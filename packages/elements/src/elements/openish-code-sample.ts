import { consume } from '@lit/context'
import { Task } from '@lit/task'
import {
  generateSnippet,
  operationToHar,
  resolveOperationNode,
  snippetClients,
  type DocumentStore,
  type NavOperationNode,
  type SnippetClient,
} from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { dispatch } from '../events.js'
import { baseStyles, visuallyHidden } from '../styles/shared.js'
import './openish-code-block.js'

/**
 * A ready-to-run request for one operation, in the reader's language.
 *
 * The request itself is built by `@openish/core` from the same reads the parameter table makes, so
 * the sample and the documentation beside it cannot disagree about what an operation takes.
 *
 * Picking a client dispatches `openish-client-change` and changes nothing locally. The root handles
 * it and re-provides `uiContext.selectedClient`, so every sample on the page follows - which is the
 * behaviour a reader expects, and the reason this is an event rather than local state.
 *
 * @fires openish-client-change - The reader picked a different client.
 */
@customElement('openish-code-sample')
export class OpenishCodeSample extends LitElement {
  static override styles = [
    baseStyles,
    visuallyHidden,
    css`
      :host {
        display: block;
      }

      .head {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        margin-bottom: var(--openish-space-xs);
      }

      select {
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-small);
        font-family: inherit;
      }

      select:focus-visible {
        outline: none;
        box-shadow: var(--openish-focus-ring);
      }

      .status {
        padding: var(--openish-space-md);
        border: 1px dashed var(--openish-color-border);
        border-radius: var(--openish-radius-lg);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** The operation to build a request for. */
  @property({ attribute: false })
  node!: NavOperationNode

  /** The offered clients. A getter: nothing outside this render needs the list to persist. */
  get #clients(): readonly SnippetClient[] {
    return snippetClients(this.ui?.config.hiddenClients ?? [])
  }

  /**
   * The client actually used: the selected one, unless config hides it.
   *
   * A host can hide the client its own default names; falling back to the first one left is better
   * than rendering an empty picker and no sample.
   */
  get #client(): SnippetClient | undefined {
    const clients = this.#clients
    const selected = this.ui?.selectedClient ?? ''
    return clients.find((client) => client.id === selected) ?? clients[0]
  }

  /*
   * Keyed on ids and the context values, not on the HAR object, which is rebuilt on every render -
   * `Task` compares args by identity, so passing the request itself would regenerate the snippet on
   * every update. The request is built inside the task instead.
   */
  readonly #snippet = new Task(this, {
    task: async ([store, node, clientId]: readonly [DocumentStore | undefined, NavOperationNode | undefined, string]) => {
      const resolved = resolveOperationNode(store?.document, node)
      if (!store || !resolved?.operation || clientId === '') {
        return undefined
      }

      const request = operationToHar({
        document: store.document,
        operation: resolved.operation,
        pathItem: resolved.pathItem,
        path: resolved.path,
        method: resolved.method,
      })

      return generateSnippet(request, clientId)
    },
    args: () => [this.store, this.node, this.#client?.id ?? ''] as const,
  })

  #onChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    dispatch(this, 'openish-client-change', value)
  }

  #renderPicker(): TemplateResult {
    const selected = this.#client?.id ?? ''

    /* Grouped by target, in the order core lists them, so the picker reads like a language list. */
    const targets: Array<[string, SnippetClient[]]> = []
    for (const client of this.#clients) {
      const group = targets.find(([label]) => label === client.targetLabel)
      if (group) {
        group[1].push(client)
      } else {
        targets.push([client.targetLabel, [client]])
      }
    }

    return html`
      <label class="visually-hidden" for="client">Code sample client</label>
      <select id="client" @change=${this.#onChange}>
        ${repeat(
          targets,
          ([label]) => label,
          ([label, clients]) => html`
            <optgroup label=${label}>
              ${repeat(
                clients,
                (client) => client.id,
                (client) => html`
                  <option value=${client.id} ?selected=${client.id === selected}>${client.clientLabel}</option>
                `,
              )}
            </optgroup>
          `,
        )}
      </select>
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.node) {
      return nothing
    }

    const client = this.#client
    const label = client ? `${client.targetLabel} · ${client.clientLabel}` : ''

    return html`
      <div class="head">${this.#renderPicker()}</div>
      ${this.#snippet.render({
        pending: () => html`<p class="status" role="status">Generating the sample…</p>`,
        error: () => html`<p class="status" role="status">This client could not generate a sample.</p>`,
        complete: (snippet) =>
          snippet
            ? html`
                <openish-code-block
                  .code=${snippet}
                  language=${client?.language ?? 'plaintext'}
                  label=${label}
                ></openish-code-block>
              `
            : html`<p class="status" role="status">No sample for this client.</p>`,
      })}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-code-sample': OpenishCodeSample
  }
}

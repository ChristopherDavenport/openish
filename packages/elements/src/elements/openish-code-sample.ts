import { consume } from '@lit/context'
import { Task } from '@lit/task'
import {
  authorSamples,
  generateSnippet,
  operationToHar,
  resolveOperationNode,
  snippetClients,
  type AuthorSample,
  type DocumentStore,
  type NavOperationNode,
  type SnippetClient,
  type VariantChoices,
} from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { dispatch } from '../events.js'
import { baseStyles, controlStyles, visuallyHidden } from '../styles/shared.js'
import './openish-code-block.js'

/**
 * A ready-to-run request for one operation, in the reader's language.
 *
 * The request itself is built by `@openish/core` from the same reads the parameter table makes, so
 * the sample and the documentation beside it cannot disagree about what an operation takes.
 *
 * Anything slotted into `actions` is forwarded straight through to the code block's own toolbar,
 * where it lands after the copy button: the picker and the copy are things a reader adjusts, and the
 * action is the thing they came to press, so it sits at the end of the bar rather than in front of
 * them. The call this is a sample *of* is named under the operation's title now, a decision that
 * belongs to `<openish-operation>` - it was the title of this card, which put the identity of the
 * call in the far column from the prose describing it.
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
    controlStyles,
    visuallyHidden,
    css`
      :host {
        display: block;
      }

      .tools {
        display: flex;
        align-items: center;
        gap: var(--openish-space-xs);
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

  /**
   * A request to render instead of deriving one.
   *
   * `<openish-try-it>` passes the request it is about to send, so the snippet is that request and
   * not a second description of it. Left unset - which is how this element renders on its own - the
   * request is derived from the document as before.
   */
  @property({ attribute: false })
  request: ReturnType<typeof operationToHar> | undefined = undefined

  /**
   * Which media type to send the body as, when this derives the request itself.
   *
   * The document's first one otherwise, which is what a sample beside a tab set showing a different
   * one was: a `--data '{...}'` under a `Content-Type: application/xml` the reader had just asked
   * for. Ignored when `request` is set, because then the panel has already built it.
   */
  @property({ type: String, attribute: 'media-type' })
  mediaType = ''

  /** The variant branches picked in the request body's tree, so the snippet posts what it shows. */
  @property({ attribute: false })
  variants: VariantChoices | undefined = undefined

  /**
   * The media type to ask for back.
   *
   * The one the examples column is showing, so a reader reading the XML response copies a request
   * that would receive XML. Ignored when `request` is set: the panel built that one.
   */
  @property({ type: String })
  accept = ''

  /** The offered clients. A getter: nothing outside this render needs the list to persist. */
  get #clients(): readonly SnippetClient[] {
    return snippetClients(this.ui?.config.hiddenClients ?? [])
  }

  /**
   * Samples the document's author wrote for this operation.
   *
   * Offered *above* the generated clients, because an author who took the trouble to write the SDK
   * call meant it to be the first thing a reader sees. They are not filtered by `hiddenClients`:
   * that option is about which of snippetz's forty-one clients to offer, and an author sample is not
   * one of those.
   */
  get #authored(): readonly AuthorSample[] {
    return authorSamples(resolveOperationNode(this.store?.document, this.node)?.operation)
  }

  /** The author sample the reader picked, if that is what the current selection names. */
  get #authoredChoice(): AuthorSample | undefined {
    const selected = this.ui?.selectedClient ?? ''
    return this.#authored.find((sample) => sample.id === selected)
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

  /**
   * The id the sample is generated for: an author sample if the reader picked one, else a client.
   *
   * An author sample is never selected *by default*, even when the document has one. The default is
   * `config.defaultHttpClient`, and a host that set it meant it; surfacing the author's samples at
   * the top of the picker is enough to make them findable without overriding that.
   */
  get #selectedId(): string {
    return this.#authoredChoice?.id ?? this.#client?.id ?? ''
  }

  /*
   * Keyed on ids and the context values, not on the HAR object, which is rebuilt on every render -
   * `Task` compares args by identity, so passing the request itself would regenerate the snippet on
   * every update. The request is built inside the task instead.
   */
  readonly #snippet = new Task(this, {
    task: async ([store, node, clientId]: readonly [
      DocumentStore | undefined,
      NavOperationNode | undefined,
      string,
      string,
      string,
      string,
      string,
    ]) => {
      const resolved = resolveOperationNode(store?.document, node)
      if (!store || !resolved?.operation || clientId === '') {
        return undefined
      }

      const authored = this.#authored.find((sample) => sample.id === clientId)
      if (authored) {
        return authored.source
      }

      const request =
        this.request ??
        operationToHar(
          {
            document: store.document,
            operation: resolved.operation,
            pathItem: resolved.pathItem,
            path: resolved.path,
            method: resolved.method,
          },
          {
            ...(this.mediaType ? { contentType: this.mediaType } : {}),
            ...(this.accept ? { accept: this.accept } : {}),
            ...(this.variants ? { variants: this.variants, variantScope: 'request' } : {}),
          },
        )

      return generateSnippet(request, clientId)
    },
    /*
     * Keyed on the request's contents, not its identity: a panel rebuilds it on every keystroke, and
     * regenerating a snippet for a request that has not changed is work nobody asked for.
     */
    args: () =>
      [
        this.store,
        this.node,
        this.#selectedId,
        this.request ? JSON.stringify(this.request) : '',
        this.mediaType,
        this.accept,
        /* Serialised, because the map is rebuilt whenever any choice on the section changes. */
        this.variants ? JSON.stringify([...this.variants]) : '',
      ] as const,
  })

  #onChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    dispatch(this, 'openish-client-change', value)
  }

  #renderPicker(): TemplateResult {
    const selected = this.#selectedId
    const authored = this.#authored

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
        ${authored.length > 0
          ? html`
              <optgroup label="From the API's authors">
                ${repeat(
                  authored,
                  (sample) => sample.id,
                  (sample) => html`
                    <option value=${sample.id} ?selected=${sample.id === selected}>${sample.label}</option>
                  `,
                )}
              </optgroup>
            `
          : nothing}
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

    const authored = this.#authoredChoice
    const client = this.#client
    const label = authored
      ? `${authored.targetLabel} · ${authored.label}`
      : client
        ? `${client.targetLabel} · ${client.clientLabel}`
        : ''
    const language = authored?.language ?? client?.language ?? 'plaintext'

    const status = this.#snippet.render({
      pending: () => 'Generating the sample…',
      error: () => 'This client could not generate a sample.',
      complete: (snippet) => (snippet ? '' : 'No sample for this client.'),
    })

    return html`
      <openish-code-block
        exportparts="code, code-toolbar, copy"
        .code=${this.#snippet.value ?? ''}
        .status=${typeof status === 'string' ? status : ''}
        language=${language}
        label=${label}
      >
        <div class="tools" slot="toolbar">${this.#renderPicker()}</div>
        <slot name="actions" slot="actions"></slot>
      </openish-code-block>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-code-sample': OpenishCodeSample
  }
}

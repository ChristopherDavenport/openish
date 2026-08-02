import { consume } from '@lit/context'
import type { DocumentStore } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, requestContext, type OpenishRequestState } from '../context/contexts.js'
import { dispatch } from '../events.js'
import { baseStyles, controlStyles, visuallyHidden } from '../styles/shared.js'

type ServerVariable = { default?: unknown; enum?: unknown[]; description?: string }

/**
 * Which server a request goes to, and what its `{variables}` are.
 *
 * A document that offers several is offering a choice a reader has to make before anything they
 * copy or send is correct - a sandbox URL in a production snippet is worse than no snippet. A
 * document that offers none gets a plain field, because an operation still has to be called
 * somewhere and guessing is not better than asking.
 *
 * @fires openish-server-change - The reader picked a server or filled in one of its variables.
 */
@customElement('openish-server-select')
export class OpenishServerSelect extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
    visuallyHidden,
    css`
      :host {
        display: block;
      }

      .row {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--openish-space-xs);
      }

      label {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      select,
      input {
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-small);
        font-family: var(--openish-font-family-mono);
      }

      input {
        min-width: 16rem;
      }

      .resolved {
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
        word-break: break-all;
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** The server and credentials the reader has chosen. Provided through context. */
  @consume({ context: requestContext, subscribe: true })
  request: OpenishRequestState | undefined

  get #servers() {
    return this.store?.document.servers ?? []
  }

  get #selected() {
    const url = this.request?.server ?? ''
    return this.#servers.find((server) => server.url === url)
  }

  #change(url: string, variables: Record<string, string>): void {
    dispatch(this, 'openish-server-change', { url, variables })
  }

  #renderVariables(): TemplateResult | typeof nothing {
    const variables = Object.entries((this.#selected?.variables ?? {}) as Record<string, ServerVariable>)
    if (variables.length === 0) {
      return nothing
    }

    const current = this.request?.serverVariables ?? {}

    return html`
      ${repeat(
        variables,
        ([name]) => name,
        ([name, variable]) => {
          const value = current[name] ?? String(variable?.default ?? '')
          const options = Array.isArray(variable?.enum) ? variable.enum.map((entry) => String(entry)) : []
          const update = (next: string) =>
            this.#change(this.request?.server ?? '', { ...current, [name]: next })

          return html`
            <label for="var-${name}">${name}</label>
            ${options.length > 0
              ? html`
                  <select id="var-${name}" @change=${(event: Event) => update((event.target as HTMLSelectElement).value)}>
                    ${options.map(
                      (option) => html`<option value=${option} ?selected=${option === value}>${option}</option>`,
                    )}
                  </select>
                `
              : html`
                  <input
                    id="var-${name}"
                    type="text"
                    .value=${value}
                    @change=${(event: Event) => update((event.target as HTMLInputElement).value)}
                  />
                `}
          `
        },
      )}
    `
  }

  override render(): TemplateResult {
    const servers = this.#servers
    const selected = this.request?.server ?? ''

    return html`
      <div class="row">
        <label for="server">Server</label>
        ${servers.length > 0
          ? html`
              <select
                id="server"
                @change=${(event: Event) => this.#change((event.target as HTMLSelectElement).value, {})}
              >
                ${repeat(
                  servers,
                  (server) => server.url ?? '',
                  (server) => html`
                    <option value=${server.url ?? ''} ?selected=${server.url === selected}>
                      ${server.url}${server.description ? ` — ${server.description}` : ''}
                    </option>
                  `,
                )}
              </select>
            `
          : html`
              <input
                id="server"
                type="url"
                placeholder="https://api.example.com"
                .value=${selected}
                @change=${(event: Event) => this.#change((event.target as HTMLInputElement).value, {})}
              />
            `}
        ${this.#renderVariables()}
      </div>
      ${this.request && this.request.serverUrl !== this.request.server
        ? html`<div class="resolved">${this.request.serverUrl}</div>`
        : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-server-select': OpenishServerSelect
  }
}

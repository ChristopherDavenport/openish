import type { SendResult } from '@openish/client'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'

import { languageForMediaType } from '../render/media-types.js'
import { baseStyles } from '../styles/shared.js'
import type { OpenishTableRow } from './openish-table.js'
import './openish-code-block.js'
import './openish-disclosure.js'
import './openish-table.js'

const HEADER_COLUMNS = ['Name', 'Value']

const toneFor = (status: number): 'success' | 'info' | 'danger' | undefined => {
  if (status >= 200 && status < 300) {
    return 'success'
  }
  if (status >= 300 && status < 400) {
    return 'info'
  }
  return status >= 400 ? 'danger' : undefined
}

const readableSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`

/**
 * What the API actually answered.
 *
 * Rendered from the same primitives as the documented responses above it - the same code block, the
 * same disclosure - so the answer and the contract are read the same way and can be compared at a
 * glance. That is the point of sending it from here rather than from a terminal.
 */
@customElement('openish-response-view')
export class OpenishResponseView extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      .summary {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--openish-space-sm);
        margin-bottom: var(--openish-space-xs);
      }

      .status {
        font: var(--openish-font-body-bold);
      }

      .status[data-tone='success'] {
        color: var(--openish-color-success);
      }

      .status[data-tone='info'] {
        color: var(--openish-color-info);
      }

      .status[data-tone='danger'] {
        color: var(--openish-color-danger);
      }

      .meta {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      .failure {
        padding: var(--openish-space-md);
        border-radius: var(--openish-radius-lg);
        background: var(--openish-color-danger-surface);
        color: var(--openish-color-danger);
        font: var(--openish-font-small);
      }

      openish-disclosure {
        margin: var(--openish-space-xs) 0;
      }
    `,
  ]

  /** The outcome of the last send, or `undefined` before there has been one. */
  @property({ attribute: false })
  result: SendResult | undefined = undefined

  #renderHeaders(headers: Record<string, string>): TemplateResult | typeof nothing {
    const rows: OpenishTableRow[] = Object.entries(headers).map(([name, value]) => ({
      key: name,
      cells: [name, value],
    }))

    if (rows.length === 0) {
      return nothing
    }

    return html`
      <openish-disclosure summary="Response headers" hint=${`${rows.length}`}>
        <openish-table .columns=${HEADER_COLUMNS} .rows=${rows} caption="Response headers"></openish-table>
      </openish-disclosure>
    `
  }

  /**
   * The body, indented if it is JSON that parses.
   *
   * An API answers on one line - there is no reason for it to spend bytes on whitespace - and one
   * line of JSON in a panel is sixty readable characters and a horizontal scrollbar holding the
   * rest. Indenting is not a change to what came back: the raw bytes are what `size` counts and
   * what Copy would have given either way. Anything that does not parse is shown exactly as it
   * arrived, because then the formatting may be the thing the reader is looking at.
   */
  get #body(): string {
    const body = this.result?.ok ? this.result.body : ''
    if (!this.result?.ok || !this.result.mediaType.toLowerCase().includes('json')) {
      return body
    }

    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }

  override render(): TemplateResult | typeof nothing {
    const result = this.result
    if (!result) {
      return nothing
    }

    if (!result.ok) {
      /*
       * A failure here is the browser refusing to make the request, not the API refusing to answer.
       * `@openish/client` has already turned it into a sentence worth reading.
       */
      return html`<p class="failure" role="alert">${result.message}</p>`
    }

    return html`
      <div class="summary">
        <span class="status" data-tone=${ifDefined(toneFor(result.status))} role="status">
          ${result.status} ${result.statusText}
        </span>
        <span class="meta">${result.durationMs} ms · ${readableSize(result.size)}</span>
      </div>
      ${this.#renderHeaders(result.headers)}
      ${result.body === ''
        ? html`<p class="meta">No body.</p>`
        : html`
            <openish-code-block
              label="Response"
              language=${languageForMediaType(result.mediaType)}
              .code=${this.#body}
            ></openish-code-block>
          `}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-response-view': OpenishResponseView
  }
}

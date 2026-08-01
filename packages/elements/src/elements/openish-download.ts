import { consume } from '@lit/context'
import { documentFilename, serializeDocument, type DocumentStore, type DocumentFormat } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { baseStyles } from '../styles/shared.js'

/**
 * Handing the reader the document the page was rendered from.
 *
 * A reference is a view of a file, and the file is often the thing a reader actually needs - to
 * generate a client, to diff against last week's, to open in an editor. Every other tool in this
 * space offers it, and openish already holds `store.raw`.
 *
 * `documentDownloadType: 'direct'` links `url` untouched instead. The difference is real: what
 * openish serialises has been bundled and upgraded to 3.1, so it is not byte-identical to a
 * published 3.0 file even though it describes the same API.
 */
@customElement('openish-download')
export class OpenishDownload extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--openish-space-xs);
        align-items: center;
      }

      a,
      button {
        display: inline-flex;
        align-items: center;
        gap: var(--openish-space-3xs);
        padding: var(--openish-space-3xs) var(--openish-space-sm);
        border: 1px solid var(--openish-color-border-strong);
        border-radius: var(--openish-radius-md);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-small);
        font-family: inherit;
        text-decoration: none;
        cursor: pointer;
      }

      a:hover,
      button:hover {
        background: var(--openish-color-surface-hover);
      }

      a:focus-visible,
      button:focus-visible {
        outline: none;
        box-shadow: var(--openish-focus-ring);
      }

      .label {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** Set while a format is being serialised, so a large document does not look like a dead button. */
  @state()
  private working: DocumentFormat | undefined = undefined

  get #formats(): DocumentFormat[] {
    switch (this.ui?.config.documentDownloadType) {
      case 'json':
        return ['json']
      case 'yaml':
        return ['yaml']
      case 'both':
        return ['json', 'yaml']
      default:
        return []
    }
  }

  /**
   * Serialises, then hands the result to the browser as a file.
   *
   * The object URL is revoked on the next frame rather than immediately: the click has to have been
   * dispatched first, and revoking in the same turn cancels the download in Safari.
   */
  async #download(format: DocumentFormat): Promise<void> {
    if (!this.store || this.working) {
      return
    }

    this.working = format
    try {
      const text = await serializeDocument(this.store.raw, format)
      const blob = new Blob([text], { type: `${format === 'json' ? 'application/json' : 'application/yaml'};charset=utf-8` })
      const url = URL.createObjectURL(blob)

      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = documentFilename(this.store.document.info?.title, format)
      anchor.click()

      requestAnimationFrame(() => URL.revokeObjectURL(url))
    } finally {
      this.working = undefined
    }
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.store) {
      return nothing
    }

    const type = this.ui?.config.documentDownloadType ?? 'both'
    if (type === 'none') {
      return nothing
    }

    if (type === 'direct') {
      const url = this.#directUrl
      return url
        ? html`
            <div class="row">
              <span class="label">OpenAPI document</span>
              <a href=${url} download>Download</a>
            </div>
          `
        : nothing
    }

    return html`
      <div class="row">
        <span class="label">OpenAPI document</span>
        ${repeat(
          this.#formats,
          (format) => format,
          (format) => html`
            <button type="button" ?disabled=${this.working !== undefined} @click=${() => void this.#download(format)}>
              ${this.working === format ? 'Preparing…' : format.toUpperCase()}
            </button>
          `,
        )}
      </div>
    `
  }

  /**
   * The URL the reference was loaded from, for `direct`.
   *
   * Comes down through `uiContext`: this element is two shadow roots below the one that knows it,
   * and `closest()` does not cross a shadow boundary. A reference given an inline `spec` has no URL
   * to offer, and renders nothing rather than a broken link.
   */
  get #directUrl(): string | undefined {
    const url = this.ui?.documentUrl ?? ''
    return url.trim() !== '' ? url : undefined
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-download': OpenishDownload
  }
}

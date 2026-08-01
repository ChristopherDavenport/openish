import { syntaxHighlight } from '@scalar/code-highlight/code'
import { standardLanguages } from '@scalar/code-highlight/languages'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

import { baseStyles, highlightStyles, visuallyHidden } from '../styles/shared.js'

/** How long the copy button stays confirmed before going back to its label. */
const COPIED_MS = 2000

/**
 * A block of code: highlighted, labelled, and copyable.
 *
 * `syntaxHighlight` returns the whole `<pre><code>` markup, which goes through `unsafeHTML` - safe
 * because the input is a string this project generated (a snippet or an example), never document
 * HTML, and because highlight.js escapes what it wraps.
 *
 * The copy button disappears where `navigator.clipboard` does not exist - an insecure origin - so a
 * reader is never offered a control that silently fails. What it copies is the plain source, not
 * the highlighted markup.
 */
@customElement('openish-code-block')
export class OpenishCodeBlock extends LitElement {
  static override styles = [
    baseStyles,
    highlightStyles,
    visuallyHidden,
    css`
      :host {
        display: block;
      }

      .frame {
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-lg);
        background: var(--openish-color-code-surface);
        overflow: hidden;
      }

      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--openish-space-sm);
        padding: var(--openish-space-2xs) var(--openish-space-sm);
        border-bottom: 1px solid var(--openish-color-border);
      }

      .label {
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
      }

      button {
        display: inline-flex;
        align-items: center;
        gap: var(--openish-space-3xs);
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-micro);
        font-family: inherit;
        cursor: pointer;
      }

      button:hover {
        background: var(--openish-color-surface-hover);
      }

      pre {
        margin: 0;
        padding: var(--openish-space-md);
        color: var(--openish-color-code-content);
        font: var(--openish-font-code);
        overflow-x: auto;
      }

      code {
        font: inherit;
      }
    `,
  ]

  /** The source to show. Copied verbatim; only the rendering is highlighted. */
  @property({ type: String })
  code = ''

  /** A highlight.js language name. Unknown ones render unhighlighted rather than failing. */
  @property({ type: String })
  language = 'plaintext'

  /** What to call this block, e.g. `curl`. Falls back to the language. */
  @property({ type: String })
  label = ''

  @state()
  private copied = false

  #timer: ReturnType<typeof setTimeout> | undefined

  override disconnectedCallback(): void {
    clearTimeout(this.#timer)
    super.disconnectedCallback()
  }

  get #canCopy(): boolean {
    return typeof navigator !== 'undefined' && navigator.clipboard !== undefined
  }

  async #copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code)
      this.copied = true
      clearTimeout(this.#timer)
      this.#timer = setTimeout(() => {
        this.copied = false
      }, COPIED_MS)
    } catch {
      /* A denied permission is the reader's answer, not an error worth showing them. */
      this.copied = false
    }
  }

  #highlighted(): string {
    try {
      return syntaxHighlight(this.code, { lang: this.language, languages: standardLanguages })
    } catch {
      /* An unknown language is not a reason to show nothing; show the code. */
      return ''
    }
  }

  override render(): TemplateResult | typeof nothing {
    if (this.code === '') {
      return nothing
    }

    const highlighted = this.#highlighted()

    return html`
      <div class="frame">
        <div class="head">
          <span class="label">${this.label || this.language}</span>
          ${this.#canCopy
            ? html`
                <button type="button" @click=${this.#copy}>
                  ${this.copied ? 'Copied' : 'Copy'}
                  <span class="visually-hidden">${this.label || this.language} sample</span>
                </button>
              `
            : nothing}
        </div>
        ${highlighted === ''
          ? html`<pre><code>${this.code}</code></pre>`
          : html`${unsafeHTML(highlighted)}`}
      </div>
      <span class="visually-hidden" role="status">${this.copied ? 'Copied to clipboard' : ''}</span>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-code-block': OpenishCodeBlock
  }
}

import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

import { codeNow, loadCode } from '../render/highlight.js'
import { baseStyles, controlStyles, highlightStyles, visuallyHidden } from '../styles/shared.js'

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
    controlStyles,
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
      }

      /*
       * The scroller is a wrapper element, not the pre itself, and it is focusable.
       *
       * A region that scrolls has to be reachable by keyboard, or the only way to read the rest of a
       * long line is a pointer - axe calls this scrollable-region-focusable and it is a serious
       * violation. The table element has always wrapped its own overflow this way; the code block did
       * not, and nothing caught it until an operation page put a sample in a narrow column where the
       * lines actually overflow.
       *
       * Capped, too, because a generated request body can run to a thousand lines and a reader should
       * not have to scroll past all of it to reach the button that sends it. The cap is a token, so a
       * host that would rather show everything can say so.
       */
      .scroll {
        max-height: var(--openish-code-max-height, 24rem);
        overflow: auto;
        /* Flush inside .frame, which clips - so the ring goes in rather than out. */
        --openish-focus-ring-offset: calc(-1 * var(--openish-focus-ring-width));
      }

      pre {
        margin: 0;
        padding: var(--openish-space-md);
        color: var(--openish-color-code-content);
        font: var(--openish-font-code);
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

  /** Bumped once the highlighter arrives, purely to ask for another render. See `#highlighted`. */
  @state()
  private loaded = 0

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

  /**
   * The highlighted markup, or `''` to fall back to plain code.
   *
   * The highlighter is loaded on demand, and until it arrives this returns `''` - which the render
   * below already handles, because an unknown language has always fallen back to a plain
   * `<pre><code>`. That makes the loading state and the failure state the same state, and it is the
   * right one either way: the code is readable immediately and gains colour when colour arrives,
   * with no layout shift, because both forms are the same block of text.
   */
  #highlighted(): string {
    const highlighter = codeNow()
    if (!highlighter) {
      void loadCode().then(() => {
        this.loaded += 1
      })
      return ''
    }

    try {
      return highlighter.syntaxHighlight(this.code, {
        lang: this.language,
        languages: highlighter.standardLanguages,
      })
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
      <div class="frame" part="code">
        <div class="head" part="code-toolbar">
          <span class="label">${this.label || this.language}</span>
          ${this.#canCopy
            ? html`
                <button type="button" part="copy" @click=${this.#copy}>
                  ${this.copied ? 'Copied' : 'Copy'}
                  <span class="visually-hidden">${this.label || this.language} sample</span>
                </button>
              `
            : nothing}
        </div>
        <div class="scroll" tabindex="0" role="group" aria-label=${`${this.label || this.language} code`}>
          ${highlighted === ''
            ? html`<pre><code>${this.code}</code></pre>`
            : html`${unsafeHTML(highlighted)}`}
        </div>
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

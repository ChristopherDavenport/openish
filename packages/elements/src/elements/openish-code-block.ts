import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

import { codeNow, loadCode } from '../render/highlight.js'
import { baseStyles, controlStyles, highlightStyles, visuallyHidden } from '../styles/shared.js'
import './openish-copy-button.js'

/**
 * A block of code: highlighted, labelled, and copyable.
 *
 * `syntaxHighlight` returns the whole `<pre><code>` markup, which goes through `unsafeHTML` - safe
 * because the input is a string this project generated (a snippet or an example), never document
 * HTML, and because highlight.js escapes what it wraps.
 *
 * The copy control is `<openish-copy-button>`, which is where the clipboard rules live now that two
 * things in the project are worth copying. What it copies is the plain source, not the highlighted
 * markup.
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

      /*
       * One bar, and the order in it is the order of the questions a reader asks: what is this, then
       * what language do I want it in, then give it to me. The picker used to sit in a bar of its own
       * above this one, which put a control between the reader and the thing it controls.
       */
      .heading {
        display: flex;
        align-items: center;
        gap: var(--openish-space-2xs);
        min-width: 0;
        overflow: hidden;
      }

      .tools {
        display: flex;
        align-items: center;
        gap: var(--openish-space-xs);
        flex: none;
      }

      .label {
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
      }

      /* A block whose source has not arrived, or could not be built. The bar above it still works. */
      .status {
        padding: var(--openish-space-md);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
        margin: 0;
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

  /** What to call this block, e.g. `curl`. Falls back to the language, and to the `title` slot. */
  @property({ type: String })
  label = ''

  /**
   * Shown in place of the code, for a block whose source has not arrived or could not be built.
   *
   * The frame and its toolbar stay, which is the point: the picker that chooses what the code *is*
   * lives in that toolbar, so a reader whose chosen client cannot generate a sample needs it more
   * than usual, not less. It used to sit in a bar of its own and survived by accident.
   */
  @property({ type: String })
  status = ''

  /** Bumped once the highlighter arrives, purely to ask for another render. See `#highlighted`. */
  @state()
  private loaded = 0

  /** A bound field, so the property the button holds does not change identity on every render. */
  readonly #source = (): string => this.code

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
    if (this.code === '' && this.status === '') {
      return nothing
    }

    const highlighted = this.code === '' ? '' : this.#highlighted()

    return html`
      <div class="frame" part="code">
        <div class="head" part="code-toolbar">
          <div class="heading">
            <slot name="title"><span class="label">${this.label || this.language}</span></slot>
          </div>
          <div class="tools">
            <slot name="toolbar"></slot>
            ${this.code === ''
              ? nothing
              : html`
                  <openish-copy-button
                    exportparts="copy"
                    .label=${`${this.label || this.language} sample`}
                    .source=${this.#source}
                  ></openish-copy-button>
                `}
          </div>
        </div>
        ${this.code === ''
          ? html`<p class="status" role="status">${this.status}</p>`
          : html`
              <div class="scroll" tabindex="0" role="group" aria-label=${`${this.label || this.language} code`}>
                ${highlighted === ''
                  ? html`<pre><code>${this.code}</code></pre>`
                  : html`${unsafeHTML(highlighted)}`}
              </div>
            `}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-code-block': OpenishCodeBlock
  }
}

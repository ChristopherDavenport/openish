import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

import { baseStyles, controlStyles, visuallyHidden } from '../styles/shared.js'

/** How long the button stays confirmed before going back to its label. */
const COPIED_MS = 2000

/**
 * Putting something on the clipboard, and saying so.
 *
 * Extracted from `<openish-code-block>`, which had the only copy in the project until there were two
 * things worth copying. Everything here was already decided there and is worth restating, because
 * each part is load-bearing:
 *
 * - The button is **absent** where `navigator.clipboard` is - an insecure origin - rather than
 *   present and failing silently. A reader is never offered a control that does nothing.
 * - A denied permission is the reader's answer, not an error to show them.
 * - The confirmation is announced through a live region that is always in the DOM, because a region
 *   inserted at the same moment as its text is not reliably announced.
 * - The timer is cleared on disconnect, so a button that is removed mid-confirmation does not set
 *   state on a detached element.
 *
 * `source` is a function rather than a string, and that is the one thing that is new. What a section
 * looks like as Markdown is expensive to work out - a tag means every operation under it - and a
 * string property would mean working it out on every render of a control that is almost never
 * pressed. Give it a bound field, not a fresh arrow, or the property changes identity each render.
 */
@customElement('openish-copy-button')
export class OpenishCopyButton extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
    visuallyHidden,
    css`
      /*
       * No box of its own: the button is the thing being laid out, and every toolbar this sits in is
       * a flex row that wants the button as its item rather than a wrapper around it.
       */
      :host {
        display: contents;
      }

      button {
        display: inline-flex;
        align-items: center;
        gap: var(--openish-space-3xs);
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        border: 1px solid var(--openish-border-action-color);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-micro);
      }
    `,
  ]

  /**
   * What to copy, worked out when the button is pressed.
   *
   * Undefined, or a function returning an empty string, renders nothing - there is no such thing as
   * copying nothing, and a button that says it will is worse than no button.
   */
  @property({ attribute: false })
  source: (() => string) | undefined

  /** The visible word. `Copy` unless the thing being copied needs a different one. */
  @property({ type: String })
  action = 'Copy'

  /**
   * What is being copied, added to the accessible name after the visible text.
   *
   * After rather than instead of, so the name still begins with the words on the button - which is
   * what lets somebody driving by voice say "copy" and be understood.
   */
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
      await navigator.clipboard.writeText(this.source?.() ?? '')
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

  override render(): TemplateResult | typeof nothing {
    if (!this.#canCopy || !this.source) {
      return nothing
    }

    return html`
      <button type="button" part="copy" @click=${this.#copy}>
        ${this.copied ? 'Copied' : this.action}
        ${this.label ? html`<span class="visually-hidden">${this.label}</span>` : nothing}
      </button>
      <span class="visually-hidden" role="status">${this.copied ? 'Copied to clipboard' : ''}</span>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-copy-button': OpenishCopyButton
  }
}

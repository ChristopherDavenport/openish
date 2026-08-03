import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'

import { baseStyles, controlStyles } from '../styles/shared.js'

/**
 * A show/hide section.
 *
 * Not `<details>`/`<summary>`: that pair cannot be animated open, its open state cannot be driven
 * from a parent without fighting the browser's own toggle, and its summary marker is only
 * styleable in some engines. A `<button aria-expanded>` plus a region is the same semantics with
 * none of that.
 *
 * `open` is an ordinary property, so a parent can set the initial state - `expandAllResponses`
 * does - and the reader can then change it. The region stays in the DOM when closed, hidden, so
 * that opening it later has nothing to build and a future transition has something to animate.
 *
 * Toggling fires `openish-toggle`, which is what makes the parent's copy of `open` worth keeping:
 * `<openish-schema>` renders nothing inside a closed disclosure, so an unopened branch of a schema
 * tree costs no elements at all. The event bubbles but is **not** composed - it is a control
 * changing shape, not something the host application has any business hearing about.
 *
 * @fires openish-toggle - The reader opened or closed it. `detail` is the new state.
 */
@customElement('openish-disclosure')
export class OpenishDisclosure extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
    css`
      :host {
        display: block;
      }

      button {
        display: flex;
        align-items: center;
        gap: var(--openish-space-2xs);
        width: 100%;
        padding: var(--openish-space-2xs) 0;
        border: 0;
        background: none;
        color: var(--openish-color-text);
        font: var(--openish-font-body-bold);
        font-family: inherit;
        text-align: left;
        cursor: pointer;
      }

      .marker {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        border-right: 2px solid var(--openish-color-text-muted);
        border-bottom: 2px solid var(--openish-color-text-muted);
        transform: rotate(-45deg);
        transition: transform 150ms ease;
      }

      button[aria-expanded='true'] .marker {
        transform: rotate(45deg);
      }

      /*
       * A count, or a whole sentence.
       *
       * It was written for "Properties 5" and now also carries a response's description on the row
       * that opens it - which is the scan view of the Returns section, and the thing a reader used
       * to have to click a tab to learn. Small rather than micro because it is prose now, and
       * truncated rather than wrapped so a long description cannot push the code out of line.
       */
      .hint {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
      }

      .summary[data-tone='success'] {
        color: var(--openish-color-success);
      }

      .summary[data-tone='info'] {
        color: var(--openish-color-info);
      }

      .summary[data-tone='danger'] {
        color: var(--openish-color-danger);
      }

      .region {
        padding-top: var(--openish-space-xs);
      }

      @media (prefers-reduced-motion: reduce) {
        .marker {
          transition: none;
        }
      }
    `,
  ]

  /** The button's label. */
  @property({ type: String })
  summary = ''

  /** A short qualifier after the label: how many rows are inside, or what a status code means. */
  @property({ type: String })
  hint = ''

  /**
   * Colours the label: `success`, `info`, `danger`.
   *
   * A status code is the only caller so far, and it is the reason this exists - a `409` that reads
   * like a `200` is worse than no colour at all. The three names are the ones `OpenishTab` already
   * uses, so a status looks the same whichever column it is in.
   */
  @property({ type: String })
  tone = ''

  /** Whether the region is showing. Reflected, so CSS can follow it. */
  @property({ type: Boolean, reflect: true })
  open = false

  #toggle(): void {
    this.open = !this.open
    this.dispatchEvent(new CustomEvent('openish-toggle', { detail: this.open, bubbles: true }))
  }

  override render(): TemplateResult {
    return html`
      <button type="button" aria-expanded=${this.open ? 'true' : 'false'} aria-controls="region" @click=${this.#toggle}>
        <span class="marker" aria-hidden="true"></span>
        <span class="summary" data-tone=${ifDefined(this.tone || undefined)}>${this.summary}</span>
        ${this.hint ? html`<span class="hint">${this.hint}</span>` : nothing}
      </button>
      <div id="region" part="region" class="region" ?hidden=${!this.open}>
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-disclosure': OpenishDisclosure
  }

  interface HTMLElementEventMap {
    'openish-toggle': CustomEvent<boolean>
  }
}

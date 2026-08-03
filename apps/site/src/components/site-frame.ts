import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { createRef, ref } from 'lit/directives/ref.js'

import { siteStyles } from '../styles/shared.js'

/**
 * A framed demo with its own address bar.
 *
 * The routing modes are *about* which half of the URL the reference reads and writes, so a
 * demonstration that does not show the URL demonstrates nothing. The frame has its own `location`,
 * so there is a real one to show - and putting it above the frame, updating live, is the whole
 * point of the component.
 *
 * Three signals, because no one of them covers it:
 *
 * - `hashchange` for `hash` mode, which is the browser's own announcement.
 * - `popstate` for `history` mode, including the synthetic one openish dispatches after a
 *   `pushState` - since `pushState` fires nothing and `LocationController` is listening for the
 *   browser's signal, openish makes the same one rather than teaching every caller to poke it.
 * - `openish-navigate` for everything else, and specifically for the scroll-driven `replaceState`
 *   that rewrites the URL as a reader moves through the document. That one fires no browser event
 *   at all, deliberately - a `hashchange` would re-render, which would scroll, which is the
 *   feedback loop written out - so the element's own event is the only way to hear it. A host
 *   syncing its own chrome to the reference has exactly this problem, and this is the answer to it.
 */
@customElement('site-frame')
export class SiteFrame extends LitElement {
  static override styles = [
    siteStyles,
    css`
      :host {
        display: block;
      }

      .bar {
        display: flex;
        align-items: baseline;
        gap: var(--openish-space-xs);
        padding: var(--openish-space-2xs) var(--openish-space-sm);
        background: var(--openish-color-surface-muted);
        border: 1px solid var(--openish-color-border);
        border-bottom: none;
        border-start-start-radius: var(--openish-radius-lg);
        border-start-end-radius: var(--openish-radius-lg);
      }

      .mode {
        font: var(--openish-font-small-bold);
        white-space: nowrap;
      }

      .url {
        font: var(--openish-font-code-small);
        color: var(--openish-color-text-muted);
        overflow-x: auto;
        white-space: nowrap;
      }

      iframe {
        display: block;
        inline-size: 100%;
        border: 1px solid var(--openish-color-border);
        border-end-start-radius: var(--openish-radius-lg);
        border-end-end-radius: var(--openish-radius-lg);
        background: var(--openish-color-page);
      }
    `,
  ]

  /** The document to frame, relative to the site's base. */
  @property({ type: String })
  src = ''

  /** What this frame is showing, e.g. the routing mode. Also the iframe's accessible name. */
  @property({ type: String })
  label = ''

  /** How tall the frame should be. A CSS length. */
  @property({ type: String })
  height = '28rem'

  @state()
  private shownUrl = ''

  readonly #frame = createRef<HTMLIFrameElement>()

  #watching: Window | undefined

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#unwatch()
  }

  #unwatch(): void {
    const frameWindow = this.#watching
    if (!frameWindow) {
      return
    }
    frameWindow.removeEventListener('hashchange', this.#sync)
    frameWindow.removeEventListener('popstate', this.#sync)
    frameWindow.document.removeEventListener('openish-navigate', this.#sync)
    this.#watching = undefined
  }

  readonly #sync = (): void => {
    const frameWindow = this.#watching
    if (!frameWindow) {
      return
    }
    /*
     * Same origin, so this is readable. It is also the reason the demo is an iframe rather than a
     * popup: a window opened with `open()` is same-origin too, but nothing on the page can lay it
     * out beside the prose that explains it.
     */
    this.shownUrl = `${frameWindow.location.pathname}${frameWindow.location.search}${frameWindow.location.hash}`
  }

  readonly #onLoad = (): void => {
    this.#unwatch()
    const frameWindow = this.#frame.value?.contentWindow ?? undefined
    if (!frameWindow) {
      return
    }
    this.#watching = frameWindow
    frameWindow.addEventListener('hashchange', this.#sync)
    frameWindow.addEventListener('popstate', this.#sync)
    frameWindow.document.addEventListener('openish-navigate', this.#sync)
    this.#sync()
  }

  override render(): TemplateResult {
    return html`
      <div class="bar">
        <span class="mode">${this.label}</span>
        <span class="url">${this.shownUrl || '—'}</span>
      </div>
      <iframe
        ${ref(this.#frame)}
        src=${this.src}
        title=${this.label}
        style="block-size: ${this.height}"
        @load=${this.#onLoad}
      ></iframe>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-frame': SiteFrame
  }
}

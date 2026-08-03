import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'

import { siteStyles } from '../styles/shared.js'

/**
 * The wrapper every embedded `<openish-api-reference>` goes inside.
 *
 * It does two things a page would otherwise have to remember, and the second one fails silently.
 *
 * **It gives the reference a height.** The reference fills its container and does not decide how
 * tall it is - break the chain and it falls back to the height of its content, which means nothing
 * inside it scrolls on its own and the sidebar leaves the top of the page with no way back to it.
 *
 * **It keeps the site's router out of the reference's fragment links.**
 *
 * `@lit-labs/router`'s root `Router` installs a `click` listener on `window`. It finds an anchor
 * with `composedPath()`, so shadow DOM is no protection, and for any same-origin anchor with no
 * `target`, no `download` and no `rel="external"` it calls `preventDefault()`, then
 * `history.pushState(anchor.href)`, then `goto(anchor.pathname)`.
 *
 * A reference in `hash` mode renders `#/tags/planets` and navigates by *not* intercepting: a
 * fragment link is navigation the browser performs itself, and `hashchange` is the browser saying
 * it did - which is the one signal `LocationController` subscribes to. `pushState` fires no
 * `hashchange`. So without this wrapper the router eats the click, writes the fragment into the
 * address bar, and the page does not move: the URL is right, the reference is wrong, and nothing is
 * logged. That is the failure this element exists for, and why it has a test of its own.
 *
 * Only same-document fragment links are stopped. A link *out* of the demo is the site's to route,
 * and `href.startsWith('#')` is the exact question - not a comparison against `location`, which
 * would also swallow a full URL that happened to name this page.
 *
 * The modes that call `preventDefault` first, `history` and `none`, are unaffected either way: the
 * router bails on an event that is already defaulted. This is needed only by `hash`, which is the
 * default and the mode a static host actually uses.
 *
 * **If a second conflict of this shape appears** - a markdown link inside a document, a `?api=`
 * link, anything the *document* contains rather than the site - do not add a second guard. Invert
 * the default instead: use a root `Routes` rather than `Router` and have `<site-app>` handle clicks
 * itself, intercepting only anchors whose `href` starts with `/`. That is about fifteen lines and it
 * removes the whole class rather than one member of it.
 */
@customElement('site-demo-scope')
export class SiteDemoScope extends LitElement {
  static override styles = [
    siteStyles,
    css`
      :host {
        display: block;
      }

      .scope {
        display: flex;
        flex-direction: column;
        min-height: 0;
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-lg);
        overflow: hidden;
      }

      /* The other half of the height chain: the slotted reference has to be told to fill it. */
      ::slotted(*) {
        flex: 1;
        min-height: 0;
      }

      /* Full bleed wants the frame gone as well as the height changed. */
      :host([bare]) .scope {
        border: none;
        border-radius: 0;
      }
    `,
  ]

  /**
   * How tall the reference should be.
   *
   * A CSS length, so a page can hand over `100%` and inherit its own container's height - which is
   * what the full-bleed page does - or take the default and get something that reads as an example
   * on a page of prose rather than as the page itself.
   */
  @property({ type: String })
  height = 'min(70vh, 40rem)'

  /** Drops the frame, for a page where the reference *is* the page. */
  @property({ type: Boolean, reflect: true })
  bare = false

  /**
   * Stops a same-document fragment click before it reaches the window listener.
   *
   * Bound in the template, so it runs during bubbling at this element's own wrapper - which is below
   * `window` on the composed path and above anything the reference does with the click itself. The
   * reference's own handler is deeper still and has already run, so `none` and `history` have
   * already called `preventDefault` by the time this sees the event.
   *
   * `stopPropagation` and never `preventDefault`: the whole point is to let the browser perform the
   * navigation it was always going to perform.
   */
  readonly #keepFragmentsLocal = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0) {
      return
    }
    /* A modified click is the reader asking for a new tab. Whatever happens next is the browser's. */
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }

    const anchor = event
      .composedPath()
      .find((target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement)
    if (!anchor?.getAttribute('href')?.startsWith('#')) {
      return
    }

    event.stopPropagation()
  }

  override render(): TemplateResult {
    return html`
      <div class="scope" style=${styleMap({ blockSize: this.height })} @click=${this.#keepFragmentsLocal}>
        <slot></slot>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-demo-scope': SiteDemoScope
  }
}

import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import './site-demo-scope.js'
import { ElementsLoader } from '../controllers/elements-loader.js'
import { embeddedReferenceStyles, siteStyles } from '../styles/shared.js'

/**
 * A real `<openish-api-reference>`, fetched only when a page actually shows one.
 *
 * This is how the site embeds a reference that needs no configuration beyond a URL, and it exists
 * so that two things cannot be forgotten independently.
 *
 * **The cost is deferred**, by {@link ElementsLoader}, which also holds the page's scroll position
 * across the mount. See that controller for why both halves are necessary.
 *
 * **The fence is not optional.** `<site-demo-scope>` is rendered here rather than by the page, so a
 * page cannot embed a reference without it. Forgetting it breaks the reference's sidebar silently -
 * see that element for the mechanism - and a failure with no symptom is not one to leave to whoever
 * writes the next page.
 *
 * The reference is rendered only once the module has arrived. It would technically upgrade in place
 * if rendered early, since attributes survive an upgrade - but that is true only of *attributes*,
 * and anything set as a property, which is how `spec`, `sources` and `config` have to be set, would
 * be assigned to a plain element and lost. `<site-example>` is the one that sets properties, and it
 * waits for the same reason.
 */
@customElement('site-live-reference')
export class SiteLiveReference extends LitElement {
  static override styles = [
    siteStyles,
    embeddedReferenceStyles,
    css`
      :host {
        display: block;
      }

      :host([bare]) {
        display: flex;
        flex-direction: column;
        min-block-size: 0;
      }

      site-demo-scope {
        flex: 1;
        min-block-size: 0;
      }

      .waiting {
        display: flex;
        align-items: center;
        justify-content: center;
        block-size: 100%;
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
      }
    `,
  ]

  readonly #elements = new ElementsLoader(this)

  /** Where to fetch the document from. */
  @property({ type: String })
  url = ''

  /** How tall the reference should be. Passed through to the scope. */
  @property({ type: String })
  height = 'min(70vh, 40rem)'

  /** Drops the frame, for a page where the reference *is* the page. */
  @property({ type: Boolean, reflect: true })
  bare = false

  /**
   * How the reference reads the URL.
   *
   * `none` by default, and that default is the point. A reference in `hash` mode owns
   * `window.location` - it reads the fragment and rewrites it with `replaceState` as the reader
   * scrolls - so two of them on one page would follow each other around the address bar. Content
   * pages embed references to be looked at, not navigated by URL, so they hand navigation over.
   * The one page whose job is deep linking passes `hash` explicitly, and there is only ever one.
   */
  @property({ type: String })
  routing: 'hash' | 'none' = 'none'

  override render(): TemplateResult {
    return html`
      <site-demo-scope .height=${this.height} ?bare=${this.bare}>
        ${this.#elements.ready
          ? html`<openish-api-reference url=${this.url} routing=${this.routing}></openish-api-reference>`
          : html`<p class="waiting">
              ${this.#elements.failed ? 'The reference could not be loaded.' : 'Loading the reference…'}
            </p>`}
      </site-demo-scope>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-live-reference': SiteLiveReference
  }
}

import { Router } from '@lit-labs/router'
import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { createRef, ref } from 'lit/directives/ref.js'

import type { ColorSchemePreference } from '@openish/core'

import '../pages/site-page-not-found.js'
import { siteStyles } from '../styles/shared.js'
import { applyColorScheme, initialColorScheme, nextColorScheme } from './scheme.js'
import { routePath } from './paths.js'
import { ROUTES, routeAt } from './routes.js'
import './site-header.js'
import './site-nav.js'

/**
 * The site shell, and the one router on the page.
 *
 * `@lit-labs/router` is a dependency of this application and of nothing else. `packages/` has no
 * router and must not gain one: an API reference's navigation ids *are* URL paths and `store.bySlug`
 * is a map, so a route table there was an elaborate detour to a lookup that had already happened -
 * the README's "Why there is no router." says it at length. A documentation site is the other case.
 * It has a dozen genuinely distinct pages, each with its own component, and resolving a URL to one
 * of them is what a route table is for.
 *
 * The router is Lit **Labs**, pre-1.0. Two of its edges matter here and are handled rather than
 * worked around:
 *
 * - `goto()` does not call `pushState`. Navigation here is by `<a href>` only, which the router's
 *   own click interception answers correctly. Anything that ever needs to move without a click has
 *   to pair `history.pushState` with `goto` itself; there is no such caller yet, and adding one
 *   means adding that pair rather than reaching for `goto` alone.
 * - That click interception is global, crosses shadow DOM, and rewrites *any* same-origin anchor as
 *   a `pushState`. An embedded `<openish-api-reference routing="hash">` navigates by fragment links
 *   and listens for `hashchange`, which `pushState` does not fire - so a reference embedded in this
 *   site needs its fragment clicks kept away from the window listener. That fence arrives with the
 *   first embedded reference; the modes that call `preventDefault` first (`history`, `none`) are
 *   unaffected, because the router bails on an already-defaulted event.
 */
@customElement('site-app')
export class SiteApp extends LitElement {
  static override styles = [
    siteStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100%;
      }

      .body {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(12rem, 16rem) 1fr;
      }

      site-nav {
        border-inline-end: 1px solid var(--openish-color-border);
        overflow-y: auto;
      }

      main {
        min-width: 0;
        padding: var(--openish-space-xl) var(--openish-space-lg);
      }

      /*
       * A page that is a reference rather than a page about one: no padding, and the height passed
       * through instead of stopping here. Hiding the overflow is what makes the plane inside it
       * scroll itself rather than growing the document - which is the whole reason the reference
       * wants a container with a height in the first place.
       */
      main.full {
        padding: 0;
        min-height: 0;
        overflow: hidden;
      }

      /*
       * One column below the breakpoint, with the navigation above the content rather than beside
       * it. A viewport query and not a container query: this is the page's own layout, and the page
       * is the thing the viewport describes.
       */
      @media (max-width: 60rem) {
        .body {
          grid-template-columns: 1fr;
        }

        site-nav {
          border-inline-end: none;
          border-block-end: 1px solid var(--openish-color-border);
        }
      }

      /*
       * Visible only once it has focus. A site with an accessibility page owes its own readers the
       * way past a navigation column that is identical on every page.
       *
       * A button, not the anchor this pattern is usually written as, and for two separate reasons -
       * either one of which alone would be enough. A fragment is resolved against the *document*, so
       * an id inside this shadow root is not something the browser can navigate to. And the root
       * Router intercepts every same-origin anchor click, including this one, and would answer it
       * with a pushState that put the fragment in the URL and moved nothing. The thing being asked
       * for is "focus the main region", which is a button's job.
       */
      .skip {
        position: absolute;
        inset-inline-start: var(--openish-space-sm);
        inset-block-start: var(--openish-space-sm);
        z-index: var(--openish-z-overlay);
        padding: var(--openish-space-xs) var(--openish-space-sm);
        background: var(--openish-color-surface-raised);
        border: 1px solid var(--openish-color-border-strong);
        border-radius: var(--openish-radius-md);
        transform: translateY(-200%);
      }

      .skip:focus-visible {
        transform: none;
      }
    `,
  ]

  /**
   * The URL, read at render time rather than subscribed to.
   *
   * `Router` calls `requestUpdate()` on this host after every successful `goto()`, and every way the
   * pathname can change goes through one: a click it intercepts, or the `popstate` it listens for.
   * So `location.pathname` read inside `render()` is never stale, and a subscription would be a
   * second mechanism arriving at the same answer.
   *
   * `@openish/elements` exports a `LocationController` that does subscribe, and using it was the
   * first version of this. It is the wrong trade here: the export is the package entry, importing it
   * registers all thirty-one elements, and the site went from 6 kB to 145 kB gzipped to render a
   * paragraph. A documentation site that ships an entire component library to draw its own 404 page
   * has no business having an opinion about anyone's bundle. The page that embeds a reference pays
   * that cost honestly, because it is showing one.
   *
   * What this gives up is `hashchange`, which no page reads yet. The page that does - the one with a
   * reference in `hash` mode - is also the page that already imports the elements.
   */
  get #pathname(): string {
    return window.location.pathname
  }

  readonly #router = new Router(
    this,
    /*
     * Every page module is imported statically and every page element is small. What is heavy -
     * `@openish/elements`, and the markdown and highlight chunk behind it - is deferred one level
     * down, inside `<site-live-reference>`, where the cost is next to the thing that incurs it.
     *
     * This was route-level `enter` deferral first, and moving it was a simplification worth noting:
     * the router hook defers a whole *page*, which is the wrong unit when the front page is prose
     * that should render at once and a reference that can arrive a beat later.
     */
    ROUTES.map((route) => ({ path: routePath(route.slug), render: route.render })),
    { fallback: { render: () => html`<site-page-not-found></site-page-not-found>` } },
  )

  @state()
  private scheme: ColorSchemePreference = 'auto'

  override connectedCallback(): void {
    super.connectedCallback()
    this.scheme = initialColorScheme()
    applyColorScheme(this.scheme)
  }

  /**
   * The tab title follows the URL.
   *
   * `document.title` is outside this element's tree, so it cannot be expressed in a template and
   * belongs in `updated()` - the one place imperative DOM is allowed. A path that names nothing gets
   * the 404's title rather than keeping whichever page the reader came from.
   */
  protected override updated(): void {
    const route = routeAt(this.#pathname)
    document.title = route === undefined ? 'Not found · openish' : route.slug === '' ? 'openish' : `${route.title} · openish`
  }

  readonly #onSchemeToggle = (): void => {
    this.scheme = nextColorScheme(this.scheme)
    applyColorScheme(this.scheme)
  }

  /**
   * The main region, kept by `ref()` rather than found again with a query.
   *
   * Moving focus is a DOM call and cannot be expressed in a template, but *which* element to move it
   * to can be - the same division `<openish-tabs>` makes for its selected tab.
   */
  readonly #main = createRef<HTMLElement>()

  readonly #skipToContent = (): void => {
    this.#main.value?.focus()
  }

  override render(): TemplateResult {
    return html`
      <button class="skip" type="button" @click=${this.#skipToContent}>Skip to content</button>
      <site-header .scheme=${this.scheme} @site-scheme-toggle=${this.#onSchemeToggle}></site-header>
      <div class="body">
        <site-nav .pathname=${this.#pathname}></site-nav>
        <main
          ${ref(this.#main)}
          tabindex="-1"
          class=${routeAt(this.#pathname)?.layout === 'full' ? 'full' : ''}
        >
          ${this.#router.outlet()}
        </main>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-app': SiteApp
  }
}

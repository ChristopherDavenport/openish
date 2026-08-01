import { Router, type RouteConfig } from '@lit-labs/router'
import { provide } from '@lit/context'
import { Task, TaskStatus } from '@lit/task'
import {
  createDocumentStore,
  resolveConfig,
  type ColorScheme,
  type DocumentStore,
  type Layout,
  type OpenishConfig,
} from '@openish/core'
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { createRef, ref } from 'lit/directives/ref.js'

import { documentContext, sameUiState, uiContext, type OpenishUiState } from '../context/contexts.js'
import { LocationController } from '../controllers/location.js'
import { MediaQueryController } from '../controllers/media-query.js'
import { dispatch } from '../events.js'
import { renderNodeById, renderOverview } from '../render/render-node.js'
import { idFromPathname, normalizeBasePath } from '../router/urls.js'
import { baseStyles, statusStyles, visuallyHidden } from '../styles/shared.js'
import './openish-markdown.js'
import './openish-section.js'
import './openish-sidebar.js'

/* Firefox and Safari still lack URLPattern, which @lit-labs/router matches routes with. */
if (!('URLPattern' in globalThis)) {
  await import('urlpattern-polyfill')
}

/**
 * The root of an API reference.
 *
 * Owns the three things that cannot be owned lower down: the document (loaded once, provided as
 * context), the presentation state (provided as context, changed only by events travelling up), and
 * the `Router` - one per page, by library contract, since it installs the global `click` and
 * `popstate` listeners. Every routed section below it uses a `Routes` controller instead and is
 * mounted into this router by DOM containment; see `<openish-section>`.
 *
 * @fires openish-color-scheme-change - A descendant asked to switch schemes. Re-dispatched because
 *   only the host application can swap the Jack Henry theme stylesheet and persist the choice.
 * @fires openish-client-change - The reader picked a different code-sample client.
 * @fires openish-navigate - The active node changed. Useful with `routing="none"`.
 */
@customElement('openish-api-reference')
export class OpenishApiReference extends LitElement {
  static override styles = [
    baseStyles,
    statusStyles,
    visuallyHidden,
    css`
      /*
       * The element fills its container and does not decide how tall it is. A host that gives it no
       * height gets a page that scrolls as one - see the sticky rule on .menu below, and the note in
       * the README.
       */
      :host {
        display: block;
        height: 100%;
        background: var(--openish-color-page);
      }

      .layout {
        display: grid;
        grid-template-columns: var(--openish-sidebar-width) minmax(0, 1fr);
        height: 100%;
      }

      .layout.no-sidebar {
        grid-template-columns: minmax(0, 1fr);
      }

      /*
       * One column, whether because the viewport is narrow or because the host asked for it.
       *
       * A flex column rather than a grid: the number of children changes when the disclosure opens,
       * and a grid with a fixed row list either runs out of rows or has to be told about the extra
       * one. A stack is what this is.
       */
      .layout.stacked {
        display: flex;
        flex-direction: column;
      }

      .layout.stacked main {
        flex: 1;
        min-height: 0;
      }

      main {
        overflow-y: auto;
        padding: var(--openish-space-xl) var(--openish-space-lg);
      }

      .content {
        max-width: var(--openish-content-max-width);
        margin: 0 auto;
      }

      /*
       * Sticky, so the way back to the navigation is always on screen.
       *
       * In a host that gives this element a height, main scrolls on its own and this never comes up.
       * In one that does not, the whole page scrolls - and a disclosure that has scrolled away is a
       * reader stranded on whatever page they were reading. It costs nothing in the first case.
       */
      .menu {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: var(--openish-space-2xs);
        padding: var(--openish-space-xs) var(--openish-space-md);
        border: 0;
        border-bottom: 1px solid var(--openish-color-border);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-body-bold);
        font-family: inherit;
        cursor: pointer;
      }

      .menu .marker {
        width: 0.5rem;
        height: 0.5rem;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: rotate(-45deg);
        transition: transform 150ms ease;
      }

      .menu[aria-expanded='true'] .marker {
        transform: rotate(45deg);
      }

      /*
       * Stacked, the navigation is a disclosure above the page rather than a column beside it.
       *
       * The wrapper is display: contents so the sidebar is the flex child itself - it exists to be
       * named by aria-controls and to catch Escape, not to take part in the layout.
       */
      .layout.stacked .navigation {
        display: contents;
      }

      .layout.stacked openish-sidebar {
        flex: none;
        max-height: 60vh;
        border-right: 0;
        border-bottom: 1px solid var(--openish-color-border);
      }

      @media (prefers-reduced-motion: reduce) {
        .menu .marker {
          transition: none;
        }
      }
    `,
  ]

  /** URL to fetch the document from. Ignored when {@link spec} is set. */
  @property({ type: String })
  url?: string

  /** An inline document: a YAML/JSON string, or an already-parsed object. Property only. */
  @property({ attribute: false })
  spec?: string | Record<string, unknown>

  /** Presentation options. Property only, because it is an object. */
  @property({ attribute: false })
  config?: OpenishConfig

  /**
   * `modern` puts the navigation in a column beside the page. `classic` stacks it into a disclosure
   * above the page - the same composition a narrow viewport gets, because "one column with the
   * navigation folded away" is one design, not two, and a second implementation of it would only be
   * a second thing to keep correct.
   */
  @property({ type: String })
  layout: Layout = 'modern'

  /** URL prefix this reference is mounted under, e.g. `/docs`. */
  @property({ type: String, attribute: 'base-path' })
  basePath = ''

  /**
   * `history` installs a router and reads the URL. `none` leaves navigation to the host, which
   * drives it with {@link selected} and listens for `openish-navigate`.
   */
  @property({ type: String })
  routing: 'history' | 'none' = 'history'

  /** The active node id when `routing="none"`. Ignored otherwise. */
  @property({ type: String })
  selected = ''

  /** Which scheme the reference renders in. The host still owns the theme stylesheet. */
  @property({ type: String, attribute: 'color-scheme' })
  colorScheme: ColorScheme = 'light'

  @provide({ context: documentContext })
  @state()
  private store: DocumentStore | undefined = undefined

  /*
   * `hasChanged` compares the value rather than its identity. `willUpdate` rebuilds this object on
   * every update, and a context provider notifies by identity - without a comparison, every render
   * of the root would re-render every consumer of `uiContext` on the page.
   */
  @provide({ context: uiContext })
  @state({ hasChanged: (value: OpenishUiState, old: OpenishUiState | undefined) => !sameUiState(value, old) })
  private ui: OpenishUiState = {
    config: resolveConfig(),
    layout: 'modern',
    colorScheme: 'light',
    selectedClient: resolveConfig().defaultHttpClient,
    basePath: '',
    activeId: '',
    hash: '',
  }

  /** Set once the reader picks a client, so a later config change does not silently override them. */
  @state()
  private clientChosenByUser: string | undefined = undefined

  #router: Router | undefined

  /**
   * The URL as a reactive input, rather than a `window.location` read inside `render()`.
   *
   * Every element below reads the active id from `uiContext`, so this is the only place in the
   * project that touches the global at all.
   */
  readonly #location = new LocationController(this)

  /**
   * Whether the viewport is too narrow for two columns.
   *
   * A media query in CSS could hide the sidebar, and used to - but hiding it left a navigation tree
   * that was invisible and still focusable, and no way to reach it at all. Knowing the answer in
   * JavaScript is what lets the element render a different *thing*: a disclosure, with a button that
   * says whether it is open.
   */
  readonly #narrow = new MediaQueryController(this, '(max-width: 48rem)')

  /** Whether the stacked navigation is showing. Meaningless in the two-column layout. */
  @state()
  private navOpen = false

  /** The disclosure control, so Escape inside the panel can hand focus back to it. */
  readonly #menuButton = createRef<HTMLButtonElement>()


  readonly #loadTask = new Task(this, {
    task: async ([url, spec, config]: readonly [
      string | undefined,
      string | Record<string, unknown> | undefined,
      OpenishConfig | undefined,
    ]) => {
      const input = spec ?? (url && url.trim() !== '' ? await this.#fetchDocument(url) : undefined)
      if (input === undefined) {
        return undefined
      }
      return createDocumentStore(input, config ? { config } : {})
    },
    args: () => [this.url, this.spec, this.config] as const,
    onComplete: (value) => {
      this.store = value
    },
    onError: () => {
      this.store = undefined
    },
  })

  /** Whether a document has been configured at all. An empty `url` counts as "not configured". */
  get #hasSource(): boolean {
    return this.spec !== undefined || (this.url !== undefined && this.url.trim() !== '')
  }

  async #fetchDocument(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }

  override connectedCallback(): void {
    /*
     * The router is created BEFORE `super.connectedCallback()`, and that ordering is load-bearing.
     *
     * `@lit-labs/router@0.1.4` calls `host.addController(this)` in its constructor and only then
     * assigns `this.routes` and `this.fallback`. If the host is already connected at that moment,
     * `addController` invokes `hostConnected()` immediately, which calls `goto()` while `routes` is
     * still empty and `fallback` still undefined - and `goto` then takes its "controller with no
     * routes" branch, which never sets `_currentRoute`. The outlet renders nothing, permanently,
     * with no error. Constructing here means `addController` runs while `renderRoot` is still
     * undefined, so `hostConnected` is deferred to `super.connectedCallback()` below, by which time
     * the routes are in place.
     *
     * The consequence for the public API: `routing` is read once, at connect time. Changing it on a
     * live element does nothing; re-create the element instead. `basePath` can change freely - see
     * `#syncRoutes`.
     */
    if (this.routing === 'history' && this.#router === undefined) {
      this.#router = new Router(this, this.#buildRoutes(), {
        fallback: { render: () => renderNodeById(this.store, this.ui.activeId, this.ui.hash) },
      })
    }

    super.connectedCallback()
  }

  /*
   * The root updates its own state and then lets the event continue upward. Both halves matter:
   * without the first, a control could not change anything; without the second, the host could not
   * swap the theme stylesheet or persist the preference.
   *
   * Bound in the template rather than with `addEventListener` in `connectedCallback`: both events
   * bubble out of the shadow tree, so the layout element catches them, and the binding is attached
   * and released by the same render that owns the element.
   */
  readonly #onColorSchemeChange = (event: CustomEvent<ColorScheme>): void => {
    this.colorScheme = event.detail
  }

  readonly #onClientChange = (event: CustomEvent<string>): void => {
    this.clientChosenByUser = event.detail
  }

  /**
   * The one thing this element derives, and the only reason it has a `willUpdate` at all.
   *
   * Everywhere else a value computed from other state is a getter, because nothing outside the
   * element needs it. This one is *provided*: a context provider pushes, so the value has to be
   * assigned somewhere in the update, and `willUpdate` is where an assignment joins the update
   * already in flight instead of scheduling another. `hasChanged` above then decides whether
   * anything downstream needs to hear about it.
   */
  protected override willUpdate(): void {
    const base = normalizeBasePath(this.basePath)
    const config = this.store?.config ?? resolveConfig(this.config)

    this.ui = {
      config,
      layout: this.layout,
      colorScheme: this.colorScheme,
      selectedClient: this.clientChosenByUser ?? config.defaultHttpClient,
      basePath: base,
      activeId: this.routing === 'history' ? idFromPathname(this.#location.pathname, base) : this.selected,
      hash: this.#location.hash,
    }
  }

  /**
   * Rebuilds the route table after a `basePath` change.
   *
   * `Routes.routes` is documented as mutable, but mutating it does not re-match the current URL, so
   * an explicit `goto` has to follow. Replacing the whole `Router` instead would re-trigger the
   * constructor bug described in `connectedCallback`.
   */
  #syncRoutes(): void {
    if (!this.#router) {
      return
    }
    this.#router.routes = this.#buildRoutes()
    void this.#router.goto(this.#location.pathname)
  }

  /**
   * The top-level route table: the overview, and one mount per section.
   *
   * Everything below a section prefix is matched by the `Routes` controller inside
   * `<openish-section>`, which receives the tail of what matched here. The root only decides which
   * section a URL belongs to, so adding a page shape inside a section does not touch this file.
   *
   * The mounts are `/tags*`, not `/tags/*`, deliberately: `URLPattern` requires the literal slash,
   * so `/models/*` matches `/models/Account` but not `/models` - and `/models` is a real page. The
   * trailing-wildcard form matches both and always produces a tail group, which is what the child
   * needs to route at all. The cost is that `/modelsomething` also matches; it resolves to no node
   * and gets the same "not found" the reader would have seen anyway.
   */
  #buildRoutes(): RouteConfig[] {
    const base = normalizeBasePath(this.basePath)

    const routes: RouteConfig[] = [
      { path: `${base}/`, render: () => renderOverview(this.#location.hash) },
      { path: `${base}/tags*`, render: () => html`<openish-section section="tags"></openish-section>` },
      { path: `${base}/models*`, render: () => html`<openish-section section="models"></openish-section>` },
      { path: `${base}/webhooks*`, render: () => html`<openish-section section="webhooks"></openish-section>` },
    ]

    /* `/docs/` does not match a bare `/docs`, so the mount point needs its own route. */
    if (base !== '') {
      routes.unshift({ path: base, render: () => renderOverview(this.#location.hash) })
    }

    return routes
  }

  /**
   * Why there is nothing to route into yet, if that is the case.
   *
   * Gating the outlet on this - rather than repeating the checks inside every route - means a
   * routed element can assume the document exists, and the loading and error states are stated once.
   */
  #renderLoadState(): TemplateResult | undefined {
    if (!this.#hasSource) {
      return html`<p class="status" role="status">No document loaded.</p>`
    }

    if (this.#loadTask.status === TaskStatus.PENDING) {
      return html`<p class="status" role="status">Loading the API reference…</p>`
    }

    const error = this.#loadTask.error
    if (error) {
      return html`
        <div class="status">
          <div class="error" role="alert">${error instanceof Error ? error.message : String(error)}</div>
        </div>
      `
    }

    return this.store ? undefined : html`<p class="status" role="status">No document loaded.</p>`
  }

  /** The routed content: from the router when there is one, from `selected` when there is not. */
  #renderContent(): unknown {
    const loadState = this.#renderLoadState()
    if (loadState) {
      return loadState
    }

    return this.#router ? this.#router.outlet() : renderNodeById(this.store, this.ui.activeId, this.ui.hash)
  }

  /**
   * Announcements, decided by what actually changed.
   *
   * Every one of these is a reactive property, so Lit's own `changedProperties` is the record of
   * what happened - there is no "last announced" field to keep beside them and no way for the two
   * to disagree.
   */
  protected override updated(changed: PropertyValues): void {
    if (changed.has('colorScheme')) {
      dispatch(this, 'openish-color-scheme-change', this.colorScheme)
    }
    if (changed.has('clientChosenByUser') && this.clientChosenByUser) {
      dispatch(this, 'openish-client-change', this.clientChosenByUser)
    }

    const previous = changed.get('ui') as OpenishUiState | undefined
    if (changed.has('ui') && previous?.activeId !== this.ui.activeId) {
      dispatch(this, 'openish-navigate', this.ui.activeId)
    }

    /* Re-matching the URL is a side effect, so it belongs here rather than in `willUpdate`. */
    if (changed.has('basePath') && changed.get('basePath') !== undefined) {
      this.#syncRoutes()
    }

    /* Picking a page is the end of using the navigation, so the disclosure closes behind it. */
    if (previous !== undefined && previous.activeId !== this.ui.activeId && this.navOpen) {
      this.navOpen = false
    }
  }

  /** One column when the host asked for it, or when there is not room for two. */
  get #stacked(): boolean {
    return this.layout === 'classic' || this.#narrow.matches
  }

  /**
   * The navigation, as a column or as a disclosure.
   *
   * Stacked, the sidebar is not rendered at all until it is open - so it is never a tree that is
   * invisible and still reachable by keyboard, which is what hiding it with CSS used to produce.
   */
  #renderNavigation(): TemplateResult {
    if (!this.#stacked) {
      return html`<openish-sidebar></openish-sidebar>`
    }

    return html`
      <button
        type="button"
        class="menu"
        aria-expanded=${this.navOpen ? 'true' : 'false'}
        aria-controls="navigation"
        ${ref(this.#menuButton)}
        @click=${() => {
          this.navOpen = !this.navOpen
        }}
      >
        <span class="marker" aria-hidden="true"></span>
        <span>Navigation</span>
      </button>
      ${this.navOpen
        ? html`
            <div id="navigation" class="navigation" @keydown=${this.#onNavigationKeydown}>
              <openish-sidebar></openish-sidebar>
            </div>
          `
        : nothing}
    `
  }

  /** Escape closes the disclosure from inside it, and hands focus back to the control that opened it. */
  readonly #onNavigationKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') {
      return
    }
    event.preventDefault()
    this.navOpen = false
    this.#menuButton.value?.focus()
  }

  override render(): TemplateResult {
    const showSidebar = this.ui.config.showSidebar && this.store !== undefined

    return html`
      <div
        class=${classMap({ layout: true, stacked: this.#stacked, 'no-sidebar': !showSidebar })}
        @openish-color-scheme-change=${this.#onColorSchemeChange}
        @openish-client-change=${this.#onClientChange}
      >
        ${showSidebar ? this.#renderNavigation() : nothing}
        <main>
          <div class="content">${this.#renderContent()}</div>
        </main>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-api-reference': OpenishApiReference
  }
}

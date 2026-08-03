import { provide } from '@lit/context'
import {
  resolveConfig,
  type ColorSchemePreference,
  type DocumentStore,
  type OpenishConfig,
  type SourceConfig,
} from '@openish/core'
import { virtualize } from '@lit-labs/virtualizer/virtualize.js'
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { keyed } from 'lit/directives/keyed.js'
import { createRef, ref } from 'lit/directives/ref.js'

import type { CredentialStore } from '@openish/client'

import { buildRequestState } from '../context/build.js'
import {
  documentContext,
  requestContext,
  sameRequestState,
  sameSourcesState,
  sameUiState,
  sourcesContext,
  uiContext,
  type OpenishRequestState,
  type OpenishSourcesState,
  type OpenishUiState,
} from '../context/contexts.js'
import { AuthController } from '../controllers/auth.js'
import { ElementWidthController } from '../controllers/element-width.js'
import { RoutingController } from '../controllers/routing.js'
import { SectionsController } from '../controllers/sections.js'
import { ServerChoiceController } from '../controllers/server-choice.js'
import { SourcesController } from '../controllers/sources.js'
import { readStoredClient, writeStoredClient } from '../storage/client-choice.js'
import { dispatch, type OpenishAuthChange } from '../events.js'
import { renderSection } from '../render/render-section.js'
import { documentSections, type Section } from '../render/sections.js'
import { resolvedId, scrollTarget, urlResolves, type PlanePosition } from '../render/scroll-target.js'
import { documentServers } from '../render/servers.js'
import { navigate } from '../router/navigate.js'
import { normalizeBasePath, stripFirstSegment, type RoutingMode } from '../router/urls.js'
import { baseStyles, controlStyles, statusStyles, visuallyHidden } from '../styles/shared.js'
import './openish-markdown.js'
import './openish-sidebar.js'

/**
 * The root of an API reference.
 *
 * Owns the two things that cannot be owned lower down: the document (loaded once, provided as
 * context) and the presentation state (provided as context, changed only by events travelling up).
 *
 * There is no route table and no router. Navigation ids minted by `@openish/core` *are* URL paths,
 * so `store.bySlug` resolves a URL to a node in one lookup and `renderNodeById` renders it - which
 * is all a route table was ever arriving at here. What remains is reading the id out of the URL,
 * which differs by mode and is three lines, and putting it back, which the browser does by itself
 * in the default mode.
 *
 * @fires openish-color-scheme-change - A descendant asked to switch schemes. Re-dispatched so the
 *   host can persist the choice and apply it to its own chrome; the reference itself needs nothing
 *   done for it, because `color-scheme` is reflected and `@openish/theme` matches the attribute.
 * @fires openish-client-change - The reader picked a different code-sample client.
 * @fires openish-navigate - The active node changed. Useful with `routing="none"`.
 */
@customElement('openish-api-reference')
export class OpenishApiReference extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
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
       * One column, whether because the element is narrow or because the host asked for it.
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
        /*
         * Stated, because the default is not what it looks like: a box that scrolls vertically and
         * says nothing about x computes x to auto as well. So one long line anywhere in
         * the document - a deep property tree, a pattern with no spaces in it - did not overflow its
         * own column, it put a horizontal scrollbar under the entire page and moved the sidebar off
         * the side of it.
         *
         * The things that legitimately need to scroll sideways carry their own scroller and their
         * own focus ring: a table wraps one, a code block wraps one. This is the backstop for
         * everything that should have wrapped instead, and the layout test says it is never load
         * bearing.
         */
        overflow-x: hidden;
        /*
         * Explicit, so a host's own smooth-scroll rule cannot turn every correction the virtualiser
         * makes while it converges on a deep link into an animation it then chases.
         */
        scroll-behavior: auto;
      }

      /*
       * No ceiling and no centring: the page fills the window.
       *
       * There used to be an 82rem cap here, which on a wide screen left a band of empty page down
       * both sides and was a large part of why this did not read like the references it is measured
       * against. The measure a reader actually needs is the one prose is set at, and that is now a
       * *track* - --openish-docs-column - so documentation stops growing at the reading measure
       * while the examples beside it take the surplus. Capping the wrapper as well would only put
       * the empty band back outside it.
       */
      .content {
        min-width: 0;
      }

      /*
       * A section, and the width it has to be told.
       *
       * The virtualiser positions every item absolutely, and an absolutely positioned block with no
       * width is shrink-to-fit - so each section would be as wide as its longest line rather than as
       * wide as the plane, and the shared column tracks would land somewhere different on every one
       * of them. The sidebar paid for this once already; see the same rule on its rows.
       */
      /*
       * The gutter is narrower than the space between sections, and deliberately.
       *
       * Vertical space separates one section from the next and there is nothing competing for it.
       * Horizontal space comes straight out of the two columns: three rems of gutter is three rems
       * the content does not have, and it was the difference between a 1200px window getting the
       * two-column arrangement and not. The columns are the measure; the gutter only has to stop the
       * text touching the edge.
       */
      .section {
        width: 100%;
        box-sizing: border-box;
        padding: var(--openish-space-xl) var(--openish-space-md);
        scroll-margin-top: var(--openish-space-lg);
      }

      /* One rule between sections, so a continuous page still reads as a sequence of them. */
      .section + .section {
        border-top: 1px solid var(--openish-color-border);
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
  url: string | undefined = undefined

  /** An inline document: a YAML/JSON string, or an already-parsed object. Property only. */
  @property({ attribute: false })
  spec: string | Record<string, unknown> | undefined = undefined

  /**
   * Several documents, with a picker to move between them. Takes precedence over `url` and `spec`.
   *
   * Using this changes every URL: each document's pages live under its slug, so an operation is at
   * `#/consumer/tags/accounts/listAccounts` rather than `#/tags/accounts/listAccounts`. That is not
   * an accident of the implementation - the slug is what decides which document the rest of the id
   * is about, so it has to be in the URL before the rest of it means anything. A host moving from a
   * single `url` maps its old links with `config.redirect`.
   *
   * Each document keeps its own selected server and its own credentials, because two documents that
   * both declare `oauth2` are usually two different authorization servers.
   */
  @property({ attribute: false })
  sources: SourceConfig[] | undefined = undefined

  /** Presentation options. Property only, because it is an object. */
  @property({ attribute: false })
  config: OpenishConfig | undefined = undefined

  /** URL prefix this reference is mounted under, e.g. `/docs`. Only `routing="history"` reads it. */
  @property({ type: String, attribute: 'base-path' })
  basePath = ''

  /**
   * How the reference reads and writes the URL.
   *
   * `hash` is the default because it is the only one that works everywhere with no cooperation:
   * a fragment link needs no interception, and a reload of `…/docs#/tags/accounts` asks the server
   * for `…/docs`, which it already serves. `history` gives real paths and needs the host to serve
   * the application for every one of them. `none` hands navigation over entirely - the host sets
   * {@link selected} and listens for `openish-navigate`.
   *
   * Unlike previous versions this can be changed on a live element; nothing is installed at connect
   * time any more.
   */
  @property({ type: String })
  routing: RoutingMode = 'hash'

  /** The active node id when `routing="none"`. Ignored otherwise. */
  @property({ type: String })
  selected = ''

  /**
   * Which scheme the reference renders in.
   *
   * `auto`, the default, means the stylesheet follows the reader's `prefers-color-scheme` - so the
   * common case is correct with no attribute, no class, and no script. Setting `light` or `dark`
   * overrides that for this reference alone.
   *
   * Reflected, because that is the whole mechanism: `@openish/theme` matches
   * `openish-api-reference[color-scheme='dark']` and sets `color-scheme` on it, which is what
   * `light-dark()` reads. Without reflection, assigning the property would change nothing visible.
   */
  @property({ type: String, attribute: 'color-scheme', reflect: true })
  colorScheme: ColorSchemePreference = 'auto'

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
    colorScheme: 'auto',
    selectedClient: resolveConfig().defaultHttpClient,
    basePath: '',
    routing: 'hash',
    activeId: '',
    hash: '',
    documentUrl: '',
    slugPrefix: '',
  }

  /** Set once the reader picks a client, so a later config change does not silently override them. */
  @state()
  private clientChosenByUser: string | undefined = undefined

  /** Whether the stored client choice has been consulted. Once only, and only if asked for. */
  #clientRestored = false

  /**
   * The documents on offer, the one on screen, and everything it took to get it there.
   *
   * A controller rather than a dozen fields here, because none of what it holds is reactive state -
   * a cache, an in-flight map and a generation counter - and an element that held them had to
   * announce every mutation of them by hand.
   */
  readonly #sources: SourcesController = new SourcesController(this, {
    configured: () => ({ sources: this.sources, url: this.url, spec: this.spec, config: this.config }),
    named: () => this.#routing.urlId.split('/')[0] ?? '',
    onLoaded: (result) => dispatch(this, 'openish-loaded', result),
  })

  /**
   * The URL, read and written in one place.
   *
   * Constructed after {@link #sources} because it asks it for the slug prefix, and before
   * {@link #sectionsController} because the spy hands its answers straight to it.
   */
  readonly #routing: RoutingController = new RoutingController(this, {
    inputs: () => ({
      mode: this.routing,
      basePath: normalizeBasePath(this.basePath),
      selected: this.selected,
      slugPrefix: this.#sources.slugPrefix,
    }),
    onSameId: () => {
      const target = scrollTarget(this.store, this.#position)
      this.#sectionsController.scrollTo(target.section, target.anchor)
    },
    onNavigate: (id) => dispatch(this, 'openish-navigate', id),
    resolves: () => urlResolves(this.store, this.#position),
    hasSource: (slug) => this.#sources.sources.some((source) => source.slug === slug),
    usesSources: () => this.#sources.usesSources,
  })

  /**
   * What the reader is holding, and the one thing that writes it.
   *
   * One session per document: two documents that both declare `oauth2` are usually two different
   * authorization servers, and one session would send the first one's token to the second.
   */
  readonly #auth: AuthController = new AuthController(this, {
    activeSlug: () => this.#sources.activeSlug,
    usesSources: () => this.#sources.usesSources,
    store: () => this.credentialStore,
    prefilled: () => this.credentials,
    proxyUrl: () => this.ui.config.proxyUrl,
    onChange: (change) => dispatch(this, 'openish-auth-change', change),
  })

  /** The server each document's reader picked, so switching away and back does not forget it. */
  readonly #serverChoice: ServerChoiceController = new ServerChoiceController(this, {
    activeSlug: () => this.#sources.activeSlug,
  })

  /**
   * Credentials a host already has - after its own login, say.
   *
   * A property, never an attribute: a token does not belong in markup, where it would be visible in
   * the DOM inspector and in whatever serialises the page.
   */
  @property({ attribute: false })
  credentials: Record<string, string> | undefined = undefined

  /**
   * Where credentials should be kept between page loads, if anywhere.
   *
   * openish ships no implementation and has no default beyond memory. Where a token may be written,
   * and for how long, is a decision with a threat model attached - `sessionStorage` is reasonable in
   * an internal tool and wrong on a public docs site - and a viewer cannot tell which one it is in.
   * A host that has made that decision passes a `{ read, write, clear }`; one that has not gets a
   * session that lasts exactly as long as the page.
   *
   * Read once, at construction, because the session is created before the first render.
   */
  @property({ attribute: false })
  credentialStore: CredentialStore | undefined = undefined

  /**
   * Every document on offer, and which of them are loaded.
   *
   * Provided separately from the active store so that nothing rendering a page has to know there
   * might be others. Only the picker and search consume it.
   */
  @provide({ context: sourcesContext })
  @state({
    hasChanged: (value: OpenishSourcesState, old: OpenishSourcesState | undefined) =>
      !sameSourcesState(value, old),
  })
  private sourcesState: OpenishSourcesState = {
    sources: [],
    activeSlug: '',
    loaded: new Map(),
    loading: new Set(),
  }

  @provide({ context: requestContext })
  @state({
    hasChanged: (value: OpenishRequestState, old: OpenishRequestState | undefined) =>
      !sameRequestState(value, old),
  })
  private request: OpenishRequestState = {
    server: '',
    serverVariables: {},
    serverUrl: '',
    credentials: {},
    grants: this.#auth.session.snapshot(),
  }

  /**
   * Whether this reference is too narrow for a navigation column beside the page.
   *
   * A media query in CSS could hide the sidebar, and used to - but hiding it left a navigation tree
   * that was invisible and still focusable, and no way to reach it at all. Knowing the answer in
   * JavaScript is what lets the element render a different *thing*: a disclosure, with a button that
   * says whether it is open.
   *
   * *This* element's width, not the window's. It asked the window until now, which is the right
   * answer only for a reference that fills the page: a host that puts one in a column of its own had
   * a narrow reference on a wide viewport, and got the eighteen-rem sidebar and whatever was left.
   * The container queries inside every section already ask the question this way.
   */
  readonly #narrow = new ElementWidthController(this, 48)

  /**
   * Where the reader is on the plane, and how to put them somewhere else.
   *
   * The only thing it is told is the section list; it reads no store and holds no copy of the active
   * id. What it reports comes back through the URL, which stays the single authority - see
   * `#onSpyActive`.
   */
  readonly #sectionsController = new SectionsController(this, { onActive: (id) => this.#routing.follow(id) })

  /** Whether the stacked navigation is showing. Meaningless in the two-column layout. */
  @state()
  private navOpen = false

  /** The disclosure control, so Escape inside the panel can hand focus back to it. */
  readonly #menuButton = createRef<HTMLButtonElement>()


  /** What the plane is being asked for, in the form `render/scroll-target.ts` reads. */
  get #position(): PlanePosition {
    return { activeId: this.ui.activeId, slugPrefix: this.ui.slugPrefix, hash: this.ui.hash }
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
  /**
   * These three are announced again from `updated()`, so the inbound one has to stop here.
   *
   * `dispatch` marks every event `composed`, which is what lets a request from inside a nested
   * shadow root reach this handler at all - but `composed` also means it would carry on past this
   * element to the host, which then hears the reader's request *and* the re-dispatched fact, for
   * every change. The rule is one event per thing that happened: a descendant's is a request
   * addressed to this element, and the host hears what this element decided.
   *
   * `openish-auth-change` is deliberately not in this list - nothing re-dispatches it, so the
   * original escaping is how the host hears about a credential.
   */
  readonly #onColorSchemeChange = (event: CustomEvent<ColorSchemePreference>): void => {
    event.stopPropagation()
    this.colorScheme = event.detail
  }

  readonly #onClientChange = (event: CustomEvent<string>): void => {
    event.stopPropagation()
    this.clientChosenByUser = event.detail
    if (this.ui.config.persistClient) {
      writeStoredClient(event.detail)
    }
  }

  readonly #onServerChange = (event: CustomEvent<{ url: string; variables: Record<string, string> }>): void => {
    event.stopPropagation()
    this.#serverChoice.set(event.detail.url, event.detail.variables)
  }

  /**
   * The reader picked a different document.
   *
   * Answered by navigating to that document's overview rather than by setting a field. The URL is
   * already what decides which document is on screen - that is what makes a deep link and a reload
   * work - so routing the pick through it keeps one answer instead of two.
   */
  readonly #onSourceChange = (event: CustomEvent<string>): void => {
    event.stopPropagation()
    const slug = event.detail
    if (slug === this.#sources.activeSlug || !this.#sources.sources.some((source) => source.slug === slug)) {
      return
    }

    if (this.routing === 'none') {
      dispatch(this, 'openish-navigate', slug)
      return
    }
    navigate(this.#routing.state, slug)
  }

  /**
   * Every change to what the reader is holding, on its way to the one thing that writes it.
   *
   * A form that set a credential itself would be a second writer, and two writers is two ideas of
   * what the reader is holding. It dispatches instead, and hears the result back as context.
   *
   * Deliberately not stopped: nothing re-dispatches this one, so the original escaping is how the
   * host hears about a credential.
   */
  readonly #onAuthChange = (event: CustomEvent<OpenishAuthChange>): void => {
    this.#auth.apply(event.detail)
  }

  /** The server templates the document offers, in its own order. */
  get #servers(): string[] {
    return documentServers(this.ui.config, this.store?.document.servers)
  }

  /**
   * The three provided contexts, assembled from what the controllers hold.
   *
   * The only `willUpdate` on this element, and the reason it exists at all: everywhere else a
   * derived value is a getter, but these are *provided*, and a context provider pushes - so the
   * value has to be assigned somewhere in the update. An assignment here joins the update already
   * in flight; one in `updated` schedules a second render, which is where the bugs live. Each
   * context's `hasChanged` then decides whether anything downstream needs to hear about it.
   */
  protected override willUpdate(): void {
    const config = this.store?.config ?? resolveConfig(this.config)

    /*
     * The reader's last client choice, if the host asked for it to be remembered. Read here rather
     * than at connect, because the config that permits it arrives as a property.
     */
    if (!this.#clientRestored && config.persistClient) {
      this.#clientRestored = true
      const stored = readStoredClient()
      if (stored !== undefined) {
        this.clientChosenByUser = stored
      }
    }

    this.store = this.#sources.store
    this.sourcesState = this.#sources.state
    this.#auth.applyPrefilled()

    this.request = buildRequestState({
      store: this.store,
      server: this.#serverChoice.server || this.#servers[0] || '',
      serverVariables: this.#serverChoice.variables,
      session: this.#auth.session,
    })

    this.#sectionsController.observe(documentSections(this.store))

    this.ui = {
      config,
      colorScheme: this.colorScheme,
      selectedClient: this.clientChosenByUser ?? config.defaultHttpClient,
      basePath: normalizeBasePath(this.basePath),
      routing: this.routing,
      documentUrl: this.store?.source.url || (this.#sources.usesSources ? '' : (this.url ?? '')),
      slugPrefix: this.#sources.slugPrefix,
      activeId: this.#routing.activeId,
      /*
       * The fragment is the heading the overview should scroll to - but only `history` mode has a
       * fragment to spare. In the other two the id is *in* the fragment, and a heading from
       * `info.description` is a navigation node in its own right, which `renderNode` already knows
       * means "the overview, scrolled here".
       */
      hash: this.#routing.hash,
    }
  }

  /**
   * Why there is nothing to route into yet, if that is the case.
   *
   * Gating the outlet on this - rather than repeating the checks inside every route - means a
   * routed element can assume the document exists, and the loading and error states are stated once.
   */
  #renderLoadState(): TemplateResult | undefined {
    if (!this.#sources.hasSource) {
      return html`<p class="status" role="status">No document loaded.</p>`
    }

    /*
     * The second half is the deep link into a document nobody has selected yet: the idle prefetch
     * may already be building it, in which case the task is waiting on that same promise rather
     * than running. Saying "loading" is the truthful answer; "not found" would be a lie the reader
     * would act on.
     */
    if (this.#sources.pending || this.sourcesState.loading.has(this.sourcesState.activeSlug)) {
      return html`<p class="status" role="status">Loading the API reference…</p>`
    }

    const error = this.#sources.error
    if (error) {
      return html`
        <div class="status">
          <div class="error" role="alert">${error instanceof Error ? error.message : String(error)}</div>
        </div>
      `
    }

    return this.store ? undefined : html`<p class="status" role="status">No document loaded.</p>`
  }

  /** Every section of the active document, in reading order. Memoised on the store. */
  get #sections(): readonly Section[] {
    return documentSections(this.store)
  }

  /**
   * The whole document, as one scroller.
   *
   * `virtualize` rather than `<lit-virtualizer>`: `main` has to stay the scroller - the sticky
   * examples column and the sticky navigation disclosure both hang off that, and so does the height
   * chain the README insists on - and the directive finds its clipping ancestor rather than owning a
   * scroller of its own.
   *
   * `keyed` on the store, so switching documents builds a new plane rather than handing the reader
   * the last one with new items in it. That also drops the previous document's try-it panels, which
   * is right: credentials are per document.
   */
  #renderPlane(): unknown {
    const loading = this.#renderLoadState()
    if (loading) {
      return loading
    }

    const position = this.#position
    const missing = this.store !== undefined && !urlResolves(this.store, position)
    /* Hoisted out of the item renderer: the answer is the same for every section on the plane. */
    const active = resolvedId(this.store, position)

    return html`
      ${missing ? this.#renderNotFound() : nothing}
      <div
        class="content"
        part="content"
        ${ref(this.#onPlaneRef)}
        @visibilityChanged=${this.#sectionsController.onVisibilityChanged}
      >
        ${keyed(
          this.store,
          virtualize({
            items: [...this.#sections],
            keyFunction: (section) => (section as Section).id,
            renderItem: (section) => html`
              <div class="section" data-id=${(section as Section).id} data-kind=${(section as Section).kind}>
                ${renderSection(section as Section, { active: (section as Section).id === active })}
              </div>
            `,
          }),
        )}
      </div>
    `
  }

  /**
   * An id the document has no section for.
   *
   * Above the plane rather than instead of it. The document is on screen and the reader is not lost
   * - which is the whole difference a continuous page makes to this case - so the banner says which
   * id failed and leaves them somewhere they can read.
   */
  #renderNotFound(): TemplateResult {
    const shown = this.ui.slugPrefix ? stripFirstSegment(this.ui.activeId) : this.ui.activeId
    return html`
      <div class="status">
        <h1>Not found</h1>
        <p>Nothing in this document matches <code>${shown}</code>.</p>
      </div>
    `
  }

  readonly #onPlaneRef = (element: Element | undefined): void => {
    this.#sectionsController.plane = element
  }

  /** Finishes an authorization the reader was redirected away for, if this load is that return. */
  protected override firstUpdated(): void {
    void this.#auth.resume()
  }

  /**
   * Announcements, and the one piece of coordination between two controllers.
   *
   * Every announcement is decided by a reactive property, so Lit's own `changedProperties` is the
   * record of what happened - there is no "last announced" field beside them and no way for the two
   * to disagree.
   */
  protected override updated(changed: PropertyValues): void {
    this.#routing.adoptApiParam()

    if (changed.has('colorScheme')) {
      dispatch(this, 'openish-color-scheme-change', this.colorScheme)
    }
    if (changed.has('clientChosenByUser') && this.clientChosenByUser) {
      dispatch(this, 'openish-client-change', this.clientChosenByUser)
    }

    /*
     * The server, out of the request rather than out of a pair of fields beside it.
     *
     * `request` is rebuilt on every update and compared, so what `changedProperties` holds is the
     * previous *value* - which is the only place the old server still exists now that the reader's
     * choice lives in a controller. Credentials change it too, hence the two explicit reads.
     */
    const before = changed.get('request') as OpenishRequestState | undefined
    if (
      changed.has('request') &&
      (before === undefined ||
        before.server !== this.request.server ||
        before.serverVariables !== this.request.serverVariables)
    ) {
      dispatch(this, 'openish-server-change', { url: this.request.server, variables: this.request.serverVariables })
    }

    const previous = changed.get('ui') as OpenishUiState | undefined
    const moved = changed.has('ui') && previous?.activeId !== this.ui.activeId

    /*
     * Scrolling follows the *resolved* target, not the active id.
     *
     * A deep link asks for its section before the document has arrived, so the id in the URL is
     * final several updates before it resolves to anything - and watching the id alone meant the one
     * update that could have scrolled was the one where nothing had changed. Watching what the id
     * resolves to covers both: a navigation, and a document turning up under a URL that was already
     * pointing into it.
     */
    const { section, anchor } = scrollTarget(this.store, this.#position)
    if (this.#sectionsController.arriveAt(section, anchor)) {
      if (this.#routing.followingAt(this.ui.activeId)) {
        /* The URL came to the reader. Nothing to do but stop expecting to be told again. */
        this.#routing.settle()
      } else {
        this.#sectionsController.scrollTo(section, anchor)
      }
    }

    /*
     * In `none` mode the host is the one navigating, so the click handler has already sent the
     * request and this would be announcing the host's own decision back to it.
     */
    if (this.routing !== 'none' && moved) {
      /*
       * The id as the URL has it, which is the same shape `selected` takes and the same shape the
       * `none`-mode request carries. A host that echoes what it hears back into `selected` has to
       * get the round trip it expects, and only one of the two spellings can be that.
       */
      dispatch(this, 'openish-navigate', this.#routing.urlId)
    }

    /*
     * Picking a page is the end of using the navigation, so the disclosure closes behind it - but
     * scrolling is not picking, and the URL now changes while the reader scrolls.
     */
    if (previous !== undefined && moved && !this.#routing.writing && this.navOpen) {
      this.navOpen = false
    }
  }

  /** One column when the host asked for it, or when there is not room for two. */
  get #stacked(): boolean {
    return this.#narrow.narrow
  }

  /**
   * The navigation, as a column or as a disclosure.
   *
   * Stacked, the sidebar is not rendered at all until it is open - so it is never a tree that is
   * invisible and still reachable by keyboard, which is what hiding it with CSS used to produce.
   */
  #renderNavigation(): TemplateResult {
    if (!this.#stacked) {
      return html`<openish-sidebar part="sidebar" exportparts="search, tree"></openish-sidebar>`
    }

    return html`
      <button
        type="button"
        class="menu"
        part="menu"
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
              <openish-sidebar part="sidebar" exportparts="search, tree"></openish-sidebar>
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
        @click=${this.#routing.onClick}
        @openish-color-scheme-change=${this.#onColorSchemeChange}
        @openish-client-change=${this.#onClientChange}
        @openish-server-change=${this.#onServerChange}
        @openish-source-change=${this.#onSourceChange}
        @openish-auth-change=${this.#onAuthChange}
      >
        ${showSidebar ? this.#renderNavigation() : nothing}
        <main part="main">
          <slot name="content-start"></slot>
          ${this.#renderPlane()}
          <slot name="content-end"></slot>
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

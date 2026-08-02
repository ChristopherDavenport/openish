import { provide } from '@lit/context'
import { Task, TaskStatus } from '@lit/task'
import {
  createDocumentStore,
  resolveConfig,
  resolveServerUrl,
  resolveSources,
  type ColorSchemePreference,
  type DocumentStore,
  type OpenishConfig,
  type ResolvedSource,
  type SourceConfig,
} from '@openish/core'
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { createRef, ref } from 'lit/directives/ref.js'

import {
  AuthSession,
  exchangeCode,
  resumeRedirect,
  tokenFromFragment,
  type CredentialStore,
} from '@openish/client'

import { scopedCredentialStore } from '../auth/scoped-credential-store.js'
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
import { LocationController } from '../controllers/location.js'
import { MediaQueryController } from '../controllers/media-query.js'
import { SourcePrefetchController } from '../controllers/source-prefetch.js'
import { readStoredClient, writeStoredClient } from '../storage/client-choice.js'
import { dispatch } from '../events.js'
import { renderNodeById } from '../render/render-node.js'
import { navigate } from '../router/navigate.js'
import {
  applySlugPrefix,
  hrefForOverview,
  idFromHash,
  idFromPathname,
  normalizeBasePath,
  stripFirstSegment,
  type RoutingMode,
} from '../router/urls.js'
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

      /*
       * The page decides its own measure, not this wrapper.
       *
       * The wide value is a ceiling rather than a width: the overview, tag and model pages cap
       * themselves at the prose measure, and only the operation page - which puts two columns side
       * by side - uses the room. Capping here instead meant the operation page could never be wider
       * than one column's worth, so its container query could never fire.
       */
      .content {
        max-width: var(--openish-content-max-width-wide);
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

  /** Stores built so far, keyed by slug. A store is immutable, so one is only ever built once. */
  readonly #stores = new Map<string, DocumentStore>()

  /**
   * Loads in flight, keyed by slug.
   *
   * Two things ask for a document - the reader navigating to it, and the idle prefetch warming it -
   * and without this they would fetch and parse it twice.
   */
  readonly #inflight = new Map<string, Promise<DocumentStore>>()

  /**
   * Bumped whenever the configured documents change, so a load started against the old
   * configuration cannot write its result into the new one's cache.
   */
  #generation = 0

  #sourcesKey: readonly unknown[] = []
  #sourcesCache: readonly ResolvedSource[] = []

  /**
   * What the reader is holding, for the life of this page.
   *
   * Owned here rather than by the panel that shows it, because a reader authorises once and every
   * operation uses it. `openish-auth-change` announces every change either way, so a host can
   * persist by listening rather than by supplying a store if that suits it better.
   */
  readonly #sessions = new Map<string, AuthSession>()
  #sessionStore: CredentialStore | undefined
  #sessionStoreSeen = false

  /**
   * The session for the document on screen, built against whatever store the host has given by now.
   *
   * There is no single moment when "now" is late enough for a field initialiser: `request`'s own
   * initial value names a session, so the constructor asks for one before any property assignment
   * has happened. So it is built on first use *and* rebuilt in `connectedCallback` if a store has
   * arrived since - which is the point where `element.credentialStore = …; parent.append(element)`
   * has certainly run, and still before the first render. Rebuilding costs nothing: the session it
   * replaces cannot have anything in it yet.
   *
   * One per document, because two documents that both declare `oauth2` are usually two different
   * authorization servers, and one session would send the first one's token to the second.
   */
  get #session(): AuthSession {
    return this.#sessionFor(this.#activeSlug)
  }

  #sessionFor(slug: string): AuthSession {
    if (!this.#sessionStoreSeen || this.#sessionStore !== this.credentialStore) {
      this.#sessionStoreSeen = true
      this.#sessionStore = this.credentialStore
      this.#sessions.clear()
    }

    const existing = this.#sessions.get(slug)
    if (existing) {
      return existing
    }

    /*
     * A single-document reference is handed the host's store untouched, so anything it has already
     * persisted still reads back. Only `sources` namespaces, because only `sources` can collide.
     */
    const store =
      this.credentialStore && this.#usesSources
        ? scopedCredentialStore(this.credentialStore, slug)
        : this.credentialStore

    const session = new AuthSession(store ? { store } : {})
    this.#sessions.set(slug, session)
    return session
  }

  override connectedCallback(): void {
    super.connectedCallback()
    /* Reads the getter, which is what rebuilds the session against a store set before append. */
    void this.#session
  }

  @state()
  private server = ''

  @state()
  private serverVariables: Record<string, string> = {}

  /**
   * The server each document's reader picked, so switching away and back does not forget it.
   *
   * A plain map rather than state: `server` and `serverVariables` above are the reactive pair, and
   * this is only where the inactive documents' answers wait.
   */
  readonly #serverChoice = new Map<string, { server: string; variables: Record<string, string> }>()

  /** Which document `server` currently describes, so `willUpdate` can tell when it has to swap. */
  #serverSlug: string | undefined

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

  /** Prefilled credentials are a starting state, not something to reapply over the reader's edits. */
  #appliedCredentials = false

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
    session: this.#session,
  }

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


  /** Whether the host configured several documents rather than one. */
  get #usesSources(): boolean {
    return (this.sources?.length ?? 0) > 0
  }

  /**
   * The documents this reference offers, with their slugs and titles decided.
   *
   * A reference configured with `url` or `spec` gets a one-entry list rather than a special case:
   * the store it builds has a source like any other, and the only thing that makes it different is
   * that the URL leaves the slug out.
   */
  get #sources(): readonly ResolvedSource[] {
    const key = [this.sources, this.url, this.spec, this.config] as const
    if (key.length === this.#sourcesKey.length && key.every((value, index) => this.#sourcesKey[index] === value)) {
      return this.#sourcesCache
    }

    /*
     * Invalidated here rather than in `willUpdate` because `@lit/task` reads `args()` from
     * `hostUpdate`, and whichever of the two runs first, the answer has to be the same. A load
     * already in flight is left to finish and discarded by its generation check.
     */
    this.#sourcesKey = key
    this.#generation += 1
    this.#stores.clear()
    this.#inflight.clear()
    this.#sourcesCache = resolveSources(this.#usesSources ? this.sources! : [this.#implicitSource()])
    return this.#sourcesCache
  }

  /**
   * The sources, with a generated title replaced by the document's own once it has loaded.
   *
   * A host that named its documents gets exactly those names. One that did not gets `API #2` in the
   * picker until the document arrives and then what the document calls itself, which is the name the
   * reader would recognise. The slug never moves - it is in every URL - so this is a label change
   * and nothing more.
   */
  #titled(): readonly ResolvedSource[] {
    const sources = this.#sources
    if (!sources.some((source) => source.titleIsGenerated)) {
      return sources
    }

    return sources.map((source) => {
      const title = this.#stores.get(source.slug)?.document.info?.title
      return source.titleIsGenerated && title ? { ...source, title } : source
    })
  }

  /** The single document a host named with `url` or `spec`, as a source like any other. */
  #implicitSource(): SourceConfig {
    return {
      ...(this.url !== undefined ? { url: this.url } : {}),
      ...(this.spec !== undefined ? { content: this.spec } : {}),
    }
  }

  /** The document on screen: the one the URL names, else the one marked `default`, else the first. */
  get #activeSlug(): string {
    const sources = this.#sources
    if (sources.length === 0) {
      return ''
    }
    if (!this.#usesSources) {
      return sources[0]!.slug
    }

    const named = this.#urlId(normalizeBasePath(this.basePath)).split('/')[0] ?? ''
    if (sources.some((source) => source.slug === named)) {
      return named
    }
    return (sources.find((source) => source.isDefault) ?? sources[0]!).slug
  }

  /**
   * The document slug the URL leaves out.
   *
   * Empty whenever `sources` is used: there the slug is what decides which document an id is about,
   * so it has to be in the URL. The single-document case is the only one that can imply it.
   */
  get #slugPrefix(): string {
    return this.#usesSources ? '' : (this.#sources[0]?.slug ?? '')
  }

  /**
   * Builds a document's store, or hands back the one already built.
   *
   * openish's port of Scalar's `ensureDocumentLoaded`: cache, then in-flight, then do the work.
   */
  #loadSource(slug: string): Promise<DocumentStore> {
    const cached = this.#stores.get(slug)
    if (cached) {
      return Promise.resolve(cached)
    }
    const pending = this.#inflight.get(slug)
    if (pending) {
      return pending
    }

    const source = this.#sources.find((candidate) => candidate.slug === slug)
    if (!source) {
      return Promise.reject(new Error(`No document is configured with the slug "${slug}".`))
    }

    const generation = this.#generation
    const promise = (async () => {
      const input = source.content ?? (source.url ? await this.#fetchDocument(source.url) : undefined)
      if (input === undefined) {
        throw new Error(`The document "${slug}" names neither a url nor content.`)
      }

      const store = await createDocumentStore(input, {
        config: { ...this.config, ...source.config },
        source: { slug: source.slug, title: source.title, url: source.url },
      })

      /* The configuration changed while this was in the air; the result belongs to nothing now. */
      if (generation === this.#generation) {
        this.#stores.set(slug, store)
      }
      return store
    })().finally(() => {
      this.#inflight.delete(slug)
      /* So the picker stops saying "loading" and search picks up a document that has just landed. */
      this.requestUpdate()
    })

    this.#inflight.set(slug, promise)
    return promise
  }

  /** Warms the documents the reader has not asked for, while the browser is idle. */
  readonly #prefetch = new SourcePrefetchController(this, {
    pending: () => this.#sources.map((source) => source.slug).filter((slug) => !this.#stores.has(slug)),
    load: (slug) => this.#loadSource(slug).then(() => undefined),
  })

  readonly #loadTask = new Task(this, {
    task: async ([slug]: readonly [string, readonly ResolvedSource[]]) => {
      if (slug === '') {
        return undefined
      }
      return this.#loadSource(slug)
    },
    args: () => [this.#activeSlug, this.#sources] as const,
    onComplete: (value) => {
      this.store = value
      if (value) {
        dispatch(this, 'openish-loaded', { ok: true, store: value })
      }
      /* Only once a document is on screen, so the first one is never competing for the network. */
      this.#prefetch.start()
    },
    onError: (error: unknown) => {
      this.store = undefined
      dispatch(this, 'openish-loaded', {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      })
    },
  })

  /** Whether a document has been configured at all. An empty `url` counts as "not configured". */
  get #hasSource(): boolean {
    return this.#sources.length > 0
  }

  async #fetchDocument(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`)
    }
    return response.text()
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
    this.server = event.detail.url
    this.serverVariables = event.detail.variables
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
    if (slug === this.#activeSlug || !this.#sources.some((source) => source.slug === slug)) {
      return
    }

    const routing = { routing: this.routing, basePath: normalizeBasePath(this.basePath), slugPrefix: this.#slugPrefix }
    if (this.routing === 'none') {
      dispatch(this, 'openish-navigate', slug)
      return
    }
    navigate(routing, slug)
  }

  /**
   * The only thing that writes to the session.
   *
   * A form that wanted to set a credential itself would be a second writer, and two writers is two
   * ideas of what the reader is holding. It dispatches instead, and hears the result back as context.
   */
  readonly #onAuthChange = (event: CustomEvent<import('../events.js').OpenishAuthChange>): void => {
    const change = event.detail

    switch (change.kind) {
      case 'pasted':
        this.#session.setPasted(change.scheme, change.value)
        break
      case 'authorizing':
        this.#session.beginAuthorizing(change.scheme)
        break
      case 'token':
        this.#session.setToken(change.scheme, change.token)
        break
      case 'failed':
        this.#session.fail(change.scheme, change.message)
        break
      case 'clear':
        this.#session.clear(change.scheme)
        break
    }

    this.requestUpdate()
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
  /**
   * Finishes an authorization that navigated away and came back.
   *
   * Runs once, on the first update, because that is when the URL carrying the code is still there -
   * `resumeRedirect` strips it immediately, so nothing downstream ever sees a code in the address
   * bar. The reader is then sent back to the page they left, which may not be where the provider
   * returned them.
   */
  async #resumeOAuth(): Promise<void> {
    const resumed = resumeRedirect()
    if (!resumed) {
      return
    }

    const { pending, outcome } = resumed
    if (!outcome.ok) {
      this.#session.fail(pending.scheme, outcome.message)
      this.requestUpdate()
      return
    }

    this.#session.beginAuthorizing(pending.scheme)
    this.requestUpdate()

    /*
     * A redirect that came back with a token rather than a code is an implicit flow, which has
     * nothing to exchange. `resumeRedirect` has already verified the state and stripped the URL.
     */
    if (outcome.accessToken !== undefined) {
      const implicit = tokenFromFragment(outcome.fragment)
      if (implicit) {
        this.#session.setToken(pending.scheme, {
          accessToken: implicit.accessToken,
          tokenType: implicit.tokenType,
          scope: implicit.scope,
          ...(implicit.expiresAt !== undefined ? { expiresAt: implicit.expiresAt } : {}),
        })
      } else {
        this.#session.fail(pending.scheme, 'The provider returned no usable token.')
      }
      this.requestUpdate()
      return
    }

    const proxyUrl = this.ui.config.proxyUrl
    const result = await exchangeCode(
      {
        tokenEndpoint: pending.tokenEndpoint,
        code: outcome.code,
        verifier: pending.verifier,
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
      },
      proxyUrl ? { proxyUrl } : {},
    )

    if (result.ok) {
      this.#session.setToken(pending.scheme, result.token)
    } else {
      this.#session.fail(pending.scheme, result.message)
    }
    this.requestUpdate()

    /*
     * `resumeRedirect` has already stripped the provider's `code` and `state` out of the URL, so
     * what is left differing from `returnTo` is the page the reader was on before they were sent
     * away. Restoring it is a `replaceState` rather than a push: the authorization round trip is not
     * a place the back button should be able to return to.
     */
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (pending.returnTo && pending.returnTo !== here) {
      window.history.replaceState(window.history.state, '', pending.returnTo)
      this.requestUpdate()
    }
  }

  /** The server templates the document offers, in its own order. */
  get #servers(): string[] {
    /*
     * A host's list replaces the document's rather than adding to it. "Both" would leave a reader
     * choosing between environments the host has already decided are not on offer.
     */
    const configured = this.ui.config.servers
    const servers = configured.length > 0 ? configured : (this.store?.document.servers ?? [])
    const base = this.ui.config.baseServerURL

    return servers
      .map((server) => server.url ?? '')
      .filter((url) => url !== '')
      /* A relative server is only meaningful against something; `baseServerURL` is that something. */
      .map((url) => (base && url.startsWith('/') ? `${base.replace(/\/$/, '')}${url}` : url))
  }

  protected override willUpdate(): void {
    const base = normalizeBasePath(this.basePath)
    const config = this.store?.config ?? resolveConfig(this.config)
    const activeSlug = this.#activeSlug

    /*
     * The reader's last client choice, if the host asked for it to be remembered.
     *
     * Read here rather than at connect because the config that permits it arrives as a property, and
     * assigned here rather than in `updated()` for the reason the server swap above gives: this
     * joins the update in flight instead of scheduling a second one.
     */
    if (!this.#clientRestored && config.persistClient) {
      this.#clientRestored = true
      const stored = readStoredClient()
      if (stored !== undefined) {
        this.clientChosenByUser = stored
      }
    }

    /*
     * The server the reader picked follows the document it was picked for. Assigned here rather
     * than watched for in `updated()`: this joins the update already in flight, where a second
     * assignment would schedule a second render.
     */
    if (this.#serverSlug !== activeSlug) {
      if (this.#serverSlug !== undefined) {
        this.#serverChoice.set(this.#serverSlug, { server: this.server, variables: this.serverVariables })
      }
      const restored = this.#serverChoice.get(activeSlug)
      this.server = restored?.server ?? ''
      this.serverVariables = restored?.variables ?? {}
      this.#serverSlug = activeSlug
    }

    this.sourcesState = {
      sources: this.#titled(),
      activeSlug,
      loaded: new Map(this.#stores),
      loading: new Set(this.#inflight.keys()),
    }

    /* A host's prefilled credentials are applied once, as the starting state, not on every update. */
    if (this.credentials && !this.#appliedCredentials) {
      this.#appliedCredentials = true
      for (const [scheme, value] of Object.entries(this.credentials)) {
        this.#session.setPasted(scheme, value)
      }
    }

    const server = this.server || this.#servers[0] || ''
    const declared = this.store?.document.servers?.find((candidate) => candidate.url === server)

    this.request = {
      server,
      serverVariables: this.serverVariables,
      serverUrl: declared ? resolveServerUrl(declared, this.serverVariables) : server,
      credentials: this.#session.credentials(),
      session: this.#session,
    }

    this.ui = {
      config,
      colorScheme: this.colorScheme,
      selectedClient: this.clientChosenByUser ?? config.defaultHttpClient,
      basePath: base,
      routing: this.routing,
      documentUrl: this.store?.source.url || (this.#usesSources ? '' : (this.url ?? '')),
      slugPrefix: this.#slugPrefix,
      activeId: this.#activeId(base),
      /*
       * The fragment is the heading the overview should scroll to - but only `history` mode has a
       * fragment to spare. In the other two the id is *in* the fragment, and a heading from
       * `info.description` is a navigation node in its own right, which `renderNode` already knows
       * means "the overview, scrolled here".
       */
      hash: this.routing === 'history' ? this.#location.hash : '',
    }
  }

  /**
   * The id as the URL has it, before the implied document slug is put back.
   *
   * Separate from {@link #activeId} because {@link #activeSlug} has to read it to find out which
   * document the URL names, and it cannot use the full id to do that - deciding the prefix is the
   * very thing it is in the middle of.
   */
  #urlId(base: string): string {
    switch (this.routing) {
      case 'history':
        return idFromPathname(this.#location.pathname, base)
      case 'hash':
        return idFromHash(this.#location.hash)
      case 'none':
        return this.selected
    }
  }

  /** Which node the reference is showing, according to whatever is authoritative in this mode. */
  #activeId(base: string): string {
    return applySlugPrefix(this.#urlId(base), this.#slugPrefix)
  }

  /**
   * Click interception, for the two modes that need it.
   *
   * `hash` needs none: a fragment link is navigation the browser performs itself, and the
   * `hashchange` that follows is already a reactive input through `LocationController`. That is the
   * whole reason it is the default.
   *
   * `history` needs `pushState` instead of a page load. `none` needs the click to become an
   * `openish-navigate` for the host - without this a sidebar link in that mode navigated the browser
   * to a URL the host had never agreed to serve.
   *
   * Bound in the template rather than with `addEventListener`, and reading `composedPath()` so that
   * anchors inside a nested shadow root - which is all of them - are seen.
   */
  readonly #onClick = (event: MouseEvent): void => {
    if (this.routing === 'hash' || event.defaultPrevented || event.button !== 0) {
      return
    }
    /* A modified click is the reader asking for a new tab or a download. Leave it to the browser. */
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }

    const anchor = event.composedPath().find((target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement)
    if (!anchor || anchor.target !== '' || anchor.hasAttribute('download') || anchor.origin !== window.location.origin) {
      return
    }

    event.preventDefault()

    if (this.routing === 'none') {
      /*
       * `none` renders fragment hrefs - see `hrefFor` - so the id is in the anchor's hash, not its
       * path. This is the *request*, and it is the only `openish-navigate` this mode sends: the host
       * answers by setting `selected`, and re-announcing that back at it would be telling the host
       * what the host just decided.
       */
      dispatch(this, 'openish-navigate', idFromHash(anchor.hash))
      return
    }

    window.history.pushState({}, '', anchor.href)
    /* `pushState` fires nothing; `LocationController` is listening for the browser's own signal. */
    window.dispatchEvent(new PopStateEvent('popstate'))
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

    /*
     * The second half is the deep link into a document nobody has selected yet: the idle prefetch
     * may already be building it, in which case the task is waiting on that same promise rather
     * than running. Saying "loading" is the truthful answer; "not found" would be a lie the reader
     * would act on.
     */
    if (this.#loadTask.status === TaskStatus.PENDING || this.sourcesState.loading.has(this.sourcesState.activeSlug)) {
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

  /**
   * The page, from the active id.
   *
   * One call, in every mode. The modes differ in where the id came from and in what has to happen
   * for it to change; none of them differ in what an id means.
   */
  #renderContent(): unknown {
    return (
      this.#renderLoadState() ??
      renderNodeById(this.store, this.ui.activeId, this.ui.hash, this.ui.slugPrefix)
    )
  }

  /**
   * Announcements, decided by what actually changed.
   *
   * Every one of these is a reactive property, so Lit's own `changedProperties` is the record of
   * what happened - there is no "last announced" field to keep beside them and no way for the two
   * to disagree.
   */
  protected override firstUpdated(): void {
    void this.#resumeOAuth()
  }

  /** Whether `?api=` has been dealt with. Once only, however late the documents arrive. */
  #adoptedApiParam = false

  /**
   * `?api=<slug>` selects a document, then takes itself back out of the URL.
   *
   * A link into a reference has to name an id to be a deep link, and an id begins with a slug the
   * linker may not know - a host publishing "the admin API" from its own navigation knows the slug
   * and nothing else. This is the shape for that, ported from Scalar. It is rewritten to the
   * canonical URL immediately, with `replaceState` rather than `pushState`, so the reader's Back
   * button does not land on a URL that only redirects again.
   */
  #adoptApiParam(): void {
    /*
     * Not in `firstUpdated`: a host that fetches its own list of documents assigns `sources` after
     * the element is in the DOM, so the first update is usually too early to know whether the param
     * names anything. This runs on every update until there are documents to check it against.
     */
    if (this.#adoptedApiParam || typeof window === 'undefined' || !this.#usesSources) {
      return
    }
    this.#adoptedApiParam = true

    const url = new URL(window.location.href)
    const slug = url.searchParams.get('api')
    if (!slug || !this.#sources.some((source) => source.slug === slug)) {
      return
    }

    url.searchParams.delete('api')
    const routing = { routing: this.routing, basePath: normalizeBasePath(this.basePath), slugPrefix: '' }
    const target = hrefForOverview(routing, slug)

    if (this.routing === 'history') {
      url.pathname = target
    } else {
      url.hash = target
    }
    window.history.replaceState(window.history.state, '', url.toString())
    this.requestUpdate()
  }

  protected override updated(changed: PropertyValues): void {
    this.#adoptApiParam()

    if (changed.has('colorScheme')) {
      dispatch(this, 'openish-color-scheme-change', this.colorScheme)
    }
    if (changed.has('clientChosenByUser') && this.clientChosenByUser) {
      dispatch(this, 'openish-client-change', this.clientChosenByUser)
    }
    if (changed.has('server') || changed.has('serverVariables')) {
      dispatch(this, 'openish-server-change', { url: this.request.server, variables: this.request.serverVariables })
    }

    /*
     * In `none` mode the host is the one navigating, so `#onClick` has already sent the request and
     * this would be announcing the host's own decision back to it.
     */
    const previous = changed.get('ui') as OpenishUiState | undefined
    if (this.routing !== 'none' && changed.has('ui') && previous?.activeId !== this.ui.activeId) {
      /*
       * The id as the URL has it, which is the same shape `selected` takes and the same shape the
       * `none`-mode request carries. A host that echoes what it hears back into `selected` has to
       * get the round trip it expects, and only one of the two spellings can be that.
       */
      dispatch(this, 'openish-navigate', this.#slugPrefix ? stripFirstSegment(this.ui.activeId) : this.ui.activeId)
    }

    /* Picking a page is the end of using the navigation, so the disclosure closes behind it. */
    if (previous !== undefined && previous.activeId !== this.ui.activeId && this.navOpen) {
      this.navOpen = false
    }
  }

  /** One column when the host asked for it, or when there is not room for two. */
  get #stacked(): boolean {
    return this.#narrow.matches
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
        @click=${this.#onClick}
        @openish-color-scheme-change=${this.#onColorSchemeChange}
        @openish-client-change=${this.#onClientChange}
        @openish-server-change=${this.#onServerChange}
        @openish-source-change=${this.#onSourceChange}
        @openish-auth-change=${this.#onAuthChange}
      >
        ${showSidebar ? this.#renderNavigation() : nothing}
        <main part="main">
          <div class="content" part="content">
            <slot name="content-start"></slot>
            ${this.#renderContent()}
            <slot name="content-end"></slot>
          </div>
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

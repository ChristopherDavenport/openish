import { createContext } from '@lit/context'
import type { AuthSession } from '@openish/client'
import type {
  ColorSchemePreference,
  DocumentStore,
  ResolvedOpenishConfig,
  ResolvedSource,
} from '@openish/core'

import type { RoutingMode } from '../router/urls.js'

/**
 * The parsed document, or `undefined` while it is still loading or failed to load.
 *
 * Provided once by `<openish-api-reference>`. The store is immutable, so a new document means a new
 * store object and every consumer re-renders because the context value changed - there is no
 * subscription, no reactivity, and nothing for a child to mutate.
 */
export const documentContext = createContext<DocumentStore | undefined>(Symbol('openish-document'))

/**
 * Every document the reference offers, and which of them are loaded.
 *
 * Separate from {@link documentContext}, which stays the *active* store - so nothing that renders a
 * page has to learn that there might be others. Only two things consume this: the picker, which
 * needs the list before anything has loaded, and search, which spans every document that has.
 */
export type OpenishSourcesState = {
  /** In configured order. One entry, synthesised, when the host used `url` or `spec`. */
  readonly sources: readonly ResolvedSource[]
  readonly activeSlug: string
  /** Stores built so far, keyed by slug. Grows as the idle prefetch lands. */
  readonly loaded: ReadonlyMap<string, DocumentStore>
  /** Slugs currently being fetched or parsed. */
  readonly loading: ReadonlySet<string>
}

export const sourcesContext = createContext<OpenishSourcesState>(Symbol('openish-sources'))

/**
 * Whether two source states say the same thing. See {@link sameUiState} for why this exists.
 *
 * `loaded` is compared by size and by key, not by store identity: a store is replaced wholesale, and
 * the map is rebuilt on every update, so identity would report a change on every render.
 */
export const sameSourcesState = (
  left: OpenishSourcesState,
  right: OpenishSourcesState | undefined,
): boolean =>
  right !== undefined &&
  /*
   * By slug and title rather than by identity: a generated title is replaced by the document's own
   * once it loads, so this array is rebuilt on every update and identity would report a change on
   * each one. Those two fields are all a consumer renders.
   */
  left.sources.length === right.sources.length &&
  left.sources.every(
    (source, index) =>
      source.slug === right.sources[index]?.slug && source.title === right.sources[index]?.title,
  ) &&
  left.activeSlug === right.activeSlug &&
  left.loaded.size === right.loaded.size &&
  left.loading.size === right.loading.size &&
  [...left.loaded.keys()].every((slug) => right.loaded.get(slug) === left.loaded.get(slug)) &&
  [...left.loading].every((slug) => right.loading.has(slug))

/**
 * Presentation state that any depth of the tree may need to read, and that a few places request
 * changes to by dispatching an event upward.
 *
 * Kept separate from the document because it changes for different reasons and at a different rate:
 * picking a dark theme should not invalidate anything that depends on the document.
 */
export type OpenishUiState = {
  readonly config: ResolvedOpenishConfig
  readonly colorScheme: ColorSchemePreference
  /** The snippetz client, as `target/client`. Shared so every code sample on the page agrees. */
  readonly selectedClient: string
  /** URL prefix the reference is mounted under, with no trailing slash. Only `history` reads it. */
  readonly basePath: string
  /**
   * How the reference reads and writes the URL.
   *
   * Here rather than passed down as a property because every element that renders a link to another
   * node needs it - the sidebar, search results, tag indexes, and the model links in the schema tree -
   * and they are at four different depths. `hrefFor` takes the whole state for that reason.
   */
  readonly routing: RoutingMode
  /**
   * The navigation id the current URL points at, or `selected` when `routing="none"`.
   *
   * Provided rather than read from `window.location` wherever it is needed: the URL is external
   * mutable state, and a component that reads it inside `render()` produces output Lit cannot know
   * has gone stale. One element owns that read; everything else consumes the result.
   */
  readonly activeId: string
  /** The current fragment, with no leading `#`. */
  readonly hash: string
  /**
   * Where the document was fetched from, when it was fetched rather than handed over inline.
   *
   * Here because `documentDownloadType: 'direct'` links the published file rather than serialising
   * what was parsed, and the element that renders that link is two shadow roots below the one that
   * knows the URL - `closest()` does not cross a shadow boundary, so there is nothing to reach for.
   */
  readonly documentUrl: string
  /**
   * The document slug the URL leaves out, or `''` when the URL carries it.
   *
   * Here because it is half of what `hrefFor` needs, and every element that renders a link to a node
   * already reads this context for the other half. See `router/urls.ts` for the rule itself.
   */
  readonly slugPrefix: string
}

export const uiContext = createContext<OpenishUiState>(Symbol('openish-ui'))

/**
 * Whether two presentation states say the same thing.
 *
 * The root rebuilds this object on every update, and `@lit/context` notifies consumers by identity -
 * so without a comparison, every render of the root would re-render every element that consumes it.
 * `config` is compared by identity on purpose: it is frozen and replaced wholesale, never edited.
 */
export const sameUiState = (left: OpenishUiState, right: OpenishUiState | undefined): boolean =>
  right !== undefined &&
  left.config === right.config &&
  left.colorScheme === right.colorScheme &&
  left.selectedClient === right.selectedClient &&
  left.basePath === right.basePath &&
  left.routing === right.routing &&
  left.activeId === right.activeId &&
  left.documentUrl === right.documentUrl &&
  left.slugPrefix === right.slugPrefix &&
  left.hash === right.hash

/**
 * What it would take to actually call the API being described.
 *
 * Separate from `uiContext` because it carries secrets: nothing that consumes presentation state
 * should receive a credential by accident. Separate from the store because it is the reader's, not
 * the document's.
 *
 * `session` is here to be *read* - its status, its expiry, its last error - not written to. Changes
 * travel upward as `openish-auth-change`, and the root is the only thing that writes, which is what
 * keeps one description of what the reader is holding.
 */
export type OpenishRequestState = {
  /** The server URL the reader picked, still carrying its `{variables}`. */
  readonly server: string
  readonly serverVariables: Readonly<Record<string, string>>
  /** The same server with its variables applied - what a request is actually built against. */
  readonly serverUrl: string
  /** What can be sent right now, keyed by security scheme. Expired grants are absent. */
  readonly credentials: Readonly<Record<string, string>>
  /** The read model behind those credentials: status, expiry, and why a flow failed. */
  readonly session: AuthSession
}

export const requestContext = createContext<OpenishRequestState>(Symbol('openish-request'))

/** Whether two request states say the same thing. See `sameUiState` for why this exists. */
export const sameRequestState = (
  left: OpenishRequestState,
  right: OpenishRequestState | undefined,
): boolean => {
  if (right === undefined || left.session !== right.session || left.serverUrl !== right.serverUrl) {
    return false
  }

  const names = Object.keys(left.credentials)
  return (
    names.length === Object.keys(right.credentials).length &&
    names.every((name) => left.credentials[name] === right.credentials[name]) &&
    left.server === right.server &&
    Object.keys(left.serverVariables).length === Object.keys(right.serverVariables).length &&
    Object.entries(left.serverVariables).every(([name, value]) => right.serverVariables[name] === value)
  )
}

/**
 * Where a schema renderer is in its own traversal.
 *
 * This is the context the project's "context carries the graph downward" rule was written for.
 * `<openish-schema>` both consumes and provides it: it reads the state its ancestor left, adds its
 * own `$ref` to the path, and provides that to whatever it renders below - properties, `oneOf`
 * variants, array items. `@lit/context` supports an element being consumer and provider of one
 * context, and explicitly refuses to let it register with itself.
 *
 * `seenRefs` holds `$ref` **pointers**, not objects. A schema that refers to itself only does so
 * through a reference, and the magic proxy hands back a fresh wrapper every time one resolves - so
 * a `Set<object>` of visited schemas never fires and the renderer runs to its depth cap instead of
 * stopping where the reader would want it to.
 */
export type OpenishSchemaState = {
  /** How many schemas deep this one is. 0 is the schema a page is about. */
  readonly depth: number
  /** The `$ref` pointers on the path to here. A repeat is a cycle. */
  readonly seenRefs: ReadonlySet<string>
  /** Open every level at once, from `config.expandAllSchemaProperties`. */
  readonly expandAll: boolean
  /**
   * The `$dynamicAnchor`s in scope, by name — what a `$dynamicRef` resolves against.
   *
   * This is the *dynamic scope* of JSON Schema 2020-12, which is why it travels as context rather
   * than being read off the schema at hand: `PaginatedResource` says its items are `$dynamicRef`
   * `#itemType` and cannot know what that is, while `PaginatedPlanets` binds `itemType` to `Planet`
   * one level above. The outermost binding wins, so an entry is only ever added when the name is not
   * already in scope.
   */
  readonly anchors: ReadonlyMap<string, unknown>
}

export const schemaContext = createContext<OpenishSchemaState>(Symbol('openish-schema'))

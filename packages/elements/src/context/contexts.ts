import { createContext } from '@lit/context'
import type { ColorScheme, DocumentStore, Layout, ResolvedOpenishConfig } from '@openish/core'

/**
 * The parsed document, or `undefined` while it is still loading or failed to load.
 *
 * Provided once by `<openish-api-reference>`. The store is immutable, so a new document means a new
 * store object and every consumer re-renders because the context value changed - there is no
 * subscription, no reactivity, and nothing for a child to mutate.
 */
export const documentContext = createContext<DocumentStore | undefined>(Symbol('openish-document'))

/**
 * Presentation state that any depth of the tree may need to read, and that a few places request
 * changes to by dispatching an event upward.
 *
 * Kept separate from the document because it changes for different reasons and at a different rate:
 * picking a dark theme should not invalidate anything that depends on the document.
 */
export type OpenishUiState = {
  readonly config: ResolvedOpenishConfig
  readonly layout: Layout
  readonly colorScheme: ColorScheme
  /** The snippetz client, as `target/client`. Shared so every code sample on the page agrees. */
  readonly selectedClient: string
  /** URL prefix the reference is mounted under, with no trailing slash. */
  readonly basePath: string
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
  left.layout === right.layout &&
  left.colorScheme === right.colorScheme &&
  left.selectedClient === right.selectedClient &&
  left.basePath === right.basePath &&
  left.activeId === right.activeId &&
  left.hash === right.hash

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
}

export const schemaContext = createContext<OpenishSchemaState>(Symbol('openish-schema'))

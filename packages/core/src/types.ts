import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

/** The HTTP methods an OpenAPI Path Item can define an operation for. */
export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export const isHttpMethod = (value: string): value is HttpMethod =>
  (HTTP_METHODS as readonly string[]).includes(value)

/**
 * A node in the navigation tree.
 *
 * Every node carries a stable `id` that doubles as its URL slug, so a route can be resolved back to
 * a node through {@link DocumentStore.bySlug} without re-walking the document.
 */
export type NavNode = NavTextNode | NavGroupNode | NavTagNode | NavOperationNode | NavModelNode | NavWebhookNode

/** A plain container. Used for the Models and Webhooks sections, which are not tags. */
export type NavGroupNode = {
  type: 'group'
  id: string
  title: string
  children: NavNode[]
}

/** A heading lifted out of `info.description`, so long introductions get their own nav entries. */
export type NavTextNode = {
  type: 'text'
  id: string
  title: string
  /** Heading depth in the source markdown (1-6). */
  level: number
  children?: NavNode[]
}

export type NavTagNode = {
  type: 'tag'
  id: string
  title: string
  /** The tag name exactly as it appears in the document, for matching `operation.tags`. */
  name: string
  description?: string
  children: NavNode[]
  /** True for the synthetic tag collecting operations that declare no tags of their own. */
  isUntagged?: boolean
}

export type NavOperationNode = {
  type: 'operation'
  id: string
  title: string
  method: HttpMethod
  path: string
  operationId?: string
  deprecated?: boolean
  /** JSON pointer to the operation within the document, e.g. `#/paths/~1users/get`. */
  pointer: string
}

export type NavModelNode = {
  type: 'model'
  id: string
  title: string
  /** The key under `components.schemas`. */
  name: string
  pointer: string
}

export type NavWebhookNode = {
  type: 'webhook'
  id: string
  title: string
  name: string
  method: HttpMethod
  pointer: string
}

/** Layout mode. Only `modern` renders today; `classic` is reserved and falls back to `modern`. */
export type Layout = 'modern' | 'classic'

export type ColorScheme = 'light' | 'dark'

/**
 * Consumer-facing configuration. Option names mirror `@scalar/types/api-reference` where the same
 * concept exists, so a Scalar config is mostly portable.
 */
export type OpenishConfig = {
  layout?: Layout
  /** Hide `components.schemas` from the navigation and search. */
  hideModels?: boolean
  /** Label for the models section. */
  modelsSectionLabel?: string
  showSidebar?: boolean
  hideSearch?: boolean
  /** Show `operationId` alongside the summary in the navigation. */
  showOperationId?: boolean
  expandAllResponses?: boolean
  /** Open every level of the schema property tree instead of one level at a time. */
  expandAllSchemaProperties?: boolean
  /** Label used for operations that declare no tags. */
  untaggedLabel?: string
  /** Sort order for operations within a tag. `document` preserves the source order. */
  operationSort?: 'document' | 'alpha' | 'method'
  /** Sort order for tags. `document` preserves `tags` declaration order, then first-seen order. */
  tagSort?: 'document' | 'alpha'
  /** Default snippetz client, as `target/client` (e.g. `shell/curl`). */
  defaultHttpClient?: string
  /** Snippetz clients to omit from the picker, as `target/client`. */
  hiddenClients?: string[]
  colorScheme?: ColorScheme
}

/** {@link OpenishConfig} with every option filled in. What components actually read. */
export type ResolvedOpenishConfig = Required<Omit<OpenishConfig, 'hiddenClients'>> & {
  readonly hiddenClients: readonly string[]
}

/**
 * An immutable view of one OpenAPI document.
 *
 * There is deliberately no reactivity here: the store is built once per document and replaced
 * wholesale when the document changes. Components receive it through context and re-render because
 * the context value changed, not because the store notified them.
 */
export type DocumentStore = {
  /**
   * The upgraded document wrapped in a magic proxy: `$ref`s resolve on property access rather than
   * being expanded up front, so a large document costs nothing until it is read.
   */
  readonly document: OpenApiDocument
  /** The same document without the proxy, for serialising or downloading. */
  readonly raw: unknown
  readonly navigation: readonly NavNode[]
  readonly bySlug: ReadonlyMap<string, NavNode>
  readonly config: ResolvedOpenishConfig
}

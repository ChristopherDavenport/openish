import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import type { HiddenClients } from './har/snippet.js'

/** The HTTP methods an OpenAPI Path Item can define an operation for. */
export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export const isHttpMethod = (value: string): value is HttpMethod =>
  (HTTP_METHODS as readonly string[]).includes(value)

/**
 * An External Documentation Object: somewhere else that explains this.
 *
 * `url` is the only required half, so a link with nothing to say about itself has to be labelled by
 * whatever renders it rather than by the document.
 */
export type ExternalDocs = {
  url: string
  description?: string | undefined
}

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
  /** Where the tag says the rest of the story is. */
  externalDocs?: ExternalDocs
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
  /**
   * The tags the schema claims membership of, from `x-tags`.
   *
   * A Schema Object is JSON Schema and has no `tags` keyword, so there is nothing standard to read
   * here; `x-tags` is Redoc's convention and the one every tool that groups models by tag uses. The
   * model keeps its place in the Models section either way - this says which tags may *also* list
   * it, not where it lives.
   */
  tags?: readonly string[]
}

export type NavWebhookNode = {
  type: 'webhook'
  id: string
  title: string
  name: string
  method: HttpMethod
  pointer: string
  /**
   * The tags the webhook's operation declares.
   *
   * Ordinary `tags` on an ordinary Operation Object: a webhook entry is a Path Item, so this is the
   * standard field and not an extension. The webhook still lives under Webhooks - one home, one URL -
   * and this is what lets a tag list the events that belong to it.
   */
  tags?: readonly string[]
}

export type ColorScheme = 'light' | 'dark'

/**
 * What a host asks for, which includes not asking.
 *
 * `auto` is the default and is not a third palette - it is the absence of an override, so the
 * stylesheet defers to the reader's own `prefers-color-scheme`. That is the case worth making
 * easy: it needs no script, cannot flash the wrong scheme before script runs, and follows a reader
 * who changes their mind mid-session.
 */
export type ColorSchemePreference = ColorScheme | 'auto'

/**
 * Consumer-facing configuration. Option names mirror `@scalar/types/api-reference` where the same
 * concept exists, so a Scalar config is mostly portable.
 */
export type OpenishConfig = {
  /** Hide `components.schemas` from the navigation and search. */
  hideModels?: boolean
  /** Label for the models section. */
  modelsSectionLabel?: string
  showSidebar?: boolean
  hideSearch?: boolean
  /** Show `operationId` alongside the summary in the navigation. */
  showOperationId?: boolean
  /**
   * What the sidebar calls an operation: its `summary`, or its path.
   *
   * `summary` is the default because it is what the author wrote for a reader. A document whose
   * summaries are absent or generated - plenty are - reads better by path.
   */
  operationTitleSource?: 'summary' | 'path'
  /** Open the first tag when the URL names nothing in particular. */
  defaultOpenFirstTag?: boolean
  /** Open every tag. Costly on a large document, which is why it is not the default. */
  defaultOpenAllTags?: boolean
  /**
   * The key that opens search, alongside Cmd/Ctrl-K.
   *
   * A single character. `/` is the default because it is what every documentation site uses and it
   * costs nothing - the hotkey controller already ignores bare keys typed into a field.
   */
  searchHotKey?: string
  /**
   * Servers to offer instead of the document's own.
   *
   * For a host that publishes one document across several environments and does not want to edit it
   * per deployment.
   */
  servers?: ServerOverride[]
  /** Prefix for a document whose servers are relative, e.g. `/v1`. */
  baseServerURL?: string
  expandAllResponses?: boolean
  /** Open every level of the schema property tree instead of one level at a time. */
  expandAllSchemaProperties?: boolean
  /**
   * How to order the properties of an object schema.
   *
   * `document` keeps the order the author wrote, which is often meaningful - `id` first, metadata
   * last. `alpha` is easier to scan in a type with fifty fields. Scalar spells the latter choice
   * `alpha` and the former `preserve`; both names are accepted.
   */
  orderSchemaPropertiesBy?: 'document' | 'preserve' | 'alpha'
  /** List required properties before optional ones, whatever the order within each group. */
  orderRequiredPropertiesFirst?: boolean
  /** Label used for operations that declare no tags. */
  untaggedLabel?: string
  /** Sort order for operations within a tag. `document` preserves the source order. */
  operationSort?: 'document' | 'alpha' | 'method'
  /** Sort order for tags. `document` preserves `tags` declaration order, then first-seen order. */
  tagSort?: 'document' | 'alpha'
  /** Default snippetz client, as `target/client` (e.g. `shell/curl`). */
  defaultHttpClient?: string
  /**
   * Remember which code-sample client the reader picked, across reloads.
   *
   * Off by default, and deliberately: openish persists nothing on its own, because how long anything
   * survives on a reader's machine is the host's decision. A client choice is not a credential, so
   * this is safe to switch on - it is opt-in because storing *anything* silently is the part that
   * should never happen, not because the value is sensitive.
   */
  persistClient?: boolean
  /**
   * Snippetz clients to omit from the picker.
   *
   * A list of `target/client` ids (or bare targets), `true` to hide the generated clients
   * altogether, or a record naming targets and the clients within them. Author-supplied samples are
   * never hidden by this - it is about which of snippetz's clients to generate.
   */
  hiddenClients?: HiddenClients
  colorScheme?: ColorSchemePreference
  /**
   * Which formats the overview offers the document in, if any.
   *
   * `none` removes the control. `direct` links `url` as-is rather than serialising what was parsed -
   * useful when the published file is the canonical artefact and openish's round trip through the
   * 3.1 upgrade would hand the reader something subtly different from what they asked for.
   */
  documentDownloadType?: 'yaml' | 'json' | 'both' | 'direct' | 'none'

  /** Render the operation pages without the panel that sends requests. */
  hideTryIt?: boolean
  /**
   * A forwarder for APIs that do not allow this page's origin.
   *
   * openish neither ships nor hosts one - a proxy sees every credential that passes through it, so
   * it has to be yours. The contract is in `@openish/client`'s README.
   */
  proxyUrl?: string
  /**
   * Put real credentials in the generated code sample.
   *
   * Off, deliberately: a documentation page should not be the thing that puts a production token
   * into someone's shell history. The request that is *sent* always carries the real value.
   */
  revealCredentialsInSamples?: boolean
  /**
   * Where an authorization server sends the reader back. Must be same-origin, and must be one the
   * provider has registered. Defaults to the page the reference is on.
   */
  oauthRedirectUri?: string
  /** `popup` keeps the page and everything typed into it; `redirect` survives a popup blocker. */
  oauthRedirectMode?: 'popup' | 'redirect'
  /**
   * Which security scheme to satisfy when a document offers a choice.
   *
   * Only consulted when the reader holds nothing yet: once they have a credential, the one they
   * obtained is the one that gets sent. Name several to pick an alternative that requires all of
   * them together.
   */
  preferredSecurityScheme?: string | string[]
  /** Per security scheme, what a host already knows: its public client id, and which scopes to ask for. */
  oauth?: Record<string, OAuthSchemeConfig>

  /**
   * How each kind of node's URL segment is built.
   *
   * openish mints readable ids by default and they are stable for a given document, but they are not
   * the same strings another tool would have minted - so anyone moving to openish from a reference
   * that published different URLs would break every existing link. These let a host reproduce the
   * old ones. Only the last *segment* is returned; the section prefix (`tags/`, `models/`) is
   * openish's, because the id is also how a URL resolves back to a node.
   *
   * Collisions are still resolved by the registry, so a generator that returns the same string twice
   * gets a `-2` rather than two nodes fighting over one URL.
   */
  slugs?: SlugOverrides

  /**
   * A last chance to rewrite an id that matches nothing.
   *
   * Called with the id the URL resolved to, and only when the document has no node for it - so it
   * costs nothing on every other navigation and cannot shadow a real page. Return the id to go to,
   * or `null` to let the not-found stand.
   *
   * This is the migration seam: a document that renamed an operation, or a site moving from another
   * tool's URLs, maps the old shape here instead of breaking bookmarks.
   */
  redirect?: (id: string) => string | null | undefined
}

/**
 * One document a reference offers.
 *
 * The same shape as `@scalar/types`' `SourceConfiguration`, so a Scalar `sources` array is mostly
 * portable. The one addition is `config`: Scalar expresses "these documents share options" as
 * `sources` and "these documents each have their own" as an array of whole configurations, and
 * normalises both into one record keyed by slug. openish has a single element with a single `config`
 * property, so the per-source override lives here instead and covers both spellings with one shape.
 */
export type SourceConfig = {
  /**
   * The URL segment this document's pages live under.
   *
   * Defaults to a slug of `title`, then `api-2`, `api-3`. Collisions are resolved rather than
   * allowed, because a slug is the first segment of every id in the document beneath it.
   */
  slug?: string
  /** What the picker calls it. Defaults to the slug, then `API #2`. */
  title?: string
  url?: string
  /** An inline document: a YAML/JSON string, or an already-parsed object. */
  content?: string | Record<string, unknown>
  /** The document shown when the URL names none. The first source if none is marked. */
  default?: boolean
  /** Options for this document alone, merged over the reference-level config. */
  config?: OpenishConfig
}

/**
 * Which source a built store is.
 *
 * Always present, including for a reference configured with `url` or `spec` - see
 * {@link DocumentStore.source} for why that matters.
 */
export type SourceDescriptor = {
  readonly slug: string
  readonly title: string
  /** Where the document was fetched from, or `''` when it was handed over inline. */
  readonly url: string
}

/** {@link SourceConfig} with the slug and title decided. What the element layer works with. */
export type ResolvedSource = SourceDescriptor & {
  readonly isDefault: boolean
  /**
   * Whether the title was made up here rather than given by the host.
   *
   * A generated one is a placeholder - `API #2` names nothing - so the element layer replaces it
   * with the document's own `info.title` once there is a document to ask. A title the host chose is
   * left alone: it is what that host wants this document called, whatever the file says.
   */
  readonly titleIsGenerated: boolean
  readonly content?: string | Record<string, unknown> | undefined
  readonly config?: OpenishConfig | undefined
}

/**
 * A server a host offers instead of the document's own.
 *
 * The same shape as an OpenAPI Server Object, variables included - a host overriding the servers is
 * usually pointing at a different environment, and environments are exactly what `{region}`-style
 * variables express.
 */
export type ServerOverride = {
  url: string
  description?: string
  variables?: Record<string, { default?: string; enum?: string[]; description?: string }>
}

/** Per-node-kind slug generators. Each returns the final URL segment, not the whole path. */
export type SlugOverrides = {
  operation?: (operation: {
    path: string
    method: string
    operationId?: string | undefined
    summary?: string | undefined
  }) => string
  tag?: (tag: { name: string; title: string }) => string
  model?: (model: { name: string }) => string
  webhook?: (webhook: { name: string; method: string }) => string
  heading?: (heading: { slug: string; title: string }) => string
}

export type OAuthSchemeConfig = {
  clientId?: string
  scopes?: string[]
  /** Overrides `oauthRedirectUri` for this scheme alone. */
  redirectUri?: string
  /** Anything the provider needs beyond the standard set, e.g. `audience` or `prompt`. */
  extraParams?: Record<string, string>
}

/** {@link OpenishConfig} with every option filled in. What components actually read. */
export type ResolvedOpenishConfig = Required<
  Omit<OpenishConfig, 'hiddenClients' | 'oauth' | 'preferredSecurityScheme' | 'slugs' | 'redirect' | 'servers'>
> & {
  readonly hiddenClients: HiddenClients
  readonly oauth: Readonly<Record<string, OAuthSchemeConfig>>
  /** `''` when the host named nothing, so the resolved shape has no `undefined` in it. */
  readonly preferredSecurityScheme: string | readonly string[]
  /**
   * These two stay optional rather than being filled in with an identity function: "the host did not
   * ask for anything" is a state the traversal reads, and a default that returned the same string
   * would make every call site pretend a generator ran.
   */
  readonly slugs: SlugOverrides
  /** Empty when the host named none, so the document's own servers are used. */
  readonly servers: readonly ServerOverride[]
  readonly redirect?: ((id: string) => string | null | undefined) | undefined
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
  /**
   * Which of the reference's documents this is.
   *
   * Never absent, even for a reference showing one document: every id in `bySlug` begins with
   * `source.slug`, so there is exactly one traversal to reason about rather than a prefixed and an
   * unprefixed one. Whether that segment appears in the URL is a separate question, answered at the
   * URL boundary in `@openish/elements` - see `stripFirstSegment` there.
   */
  readonly source: SourceDescriptor
}

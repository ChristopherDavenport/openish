import { bundle } from '@scalar/json-magic/bundle'
import { fetchUrls, parseJson, parseYaml } from '@scalar/json-magic/bundle/plugins/browser'
import { createMagicProxy, getRaw } from '@scalar/json-magic/magic-proxy'
import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'
import { normalize } from '@scalar/openapi-parser'
import { upgrade } from '@scalar/openapi-parser'

import { resolveConfig } from '../config.js'
import { indexNavigation, traverseDocument } from '../navigation/traverse-document.js'
import type { DocumentStore, OpenishConfig, SourceDescriptor } from '../types.js'

/** Anything `bundle` accepts as a resolver. Typed loosely so callers can pass a stub in tests. */
type BundlePlugin = Parameters<typeof bundle>[1]['plugins'][number]

export type CreateDocumentStoreOptions = {
  config?: OpenishConfig
  /**
   * Resolvers for external `$ref`s. Defaults to fetching URLs and parsing JSON/YAML, which is what a
   * browser needs. Pass your own to resolve from a filesystem, a cache, or a fixture.
   */
  plugins?: BundlePlugin[]
  /**
   * Called for each external reference that could not be resolved. A document with a dangling
   * reference still produces a store - the affected node renders as an unresolved `$ref` rather
   * than taking the page down.
   */
  onReferenceError?: (reference: string) => void
  /**
   * Which of the reference's documents this is.
   *
   * Its slug prefixes every id the traversal mints. Defaults to {@link IMPLICIT_SOURCE}, so a caller
   * with one document never has to name it - and still gets ids of the same shape, which is what
   * keeps there being one traversal rather than two.
   */
  source?: SourceDescriptor
}

/**
 * The source a reference gets when the host configured a single document rather than a `sources`
 * array.
 *
 * Its slug is real - it is the first segment of every id in the store - but `@openish/elements`
 * strips it on the way to the URL, so a single-document reference has the URLs it always had.
 */
export const IMPLICIT_SOURCE: SourceDescriptor = Object.freeze({ slug: 'api-1', title: 'API #1', url: '' })

/**
 * Builds a {@link DocumentStore} from an OpenAPI document.
 *
 * The pipeline, and why it is in this order:
 *
 *   normalize  - accept YAML, JSON, or an object; everything downstream works on objects.
 *   bundle     - inline external documents into `x-ext`. Before upgrading, so that content pulled
 *                in from another file gets upgraded too.
 *   upgrade    - bring 2.0 and 3.0 documents to 3.1, so there is exactly one shape to render.
 *   magicProxy - make `$ref`s resolvable on access instead of expanding them. This is what keeps a
 *                large document cheap and makes recursive schemas representable at all.
 *   traverse   - build the navigation tree once, up front. It is small, and every route needs it.
 *
 * The result is immutable: there is no reactivity here, and no subscription API. When a document
 * changes, build a new store and hand it down - the element layer re-renders because the context
 * value changed.
 */
export const createDocumentStore = async (
  input: string | Record<string, unknown>,
  options: CreateDocumentStoreOptions = {},
): Promise<DocumentStore> => {
  const config = resolveConfig(options.config)
  const source = options.source ?? IMPLICIT_SOURCE

  const normalized = normalize(input)
  /* `normalize` returns a `Filesystem` - an array of file entries - for multi-file input. */
  if (typeof normalized !== 'object' || normalized === null || Array.isArray(normalized)) {
    throw new Error(
      'openish expects a single OpenAPI document. Bundle a multi-file definition before passing it in.',
    )
  }

  const bundled = await bundle(normalized as Record<string, unknown>, {
    plugins: options.plugins ?? [fetchUrls(), parseJson(), parseYaml()],
    treeShake: false,
    urlMap: true,
    hooks: {
      onResolveError: (node: Record<string, unknown>) =>
        options.onReferenceError?.(typeof node['$ref'] === 'string' ? node['$ref'] : '<unknown>'),
    },
  })

  const { specification } = upgrade(bundled as Record<string, unknown>)
  const document = createMagicProxy(specification as unknown as Record<string, unknown>) as OpenApiDocument

  const navigation = traverseDocument(document, config, source.slug)

  return Object.freeze({
    document,
    raw: getRaw(specification),
    navigation,
    bySlug: indexNavigation(navigation),
    config,
    source,
  })
}

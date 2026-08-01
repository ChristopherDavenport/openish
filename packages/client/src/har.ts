/**
 * The HAR request shape, declared here rather than imported.
 *
 * `@openish/core` builds these with `operationToHar` and types them from `@scalar/types/snippetz`.
 * This package deliberately keeps its dependency list empty, and HAR 1.2 is a published format that
 * is not going to move, so the shape is restated instead of depended on. TypeScript matches it
 * structurally: what core produces is accepted here with no cast and no adapter.
 *
 * Only the fields a sender needs are declared. A HAR entry carries more - timings, cache, page refs -
 * and none of it describes what to put on the wire.
 *
 * Every optional field spells out `| undefined` on purpose: with `exactOptionalPropertyTypes`, an
 * optional in one declaration is not assignable to an optional in another unless both admit it, and
 * accepting what core produces without a cast is the entire reason this file exists.
 */
export type HarHeader = { name: string; value: string }

export type HarRequest = {
  method: string
  url: string
  httpVersion?: string | undefined
  headers: readonly HarHeader[]
  queryString: readonly HarHeader[]
  cookies: readonly HarHeader[]
  postData?: { mimeType: string; text?: string | undefined } | undefined
  headersSize?: number | undefined
  bodySize?: number | undefined
}

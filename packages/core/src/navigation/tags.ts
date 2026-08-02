/**
 * Which tags a thing in the document claims membership of.
 *
 * Three kinds of object answer this question and only two of them are standard. An Operation Object
 * has `tags`, and a webhook's operation is an ordinary Operation Object, so a tagged webhook is
 * plain OpenAPI. A Schema Object is JSON Schema, which has no `tags` keyword and never will, so a
 * document that wants its models grouped by tag says so with `x-tags` - Redoc's convention, and the
 * one every tool that does this reads.
 *
 * A name is kept only if it is a non-empty string: `tags: [null]` and `tags: []` are both documents
 * saying nothing, and a bucket keyed on the empty string would collect them into a tag that does not
 * exist. `undefined` rather than an empty array for the same reason - "declared none" and "declared
 * badly" are the same answer, and neither is a tag.
 */
export const declaredTags = (source: unknown, key: 'tags' | 'x-tags'): readonly string[] | undefined => {
  if (typeof source !== 'object' || source === null) {
    return undefined
  }

  const raw = (source as Record<string, unknown>)[key]
  if (!Array.isArray(raw)) {
    return undefined
  }

  const names = raw.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
  return names.length > 0 ? names : undefined
}

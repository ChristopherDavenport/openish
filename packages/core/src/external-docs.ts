import { getResolvedRef } from './ref.js'
import type { ExternalDocs } from './types.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * An External Documentation Object, if that is what this is.
 *
 * `url` is the only key the specification requires, so an object without one describes nowhere and
 * is dropped rather than rendered as a link to the empty string. Every level of the document can
 * carry one - the document itself, a tag, an operation, a schema - which is why this is a normaliser
 * rather than four copies of the same three lines.
 */
export const asExternalDocs = (value: unknown): ExternalDocs | undefined => {
  const docs = getResolvedRef(value)
  if (!isPlainObject(docs)) {
    return undefined
  }

  const url = docs['url']
  if (typeof url !== 'string' || url.trim() === '') {
    return undefined
  }

  const description = docs['description']
  return typeof description === 'string' && description.trim() !== '' ? { url, description } : { url }
}

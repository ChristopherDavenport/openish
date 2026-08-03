import { getResolvedRef } from '../ref.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** One part of a multipart or form-encoded body, and how it goes on the wire. */
export type EncodingEntry = {
  /** The property of the body schema this describes. */
  property: string
  /** The `Content-Type` this part is sent with, where the document says. */
  contentType?: string
  /** Header names this part carries, in document order. `Content-Type` is excluded by the spec. */
  headers: string[]
  /** `style`/`explode`/`allowReserved`, in the words the parameter table uses for the same keywords. */
  serialization: string[]
}

/**
 * How the parts of a body are encoded, where the document says.
 *
 * The Encoding Object is the only place a document can say that the `avatar` property of a
 * `multipart/form-data` body is a PNG rather than a string, or that `metadata` goes in as JSON. Every
 * upload endpoint that is documented properly says it here, and openish read none of it - the body
 * rendered as a plain object, so the one fact a reader needed in order to build the request was the
 * one fact missing.
 *
 * Ordered by the encoding map rather than by the schema's properties, because the map is the smaller
 * of the two and its order is the author's: a document that describes three parts out of nine is
 * saying those three are the ones that need saying.
 */
export const mediaTypeEncoding = (media: unknown): EncodingEntry[] => {
  const resolved = getResolvedRef(media)
  const encoding = isPlainObject(resolved) ? resolved['encoding'] : undefined
  if (!isPlainObject(encoding)) {
    return []
  }

  const entries: EncodingEntry[] = []

  for (const [property, raw] of Object.entries(encoding)) {
    const entry = getResolvedRef(raw)
    if (!isPlainObject(entry)) {
      continue
    }

    const serialization: string[] = []
    if (typeof entry['style'] === 'string' && entry['style'] !== '') {
      serialization.push(`style ${entry['style']}`)
    }
    if (entry['explode'] === true) {
      serialization.push('exploded')
    }
    if (entry['explode'] === false) {
      serialization.push('not exploded')
    }
    if (entry['allowReserved'] === true) {
      serialization.push('reserved characters allowed')
    }

    const headers = isPlainObject(entry['headers']) ? Object.keys(entry['headers']) : []
    const contentType = entry['contentType']

    /*
     * An entry that says nothing is not rendered. A generator that writes `encoding: { file: {} }`
     * for every property would otherwise fill the table with rows carrying no information.
     */
    if (typeof contentType !== 'string' && headers.length === 0 && serialization.length === 0) {
      continue
    }

    entries.push({
      property,
      ...(typeof contentType === 'string' ? { contentType } : {}),
      headers,
      serialization,
    })
  }

  return entries
}

import { getResolvedRef } from '../ref.js'

/**
 * One example an author wrote, flattened out of a Media Type Object.
 *
 * `name` is the key in `examples`, which is an identifier the author chose and therefore keeps its
 * case - the same rule ids follow. It is empty for the singular `example` keyword, which has no key
 * and needs no picker.
 */
export type MediaTypeExample = {
  /** The key in `examples`, or `''` for a bare `example`. */
  name: string
  /** A one-line label. Shown in the picker in preference to the key. */
  summary?: string | undefined
  /** Prose about this example. Markdown, per the specification. */
  description?: string | undefined
  /** The example itself. `undefined` when the author pointed at `externalValue` instead. */
  value?: unknown
  /** A URL holding the example, for one too large or too binary to inline. */
  externalValue?: string | undefined
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asText = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** What a Media Type Object needs to have for examples to be read off it. */
type MediaTypeLike = {
  example?: unknown
  examples?: Record<string, unknown>
}

/**
 * Every example on a media type, in document order.
 *
 * The specification says `example` and `examples` are mutually exclusive, and real documents say
 * otherwise - so `examples` wins when both are present, because the plural form is the one that
 * carries names and summaries and is therefore the one an author took trouble over.
 *
 * An entry with neither a `value` nor an `externalValue` is dropped: it names nothing the reader can
 * be shown, and leaving it in puts an empty option in the picker. Returning an empty array is how a
 * caller learns to generate one from the schema instead.
 */
export const mediaTypeExamples = (media: MediaTypeLike | undefined): MediaTypeExample[] => {
  const named = media?.examples
  if (isPlainObject(named)) {
    const examples: MediaTypeExample[] = []

    for (const [name, raw] of Object.entries(named)) {
      const example = getResolvedRef(raw)
      if (!isPlainObject(example)) {
        continue
      }

      const value = example['value']
      const externalValue = asText(example['externalValue'])
      if (value === undefined && externalValue === undefined) {
        continue
      }

      examples.push({
        name,
        summary: asText(example['summary']),
        description: asText(example['description']),
        value,
        externalValue,
      })
    }

    if (examples.length > 0) {
      return examples
    }
  }

  if (media?.example !== undefined) {
    return [{ name: '', value: media.example }]
  }

  return []
}

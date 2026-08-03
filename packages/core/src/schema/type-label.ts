import { getResolvedRef } from '../ref.js'

/**
 * Naming a schema in one line, for anything that has a cell or a sentence to put it in.
 *
 * This lived in `@openish/elements` for as long as a table was the only thing that needed it. It is
 * here now because it is not a rendering decision: `nodeToMarkdown` has to name the same types the
 * table names, and two answers to "what type is this" - one in the page, one on the clipboard - is
 * the failure this project keeps writing rules to avoid. The rest of the schema readers followed it
 * into `read.ts` next door for the same reason, and `@openish/elements` re-exports the lot, so every
 * call site that already had them still does.
 *
 * Schemas are read as `Record<string, unknown>` rather than through `SchemaObject`, which is a
 * discriminated union: code that probes `allOf`, then `enum`, then `items` before it knows what it
 * holds would narrow at every access for no benefit.
 */
type AnySchema = Record<string, unknown>

/** How far a label will follow item schemas before it stops describing and starts guessing. */
const MAX_DEPTH = 4

const isPlainObject = (value: unknown): value is AnySchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A schema, with any `$ref` resolved, or `undefined` if the value is not one. */
export const asSchema = (value: unknown): AnySchema | undefined => {
  const resolved = getResolvedRef(value)
  return isPlainObject(resolved) ? resolved : undefined
}

/** The `type` keyword as a list, since 3.1 allows either a string or an array of them. */
export const schemaTypeNames = (schema: AnySchema): string[] => {
  const type = schema['type']
  if (Array.isArray(type)) {
    return type.filter((entry): entry is string => typeof entry === 'string')
  }
  return typeof type === 'string' ? [type] : []
}

/** The model a pointer names, for code holding the string rather than a `$ref` object. */
export const modelNameFromPointer = (pointer: string | undefined): string | undefined => {
  const match = pointer === undefined ? null : /#\/components\/schemas\/(.+)$/.exec(pointer)
  return match?.[1] ? decodeURIComponent(match[1].replace(/~1/g, '/').replace(/~0/g, '~')) : undefined
}

/** The model name a `$ref` points at, so a type cell can say `Account` instead of `object`. */
export const refName = (value: unknown): string | undefined => {
  const ref = isPlainObject(value) ? value['$ref'] : undefined
  return typeof ref === 'string' ? modelNameFromPointer(ref) : undefined
}

/**
 * A one-line type for a table cell: `string`, `string (uuid)`, `Account[]`, `object or null`.
 *
 * A `$ref` that resolves to a named model shows the model name, because that is the word the reader
 * will look for in the sidebar - the resolved schema rarely repeats its own name.
 */
export const schemaTypeLabel = (value: unknown, depth = 0): string => {
  const named = refName(value)
  const schema = asSchema(value)
  if (!schema) {
    return named ?? ''
  }

  const names = schemaTypeNames(schema)
  const nullable = names.includes('null')
  const primary = names.filter((name) => name !== 'null')

  let label = named ?? primary.join(' or ')

  /*
   * An array is described by what it holds. The depth cap is for object cycles that no `$ref` marks
   * - a YAML anchor can make `items` the array itself - which the named-model shortcut above cannot
   * catch, because there is no pointer to name.
   */
  if (named === undefined && primary.includes('array')) {
    const itemLabel = depth >= MAX_DEPTH ? '' : schemaTypeLabel(schema['items'], depth + 1)
    label = itemLabel === '' ? 'array' : `${itemLabel}[]`
  }

  /*
   * A tuple names its positions, because that is the whole of what it is: `prefixItems` says the
   * first element is a string and the second a number, and rendering that as `array` throws away the
   * only interesting thing about it.
   */
  if (named === undefined && Array.isArray(schema['prefixItems'])) {
    const positions =
      depth >= MAX_DEPTH
        ? []
        : schema['prefixItems'].map((item) => schemaTypeLabel(item, depth + 1) || 'any')
    if (positions.length > 0) {
      label = `[${positions.join(', ')}]`
    }
  }

  if (label === '') {
    if (Array.isArray(schema['enum'])) {
      label = 'enum'
    } else if (isPlainObject(schema['properties'])) {
      label = 'object'
    } else if (Array.isArray(schema['oneOf'])) {
      label = 'one of'
    } else if (Array.isArray(schema['anyOf'])) {
      label = 'any of'
    } else if (Array.isArray(schema['allOf'])) {
      label = 'object'
    }
  }

  /*
   * An inline object's title, which is the name the author gave a shape the document did not put in
   * `components`.
   *
   * Only where the label would otherwise be the bare word `object`: a schema with a type worth
   * printing already has a better label than any prose, and a `title` on a string is a caption, not
   * a type. Only where there is no `$ref` either, because a referenced schema is named by the
   * section that documents it and that is the word to look for in the sidebar.
   *
   * `title` was read in exactly one place before this - as the last-resort label on a `oneOf` tab -
   * so an author who named their shapes had that name shown only if the shapes were alternatives.
   */
  const title = schema['title']
  if (named === undefined && (label === '' || label === 'object') && typeof title === 'string' && title.trim() !== '') {
    label = title.trim()
  }

  /*
   * The format, including on a named model.
   *
   * It used to be dropped whenever the type came from a `$ref`, which is where a document is most
   * likely to have put it: a scalar worth naming - `AccountId`, `Timestamp` - is a scalar with a
   * format, and the reader was shown the name and not what to type into the field. It is kept unless
   * the name already says it, because `Uuid (uuid)` says it twice.
   */
  const format = schema['format']
  const plain = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (typeof format === 'string' && (named === undefined || plain(named) !== plain(format))) {
    label = label === '' ? format : `${label} (${format})`
  }

  if (nullable && label !== '') {
    label = `${label} or null`
  }

  return label
}

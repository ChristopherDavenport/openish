import { getResolvedRef } from '@openish/core'

/**
 * Shallow reads of a schema: the strings and yes/no answers a renderer needs about one level.
 *
 * Nothing here recurses into a property's own properties, so no document can hang it - the few
 * functions that do descend (`allOf` branches, array items) are capped and never follow a `$ref`
 * that leads back to where they started. The recursion proper lives in `<openish-schema>`, which
 * tracks `$ref` pointers across levels through context; these functions have no memory and need
 * none.
 *
 * Schemas are read as `Record<string, unknown>` rather than through `SchemaObject`, which is a
 * discriminated union: code that probes `allOf`, then `enum`, then `items` before it knows what it
 * holds would narrow at every access for no benefit.
 */
type AnySchema = Record<string, unknown>

/** How far the shallow readers below will follow composition or item schemas. A backstop. */
const MAX_DEPTH = 4

const isPlainObject = (value: unknown): value is AnySchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const asSchema = (value: unknown): AnySchema | undefined => {
  const resolved = getResolvedRef(value)
  return isPlainObject(resolved) ? resolved : undefined
}

const typeNames = (schema: AnySchema): string[] => {
  const type = schema['type']
  if (Array.isArray(type)) {
    return type.filter((entry): entry is string => typeof entry === 'string')
  }
  return typeof type === 'string' ? [type] : []
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

  const names = typeNames(schema)
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

  const format = schema['format']
  if (typeof format === 'string' && named === undefined) {
    label = label === '' ? format : `${label} (${format})`
  }

  if (nullable && label !== '') {
    label = `${label} or null`
  }

  return label
}

/** The model name a `$ref` points at, so a type cell can say `Account` instead of `object`. */
export const refName = (value: unknown): string | undefined => {
  const ref = isPlainObject(value) ? value['$ref'] : undefined
  if (typeof ref !== 'string') {
    return undefined
  }
  const match = /#\/components\/schemas\/(.+)$/.exec(ref)
  return match?.[1] ? decodeURIComponent(match[1].replace(/~1/g, '/').replace(/~0/g, '~')) : undefined
}

const asText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

/**
 * The constraints worth printing next to a description.
 *
 * Only what changes what a caller may send: `title` and `xml` do not, `pattern` does. `readOnly`
 * and `writeOnly` belong here by that rule but are deliberately absent - they are rendered as flags
 * beside the property name, and a value that appeared in both places read as two separate facts.
 */
export const schemaConstraints = (value: unknown): string[] => {
  const schema = asSchema(value)
  if (!schema) {
    return []
  }

  const constraints: string[] = []
  const enumValues = schema['enum']
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    constraints.push(`one of ${enumValues.map(asText).join(', ')}`)
  }
  if (schema['default'] !== undefined) {
    constraints.push(`default ${asText(schema['default'])}`)
  }
  if (typeof schema['minimum'] === 'number') {
    constraints.push(`min ${schema['minimum']}`)
  }
  if (typeof schema['maximum'] === 'number') {
    constraints.push(`max ${schema['maximum']}`)
  }
  if (typeof schema['minLength'] === 'number') {
    constraints.push(`min length ${schema['minLength']}`)
  }
  if (typeof schema['maxLength'] === 'number') {
    constraints.push(`max length ${schema['maxLength']}`)
  }
  if (typeof schema['pattern'] === 'string') {
    constraints.push(`pattern ${schema['pattern']}`)
  }
  return constraints
}

export type SchemaProperty = {
  name: string
  schema: unknown
  required: boolean
  deprecated: boolean
  description?: string | undefined
}

/**
 * The properties of an object schema, flattening `allOf` because a reader does not care that the
 * author composed the type out of three fragments - they care what fields exist.
 *
 * `oneOf`/`anyOf` are deliberately not flattened: their branches are alternatives, and merging them
 * would describe an object that cannot exist. {@link schemaVariants} hands them over separately, and
 * `<openish-schema>` renders them as variants the reader switches between.
 */
export const schemaProperties = (value: unknown, depth = 0): SchemaProperty[] => {
  const schema = asSchema(value)
  if (!schema || depth > MAX_DEPTH) {
    return []
  }

  const collected = new Map<string, SchemaProperty>()
  const required = new Set(
    (Array.isArray(schema['required']) ? schema['required'] : []).filter(
      (name): name is string => typeof name === 'string',
    ),
  )

  const allOf = schema['allOf']
  if (Array.isArray(allOf)) {
    for (const branch of allOf) {
      for (const property of schemaProperties(branch, depth + 1)) {
        collected.set(property.name, property)
      }
    }
  }

  const properties = schema['properties']
  if (isPlainObject(properties)) {
    for (const [name, raw] of Object.entries(properties)) {
      const child = asSchema(raw)
      collected.set(name, {
        name,
        schema: raw,
        required: required.has(name),
        deprecated: child?.['deprecated'] === true,
        description: typeof child?.['description'] === 'string' ? child['description'] : undefined,
      })
    }
  }

  /* A property listed in this level's `required` overrides what an `allOf` branch said about it. */
  for (const property of collected.values()) {
    if (required.has(property.name)) {
      collected.set(property.name, { ...property, required: true })
    }
  }

  return [...collected.values()]
}

/**
 * The schema whose properties are worth showing: an array's items stand in for the array.
 *
 * Nested arrays unwrap all the way down, because `Node[][]` describes `Node` twice and the reader
 * only needs to be told about `Node` once - the type label already said how deeply it is wrapped.
 * The items schema is returned **unresolved**, so a `$ref` on it survives for the cycle check.
 */
export const unwrapArray = (value: unknown): { schema: unknown; isArray: boolean } => {
  let current = value
  let isArray = false

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const schema = asSchema(current)
    if (!schema || !typeNames(schema).includes('array') || schema['items'] === undefined) {
      break
    }
    current = schema['items']
    isArray = true
  }

  return { schema: current, isArray }
}

/** The raw `$ref` pointer on a value, which is what a cycle is tracked by. */
export const refPointer = (value: unknown): string | undefined => {
  const ref = isPlainObject(value) ? value['$ref'] : undefined
  return typeof ref === 'string' ? ref : undefined
}

/** The `oneOf`/`anyOf` branches of a schema, and which keyword they came from. */
export type SchemaVariants = {
  keyword: 'oneOf' | 'anyOf'
  branches: readonly unknown[]
  /** The property whose value picks the branch, from `discriminator`. */
  discriminator?: string | undefined
  /** `discriminator.mapping` inverted: `$ref` pointer to the value that selects it. */
  mapping?: ReadonlyMap<string, string> | undefined
}

export const schemaVariants = (value: unknown): SchemaVariants | undefined => {
  const schema = asSchema(value)
  if (!schema) {
    return undefined
  }

  const keyword = Array.isArray(schema['oneOf']) ? 'oneOf' : Array.isArray(schema['anyOf']) ? 'anyOf' : undefined
  if (!keyword) {
    return undefined
  }

  const branches = schema[keyword] as unknown[]
  if (branches.length === 0) {
    return undefined
  }

  const discriminator = isPlainObject(schema['discriminator']) ? schema['discriminator'] : undefined
  const rawMapping = isPlainObject(discriminator?.['mapping']) ? discriminator['mapping'] : undefined
  const mapping = new Map<string, string>()
  for (const [name, pointer] of Object.entries(rawMapping ?? {})) {
    if (typeof pointer === 'string') {
      mapping.set(pointer, name)
    }
  }

  return {
    keyword,
    branches,
    discriminator: typeof discriminator?.['propertyName'] === 'string' ? discriminator['propertyName'] : undefined,
    mapping: mapping.size > 0 ? mapping : undefined,
  }
}

/**
 * Whether a schema has anything to say beyond its type.
 *
 * A property row already prints the name, the type, and whether it is required, so a schema with
 * nothing else - `{ type: 'string' }`, which most properties are - needs no renderer under it at
 * all. Asking first is what keeps a fifty-property model from creating fifty empty elements.
 */
export const hasBody = (value: unknown): boolean => {
  const { schema } = unwrapArray(value)
  const resolved = asSchema(schema)
  if (!resolved) {
    return false
  }

  const description = resolved['description']
  return (
    (typeof description === 'string' && description.trim() !== '') ||
    resolved['not'] !== undefined ||
    schemaConstraints(schema).length > 0 ||
    schemaVariants(schema) !== undefined ||
    schemaProperties(schema).length > 0 ||
    isPlainObject(resolved['additionalProperties'])
  )
}

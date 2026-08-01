import { getResolvedRef, isRefObject } from '../ref.js'

/**
 * A schema seen as a bag of keywords.
 *
 * `@scalar/openapi-types`' `SchemaObject` is a precise discriminated union - `StringObject`,
 * `ArrayObject`, and so on - which is exactly right for code that already knows which variant it
 * holds. A generic walker does not: it has to probe `allOf`, then `enum`, then `items`, before it
 * can say what this schema is. Narrowing at every step would be noise, so the walker reads a record
 * and the public signature stays `unknown`.
 */
type AnySchema = Record<string, unknown>

export type SchemaExampleOptions = {
  /**
   * How deep to descend before giving up. A backstop for pathological documents; ordinary schemas
   * never come near it.
   */
  maxDepth?: number
  /** Include properties that are not in `required`. On by default - docs should show the shape. */
  includeOptional?: boolean
}

const DEFAULT_MAX_DEPTH = 12

/** Placeholder values by `format`, then by `type`. Recognisable as samples, not real data. */
const FORMAT_SAMPLES: Record<string, string> = {
  'date-time': '2024-01-01T00:00:00Z',
  date: '2024-01-01',
  time: '00:00:00',
  duration: 'P1D',
  email: 'user@example.com',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  uri: 'https://example.com',
  'uri-reference': '/example',
  uuid: '00000000-0000-0000-0000-000000000000',
  byte: 'ZXhhbXBsZQ==',
  binary: '',
  password: '********',
}

const isPlainObject = (value: unknown): value is AnySchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asArray = (value: unknown): unknown[] | undefined => (Array.isArray(value) ? value : undefined)

const firstType = (schema: AnySchema): string | undefined => {
  const type = schema['type']
  if (Array.isArray(type)) {
    /* A nullable union like ['string', 'null'] should sample as a string, not as null. */
    const named = type.filter((entry): entry is string => typeof entry === 'string')
    return named.find((entry) => entry !== 'null') ?? named[0]
  }
  return typeof type === 'string' ? type : undefined
}

const primitive = (schema: AnySchema): unknown => {
  const type = firstType(schema)

  if (type === 'string') {
    const format = schema['format']
    return (typeof format === 'string' ? FORMAT_SAMPLES[format] : undefined) ?? 'string'
  }
  if (type === 'integer' || type === 'number') {
    return typeof schema['minimum'] === 'number' ? schema['minimum'] : 0
  }
  if (type === 'boolean') {
    return true
  }
  if (type === 'null') {
    return null
  }

  /* No type and no keywords to infer from: an empty object is the least misleading answer. */
  return {}
}

/**
 * Generates a sample value for a schema.
 *
 * Preference order is "what the author told us" before "what we can infer": `example`, then
 * `examples`, `default`, `const`, `enum`, and only then a value synthesised from `type`/`format`.
 *
 * Recursion is bounded three ways, and it takes all three.
 *
 * The primary guard tracks `$ref` pointers on the current path, because that is how a cycle is
 * actually written: a `Node` with a `children: Node[]` property is ordinary in real documents, and
 * the loop only exists through the reference. Object identity alone is not enough - the magic proxy
 * hands back a fresh wrapper each time a reference resolves, so the same schema is never the same
 * object twice. Identity is still checked, as a second guard for genuinely shared objects (YAML
 * anchors produce those). A depth cap catches whatever is left: deep-but-finite nesting.
 *
 * A stopped branch yields `null`, which is honest about having stopped rather than pretending the
 * structure ends there.
 */
export const schemaExample = (schema: unknown, options: SchemaExampleOptions = {}): unknown => {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const includeOptional = options.includeOptional ?? true

  const visit = (
    input: unknown,
    depth: number,
    seenRefs: ReadonlySet<string>,
    seenObjects: ReadonlySet<object>,
  ): unknown => {
    if (depth >= maxDepth) {
      return null
    }

    let refs = seenRefs
    if (isRefObject(input)) {
      if (refs.has(input.$ref)) {
        return null
      }
      refs = new Set(refs).add(input.$ref)
    }

    const resolved = getResolvedRef(input)

    if (!isPlainObject(resolved) || seenObjects.has(resolved)) {
      return null
    }

    if (resolved['example'] !== undefined) {
      return resolved['example']
    }
    const examples = asArray(resolved['examples'])
    if (examples && examples.length > 0) {
      return examples[0]
    }
    if (resolved['default'] !== undefined) {
      return resolved['default']
    }
    if (resolved['const'] !== undefined) {
      return resolved['const']
    }
    const enumValues = asArray(resolved['enum'])
    if (enumValues && enumValues.length > 0) {
      return enumValues[0]
    }

    const nestedObjects = new Set(seenObjects).add(resolved)
    const descend = (value: unknown) => visit(value, depth + 1, refs, nestedObjects)

    /* `allOf` is an intersection, so merge the branches. Non-object branches cannot merge; last wins. */
    const allOf = asArray(resolved['allOf'])
    if (allOf && allOf.length > 0) {
      let merged: unknown = {}
      for (const branch of allOf) {
        const value = descend(branch)
        if (isPlainObject(value) && isPlainObject(merged)) {
          merged = { ...merged, ...value }
        } else if (value !== null) {
          merged = value
        }
      }
      return merged
    }

    /* `oneOf`/`anyOf` are choices; a sample has to pick one, and the first is the author's default. */
    const choice = asArray(resolved['oneOf']) ?? asArray(resolved['anyOf'])
    if (choice && choice.length > 0) {
      return descend(choice[0])
    }

    const type = firstType(resolved)
    const items = resolved['items']
    const properties = resolved['properties']
    const additionalProperties = resolved['additionalProperties']

    if (type === 'array' || items !== undefined) {
      if (items === undefined) {
        return []
      }
      const item = descend(items)
      return item === null ? [] : [item]
    }

    if (type === 'object' || properties !== undefined || isPlainObject(additionalProperties)) {
      const requiredNames = asArray(resolved['required']) ?? []
      const required = new Set(requiredNames.filter((name): name is string => typeof name === 'string'))
      const output: Record<string, unknown> = {}

      if (isPlainObject(properties)) {
        for (const [name, property] of Object.entries(properties)) {
          if (!includeOptional && !required.has(name)) {
            continue
          }
          const propertySchema = getResolvedRef(property)
          /* `writeOnly` means "request only", so it has no place in a response sample. */
          if (isPlainObject(propertySchema) && propertySchema['writeOnly'] === true) {
            continue
          }
          output[name] = descend(property)
        }
      }

      /* A map-shaped schema has no named properties; show one entry so the shape is visible. */
      if (Object.keys(output).length === 0 && isPlainObject(additionalProperties)) {
        output['key'] = descend(additionalProperties)
      }

      return output
    }

    return primitive(resolved)
  }

  return visit(schema, 0, new Set(), new Set())
}

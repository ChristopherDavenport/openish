import {
  asSchema,
  modelNameFromPointer,
  refName,
  schemaTypeLabel,
  schemaTypeNames,
} from './type-label.js'

/*
 * Naming a type lives next door in `type-label.ts`, and is re-exported here so every call site can
 * take the whole of one schema's vocabulary from one import.
 *
 * These readers followed it into core, and for the same reason it came: `nodeToMarkdown` has to
 * describe the same shapes the page describes, and a clipboard that said `object` where the tree
 * said `Account` would be two answers to one question. Copy for LLM is the complete copy of a
 * section now that the page abstracts a body by default, so it needs every reader the page has -
 * and it cannot import them from `@openish/elements`, which depends on this package.
 */
export { asSchema, modelNameFromPointer, refName, schemaTypeLabel }

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

/**
 * How many enum members a one-line constraint prints before it starts counting instead.
 *
 * Above this the full list still renders below the line, so the cap costs the reader nothing and
 * saves them a paragraph where they expected a sentence.
 */
export const ENUM_INLINE_LIMIT = 6

const isPlainObject = (value: unknown): value is AnySchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
  const number = (key: string): number | undefined =>
    typeof schema[key] === 'number' ? (schema[key] as number) : undefined

  /*
   * A long enum is capped rather than printed in full.
   *
   * A constraint line is one line, and a currency enum with 180 members turns it into the page.
   * `<openish-schema>` renders every value underneath, so nothing is lost - this is the summary, and
   * the summary of 180 things is not 180 things.
   */
  const enumValues = schema['enum']
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    const shown = enumValues.slice(0, ENUM_INLINE_LIMIT).map(asText).join(', ')
    const rest = enumValues.length - ENUM_INLINE_LIMIT
    constraints.push(rest > 0 ? `one of ${shown} and ${rest} more` : `one of ${shown}`)
  }
  /* What the *keys* of an object may be, which `additionalProperties` says nothing about. */
  const propertyNames = asSchema(schema['propertyNames'])
  if (propertyNames) {
    const allowed = Array.isArray(propertyNames['enum']) ? propertyNames['enum'] : undefined
    const pattern = propertyNames['pattern']
    if (allowed && allowed.length > 0) {
      constraints.push(`keys: one of ${allowed.map(asText).join(', ')}`)
    } else if (typeof pattern === 'string') {
      constraints.push(`keys match ${pattern}`)
    }
  }
  /* `const` is `enum` with one member, and a document that uses it means the value is fixed. */
  if (schema['const'] !== undefined) {
    constraints.push(`always ${asText(schema['const'])}`)
  }
  if (schema['default'] !== undefined) {
    constraints.push(`default ${asText(schema['default'])}`)
  }

  /*
   * Bounds, exclusive and inclusive together.
   *
   * In OpenAPI 3.1 - which is what the store has upgraded everything to - `exclusiveMinimum` is a
   * number, not the 3.0 boolean modifier on `minimum`. The upgrade handles the conversion, so only
   * the 3.1 spelling is read here, and the two never both apply to the same edge.
   */
  const minimum = number('minimum')
  const exclusiveMinimum = number('exclusiveMinimum')
  if (minimum !== undefined) {
    constraints.push(`min ${minimum}`)
  } else if (exclusiveMinimum !== undefined) {
    constraints.push(`greater than ${exclusiveMinimum}`)
  }

  const maximum = number('maximum')
  const exclusiveMaximum = number('exclusiveMaximum')
  if (maximum !== undefined) {
    constraints.push(`max ${maximum}`)
  } else if (exclusiveMaximum !== undefined) {
    constraints.push(`less than ${exclusiveMaximum}`)
  }

  const multipleOf = number('multipleOf')
  if (multipleOf !== undefined) {
    constraints.push(`multiple of ${multipleOf}`)
  }

  if (number('minLength') !== undefined) {
    constraints.push(`min length ${schema['minLength']}`)
  }
  if (number('maxLength') !== undefined) {
    constraints.push(`max length ${schema['maxLength']}`)
  }
  if (typeof schema['pattern'] === 'string') {
    constraints.push(`pattern ${schema['pattern']}`)
  }

  if (number('minItems') !== undefined) {
    constraints.push(`min ${schema['minItems']} items`)
  }
  if (number('maxItems') !== undefined) {
    constraints.push(`max ${schema['maxItems']} items`)
  }
  if (schema['uniqueItems'] === true) {
    constraints.push('unique items')
  }

  if (number('minProperties') !== undefined) {
    constraints.push(`min ${schema['minProperties']} properties`)
  }
  if (number('maxProperties') !== undefined) {
    constraints.push(`max ${schema['maxProperties']} properties`)
  }

  /*
   * What a string actually carries.
   *
   * `{ type: 'string', contentMediaType: 'image/png', contentEncoding: 'base64' }` is a PNG, and
   * rendering it as `string` tells the reader to send the wrong thing. These are the two keywords
   * that change what a caller has to *do*, which is the rule this whole function follows.
   */
  if (typeof schema['contentMediaType'] === 'string') {
    constraints.push(`${schema['contentMediaType']} content`)
  }
  if (typeof schema['contentEncoding'] === 'string') {
    constraints.push(`${schema['contentEncoding']}-encoded`)
  }

  /*
   * `dependentRequired` is prose, not shape: it makes a property required *given another one*. A
   * reader who sends `billingAddress` without `billingPostcode` gets a 400 the type never mentioned.
   */
  const dependentRequired = schema['dependentRequired']
  if (isPlainObject(dependentRequired)) {
    for (const [name, required] of Object.entries(dependentRequired)) {
      if (Array.isArray(required) && required.length > 0) {
        constraints.push(`with ${name}: also requires ${required.join(', ')}`)
      }
    }
  }

  return constraints
}

/**
 * `dependentSchemas`: extra shape a property's mere presence brings with it.
 *
 * Unlike `dependentRequired`, which only names more required properties, this attaches a whole
 * schema - so it needs the renderer rather than a constraint line.
 */
export const schemaDependentSchemas = (value: unknown): Array<{ property: string; schema: unknown }> => {
  const dependent = asSchema(value)?.['dependentSchemas']
  if (!isPlainObject(dependent)) {
    return []
  }

  return Object.entries(dependent).map(([property, schema]) => ({ property, schema }))
}

/** An `if`/`then`/`else` triple, when a schema has one. */
export type SchemaConditional = {
  condition: unknown
  then?: unknown
  otherwise?: unknown
  /** A one-line reading of the condition, where it is a plain discriminant on one property. */
  summary?: string | undefined
}

/**
 * The conditional subschema, and a readable summary of what it tests.
 *
 * Rendered as a rule rather than three anonymous schemas, because that is how an author means it:
 * "if `type` is `card`, then these fields apply". The summary is only attempted for the shape that
 * carries almost all real uses - a `const` or single-member `enum` on one property - and is left off
 * rather than guessed at for anything more involved, where the `if` schema is rendered in full.
 */
export const schemaConditional = (value: unknown): SchemaConditional | undefined => {
  const schema = asSchema(value)
  const condition = schema?.['if']
  if (condition === undefined) {
    return undefined
  }

  const result: SchemaConditional = { condition }
  if (schema?.['then'] !== undefined) {
    result.then = schema['then']
  }
  if (schema?.['else'] !== undefined) {
    result.otherwise = schema['else']
  }

  const properties = asSchema(condition)?.['properties']
  if (isPlainObject(properties)) {
    const entries = Object.entries(properties)
    const [only] = entries
    if (entries.length === 1 && only) {
      const [name, test] = only
      const discriminant = asSchema(test)
      const constant =
        discriminant?.['const'] ??
        (Array.isArray(discriminant?.['enum']) && discriminant['enum'].length === 1
          ? discriminant['enum'][0]
          : undefined)
      if (constant !== undefined) {
        result.summary = `${name} is ${asText(constant)}`
      }
    }
  }

  return result
}

/**
 * The `$dynamicAnchor`s a schema brings into scope, by name.
 *
 * Read from `$defs`, which is where the specification puts them and where every real document does.
 * A schema that carries `$dynamicAnchor` on itself counts too.
 */
export const collectDynamicAnchors = (value: unknown): Map<string, unknown> => {
  const schema = asSchema(value)
  const anchors = new Map<string, unknown>()
  if (!schema) {
    return anchors
  }

  const own = schema['$dynamicAnchor']
  if (typeof own === 'string') {
    anchors.set(own, schema)
  }

  const defs = schema['$defs']
  if (isPlainObject(defs)) {
    for (const entry of Object.values(defs)) {
      const child = asSchema(entry)
      const name = child?.['$dynamicAnchor']
      if (typeof name === 'string') {
        anchors.set(name, entry)
      }
    }
  }

  return anchors
}

/** The anchor name a `$dynamicRef` names, e.g. `#itemType` becomes `itemType`. */
export const dynamicRefName = (value: unknown): string | undefined => {
  const ref = asSchema(value)?.['$dynamicRef']
  return typeof ref === 'string' && ref.startsWith('#') ? ref.slice(1) : undefined
}

/**
 * Whether a resolved anchor is the unbound placeholder.
 *
 * A generic schema declares its type parameter as `{ $dynamicAnchor: 'itemType', not: {} }` - `not`
 * of the empty schema matches nothing, which is JSON Schema's way of saying "a specializing schema
 * has to bind this". Rendering that as an ordinary `not` would tell the reader the item may be
 * anything except everything, which is true and useless.
 */
export const isUnboundAnchor = (value: unknown): boolean => {
  const schema = asSchema(value)
  if (!schema) {
    return false
  }
  const not = schema['not']
  return isPlainObject(not) && Object.keys(not).length === 0
}

/**
 * An enum's members, rendered the way the constraint line renders them.
 *
 * The same `asText` as everywhere else, so a value here matches the key {@link enumDescriptions}
 * files its prose under - two different spellings of `1` would silently fail to join up.
 */
export const enumValues = (value: unknown): string[] => {
  const members = asSchema(value)?.['enum']
  return Array.isArray(members) ? members.map(asText) : []
}

/**
 * The example values a schema carries, in the order the generator would reach for them.
 *
 * Two spellings, because OpenAPI changed its mind: `example` is a single value and is what a 3.0
 * document writes, `examples` is an array and is what JSON Schema 2020-12 - and therefore 3.1 - says
 * instead. Both are read, singular first, which is the precedence `schemaExample` already applies
 * when it builds a value out of a schema. The page and the generated example agree because they ask
 * the same question in the same order.
 *
 * Not the *map* of Example Objects: on a schema that spelling is not valid and `schemaExample`
 * ignores it, so surfacing it here would put a value on the page that the example beside it denies.
 * The map belongs to a Media Type or a Parameter, and `mediaTypeExamples` reads it there.
 */
export const schemaExamples = (value: unknown): unknown[] => {
  const schema = asSchema(value)
  if (!schema) {
    return []
  }

  if (schema['example'] !== undefined) {
    return [schema['example']]
  }

  return Array.isArray(schema['examples']) ? schema['examples'] : []
}

/**
 * What each member of an `enum` means, when the document bothered to say.
 *
 * Four spellings are in the wild and generators disagree about which to emit, so all four are read:
 * `x-enumDescriptions` and `x-enum-descriptions` map a value to prose, while `x-enumNames` and
 * `x-enum-varnames` give each value a symbolic name positionally. Returned keyed by the *rendered*
 * value, which is how the enum is displayed and therefore how a caller can match one back up.
 */
export const enumDescriptions = (value: unknown): Map<string, string> => {
  const schema = asSchema(value)
  const described = new Map<string, string>()
  if (!schema) {
    return described
  }

  const values = Array.isArray(schema['enum']) ? schema['enum'] : []

  const byValue = schema['x-enumDescriptions'] ?? schema['x-enum-descriptions']
  if (isPlainObject(byValue)) {
    for (const [key, text] of Object.entries(byValue)) {
      if (typeof text === 'string') {
        described.set(key, text)
      }
    }
  }

  const names = schema['x-enumNames'] ?? schema['x-enum-varnames']
  if (Array.isArray(names)) {
    names.forEach((name, index) => {
      if (typeof name !== 'string' || index >= values.length) {
        return
      }
      const key = asText(values[index])
      /* A real description outranks a symbolic name; the name is a fallback, not an override. */
      if (!described.has(key)) {
        described.set(key, name)
      }
    })
  }

  return described
}

/**
 * What the document calls the key of a free-form map, from `x-additionalPropertiesName`.
 *
 * The default row for `additionalProperties` reads `[key: string]`, which is honest and tells the
 * reader nothing. A document that says the key is a currency code should get to say so.
 */
export const additionalPropertiesName = (value: unknown): string => {
  const schema = asSchema(value)
  const name = schema?.['x-additionalPropertiesName']
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : 'key'
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
 * Puts a property list in the order the host asked for.
 *
 * Separate from {@link schemaProperties} because that function recurses through `allOf` and sorting
 * a branch before merging it would let a branch's order decide the whole list's. Sort once, at the
 * top, on the merged result.
 *
 * The default is document order for both options - the order an author wrote is information, and a
 * reference that silently alphabetises it has thrown that away.
 */
export const orderProperties = (
  properties: readonly SchemaProperty[],
  { by = 'document', requiredFirst = false }: { by?: 'document' | 'preserve' | 'alpha'; requiredFirst?: boolean } = {},
): SchemaProperty[] => {
  const ordered = [...properties]

  if (by === 'alpha') {
    ordered.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
  }

  if (requiredFirst) {
    /*
     * A stable partition rather than a comparator, so whichever order was just chosen survives
     * inside each group. `Array.prototype.sort` is stable in every engine this runs on, but saying
     * it with a filter is clearer than relying on the reader knowing that.
     */
    return [...ordered.filter((property) => property.required), ...ordered.filter((property) => !property.required)]
  }

  return ordered
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
    if (!schema || !schemaTypeNames(schema).includes('array') || schema['items'] === undefined) {
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
  /**
   * The pointer each branch was reached by, aligned with `branches`.
   *
   * Only set for variants inferred from a mapping, where the branch is a schema resolved out of the
   * document rather than a `$ref` object - so `refPointer` has nothing to read and the cycle guard
   * would have no identity to track. A `oneOf` branch carries its own `$ref` and needs none of this.
   */
  pointers?: ReadonlyArray<string | undefined> | undefined
}

/** Resolves a local JSON pointer against the document. See {@link schemaVariants}. */
export type PointerResolver = (pointer: string) => unknown

/**
 * Variants read out of `discriminator.mapping` alone, for a base schema that declares no `oneOf`.
 *
 * A document that writes a discriminator with a mapping has described a union - it has named the
 * property that decides and the schemas each value selects - and is simply not using `oneOf` to say
 * so. Rendering only the base's own properties leaves the reader on a page about `Animal` with no
 * route to `Cat`, which is the shape they actually receive.
 *
 * The one hazard here is the bug this deliberately avoids (scalar#9771): the mapped schemas usually
 * compose the base with `allOf`, so inferring variants for *them* too would expand the base inside
 * every one of its own branches, forever. A branch is a schema with no discriminator of its own, so
 * the recursion cannot start - and `<openish-schema>`'s pointer path stops it regardless.
 *
 * `resolve` is required rather than optional because a hand-built `{ $ref }` object does **not**
 * resolve. `getResolvedRef` reads a property the magic proxy installs, so only a value that came out
 * of the proxied document resolves at all - fabricating the reference here produced a branch that
 * rendered its name and nothing else. The pointer therefore has to be looked up against the
 * document, and the pointer is carried separately so the cycle guard still has an identity.
 */
const inferredVariants = (schema: AnySchema, resolve: PointerResolver | undefined): SchemaVariants | undefined => {
  const discriminator = isPlainObject(schema['discriminator']) ? schema['discriminator'] : undefined
  const rawMapping = isPlainObject(discriminator?.['mapping']) ? discriminator['mapping'] : undefined
  if (!rawMapping || !resolve) {
    return undefined
  }

  const branches: unknown[] = []
  const pointers: Array<string | undefined> = []
  const mapping = new Map<string, string>()

  for (const [name, pointer] of Object.entries(rawMapping)) {
    if (typeof pointer !== 'string') {
      continue
    }
    const branch = resolve(pointer)
    if (branch === undefined) {
      continue
    }
    branches.push(branch)
    pointers.push(pointer)
    mapping.set(pointer, name)
  }

  if (branches.length === 0) {
    return undefined
  }

  return {
    keyword: 'oneOf',
    branches,
    discriminator: typeof discriminator?.['propertyName'] === 'string' ? discriminator['propertyName'] : undefined,
    mapping,
    pointers,
  }
}

export const schemaVariants = (value: unknown, resolve?: PointerResolver): SchemaVariants | undefined => {
  const schema = asSchema(value)
  if (!schema) {
    return undefined
  }

  const keyword = Array.isArray(schema['oneOf']) ? 'oneOf' : Array.isArray(schema['anyOf']) ? 'anyOf' : undefined
  if (!keyword) {
    return inferredVariants(schema, resolve)
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
 * The pointer one branch was reached by.
 *
 * A `oneOf` branch carries its own `$ref`. An inferred branch was resolved out of the document by a
 * discriminator mapping, so its pointer travels beside it - see {@link SchemaVariants.pointers}.
 */
export const variantPointer = (variants: SchemaVariants, index: number): string =>
  refPointer(variants.branches[index]) ?? variants.pointers?.[index] ?? ''

/**
 * What to call one branch, in the order a reader would recognise it.
 *
 * The discriminator's own word for it first - an author who wrote `mapping` named these branches on
 * purpose - then the model it references, then whatever `title` says, and a position only when the
 * document has offered nothing at all.
 *
 * Here rather than in the tab set that first needed it, because the Markdown copy prints every
 * branch and has to call them what the page calls them. Two names for one branch is the same failure
 * as two answers about one type.
 */
export const variantLabel = (variants: SchemaVariants, index: number): string => {
  const branch = variants.branches[index]
  const title = asSchema(branch)?.['title']
  return (
    variants.mapping?.get(variantPointer(variants, index)) ??
    refName(branch) ??
    modelNameFromPointer(variants.pointers?.[index]) ??
    (typeof title === 'string' ? title : `Option ${index + 1}`)
  )
}

/**
 * The positional element schemas of a tuple, as rows a property list can render.
 *
 * Named `[0]`, `[1]` because that is how they are addressed. A tuple is an array whose positions
 * mean different things, so `items` does not describe it and the property list is the closest shape
 * openish already has for "these named things, in this order".
 */
export const schemaPrefixItems = (value: unknown): SchemaProperty[] => {
  const schema = asSchema(value)
  const prefixItems = schema?.['prefixItems']
  if (!Array.isArray(prefixItems)) {
    return []
  }

  return prefixItems.map((item, index) => {
    const child = asSchema(item)
    return {
      name: `[${index}]`,
      schema: item,
      /* Every declared position is required unless `minItems` says the tail may be dropped. */
      required: typeof schema?.['minItems'] !== 'number' || (schema['minItems'] as number) > index,
      deprecated: child?.['deprecated'] === true,
      description: typeof child?.['description'] === 'string' ? child['description'] : undefined,
    }
  })
}

/**
 * `patternProperties`, as one row per pattern.
 *
 * The same shape as `additionalProperties` and rendered the same way, except that the key is a
 * regular expression rather than anything - so the row names the pattern instead of saying `string`.
 */
export const schemaPatternProperties = (value: unknown): Array<{ pattern: string; schema: unknown }> => {
  const patterns = asSchema(value)?.['patternProperties']
  if (!isPlainObject(patterns)) {
    return []
  }

  return Object.entries(patterns).map(([pattern, schema]) => ({ pattern, schema }))
}

/**
 * Whether a schema has anything to say beyond its type.
 *
 * A property row already prints the name, the type, and whether it is required, so a schema with
 * nothing else - `{ type: 'string' }`, which most properties are - needs no renderer under it at
 * all. Asking first is what keeps a fifty-property model from creating fifty empty elements.
 */
export const hasBody = (value: unknown): boolean => {
  const { schema, isArray } = unwrapArray(value)
  const resolved = asSchema(schema)
  if (!resolved) {
    return false
  }

  /*
   * An array is two schemas, and both can have something to say.
   *
   * `minItems`/`maxItems`/`uniqueItems` belong to the wrapper while the properties belong to the
   * items, so asking only the unwrapped schema misses "at least one, all distinct" on an array of
   * plain strings - and because this function decides whether a nested `<openish-schema>` is created
   * at all, missing it meant the constraint was never rendered anywhere.
   */
  /*
   * A discriminated base whose variants are only inferable needs a body too, and inferring them
   * needs the document - which this function does not have. Testing for the mapping answers the only
   * question asked here, which is whether there will be something to render.
   */
  const discriminator = resolved['discriminator']
  const hasMapping = isPlainObject(discriminator) && isPlainObject(discriminator['mapping'])

  const description = resolved['description']
  return (
    (typeof description === 'string' && description.trim() !== '') ||
    resolved['not'] !== undefined ||
    schemaConstraints(schema).length > 0 ||
    (isArray && schemaConstraints(value).length > 0) ||
    enumDescriptions(schema).size > 0 ||
    schemaVariants(schema) !== undefined ||
    hasMapping ||
    schemaProperties(schema).length > 0 ||
    schemaPrefixItems(schema).length > 0 ||
    schemaPatternProperties(schema).length > 0 ||
    schemaDependentSchemas(schema).length > 0 ||
    schemaConditional(schema) !== undefined ||
    /*
     * A `$dynamicRef` has a body because it resolves to one - and the resolution needs the dynamic
     * scope, which this function does not have. The reference itself is the evidence that there is
     * something to render, so `hasBody` says yes and the element decides what.
     */
    dynamicRefName(schema) !== undefined ||
    isPlainObject(resolved['additionalProperties'])
  )
}

import {
  additionalPropertiesName,
  ENUM_INLINE_LIMIT,
  enumDescriptions,
  enumValues,
  orderProperties,
  refPointer,
  schemaConditional,
  schemaConstraints,
  schemaDependentSchemas,
  schemaExamples,
  schemaPatternProperties,
  schemaPrefixItems,
  schemaProperties,
  schemaVariants,
  unwrapArray,
  variantLabel,
  type SchemaProperty,
} from '../schema/read.js'
import { asSchema, refName, schemaTypeLabel } from '../schema/type-label.js'

/**
 * A schema as a nested list, for the copy a reader hands to a model.
 *
 * The page abstracts a body by default now - a named type and a closed disclosure, because a reader
 * arrives asking what to send rather than what shape it is. That only holds if the *complete* answer
 * is still one action away, and Copy for LLM is that action. So this is deliberately not a transcript
 * of the page: it prints what the page rations.
 *
 * - every enum member, where the page's constraint line stops at {@link ENUM_INLINE_LIMIT}
 * - every `oneOf` branch, where the page shows the tab the reader is on
 * - every nesting, where the page opens the one the reader clicked
 *
 * Built out of the same readers `<openish-schema>` renders from - which is why they live in this
 * package rather than in `@openish/elements`. Two walkers over one schema is two answers to "what
 * shape is this", and the whole rule about this file is that there is one.
 *
 * The bounds are the tree's, for the tree's reasons: a `$ref` already on the path is named rather
 * than expanded, because a document may describe a graph and a list cannot; and a depth cap catches
 * nesting that is deep but finite. A document the page can render is a document this can copy.
 */

/** The tree's own cap. Deeper than any hand-written schema and shallower than a runaway one. */
const MAX_DEPTH = 12

const INDENT = '  '

type Walk = {
  /** Pointers on the path here, so a cycle is named instead of followed. */
  readonly seen: ReadonlySet<string>
  readonly depth: number
  /**
   * The pointer this schema was reached by, when it does not carry one itself.
   *
   * A model section hands over the schema out of `components.schemas` directly, so there is no
   * `$ref` on it to learn its identity from - and without one, `Planet.satellites[].orbit.planet`
   * expands `Planet` a second time before the guard notices. `<openish-schema>` takes the same value
   * as a property for the same reason; `NavModelNode` already carries it.
   */
  readonly pointer?: string | undefined
}

const bullet = (depth: number, text: string): string => `${INDENT.repeat(depth)}- ${text}`

/** A description on a bullet of its own, indented under the line it belongs to and kept to one line. */
const note = (depth: number, text: string | undefined): string[] => {
  const trimmed = text?.replace(/\s+/g, ' ').trim()
  return trimmed ? [`${INDENT.repeat(depth + 1)}${trimmed}`] : []
}

const flags = (value: unknown): string => {
  const schema = asSchema(value)
  const found = [
    schema?.['readOnly'] === true ? 'read-only' : undefined,
    schema?.['writeOnly'] === true ? 'write-only' : undefined,
    schema?.['deprecated'] === true ? 'deprecated' : undefined,
  ].filter((flag): flag is string => flag !== undefined)

  return found.length > 0 ? ` · ${found.join(' · ')}` : ''
}

/**
 * Every value an enum allows, and what each one means.
 *
 * The constraint line above has already listed them where they fit on it - `one of a, b, c` - so
 * this is for the two cases where that line is not the whole truth: it capped at
 * {@link ENUM_INLINE_LIMIT} and said "and 40 more", or the values carry descriptions a list of bare
 * names cannot hold. Between the two, nothing is ever summarised away.
 *
 * The same rule the tree renders by, from the same readers, which is why the two agree.
 */
const enumLines = (value: unknown, depth: number): string[] => {
  const values = enumValues(value)
  const described = enumDescriptions(value)
  if (values.length === 0 || (described.size === 0 && values.length <= ENUM_INLINE_LIMIT)) {
    return []
  }

  return [
    bullet(depth, 'One of:'),
    ...values.map((member) => {
      const meaning = described.get(member)
      return bullet(depth + 1, meaning ? `\`${member}\` — ${meaning}` : `\`${member}\``)
    }),
  ]
}

/** What one property says about itself, before anything it contains. */
const headline = (property: SchemaProperty): string => {
  const label = schemaTypeLabel(property.schema)
  const required = property.required ? 'required' : 'optional'
  return `\`${property.name}\`${label ? ` — \`${label}\`` : ''} · ${required}${flags(property.schema)}`
}

const walkProperty = (property: SchemaProperty, depth: number, walk: Walk): string[] => [
  bullet(depth, headline(property)),
  ...note(depth, typeof asSchema(property.schema)?.['description'] === 'string'
    ? (asSchema(property.schema)!['description'] as string)
    : undefined),
  ...walkSchema(property.schema, depth + 1, walk),
]

/**
 * The branches of a `oneOf`/`anyOf`, all of them.
 *
 * Named the way the page's tabs name them so the two agree - the discriminator's mapping key, then
 * the `$ref`'s model name, then `title` - and printed one after another because a copy has no reader
 * to press a tab.
 */
const variantLines = (value: unknown, depth: number, walk: Walk): string[] => {
  const variants = schemaVariants(value)
  if (!variants) {
    return []
  }

  const by = variants.discriminator ? ` — by \`${variants.discriminator}\`` : ''
  return [
    bullet(depth, `${variants.keyword === 'anyOf' ? 'Any of' : 'One of'}${by}:`),
    ...variants.branches.flatMap((branch, index) => [
      bullet(depth + 1, `**${variantLabel(variants, index)}**`),
      ...walkSchema(branch, depth + 2, walk),
    ]),
  ]
}

/**
 * One level of a schema, and everything under it.
 *
 * Exported through `schemaMarkdown`; recursive here so the walk state stays out of the signature
 * callers use.
 */
const walkSchema = (value: unknown, depth: number, walk: Walk): string[] => {
  const { schema: target, isArray } = unwrapArray(value)
  const resolved = asSchema(target)
  if (!resolved) {
    return []
  }

  const pointer = refPointer(target) ?? walk.pointer
  if (pointer !== undefined && walk.seen.has(pointer)) {
    const name = refName(target)
    return [bullet(depth, name ? `Recursive — see \`${name}\`.` : 'Recursive.')]
  }

  if (walk.depth >= MAX_DEPTH) {
    const name = refName(target)
    return [bullet(depth, name ? `Nested further — see \`${name}\`.` : 'Nested further.')]
  }

  const next: Walk = {
    seen: pointer === undefined ? walk.seen : new Set(walk.seen).add(pointer),
    depth: walk.depth + 1,
  }

  /*
   * Both halves of an array: `minItems` is a fact about the array and the rest are facts about what
   * it holds, and only the items schema survives the unwrap. Merged only when there *was* an array -
   * otherwise both reads are of the same object and every constraint arrives twice.
   */
  const constraints = isArray
    ? [...schemaConstraints(value), ...schemaConstraints(target)]
    : schemaConstraints(target)
  const positions = schemaPrefixItems(target)
  const properties = orderProperties(schemaProperties(target), { by: 'document', requiredFirst: false })
  const patterns = schemaPatternProperties(target)
  const additional = resolved['additionalProperties']
  const conditional = schemaConditional(target)

  const examples = isArray ? [...schemaExamples(value), ...schemaExamples(target)] : schemaExamples(target)

  return [
    ...(constraints.length > 0 ? [bullet(depth, constraints.join(' · '))] : []),
    /* What the author wrote as a value, the way the tree prints it beside the constraint line. */
    ...examples.map((example) =>
      bullet(depth, `Example: \`${typeof example === 'string' ? example : JSON.stringify(example)}\``),
    ),
    ...enumLines(target, depth),
    ...variantLines(target, depth, next),
    ...positions.flatMap((position) => walkProperty(position, depth, next)),
    ...properties.flatMap((property) => walkProperty(property, depth, next)),
    ...patterns.flatMap((entry) =>
      walkProperty(
        { name: `/${entry.pattern}/`, schema: entry.schema, required: false, deprecated: false },
        depth,
        next,
      ),
    ),
    ...(typeof additional === 'object' && additional !== null && !Array.isArray(additional)
      ? walkProperty(
          { name: additionalPropertiesName(target), schema: additional, required: false, deprecated: false },
          depth,
          next,
        )
      : []),
    ...schemaDependentSchemas(target).flatMap((entry) => [
      bullet(depth, `With \`${entry.property}\`:`),
      ...walkSchema(entry.schema, depth + 1, next),
    ]),
    /* The rule an author meant: if this, then that - read the way the page reads it. */
    ...(conditional
      ? [
          bullet(depth, conditional.summary ? `If ${conditional.summary}:` : 'If it matches:'),
          ...(conditional.summary ? [] : walkSchema(conditional.condition, depth + 1, next)),
          ...(conditional.then === undefined
            ? []
            : [bullet(depth + 1, '**then**'), ...walkSchema(conditional.then, depth + 2, next)]),
          ...(conditional.otherwise === undefined
            ? []
            : [bullet(depth + 1, '**otherwise**'), ...walkSchema(conditional.otherwise, depth + 2, next)]),
        ]
      : []),
  ]
}

/**
 * A schema as Markdown, or `undefined` when there is nothing to say about it.
 *
 * `undefined` rather than an empty string so a caller can drop it through `blocks` unchanged, the way
 * every other part of `nodeToMarkdown` is composed.
 */
export const schemaMarkdown = (value: unknown, pointer?: string): string | undefined => {
  const lines = walkSchema(value, 0, { seen: new Set(), depth: 0, pointer })
  return lines.length === 0 ? undefined : lines.join('\n')
}

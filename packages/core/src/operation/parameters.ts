import { getResolvedRef } from '../ref.js'

/**
 * A parameter seen as the fields a reader or a snippet generator needs.
 *
 * Spelled out rather than taken from `ParameterObject`, which is a union of the with-schema and
 * with-content forms: `schema`, `example`, and `examples` live on one arm each, so code that probes
 * all of them would narrow at every access for no benefit.
 */
export type ParameterEntry = {
  name: string
  in: string
  required?: boolean
  deprecated?: boolean
  description?: string
  schema?: unknown
  example?: unknown
  examples?: Record<string, unknown>
  content?: Record<string, unknown>
  /** How an array or object is spelled on the wire: `form`, `simple`, `deepObject`, and the rest. */
  style?: string
  /** Whether each array element or object property gets its own occurrence of the name. */
  explode?: boolean
  /** Query parameters only: whether reserved characters may be sent unescaped. */
  allowReserved?: boolean
  /** Query parameters only: whether the name may appear with no value at all. */
  allowEmptyValue?: boolean
}

/** The four `in` values, in the order documentation reads best in. */
export const PARAMETER_LOCATIONS = ['path', 'query', 'header', 'cookie'] as const

export type ParameterLocation = (typeof PARAMETER_LOCATIONS)[number]

/** Anything that can carry a `parameters` list: a path item, or an operation. */
export type ParameterSource = { parameters?: unknown }

/**
 * Merges the path item's parameters with the operation's.
 *
 * OpenAPI says an operation-level parameter overrides a path-level one with the same name *and*
 * location, so the two lists are merged on that key rather than concatenated - `{in}:{name}` is the
 * identity, which is why `?id` and `X-Id` can coexist. Order is path-item first, then anything the
 * operation adds, and an override keeps the position it had at the path level.
 *
 * Entries missing `name` or `in` are dropped: they cannot be rendered, sent, or overridden.
 */
export const collectParameters = (
  pathItem: ParameterSource | undefined,
  operation: ParameterSource | undefined,
): ParameterEntry[] => {
  const merged = new Map<string, ParameterEntry>()

  for (const source of [pathItem?.parameters, operation?.parameters]) {
    if (!Array.isArray(source)) {
      continue
    }
    for (const raw of source) {
      const parameter = getResolvedRef(raw) as ParameterEntry | undefined
      if (parameter?.name && parameter.in) {
        merged.set(`${parameter.in}:${parameter.name}`, parameter)
      }
    }
  }

  return [...merged.values()]
}

/**
 * How a parameter is spelled on the wire, in words, where the document says anything about it.
 *
 * Only what the author *declared* is reported. Every parameter has a `style` and an `explode`
 * whether or not the document mentions them, so restating the defaults would put "form · exploded"
 * under every query parameter in the world - noise that buries the one parameter where it matters.
 * An author who wrote `style: deepObject` wrote it because it is surprising, and that is exactly the
 * case this exists to surface.
 *
 * `allowReserved` and `allowEmptyValue` only appear when true, because false is the default and the
 * absence of a permission is not news.
 */
export const parameterSerialization = (parameter: ParameterEntry): string[] => {
  const notes: string[] = []

  if (typeof parameter.style === 'string' && parameter.style !== '') {
    notes.push(`style ${parameter.style}`)
  }
  if (parameter.explode === true) {
    notes.push('exploded')
  }
  if (parameter.explode === false) {
    notes.push('not exploded')
  }
  if (parameter.allowReserved === true) {
    notes.push('reserved characters allowed')
  }
  if (parameter.allowEmptyValue === true) {
    notes.push('may be empty')
  }

  return notes
}

/**
 * The media type a `content`-described parameter uses, if it is described that way.
 *
 * A parameter carries *either* a `schema` or a `content` map with exactly one entry - the second
 * form is how a document describes a parameter whose value is, say, a JSON object in a query string.
 * Without this the type column rendered empty, which read as "this parameter has no type" rather
 * than "its type is described somewhere this table was not looking".
 */
export const parameterContentType = (parameter: ParameterEntry): string | undefined =>
  parameter.schema === undefined ? Object.keys(parameter.content ?? {})[0] : undefined

/** The schema of a `content`-described parameter, so the type column has something to name. */
export const parameterContentSchema = (parameter: ParameterEntry): unknown => {
  const mediaType = parameterContentType(parameter)
  if (mediaType === undefined) {
    return undefined
  }

  const media = getResolvedRef(parameter.content?.[mediaType]) as { schema?: unknown } | undefined
  return media?.schema
}

/**
 * Groups merged parameters by `in`, in {@link PARAMETER_LOCATIONS} order.
 *
 * Only locations that have parameters appear, so a caller can render one table per entry without
 * checking for empties. An unrecognised `in` value is dropped rather than given a table of its own.
 */
export const groupParameters = (
  parameters: readonly ParameterEntry[],
): Array<[ParameterLocation, ParameterEntry[]]> => {
  const groups: Array<[ParameterLocation, ParameterEntry[]]> = []

  for (const location of PARAMETER_LOCATIONS) {
    const entries = parameters.filter((parameter) => parameter.in === location)
    if (entries.length > 0) {
      groups.push([location, entries])
    }
  }

  return groups
}

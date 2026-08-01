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

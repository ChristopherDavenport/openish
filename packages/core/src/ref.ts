/**
 * Reading through `$ref`s.
 *
 * The document is wrapped in a magic proxy from `@scalar/json-magic`, which does NOT resolve
 * references transparently: `paths['/users'].get` may still be `{ $ref: '#/...' }`. The proxy adds a
 * `$ref-value` property that resolves on access, so every read of a possibly-referenced value goes
 * through {@link getResolvedRef}.
 *
 * That indirection is the whole point - a 900 KB document costs nothing until it is read, and cyclic
 * references never expand.
 */

/** `$ref` alongside sibling keys, which OpenAPI 3.1 allows for `summary` and `description`. */
export type RefObject = {
  $ref: string
  summary?: string
  description?: string
}

/** The property the magic proxy exposes to resolve a reference. */
const REF_VALUE = '$ref-value'

export const isRefObject = (value: unknown): value is RefObject =>
  typeof value === 'object' && value !== null && typeof (value as { $ref?: unknown }).$ref === 'string'

/**
 * Resolves a value that may be a `$ref`.
 *
 * Sibling keys win over the referenced value, per OpenAPI 3.1: `{ $ref, description }` means "the
 * referenced schema, but with this description".
 *
 * Returns the input unchanged when the reference cannot be resolved - an unproxied plain object, or
 * a dangling pointer. Callers get a `$ref` object back rather than `undefined`, which keeps a broken
 * reference from taking down the whole traversal.
 */
export const getResolvedRef = <T>(value: T): T => {
  if (!isRefObject(value)) {
    return value
  }

  const resolved = (value as Record<string, unknown>)[REF_VALUE]
  if (resolved === undefined || resolved === null) {
    return value
  }

  const { $ref: _$ref, ...siblings } = value as RefObject & Record<string, unknown>
  if (Object.keys(siblings).length === 0) {
    return resolved as T
  }

  if (typeof resolved !== 'object' || Array.isArray(resolved)) {
    return resolved as T
  }

  return { ...(resolved as object), ...siblings } as T
}

/** Reads a property and resolves it in one step, for the very common `getResolvedRef(obj[key])`. */
export const resolveProperty = <T, K extends keyof T>(target: T | undefined, key: K): T[K] | undefined => {
  if (target === undefined || target === null) {
    return undefined
  }
  return getResolvedRef(target[key])
}

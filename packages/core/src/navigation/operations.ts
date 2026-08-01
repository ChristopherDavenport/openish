import { escapeJsonPointer } from '@scalar/json-magic/helpers/escape-json-pointer'
import type { OperationObject, PathItemObject } from '@scalar/openapi-types/3.1'

import { getResolvedRef } from '../ref.js'
import { HTTP_METHODS, type HttpMethod } from '../types.js'
import { asIdentifier, asProse, type SlugSource } from './ids.js'

/** One operation, lifted out of the `paths` (or `webhooks`) object with its location attached. */
export type OperationEntry = {
  method: HttpMethod
  /** The path template, or the webhook name. */
  path: string
  operation: OperationObject
  pathItem: PathItemObject
  pointer: string
}

type PathsLike = Record<string, unknown> | undefined

/**
 * Walks a `paths` or `webhooks` object and yields every operation in document order.
 *
 * Both the path item and each operation can be a `$ref`, so both are resolved on the way through.
 * Non-method keys (`summary`, `description`, `parameters`, `servers`, `x-*`) are skipped.
 */
export const collectOperations = (paths: PathsLike, section: 'paths' | 'webhooks'): OperationEntry[] => {
  if (!paths) {
    return []
  }

  const entries: OperationEntry[] = []

  for (const [path, rawPathItem] of Object.entries(paths)) {
    const pathItem = getResolvedRef(rawPathItem) as PathItemObject | undefined
    if (!pathItem || typeof pathItem !== 'object') {
      continue
    }

    for (const method of HTTP_METHODS) {
      const operation = getResolvedRef(pathItem[method]) as OperationObject | undefined
      if (!operation || typeof operation !== 'object') {
        continue
      }

      entries.push({
        method,
        path,
        operation,
        pathItem,
        pointer: `#/${section}/${escapeJsonPointer(path)}/${method}`,
      })
    }
  }

  return entries
}

/** What the sidebar shows for an operation, in the order a reader would find most useful. */
export const operationTitle = (entry: OperationEntry): string =>
  entry.operation.summary?.trim() || entry.operation.operationId?.trim() || `${entry.method.toUpperCase()} ${entry.path}`

/**
 * What an operation's slug is built from.
 *
 * `operationId` is preferred because it is the one identifier the document author controls and is
 * meant to be stable - and being an identifier, it keeps its case in the URL. Without it, method
 * plus path is the next most stable thing (summaries get reworded, paths rarely do) and is treated
 * as prose, so `get-/users/{id}` slugifies to `get-users-id`.
 */
export const operationSlugSource = (entry: OperationEntry): SlugSource => {
  const operationId = entry.operation.operationId?.trim()
  return operationId ? asIdentifier(operationId) : asProse(`${entry.method}-${entry.path}`)
}

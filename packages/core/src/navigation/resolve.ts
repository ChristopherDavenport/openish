import type { Document as OpenApiDocument, OperationObject, PathItemObject } from '@scalar/openapi-types/3.1'

import { getResolvedRef } from '../ref.js'
import type { HttpMethod, NavOperationNode, NavWebhookNode } from '../types.js'

export type ResolvedOperation = {
  /** The path template for an operation, or the webhook name for a webhook. */
  path: string
  method: HttpMethod
  pathItem: PathItemObject | undefined
  operation: OperationObject | undefined
}

/**
 * Walks a navigation node back to the operation it names.
 *
 * The node carries a JSON pointer, but resolving it by hand would defeat the magic proxy: reading
 * the document by key means a referenced path item or operation resolves on access, and nothing is
 * expanded that the reader never looks at.
 *
 * Everything that renders an operation needs this same pair - the operation for its own fields, the
 * path item for the parameters it contributes - so it is one function rather than a walk copied
 * into each element.
 */
export const resolveOperationNode = (
  document: OpenApiDocument | undefined,
  node: NavOperationNode | NavWebhookNode | undefined,
): ResolvedOperation | undefined => {
  if (!document || !node) {
    return undefined
  }

  const section = (
    node.type === 'webhook' ? document.webhooks : document.paths
  ) as Record<string, unknown> | undefined
  const path = node.type === 'webhook' ? node.name : node.path

  const pathItem = getResolvedRef(section?.[path]) as PathItemObject | undefined
  const operation = getResolvedRef((pathItem as Record<string, unknown> | undefined)?.[node.method]) as
    | OperationObject
    | undefined

  return { path, method: node.method, pathItem, operation }
}

import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import type { NavNode, ResolvedOpenishConfig } from '../types.js'
import { SlugRegistry } from './ids.js'
import { traverseDescription } from './traverse-description.js'
import { traverseSchemas } from './traverse-schemas.js'
import { traverseTags } from './traverse-tags.js'
import { traverseWebhooks } from './traverse-webhooks.js'

/**
 * Builds the navigation tree for a document.
 *
 * This is openish's port of Scalar's `traverseDocument`. The structure deliberately mirrors theirs -
 * one `traverse-*` module per document section - so the two stay diffable as Scalar's OpenAPI
 * handling evolves. What is dropped is the Vue layer: upstream unwraps reactive proxies with
 * `toRaw` before reading, which is exactly the dependency openish exists to avoid.
 *
 * Section order is the reading order of the rendered page: prose, then the API surface, then
 * webhooks, then the type dictionary.
 */
export const traverseDocument = (document: OpenApiDocument, config: ResolvedOpenishConfig): NavNode[] => {
  const registry = new SlugRegistry()
  const nodes: NavNode[] = []

  nodes.push(...traverseDescription(document.info?.description, registry))
  nodes.push(...traverseTags(document, config, registry))

  const webhooks = traverseWebhooks(document, registry)
  if (webhooks) {
    nodes.push(webhooks)
  }

  if (!config.hideModels) {
    const models = traverseSchemas(document, config.modelsSectionLabel, registry)
    if (models) {
      nodes.push(models)
    }
  }

  return nodes
}

/** Flattens the tree into a slug lookup, so a URL resolves to a node without re-walking. */
export const indexNavigation = (nodes: readonly NavNode[]): Map<string, NavNode> => {
  const index = new Map<string, NavNode>()

  const visit = (list: readonly NavNode[]) => {
    for (const node of list) {
      index.set(node.id, node)
      if ('children' in node && node.children) {
        visit(node.children)
      }
    }
  }

  visit(nodes)
  return index
}

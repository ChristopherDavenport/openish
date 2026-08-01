import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import type { NavGroupNode, NavWebhookNode } from '../types.js'
import { asProse, type SlugRegistry } from './ids.js'
import { collectOperations, operationSlugSource, operationTitle } from './operations.js'

/**
 * Builds the Webhooks section from the 3.1 `webhooks` object.
 *
 * A webhook entry is a path item, so one webhook name can carry several methods; each becomes its
 * own node. The `path` on the underlying entry is the webhook name rather than a URL template.
 */
export const traverseWebhooks = (
  document: OpenApiDocument,
  registry: SlugRegistry,
): NavGroupNode | undefined => {
  const entries = collectOperations(document.webhooks as Record<string, unknown> | undefined, 'webhooks')
  if (entries.length === 0) {
    return undefined
  }

  const children: NavWebhookNode[] = entries.map((entry) => ({
    type: 'webhook',
    id: registry.claim('webhooks', operationSlugSource(entry), entry.method),
    title: operationTitle(entry),
    name: entry.path,
    method: entry.method,
    pointer: entry.pointer,
  }))

  return {
    type: 'group',
    id: registry.claim('', asProse('webhooks'), 'webhooks'),
    title: 'Webhooks',
    children,
  }
}

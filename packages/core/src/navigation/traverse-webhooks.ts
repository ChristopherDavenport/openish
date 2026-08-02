import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import type { NavGroupNode, NavWebhookNode, SlugOverrides } from '../types.js'
import { isHidden } from './hidden.js'
import { asProse, joinId, type SlugRegistry } from './ids.js'
import { collectOperations, operationSlugSource, operationTitle } from './operations.js'
import { declaredTags } from './tags.js'

/**
 * Builds the Webhooks section from the 3.1 `webhooks` object.
 *
 * A webhook entry is a path item, so one webhook name can carry several methods; each becomes its
 * own node. The `path` on the underlying entry is the webhook name rather than a URL template.
 */
export const traverseWebhooks = (
  document: OpenApiDocument,
  registry: SlugRegistry,
  slugs: SlugOverrides = {},
  prefix = '',
): NavGroupNode | undefined => {
  const entries = collectOperations(document.webhooks as Record<string, unknown> | undefined, 'webhooks').filter(
    (entry) => !isHidden(entry.operation),
  )
  if (entries.length === 0) {
    return undefined
  }

  const children: NavWebhookNode[] = entries.map((entry) => {
    const node: NavWebhookNode = {
      type: 'webhook',
      id: registry.claim(
        joinId(prefix, 'webhooks'),
        operationSlugSource(entry),
        entry.method,
        slugs.webhook?.({ name: entry.path, method: entry.method }),
      ),
      title: operationTitle(entry),
      name: entry.path,
      method: entry.method,
      pointer: entry.pointer,
    }

    /*
     * The tags travel with the node; the node does not move.
     *
     * A webhook that names a tag is still a webhook, so it keeps its place under this section and
     * the id that place gave it - which is what stops a document adding `tags` to an event from
     * breaking every link to it. What the tags buy is a tag section that can *list* it.
     */
    const tags = declaredTags(entry.operation, 'tags')
    if (tags) {
      node.tags = tags
    }
    return node
  })

  return {
    type: 'group',
    id: registry.claim(prefix, asProse('webhooks'), 'webhooks'),
    title: 'Webhooks',
    children,
  }
}

import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import type { NavTextNode, ResolvedOpenishConfig } from '../types.js'
import { asProse, joinId, type SlugRegistry } from './ids.js'

/**
 * The headings the overview writes for itself: where the API lives, and how to get in.
 *
 * These are the only two blocks on the front page that are not prose and not a tag, and until now
 * they were the only headings on it a reader could not link to - literal strings in a template, so
 * no id, no navigation entry, no way to send somebody to "the auth bit". The Markdown that
 * `nodeToMarkdown` hands to a model has had `## Servers` and `## Authentication` in it the whole
 * time; this is the page catching up with what the document already said.
 *
 * They claim through the same registry and under the same parent as the description headings, so a
 * document whose introduction already has a `## Servers` of its own gets `overview/servers-2` for
 * this one without anybody writing a rule about it.
 */
export const traverseInfo = (
  document: OpenApiDocument,
  config: ResolvedOpenishConfig,
  registry: SlugRegistry,
  prefix = '',
): NavTextNode[] => {
  const nodes: NavTextNode[] = []
  const parent = joinId(prefix, 'overview')

  /*
   * The host's list or the document's, because the overview shows whichever is in force and a
   * navigation entry that disagrees with what renders is worse than no entry at all.
   */
  const hasServers = config.servers.length > 0 || (document.servers?.length ?? 0) > 0
  if (hasServers) {
    nodes.push({
      type: 'text',
      id: registry.claim(parent, asProse('Servers'), 'section'),
      title: 'Servers',
      /* The level the overview renders it at: its own title is level one, these sit under it. */
      level: 2,
      infoSection: 'servers',
    })
  }

  const schemes = document.components?.securitySchemes
  if (schemes && Object.keys(schemes).length > 0) {
    nodes.push({
      type: 'text',
      id: registry.claim(parent, asProse('Authentication'), 'section'),
      title: 'Authentication',
      level: 2,
      infoSection: 'authentication',
    })
  }

  return nodes
}

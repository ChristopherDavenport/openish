import type { DocumentStore, NavNode } from '@openish/core'

import { applySlugPrefix, stripFirstSegment } from './urls.js'

/**
 * A second chance for an id the document has no node for.
 *
 * Consulted only on a miss, so a host's `redirect` cannot shadow a real page and costs nothing on
 * every navigation that resolves. One hop only: a generator that maps `a` to `b` and `b` to `a`
 * would otherwise be a hang, and a chain that needs two hops is a config that should say so once.
 *
 * It works in **URL space**, not in id space: a host writing `redirect` is holding a list of links
 * that used to work, and those are the strings in its old sitemap - not ids carrying a document
 * slug the single-document URL never showed. So the id goes in the way the URL had it, and an
 * answer is looked up the same way. A prefixed answer is accepted too, because a multi-document
 * host redirecting *between* documents has no other way to say which one it means.
 *
 * Here rather than beside `renderNode`, which is where it used to live: resolving an id is what the
 * plane does before it knows which section to scroll to, and that has to be reachable from code
 * with no template in it. `render/render-node.ts` imports the elements it renders, so anything
 * importing it needs a custom element registry.
 */
export const redirectedNode = (store: DocumentStore, id: string, slugPrefix: string): NavNode | undefined => {
  const target = store.config.redirect?.(slugPrefix ? stripFirstSegment(id) : id)
  if (!target) {
    return undefined
  }
  return store.bySlug.get(applySlugPrefix(target, slugPrefix)) ?? store.bySlug.get(target)
}

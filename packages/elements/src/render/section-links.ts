import type { DocumentStore, NavGroupNode, NavModelNode, NavNode, NavTagNode, NavWebhookNode } from '@openish/core'

/** One tab of a section's index: what kind of thing it lists, and the nodes. */
export type SectionLinkGroup = {
  /** Stable across renders, because `<openish-tabs>` remembers a selection by id. */
  readonly id: 'operations' | 'events' | 'models' | 'tags'
  readonly label: string
  readonly items: readonly NavNode[]
}

/** A section that can have an index: a tag, or one of the containers. */
export type SectionParent = NavTagNode | NavGroupNode

/**
 * Every webhook and model in the document, filed under each tag it claims.
 *
 * Built once per store and walked once, because the alternative is asking "which events belong to
 * this tag" twenty times on a twenty-tag document and answering it by scanning six hundred nodes
 * each time. Memoised on the store for the reason `sections.ts` memoises the plane there: a store is
 * frozen at construction and replaced wholesale, so nothing here can go stale.
 */
type TagIndex = {
  readonly events: ReadonlyMap<string, NavWebhookNode[]>
  readonly models: ReadonlyMap<string, NavModelNode[]>
}

const indexes = new WeakMap<DocumentStore, TagIndex>()
const groupsByNode = new WeakMap<SectionParent, readonly SectionLinkGroup[]>()

const NO_ITEMS: readonly NavNode[] = Object.freeze([])

const fileUnder = <T extends NavNode & { tags?: readonly string[] }>(
  target: Map<string, T[]>,
  node: T,
): void => {
  for (const tag of node.tags ?? []) {
    const bucket = target.get(tag)
    if (bucket) {
      bucket.push(node)
    } else {
      target.set(tag, [node])
    }
  }
}

const buildIndex = (store: DocumentStore): TagIndex => {
  const events = new Map<string, NavWebhookNode[]>()
  const models = new Map<string, NavModelNode[]>()

  const walk = (nodes: readonly NavNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'webhook') {
        fileUnder(events, node)
      } else if (node.type === 'model') {
        fileUnder(models, node)
      } else if ('children' in node && node.children) {
        walk(node.children)
      }
    }
  }

  walk(store.navigation)
  return { events, models }
}

const indexFor = (store: DocumentStore): TagIndex => {
  const cached = indexes.get(store)
  if (cached) {
    return cached
  }

  const built = buildIndex(store)
  indexes.set(store, built)
  return built
}

/** The children of one kind, in the order the document put them in. */
const childrenOfType = (node: SectionParent, type: NavNode['type']): readonly NavNode[] => {
  const matching = node.children.filter((child) => child.type === type)
  return matching.length > 0 ? matching : NO_ITEMS
}

/**
 * What a section contains, in tabs.
 *
 * Two sources, and the difference between them is worth stating. A section's **children** are what
 * the document put inside it - a tag's operations, the models in the Models dictionary, the events
 * under Webhooks. Its **tagged** members are elsewhere in the tree and point back at it: a webhook
 * whose operation declares `tags: [Planets]`, a schema carrying `x-tags`. Both are links to a
 * section that exists somewhere else on the plane, so nothing is rendered twice and no id moves;
 * the tag simply gains a way to say "these are mine".
 *
 * A group with nothing in it is dropped rather than shown empty, so a document that has never heard
 * of `x-tags` sees Operations alone and is not asked about a Models tab it cannot fill.
 */
export const sectionLinks = (
  store: DocumentStore | undefined,
  node: SectionParent | undefined,
): readonly SectionLinkGroup[] => {
  if (!store || !node) {
    return []
  }

  const cached = groupsByNode.get(node)
  if (cached) {
    return cached
  }

  const index = indexFor(store)
  /* Only a tag is a tag: a container has no name to match, and `''` is not one either. */
  const name = node.type === 'tag' && !node.isUntagged ? node.name : ''

  /*
   * Children first, then the tagged members - and deduplicated by id across the two, because a
   * document is entitled to say both. Nothing in the traversal produces an overlap today; a webhook
   * that is a child of the tag it names would, and the reader should still see it once.
   */
  const join = (children: readonly NavNode[], tagged: readonly NavNode[]): readonly NavNode[] => {
    if (tagged.length === 0) {
      return children
    }
    const seen = new Set(children.map((child) => child.id))
    return [...children, ...tagged.filter((one) => !seen.has(one.id))]
  }

  const candidates: SectionLinkGroup[] = [
    { id: 'operations', label: 'Operations', items: childrenOfType(node, 'operation') },
    {
      id: 'events',
      label: 'Events',
      items: join(childrenOfType(node, 'webhook'), (name && index.events.get(name)) || NO_ITEMS),
    },
    {
      id: 'models',
      label: 'Models',
      items: join(childrenOfType(node, 'model'), (name && index.models.get(name)) || NO_ITEMS),
    },
    /*
     * The tags under an `x-tagGroups` heading. Its children are sections rather than pages, so
     * without this a group would be the one header with no index at all - which is the section that
     * needs one most, being a heading whose whole content is other headings.
     */
    { id: 'tags', label: 'Tags', items: childrenOfType(node, 'tag') },
  ]

  const groups = Object.freeze(candidates.filter((group) => group.items.length > 0))
  groupsByNode.set(node, groups)
  return groups
}

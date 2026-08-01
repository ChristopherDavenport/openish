import type { DocumentStore, NavNode } from '@openish/core'

export type SearchResult = {
  node: NavNode
  /** Higher is a better match. Only meaningful relative to the other results for one query. */
  score: number
  /** Where the node lives, e.g. its tag or `Models`. Shown as the second line of a result. */
  context: string
  /** The operation's path, its `operationId`, or nothing. Shown beside the title. */
  detail: string
}

/** Everything one node can be found by, in the order a match on it counts for most. */
type Haystack = {
  title: string
  identifier: string
  path: string
  context: string
}

const DEFAULT_LIMIT = 20

/**
 * Scores one field.
 *
 * The shape of the scale matters more than the numbers: an exact title beats a prefix, a prefix
 * beats a substring, and a hit anywhere in the title beats a hit in the path - because someone
 * typing `account` wants "List accounts" before `/v1/tenants/{id}/accounts`.
 */
const scoreField = (value: string, term: string, weight: number): number => {
  if (value === '') {
    return 0
  }
  if (value === term) {
    return weight * 4
  }
  if (value.startsWith(term)) {
    return weight * 2
  }
  return value.includes(term) ? weight : 0
}

const scoreTerm = (haystack: Haystack, term: string): number =>
  Math.max(
    scoreField(haystack.title, term, 10),
    scoreField(haystack.identifier, term, 9),
    scoreField(haystack.path, term, 4),
    scoreField(haystack.context, term, 2),
  )

/**
 * The section a node belongs to, for the second line of a result.
 *
 * Ids are paths, so the parent of `tags/accounts/listAccounts` is `tags/accounts` and one lookup
 * answers it. That is the same property the router relies on, used here to say "accounts" under a
 * result instead of repeating the operation's own title.
 */
const contextOf = (store: DocumentStore, node: NavNode): string => {
  const parentId = node.id.slice(0, node.id.lastIndexOf('/'))
  const parent = parentId === '' ? undefined : store.bySlug.get(parentId)
  return parent?.title ?? ''
}

const haystackFor = (store: DocumentStore, node: NavNode): Haystack => {
  const context = contextOf(store, node)

  if (node.type === 'operation') {
    return {
      title: node.title.toLowerCase(),
      identifier: (node.operationId ?? '').toLowerCase(),
      path: `${node.method} ${node.path}`.toLowerCase(),
      context: context.toLowerCase(),
    }
  }

  if (node.type === 'model' || node.type === 'webhook') {
    return {
      title: node.title.toLowerCase(),
      identifier: node.name.toLowerCase(),
      path: '',
      context: context.toLowerCase(),
    }
  }

  return {
    title: node.title.toLowerCase(),
    identifier: node.type === 'tag' ? node.name.toLowerCase() : '',
    path: '',
    context: context.toLowerCase(),
  }
}

const detailOf = (node: NavNode): string => {
  if (node.type === 'operation') {
    return node.path
  }
  if (node.type === 'webhook') {
    return node.name
  }
  return ''
}

/**
 * Finds the nodes matching a query.
 *
 * Every term has to match something, so `list acc` narrows rather than widens - that is the
 * behaviour of every search box a reader has used, and the alternative (any term matches) returns
 * the whole document for a two-word query.
 *
 * Results are ordered by score and then by document order, which is stable: the same query returns
 * the same list in the same order every time, including where scores tie.
 */
export const searchNodes = (
  store: DocumentStore | undefined,
  query: string,
  limit = DEFAULT_LIMIT,
): SearchResult[] => {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!store || terms.length === 0) {
    return []
  }

  const results: Array<SearchResult & { order: number }> = []
  let order = 0

  for (const node of store.bySlug.values()) {
    order += 1
    const haystack = haystackFor(store, node)

    let total = 0
    for (const term of terms) {
      const score = scoreTerm(haystack, term)
      if (score === 0) {
        total = 0
        break
      }
      total += score
    }

    if (total > 0) {
      results.push({ node, score: total, context: contextOf(store, node), detail: detailOf(node), order })
    }
  }

  return results
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, limit)
    .map(({ node, score, context, detail }) => ({ node, score, context, detail }))
}

import {
  collectParameters,
  getResolvedRef,
  resolveOperationNode,
  type DocumentStore,
  type NavNode,
  type SourceDescriptor,
} from '@openish/core'

import { asSchema, schemaProperties, unwrapArray } from '../schema/summary.js'

export type SearchResult = {
  node: NavNode
  /** Higher is a better match. Only meaningful relative to the other results for one query. */
  score: number
  /** Where the node lives, e.g. its tag or `Models`. Shown as the second line of a result. */
  context: string
  /** The operation's path, its `operationId`, or nothing. Shown beside the title. */
  detail: string
  /**
   * Which document the result is in.
   *
   * Always present, because a store always knows its own source. With one document it is the same
   * for every result and the dialog says nothing about it; with several it is the heading a result
   * sits under, and the only thing distinguishing two APIs that both have a `List accounts`.
   */
  source: SourceDescriptor
}

/** Everything one node can be found by, in the order a match on it counts for most. */
type Haystack = {
  title: string
  identifier: string
  path: string
  context: string
  /**
   * Prose and field names: descriptions, parameter names, and the properties of the schemas an
   * operation takes and returns.
   *
   * Weighted lowest on purpose. A reader who types `idempotency` and gets the one operation whose
   * description mentions it has been served; a reader who types `id` must not get every operation in
   * the document because they all have one. Low weight plus the "every term must match" rule is what
   * keeps the second case from happening.
   */
  body: string
}

type IndexEntry = {
  node: NavNode
  haystack: Haystack
  context: string
  detail: string
}

const DEFAULT_LIMIT = 20

/**
 * How deep into a schema field names are collected.
 *
 * One level below the operation's own request and response bodies. Deeper than that and a search for
 * `name` matches every operation in the document through some nested address object, which is the
 * failure mode that makes full-text search on API docs useless.
 */
const FIELD_DEPTH = 2

/**
 * The built index, per store.
 *
 * Reading descriptions and walking schemas is far too expensive to do on every keystroke - it is
 * work proportional to the document, and the search dialog re-queries on every character. The store
 * is immutable and replaced wholesale when the document changes, so it is exactly the right cache
 * key: a new document is a new store is a new index, with nothing to invalidate.
 */
const indexes = new WeakMap<DocumentStore, IndexEntry[]>()

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
    scoreField(haystack.body, term, 1),
  )

/**
 * The section a node belongs to, for the second line of a result.
 *
 * Ids are paths, so the parent of `tags/accounts/listAccounts` is `tags/accounts` and one lookup
 * answers it. That is the same property routing relies on, used here to say "accounts" under a
 * result instead of repeating the operation's own title.
 */
const contextOf = (store: DocumentStore, node: NavNode): string => {
  const parentId = node.id.slice(0, node.id.lastIndexOf('/'))
  const parent = parentId === '' ? undefined : store.bySlug.get(parentId)
  return parent?.title ?? ''
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

/** Property names of a schema, one level of nesting deep, with `allOf` already flattened. */
const fieldNames = (schema: unknown, depth = 0, seen = new Set<unknown>()): string[] => {
  if (depth >= FIELD_DEPTH || schema === undefined || seen.has(schema)) {
    return []
  }
  seen.add(schema)

  const { schema: target } = unwrapArray(schema)
  const names: string[] = []

  for (const property of schemaProperties(target)) {
    names.push(property.name)
    const description = property.description
    if (description) {
      names.push(description)
    }
    names.push(...fieldNames(property.schema, depth + 1, seen))
  }

  return names
}

/** Every media type's schema under a `content` map, without resolving more than it has to. */
const contentSchemas = (content: unknown): unknown[] => {
  const record = asSchema(content)
  return record ? Object.values(record).map((media) => asSchema(media)?.['schema']) : []
}

/** The prose and field names an operation can be found by. */
const operationBody = (store: DocumentStore, node: NavNode): string[] => {
  const resolved = resolveOperationNode(store.document, node as never)
  const operation = resolved?.operation
  if (!operation) {
    return []
  }

  const parts: string[] = []
  if (operation.summary) {
    parts.push(operation.summary)
  }
  if (operation.description) {
    parts.push(operation.description)
  }

  for (const parameter of collectParameters(resolved.pathItem, operation)) {
    parts.push(parameter.name)
    if (parameter.description) {
      parts.push(parameter.description)
    }
  }

  const body = getResolvedRef(operation.requestBody) as { content?: unknown } | undefined
  for (const schema of contentSchemas(body?.content)) {
    parts.push(...fieldNames(schema))
  }

  for (const response of Object.values(operation.responses ?? {})) {
    const resolvedResponse = getResolvedRef(response) as { description?: string; content?: unknown } | undefined
    if (resolvedResponse?.description) {
      parts.push(resolvedResponse.description)
    }
    for (const schema of contentSchemas(resolvedResponse?.content)) {
      parts.push(...fieldNames(schema))
    }
  }

  return parts
}

/** The prose and field names a model can be found by. */
const modelBody = (store: DocumentStore, node: Extract<NavNode, { type: 'model' }>): string[] => {
  const schema = store.document.components?.schemas?.[node.name]
  const resolved = asSchema(schema)
  const parts: string[] = []

  if (typeof resolved?.['description'] === 'string') {
    parts.push(resolved['description'])
  }
  parts.push(...fieldNames(schema))

  return parts
}

const haystackFor = (store: DocumentStore, node: NavNode, context: string): Haystack => {
  const base = { context: context.toLowerCase(), title: node.title.toLowerCase() }

  const body = (parts: string[]) => parts.join(' ').toLowerCase()

  if (node.type === 'operation' || node.type === 'webhook') {
    return {
      ...base,
      identifier: (node.type === 'operation' ? (node.operationId ?? '') : node.name).toLowerCase(),
      path: `${node.method} ${node.type === 'operation' ? node.path : node.name}`.toLowerCase(),
      body: body(operationBody(store, node)),
    }
  }

  if (node.type === 'model') {
    return { ...base, identifier: node.name.toLowerCase(), path: '', body: body(modelBody(store, node)) }
  }

  return {
    ...base,
    identifier: node.type === 'tag' ? node.name.toLowerCase() : '',
    path: '',
    body: node.type === 'tag' ? body([node.description ?? '']) : '',
  }
}

/**
 * Builds the index once per store.
 *
 * Exported so a host with a very large document can pay for it at a moment of its choosing rather
 * than on the reader's first keystroke. Calling it twice is free.
 */
export const buildSearchIndex = (store: DocumentStore): IndexEntry[] => {
  const existing = indexes.get(store)
  if (existing) {
    return existing
  }

  const entries: IndexEntry[] = []
  for (const node of store.bySlug.values()) {
    const context = contextOf(store, node)
    entries.push({ node, context, detail: detailOf(node), haystack: haystackFor(store, node, context) })
  }

  indexes.set(store, entries)
  return entries
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
  stores: DocumentStore | readonly DocumentStore[] | undefined,
  query: string,
  limit = DEFAULT_LIMIT,
): SearchResult[] => {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  /*
   * One store or several. A reference with one document is by far the common case and should not
   * have to wrap it in an array to ask a question, and the one-document call is also what every
   * consumer of this module made before there were several.
   */
  const list = stores === undefined ? [] : Array.isArray(stores) ? stores : [stores as DocumentStore]
  if (list.length === 0 || terms.length === 0) {
    return []
  }

  const results: Array<SearchResult & { order: number; document: number }> = []

  list.forEach((store, document) => {
    let order = 0

    for (const entry of buildSearchIndex(store)) {
      order += 1

      let total = 0
      for (const term of terms) {
        const score = scoreTerm(entry.haystack, term)
        if (score === 0) {
          total = 0
          break
        }
        total += score
      }

      if (total > 0) {
        results.push({
          node: entry.node,
          score: total,
          context: entry.context,
          detail: entry.detail,
          source: store.source,
          order,
          document,
        })
      }
    }
  })

  /*
   * Score first, then configured document order, then document order within one. All three are
   * needed for the list to be stable: without the middle one, two equally good matches in two
   * documents would swap places depending on which finished loading first.
   */
  return results
    .sort(
      (left, right) =>
        right.score - left.score || left.document - right.document || left.order - right.order,
    )
    .slice(0, limit)
    .map(({ node, score, context, detail, source }) => ({ node, score, context, detail, source }))
}

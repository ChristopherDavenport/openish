import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import { asExternalDocs } from '../external-docs.js'
import { getResolvedRef } from '../ref.js'
import {
  HTTP_METHODS,
  type NavGroupNode,
  type NavOperationNode,
  type NavTagNode,
  type ResolvedOpenishConfig,
} from '../types.js'
import { isHidden } from './hidden.js'
import { asProse, joinId, SlugRegistry } from './ids.js'
import { collectOperations, operationSlugSource, operationTitle, type OperationEntry } from './operations.js'

/**
 * `x-displayName` is a widely used extension for giving a tag a human title while keeping its
 * machine name for `operation.tags` matching. Redoc popularised it and Scalar honours it.
 */
type DeclaredTag = {
  name?: string
  description?: string
  externalDocs?: unknown
  'x-displayName'?: string
}

/** `x-tagGroups`, a Redoc convention Scalar also reads: a heading with a list of tag names under it. */
type TagGroup = {
  name?: string
  tags?: string[]
}

/** Sentinel for the bucket holding operations that declare no tags. */
const UNTAGGED = Symbol('untagged')

type TagKey = string | typeof UNTAGGED

const compareByTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })

const sortOperations = (
  entries: OperationEntry[],
  sort: ResolvedOpenishConfig['operationSort'],
): OperationEntry[] => {
  if (sort === 'document') {
    return entries
  }

  const sorted = [...entries]
  if (sort === 'alpha') {
    return sorted.sort((a, b) => compareByTitle({ title: operationTitle(a) }, { title: operationTitle(b) }))
  }

  /* `method`: group by verb in the canonical OpenAPI order, keeping document order within a verb. */
  return sorted.sort((a, b) => HTTP_METHODS.indexOf(a.method) - HTTP_METHODS.indexOf(b.method))
}

/**
 * Groups every operation under its tag.
 *
 * Ordering rules, both observable and both tested:
 * - `tagSort: 'document'` puts tags declared in the top-level `tags` array first, in that order,
 *   then any tag that only appears on an operation, in first-seen order. That mirrors what document
 *   authors expect: the `tags` array is how you say "show these in this order".
 * - The untagged bucket always sorts last. It is a fallback, not a section anyone curated.
 */
export const traverseTags = (
  document: OpenApiDocument,
  config: ResolvedOpenishConfig,
  registry: SlugRegistry,
  prefix = '',
): Array<NavTagNode | NavGroupNode> => {
  const entries = collectOperations(document.paths as Record<string, unknown> | undefined, 'paths')

  const byTag = new Map<TagKey, OperationEntry[]>()
  const push = (key: TagKey, entry: OperationEntry) => {
    const bucket = byTag.get(key)
    if (bucket) {
      bucket.push(entry)
    } else {
      byTag.set(key, [entry])
    }
  }

  for (const entry of entries) {
    if (isHidden(entry.operation)) {
      continue
    }
    const tags = entry.operation.tags?.filter((tag) => typeof tag === 'string' && tag.length > 0)
    if (!tags || tags.length === 0) {
      push(UNTAGGED, entry)
      continue
    }
    for (const tag of tags) {
      push(tag, entry)
    }
  }

  const declared = (document.tags ?? []).map((tag) => getResolvedRef(tag) as DeclaredTag).filter(Boolean)
  const declaredByName = new Map(declared.map((tag) => [tag.name ?? '', tag]))

  /* A tag the document marks internal takes its operations with it, however they were reached. */
  for (const tag of declared) {
    if (tag.name && isHidden(tag)) {
      byTag.delete(tag.name)
    }
  }

  /* Declared order first, then first-seen order for tags that only exist on operations. */
  const names: string[] = []
  for (const tag of declared) {
    if (tag.name && byTag.has(tag.name)) {
      names.push(tag.name)
    }
  }
  for (const key of byTag.keys()) {
    if (typeof key === 'string' && !names.includes(key)) {
      names.push(key)
    }
  }

  if (config.tagSort === 'alpha') {
    names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }

  const buildOperations = (tagId: string, tagEntries: OperationEntry[]): NavOperationNode[] =>
    sortOperations(tagEntries, config.operationSort).map((entry) => {
      const node: NavOperationNode = {
        type: 'operation',
        id: registry.claim(
          tagId,
          operationSlugSource(entry),
          entry.method,
          config.slugs.operation?.({
            path: entry.path,
            method: entry.method,
            operationId: entry.operation.operationId,
            summary: entry.operation.summary,
          }),
        ),
        title: operationTitle(entry, config.operationTitleSource),
        method: entry.method,
        path: entry.path,
        pointer: entry.pointer,
      }
      if (entry.operation.operationId) {
        node.operationId = entry.operation.operationId
      }
      if (entry.operation.deprecated) {
        node.deprecated = true
      }
      return node
    })

  const nodes: NavTagNode[] = []

  for (const name of names) {
    const tagEntries = byTag.get(name) ?? []
    const declaration = declaredByName.get(name)
    const title = declaration?.['x-displayName'] ?? name
    const id = registry.claim(
      joinId(prefix, 'tags'),
      asProse(title),
      'tag',
      config.slugs.tag?.({ name, title }),
    )

    const node: NavTagNode = {
      type: 'tag',
      id,
      title,
      name,
      children: buildOperations(id, tagEntries),
    }
    if (declaration?.description) {
      node.description = declaration.description
    }
    const externalDocs = asExternalDocs(declaration?.externalDocs)
    if (externalDocs) {
      node.externalDocs = externalDocs
    }
    nodes.push(node)
  }

  const untagged = byTag.get(UNTAGGED)
  if (untagged && untagged.length > 0) {
    const id = registry.claim(joinId(prefix, 'tags'), asProse(config.untaggedLabel), 'default')
    nodes.push({
      type: 'tag',
      id,
      title: config.untaggedLabel,
      name: '',
      isUntagged: true,
      children: buildOperations(id, untagged),
    })
  }

  return groupTags(document, nodes, registry, prefix)
}

/**
 * Folds tags into the headings `x-tagGroups` declares, if the document declares any.
 *
 * A group is a container, not a page of its own, so it reuses `NavGroupNode` - the same shape the
 * Models and Webhooks sections already are. Nothing below it changes: the tag keeps the id it was
 * given, so every existing link and bookmark still resolves.
 *
 * A tag no group mentions is **kept**, appended after the groups, rather than dropped the way Redoc
 * drops it. Silently losing a page because someone added a group and forgot a name is a worse
 * failure than an extra heading, and the document still says everything it said before.
 */
const groupTags = (
  document: OpenApiDocument,
  tags: NavTagNode[],
  registry: SlugRegistry,
  prefix = '',
): Array<NavTagNode | NavGroupNode> => {
  const declared = (document as { 'x-tagGroups'?: TagGroup[] })['x-tagGroups']
  if (!Array.isArray(declared) || declared.length === 0) {
    return tags
  }

  const byName = new Map(tags.map((tag) => [tag.name, tag]))
  const grouped = new Set<NavTagNode>()
  const nodes: Array<NavTagNode | NavGroupNode> = []

  for (const group of declared) {
    if (isHidden(group)) {
      for (const name of group.tags ?? []) {
        const tag = byName.get(name)
        if (tag) {
          grouped.add(tag)
        }
      }
      continue
    }

    const children = (group.tags ?? []).map((name) => byName.get(name)).filter((tag): tag is NavTagNode => Boolean(tag))
    if (children.length === 0) {
      continue
    }
    for (const child of children) {
      grouped.add(child)
    }

    const title = group.name ?? ''
    nodes.push({
      type: 'group',
      id: registry.claim(joinId(prefix, 'tags'), asProse(title), 'group'),
      title,
      children,
    })
  }

  nodes.push(...tags.filter((tag) => !grouped.has(tag)))
  return nodes
}

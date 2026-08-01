import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createDocumentStore, type CreateDocumentStoreOptions } from '../src/store/create-document-store.js'
import type { DocumentStore, NavNode } from '../src/types.js'

export const readFixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')

export const storeFromFixture = (name: string, options?: CreateDocumentStoreOptions): Promise<DocumentStore> =>
  createDocumentStore(readFixture(name), options)

/** Depth-first list of every node, for assertions about the whole tree. */
export const flatten = (nodes: readonly NavNode[]): NavNode[] =>
  nodes.flatMap((node) => ['children' in node && node.children ? [node, ...flatten(node.children)] : [node]].flat())

export const idsOf = (nodes: readonly NavNode[]): string[] => nodes.map((node) => node.id)

/**
 * The ids of some nodes, relative to the document they belong to.
 *
 * Every id begins with the source's slug, which is the same string on every node in one store and
 * therefore says nothing about the tree's shape. Dropping it keeps an assertion about *navigation*
 * from also being an assertion about *sources*; the tests that care about the prefix say so by
 * comparing full ids instead.
 */
export const relativeId = (store: DocumentStore, id: string | undefined): string | undefined =>
  id?.startsWith(`${store.source.slug}/`) ? id.slice(store.source.slug.length + 1) : id

export const relativeIdsOf = (store: DocumentStore, nodes: readonly NavNode[]): string[] =>
  idsOf(nodes).map((id) => relativeId(store, id) ?? id)

/** Looks a node up by an id relative to the store's own source, or by its full id. */
export const findNode = (store: DocumentStore, id: string): NavNode => {
  const node = store.bySlug.get(`${store.source.slug}/${id}`) ?? store.bySlug.get(id)
  if (!node) {
    throw new Error(`No navigation node with id "${id}". Known ids: ${[...store.bySlug.keys()].join(', ')}`)
  }
  return node
}

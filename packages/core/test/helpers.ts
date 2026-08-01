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

export const findNode = (store: DocumentStore, id: string): NavNode => {
  const node = store.bySlug.get(id)
  if (!node) {
    throw new Error(`No navigation node with id "${id}". Known ids: ${[...store.bySlug.keys()].join(', ')}`)
  }
  return node
}

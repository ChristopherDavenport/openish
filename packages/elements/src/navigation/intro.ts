import type { DocumentStore, NavGroupNode, NavNode } from '@openish/core'

import type { StatedExpansion } from './rows.js'

/**
 * The document's front page, as a row the tree can hold.
 *
 * The overview is deliberately not a node - it is `info`, which the traversal has nothing to mint an
 * entry from, and `render/sections.ts` says so at the top. Everything that used to reach it reaches
 * it by the document's own slug. But its headings *are* nodes, and until this they were roots: a
 * `Resources` and an `Authentication` floating at the top of the sidebar with nothing saying what
 * they were headings of, the second of them directly above the tag that is also called
 * `Authentication`.
 *
 * So the row is synthesised here rather than in `@openish/core`. Grouping is a question the sidebar
 * asks - the same kind of question `documentSections` answers about columns and heading levels - and
 * answering it in the traversal would mean inventing a node for a section that has none, which is
 * the design this file is working around rather than a gap in it.
 *
 * Its id is `store.source.slug`, which is not a convenience: that string already *is* the overview
 * everywhere else. `hrefFor` turns it into exactly what `hrefForOverview` produces, `resolvedId`
 * already collapses it to the front of the document, and the plane reports it as the active id while
 * the reader is up there - so the row links, resolves and highlights with nothing else written.
 */
const trees = new WeakMap<DocumentStore, readonly NavNode[]>()

const NO_NODES: readonly NavNode[] = Object.freeze([])

const build = (store: DocumentStore): readonly NavNode[] => {
  const intro: NavGroupNode = {
    type: 'group',
    id: store.source.slug,
    title: store.document.info?.title?.trim() || 'Introduction',
    /*
     * Every text node at the root of the tree, which is every heading the overview renders: the ones
     * lifted out of `info.description` and the two the overview writes itself. Their own children -
     * an `###` under an `##` - come along inside them.
     */
    children: store.navigation.filter((node) => node.type === 'text'),
  }

  return Object.freeze([intro, ...store.navigation.filter((node) => node.type !== 'text')])
}

/**
 * The tree as the sidebar shows it: the Introduction, then everything that is not one of its
 * headings.
 *
 * Memoised on the store for the reason `render/sections.ts` memoises the plane: a store is frozen at
 * construction and replaced wholesale when the document changes, so there is nothing here that can
 * go stale, and the sidebar can read this from a getter - the "a derived value is a getter" rule -
 * without rebuilding the list on every render and handing `lit-virtualizer` a new identity for rows
 * that did not change.
 *
 * The Introduction row renders even with nothing under it. It is the only link back to the front of
 * the document the sidebar has ever had, and a first row that appears or disappears depending on
 * whether a document happens to declare servers is harder to hold in your head than one that is
 * always there.
 */
export const sidebarNodes = (store: DocumentStore | undefined): readonly NavNode[] => {
  if (!store) {
    return NO_NODES
  }

  const cached = trees.get(store)
  if (cached) {
    return cached
  }

  const built = build(store)
  trees.set(store, built)
  return built
}

/** The Introduction row itself, for code that needs the row rather than the list around it. */
export const introNode = (store: DocumentStore): NavGroupNode => sidebarNodes(store)[0] as NavGroupNode

const expansions = new WeakMap<DocumentStore, StatedExpansion>()

/**
 * The Introduction is open unless the reader closes it.
 *
 * Said rather than inferred, because ancestry gets this row wrong in both directions - see
 * `StatedExpansion`. Open by default rather than "open while the reader is inside it", which is how
 * a tag behaves: these headings were roots of the tree before this row existed and were therefore
 * always on screen, and grouping them is meant to say what they are headings *of*, not to take them
 * away from a reader who has navigated into an operation. The toggle is there for anyone who wants
 * the room back.
 */
export const introExpansion = (store: DocumentStore): StatedExpansion => {
  const cached = expansions.get(store)
  if (cached) {
    return cached
  }

  const built: StatedExpansion = new Map([[introNode(store).id, true]])
  expansions.set(store, built)
  return built
}

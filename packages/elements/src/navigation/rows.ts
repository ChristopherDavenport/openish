import type { NavNode } from '@openish/core'

import { isAncestorId } from '../router/urls.js'

/**
 * One line of the navigation, as a flat list wants it.
 *
 * A virtualised list can only render a window of rows, and it cannot do that over a nested `<ul>`
 * where a node's descendants live inside it. So the tree is flattened to exactly the rows that are
 * visible right now, and each one carries the things markup used to imply: how deep it is, whether
 * it can open, and where it sits among its siblings for `aria-posinset`.
 */
export type NavRow = {
  node: NavNode
  /** 1 for a root row. Rendered as `aria-level`, which is what a flattened tree needs. */
  level: number
  hasChildren: boolean
  expanded: boolean
  /** Position among siblings, 1-based, and how many siblings there are. */
  position: number
  setSize: number
}

/** Expansion the reader has toggled: present means decided, absent means "follow the route". */
export type Expansion = ReadonlyMap<string, boolean>

const childrenOf = (node: NavNode): readonly NavNode[] =>
  'children' in node && node.children ? node.children : []

/**
 * Rows whose expansion the caller has worked out, because ancestry cannot.
 *
 * One row needs this: the sidebar's Introduction, whose id is the document's own slug. Every id in
 * the document begins with that slug, so the prefix rule says the reader is inside the introduction
 * wherever they are; and its children are the overview's headings, whose ids begin with `overview/`
 * rather than with it, so the same rule says they are not. Both backwards, and only the caller knows
 * why - so the caller says.
 */
export type StatedExpansion = ReadonlyMap<string, boolean>

/**
 * Whether a node is open.
 *
 * A reader's decision wins. Otherwise the section follows the active route, so navigating to an
 * operation opens the tag containing it - which is the behaviour that made the tree usable before it
 * was flattened, and the reason this is a tri-state rather than a boolean.
 */
export const isExpanded = (
  node: NavNode,
  expansion: Expansion,
  activeId: string,
  defaults: {
    openAll?: boolean
    openFirst?: string
    stated?: StatedExpansion
    atOverview?: boolean
  } = {},
): boolean => {
  const decided = expansion.get(node.id)
  if (decided !== undefined) {
    return decided
  }
  if (defaults.openAll) {
    return true
  }
  const stated = defaults.stated?.get(node.id)
  if (stated !== undefined) {
    return stated
  }
  if (isAncestorId(node.id, activeId)) {
    return true
  }
  /*
   * Only when the URL names nothing in particular - a real page has already opened its own branch.
   * "Nothing in particular" is the overview, and every id begins with its document's slug, so that
   * is either the empty string or the slug alone. The caller knows which; see `atOverview`.
   */
  return (defaults.atOverview ?? activeId === '') && defaults.openFirst === node.id
}

/**
 * The rows that should be on screen, in order.
 *
 * Only expanded branches are walked, so this is the same "closed means nothing below it" property
 * the nested rendering had - a collapsed group of six hundred models costs one row, not six hundred
 * skipped ones.
 */
export const navRows = (
  nodes: readonly NavNode[],
  expansion: Expansion,
  activeId: string,
  defaults: {
    openAll?: boolean
    openFirstTag?: boolean
    stated?: StatedExpansion
    atOverview?: boolean
  } = {},
): NavRow[] => {
  const rows: NavRow[] = []

  /*
   * The first tag, not the first node: the Introduction comes before it and is a branch, but it is
   * not part of the API surface this default is about - and its own expansion is stated, so a row
   * the caller has already decided is by definition not the one to fall back to.
   */
  const firstTag = nodes.find(
    (node) => (node.type === 'tag' || node.type === 'group') && !defaults.stated?.has(node.id),
  )?.id

  const walk = (list: readonly NavNode[], level: number): void => {
    list.forEach((node, index) => {
      const children = childrenOf(node)
      const expanded =
        children.length > 0 &&
        isExpanded(node, expansion, activeId, {
          ...(defaults.openAll ? { openAll: true } : {}),
          ...(defaults.openFirstTag && firstTag ? { openFirst: firstTag } : {}),
          ...(defaults.stated ? { stated: defaults.stated } : {}),
          ...(defaults.atOverview !== undefined ? { atOverview: defaults.atOverview } : {}),
        })

      rows.push({
        node,
        level,
        hasChildren: children.length > 0,
        expanded,
        position: index + 1,
        setSize: list.length,
      })

      if (expanded) {
        walk(children, level + 1)
      }
    })
  }

  walk(nodes, 1)
  return rows
}

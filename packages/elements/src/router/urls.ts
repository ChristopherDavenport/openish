import type { NavNode } from '@openish/core'

/**
 * Navigation ids are already URL paths - `tags/accounts/listAccounts`, `models/PaymentIntent` - so
 * turning one into an href is prefixing, and turning a URL back into a node is a single map lookup.
 * That is the whole reason ids are minted the way they are in `@openish/core`.
 */

/** Strips a trailing slash and guarantees a leading one, or returns `''` for the root mount. */
export const normalizeBasePath = (basePath: string): string => {
  const trimmed = basePath.trim().replace(/\/+$/, '')
  if (trimmed === '') {
    return ''
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * The href for a node.
 *
 * Headings from `info.description` are not their own page - they are anchors on the overview - so
 * they get a fragment rather than a path.
 */
export const hrefFor = (node: NavNode, basePath: string): string => {
  if (node.type === 'text') {
    return `${basePath}/#${node.id}`
  }
  return `${basePath}/${node.id}`
}

/** The node id a pathname refers to, or `''` for the overview. */
export const idFromPathname = (pathname: string, basePath: string): string => {
  const withoutBase = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname
  return withoutBase.replace(/^\/+/, '').replace(/\/+$/, '')
}

/**
 * Whether a node is on the path to the active one, so the sidebar can mark ancestors open.
 *
 * A prefix test is enough precisely because ids are paths - but it has to be segment-aware, or
 * `models/Account` would look like an ancestor of `models/AccountList`.
 */
export const isAncestorId = (candidate: string, activeId: string): boolean =>
  activeId === candidate || activeId.startsWith(`${candidate}/`)

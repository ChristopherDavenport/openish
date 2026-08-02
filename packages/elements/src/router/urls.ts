import type { NavNode } from '@openish/core'

/**
 * Navigation ids are already URL paths - `consumer/tags/accounts/listAccounts`,
 * `consumer/models/PaymentIntent` - so turning one into an href is prefixing, and turning a URL back
 * into a node is a single map lookup. That is the whole reason ids are minted the way they are in
 * `@openish/core`, and it is why this project needs no route table: `store.bySlug` *is* the router.
 *
 * Every id begins with the slug of the document it belongs to, always, whether the reference shows
 * one document or six. Whether that segment *appears* in the URL is decided here and only here, by
 * {@link stripFirstSegment} on the way out and {@link applySlugPrefix} on the way in. Keeping the
 * decision at this boundary is what lets a reference configured with `url`/`spec` have exactly the
 * URLs it always had while the traversal below has only one shape to produce.
 */

/**
 * How the reference reads and writes the URL.
 *
 * - `hash` puts the node id in the fragment. Nothing has to be installed for it to work: a fragment
 *   link is navigation the browser already performs, and `hashchange` is the browser telling us it
 *   did. It survives a static host with no rewrite rule, a `file://` page, and a sub-path the
 *   reference was never told about, which is why it is the default.
 * - `history` puts the node id in the path. Real URLs, at the cost of a server that has to serve the
 *   application for every one of them.
 * - `none` hands navigation to the host, which sets `selected` and hears `openish-navigate`.
 */
export type RoutingMode = 'hash' | 'history' | 'none'

/** What {@link hrefFor} needs to know about the reference it is linking inside. */
export type RoutingState = {
  readonly routing: RoutingMode
  readonly basePath: string
  /**
   * The document slug the URL leaves out, or `''` when the URL carries it.
   *
   * Set to the active source's slug when the host configured a single `url`/`spec`, because that
   * reference has one document and naming it in every URL would be noise the reader never chose.
   * `''` whenever `sources` is used - there the slug is the first thing a URL has to say, since it
   * is what decides which document the rest of the id is even about.
   */
  readonly slugPrefix?: string | undefined
}

/** Strips a trailing slash and guarantees a leading one, or returns `''` for the root mount. */
export const normalizeBasePath = (basePath: string): string => {
  const trimmed = basePath.trim().replace(/\/+$/, '')
  if (trimmed === '') {
    return ''
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * Drops the leading document slug from an id.
 *
 * Used on the way out, when the URL does not name the document. A trailing slash survives so that
 * `api-1/` - the id of a source's own overview - becomes `''` rather than disappearing into a
 * segment that was never there.
 */
export const stripFirstSegment = (id: string): string => {
  const hasTrailingSlash = id.endsWith('/')
  const result = id.split('/').filter(Boolean).slice(1).join('/')
  return hasTrailingSlash && result ? `${result}/` : result
}

/** Puts it back, on the way in. The inverse of {@link stripFirstSegment}. */
export const applySlugPrefix = (id: string, slugPrefix: string): string =>
  slugPrefix ? `${slugPrefix}${id ? '/' : ''}${id}` : id

/** An id as the URL carries it. */
const idForUrl = (id: string, routing: RoutingState | undefined): string =>
  routing?.slugPrefix ? stripFirstSegment(id) : id

/**
 * The href for an id.
 *
 * In `history` mode `isAnchor` puts the id in the fragment rather than the path, because a heading
 * lifted out of `info.description` is not its own page - it is a position on the overview. In the
 * fragment modes the distinction disappears: the id goes in the fragment either way, and
 * `renderNode` already knows that a text node means "the overview, scrolled here".
 */
export const hrefForId = (id: string, routing: RoutingState | undefined, isAnchor = false): string => {
  const target = idForUrl(id, routing)
  if (routing?.routing === 'history') {
    return isAnchor ? `${routing.basePath}/#${target}` : `${routing.basePath}/${target}`
  }
  return `#/${target}`
}

/**
 * The href for a node.
 *
 * `none` gets fragment hrefs too, deliberately. The host is going to intercept the click, but an
 * href that has not been intercepted yet should not be able to navigate the whole page away - and a
 * middle-click on one still produces a URL that deep-links.
 */
export const hrefFor = (node: NavNode, routing: RoutingState | undefined): string =>
  hrefForId(node.id, routing, node.type === 'text')

/**
 * The href for a document's overview, which is the one page that is not a node.
 *
 * `slug` is the source's own slug - the id of its overview. With one document that is exactly what
 * the URL omits, so this collapses to today's `#/`; with several, it is the whole of the URL.
 */
export const hrefForOverview = (routing: RoutingState | undefined, slug = ''): string =>
  hrefForId(slug, routing)

/** The node id a `history`-mode pathname refers to. */
export const idFromPathname = (pathname: string, basePath: string, slugPrefix = ''): string => {
  const withoutBase = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname
  return applySlugPrefix(withoutBase.replace(/^\/+/, '').replace(/\/+$/, ''), slugPrefix)
}

/**
 * The node id a fragment refers to.
 *
 * Tolerant of both `#/tags/accounts` and `#tags/accounts` on the way in, because a hand-written link
 * and a hand-edited address bar both happen, and the two differ by a character nobody can see.
 */
export const idFromHash = (hash: string, slugPrefix = ''): string =>
  applySlugPrefix(hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, ''), slugPrefix)

/**
 * The parts of the address bar an id can be read out of, and the mode that decides which.
 *
 * Gathered into one object so that reading an id is a pure function rather than something only an
 * element holding a `LocationController` can do. The controller satisfies `pathname` and `hash`
 * structurally, which is the point: nothing here has to know where the strings came from.
 */
export type UrlState = {
  readonly routing: RoutingMode
  readonly pathname: string
  readonly hash: string
  /** The host's answer when `routing="none"`. Ignored in the other two modes. */
  readonly selected: string
  readonly basePath: string
}

/**
 * The id as the URL has it, before the implied document slug is put back.
 *
 * Separate from {@link activeIdFrom} because deciding *which document* the URL names has to read it
 * first, and it cannot use the full id to do that - the prefix is the very thing it is deciding.
 */
export const urlId = (url: UrlState): string => {
  switch (url.routing) {
    case 'history':
      return idFromPathname(url.pathname, url.basePath)
    case 'hash':
      return idFromHash(url.hash)
    case 'none':
      return url.selected
  }
}

/** Which node a URL names, according to whatever is authoritative in this mode. */
export const activeIdFrom = (url: UrlState, slugPrefix: string): string =>
  applySlugPrefix(urlId(url), slugPrefix)

/**
 * The id a link points at.
 *
 * Structural rather than an `HTMLAnchorElement`, because those two fields are all that is read and a
 * plain object is what a test has. Both spellings are tried: a fragment link carries the id in its
 * hash, and a `history`-mode link carries it in its path.
 */
export const idFromLink = (
  link: { readonly hash: string; readonly pathname: string },
  basePath: string,
  slugPrefix: string,
): string => applySlugPrefix(idFromHash(link.hash) || idFromPathname(link.pathname, basePath), slugPrefix)

/**
 * The same URL with a different id in it, in whichever part of it this mode uses.
 *
 * A `URL` in and a `URL` out, so a caller rewriting one part of the address - the spy replacing the
 * id, `?api=` taking itself back out - keeps every other part of what the reader had. The id goes in
 * whole; {@link hrefForId} is what decides whether the document slug appears in it.
 */
export const urlWithId = (current: URL, id: string, routing: RoutingState): URL => {
  const next = new URL(current.href)
  const href = hrefForId(id, routing)
  if (routing.routing === 'history') {
    next.pathname = href
  } else {
    next.hash = href
  }
  return next
}

/**
 * Whether a node is on the path to the active one, so the sidebar can mark ancestors open.
 *
 * A prefix test is enough precisely because ids are paths - but it has to be segment-aware, or
 * `models/Account` would look like an ancestor of `models/AccountList`.
 */
export const isAncestorId = (candidate: string, activeId: string): boolean =>
  activeId === candidate || activeId.startsWith(`${candidate}/`)

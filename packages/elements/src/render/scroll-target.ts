import type { DocumentStore } from '@openish/core'

import { redirectedNode } from '../router/redirect.js'
import { stripFirstSegment } from '../router/urls.js'
import { overviewAnchors } from './sections.js'

/**
 * Where the reader is being sent, as a section to mount and a place inside it to stop.
 *
 * Both halves are needed, and neither can be inferred from the other. A heading lifted out of
 * `info.description` has no section of its own - the overview renders it - so the section to mount
 * is the front of the document while the heading is where the reader actually asked to be.
 */
export type ScrollTarget = {
  readonly section: string
  readonly anchor: string
}

/**
 * What the URL is asking for, in the two spellings a heading can arrive in.
 *
 * `OpenishUiState` satisfies this structurally, which is deliberate: these are pure functions of
 * what the URL says and what the document has, and nothing here needs the rest of the presentation
 * state to work out an answer.
 */
export type PlanePosition = {
  /** The navigation id the URL points at, document slug included. */
  readonly activeId: string
  /** The document slug the URL leaves out, or `''` when the URL carries it. */
  readonly slugPrefix: string
  /** The browser's own fragment. Only `history` mode has one to spare; `''` in the other two. */
  readonly hash: string
}

/**
 * The section the URL names, after a `redirect` has had its one chance.
 *
 * Separate from `activeId`, which is what the URL *says*: a redirected id has to scroll somewhere
 * while the URL keeps what the reader typed, and the two are only the same string when nothing was
 * redirected.
 */
export const resolvedId = (store: DocumentStore | undefined, position: PlanePosition): string => {
  const id = position.activeId
  if (!store || id === '' || id === store.source.slug) {
    return store?.source.slug ?? ''
  }
  if (store.bySlug.has(id)) {
    return id
  }
  return redirectedNode(store, id, position.slugPrefix)?.id ?? id
}

/** Whether the id names a heading inside `info.description` rather than a section of its own. */
export const atOverviewAnchor = (store: DocumentStore | undefined, position: PlanePosition): boolean =>
  overviewAnchors(store).has(position.activeId)

/**
 * The heading in the overview the URL is asking for, in the form the overview stamps its ids in.
 *
 * Two ways to name one, because a heading is both a navigation entry and a fragment: the id itself
 * when the URL names the heading node, and the browser's own fragment in `history` mode, which is
 * the only mode with one to spare.
 */
export const overviewHash = (store: DocumentStore | undefined, position: PlanePosition): string =>
  atOverviewAnchor(store, position)
    ? position.slugPrefix
      ? stripFirstSegment(position.activeId)
      : position.activeId
    : position.hash

/**
 * What the plane is being asked for.
 *
 * Without the pair, a click on a description heading resolved to a section id the plane has never
 * heard of and nothing moved at all - which is only invisible while the overview happens to be on
 * screen already.
 */
export const scrollTarget = (store: DocumentStore | undefined, position: PlanePosition): ScrollTarget => {
  const slug = store?.source.slug ?? ''
  if (atOverviewAnchor(store, position)) {
    return { section: slug, anchor: overviewHash(store, position) }
  }

  const section = resolvedId(store, position)
  return { section, anchor: section === slug ? position.hash : '' }
}

/** Whether the URL names anything this document has. False is what the not-found banner is about. */
export const urlResolves = (store: DocumentStore | undefined, position: PlanePosition): boolean => {
  if (!store) {
    return false
  }
  const resolved = resolvedId(store, position)
  return resolved === store.source.slug || store.bySlug.has(resolved)
}

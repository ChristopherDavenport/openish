import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import { getResolvedRef } from '../ref.js'
import type { NavGroupNode, NavTagNode } from '../types.js'

/**
 * The object in the document a section node was built from, if the document wrote one down.
 *
 * The traversal keeps what navigation needs - a title, a description, the children - and drops the
 * rest, which is right: a nav tree that carried every extension an author might reach for would be
 * a second copy of the document. So anything that wants the *declaration* looks it up again, the
 * way `<openish-model>` looks its schema up: by name, in the document that is already loaded.
 *
 * Two shapes answer to this. A tag is a Tag Object in the top-level `tags` array, matched on `name`
 * because that is the identity `operation.tags` uses - the title may be an `x-displayName` and is
 * nobody's key. A group is an `x-tagGroups` entry, which has only a name, so the title *is* the key.
 *
 * Webhooks and Models return nothing, and that is not an omission: they are containers openish
 * mints for sections the document never declared, so there is nothing to find.
 */
export const declarationFor = (
  document: OpenApiDocument | undefined,
  node: NavTagNode | NavGroupNode | undefined,
): object | undefined => {
  if (!document || !node) {
    return undefined
  }

  if (node.type === 'tag') {
    const declared = (document.tags ?? []) as unknown[]
    const found = declared
      .map((tag) => getResolvedRef(tag) as { name?: string } | undefined)
      .find((tag) => tag?.name === node.name)
    return found
  }

  const groups = (document as { 'x-tagGroups'?: unknown })['x-tagGroups']
  if (!Array.isArray(groups)) {
    return undefined
  }

  return groups.find((group: unknown): group is { name?: string } => {
    return typeof group === 'object' && group !== null && (group as { name?: string }).name === node.title
  })
}

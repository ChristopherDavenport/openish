import { refName, refPointer, unwrapArray, type DocumentStore, type NavNode } from '@openish/core'
import { html, nothing, type TemplateResult } from 'lit'

import type { RoutingState } from '../router/urls.js'
import { hrefFor } from '../router/urls.js'

/**
 * Which section documents what a `$ref` names, and how to say so.
 *
 * The page stopped drawing a body's whole shape where the document already has a section for it, so
 * naming that section had to become reliable. It was a guess before - the id rebuilt as
 * `<slug>/models/<name>` inside `<openish-schema>` - and a guess that misses is a link that quietly
 * turns into plain text: a host `slugs.model` override, a name that is not URL-safe, or the `-2` a
 * collision earns are all enough. `store.byPointer` is the join the document itself wrote.
 *
 * Here rather than private to the schema tree because three call sites now need the same answer: the
 * type header over a body, a property row naming a model, and the two places a tree gives up
 * (recursion, and the depth cap).
 */

/** The node documenting this schema, if the document has one. `undefined` is an ordinary answer. */
export const modelNodeFor = (store: DocumentStore | undefined, value: unknown): NavNode | undefined => {
  const pointer = refPointer(value)
  return pointer === undefined ? undefined : store?.byPointer.get(pointer)
}

/**
 * A schema's name, linked to the section that documents it.
 *
 * Plain text when there is nowhere to go, which is not a failure case: `hideModels` and a per-schema
 * `x-internal` both remove a model's section while leaving every reference to it valid, and a reader
 * is better served by the name than by an anchor that resolves to a not-found banner.
 */
export const renderModelName = (
  store: DocumentStore | undefined,
  routing: RoutingState | undefined,
  value: unknown,
  label?: string,
): TemplateResult | typeof nothing => {
  const name = label ?? refName(value)
  if (name === undefined || name === '') {
    return nothing
  }

  const node = modelNodeFor(store, value)
  if (!node || !routing) {
    return html`${name}`
  }

  return html`<a href=${hrefFor(node, routing)}>${name}</a>`
}

/**
 * A type label with its model name linked, where the label is that name and nothing else.
 *
 * `schemaTypeLabel` puts a `$ref`'s model name at the front and appends to it - `User`, `User[]`,
 * `User or null` - so the name is a prefix in every shape worth linking. Anything the prefix test
 * does not recognise is returned whole and unlinked rather than pattern-matched into an anchor: a
 * tuple reading `[User, number]` names two types on one line, and guessing which of them the reader
 * meant is worse than naming neither.
 *
 * The array is unwrapped before the name is read because `unwrapArray` hands back the items schema
 * **unresolved**, which is the only reason a `$ref` on it survives to be found at all.
 */
export const renderTypeLabel = (
  store: DocumentStore | undefined,
  routing: RoutingState | undefined,
  value: unknown,
  label: string,
): unknown => {
  if (label === '') {
    return nothing
  }

  const { schema: inner } = unwrapArray(value)
  const name = refName(inner) ?? refName(value)
  if (name === undefined || !label.startsWith(name)) {
    return label
  }

  const linked = renderModelName(store, routing, inner ?? value, name)
  return html`${linked}${label.slice(name.length)}`
}

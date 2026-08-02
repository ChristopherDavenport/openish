import type { DocumentStore, NavNode } from '@openish/core'
import { html, type TemplateResult } from 'lit'

import { applySlugPrefix, stripFirstSegment } from '../router/urls.js'

import '../elements/openish-model.js'
import '../elements/openish-operation.js'
import '../elements/openish-overview.js'
import '../elements/openish-tag-section.js'

/**
 * What a navigation node looks like, in one place.
 *
 * There are two ways a node gets chosen - the router matches a URL, or a host sets `selected` with
 * `routing="none"` - and they must not drift into two ideas of what a model page is. So choosing
 * lives in the routed elements and rendering lives here.
 */
export const renderNode = (node: NavNode, hash = '', slugPrefix = ''): TemplateResult => {
  switch (node.type) {
    case 'operation':
    case 'webhook':
      /*
       * The slots are forwarded, not just declared.
       *
       * `<openish-operation>` is created inside `<openish-api-reference>`'s shadow root, so a host
       * has no way to put a light-DOM child into it - a `<slot>` in the operation's own shadow root
       * would be permanently empty. A `<slot>` that is itself assigned to a parent slot forwards the
       * host's children down through the boundary, which is what makes
       * `<openish-api-reference><div slot="request-start">…</div></openish-api-reference>` work.
       */
      return html`
        <openish-operation
          .node=${node}
          exportparts="operation-header, operation-docs, operation-examples, request-section, parameters-section, body-section, response-section, examples-section, security-section, callbacks-section, code, code-head, copy, dialog, dialog-bar"
        >
          <slot name="request-start" slot="request-start"></slot>
          <slot name="request-end" slot="request-end"></slot>
          <slot name="response-start" slot="response-start"></slot>
          <slot name="response-end" slot="response-end"></slot>
        </openish-operation>
      `
    case 'model':
      return html`<openish-model .node=${node}></openish-model>`
    case 'tag':
    case 'group':
      return html`<openish-tag-section .node=${node}></openish-tag-section>`
    case 'text':
      /*
       * Headings lifted out of `info.description` are anchors on the overview, not pages - and the
       * anchor is matched against the ids the overview stamps, which are the ones the URL uses.
       */
      return renderOverview((slugPrefix ? stripFirstSegment(node.id) : node.id) || hash)
  }
}

export const renderOverview = (hash = ''): TemplateResult =>
  html`<openish-overview .hash=${hash}></openish-overview>`

/**
 * A second chance for an id the document has no node for.
 *
 * Consulted only on a miss, so a host's `redirect` cannot shadow a real page and costs nothing on
 * every navigation that resolves. One hop only: a generator that maps `a` to `b` and `b` to `a`
 * would otherwise be a hang, and a chain that needs two hops is a config that should say so once.
 *
 * It works in **URL space**, not in id space: a host writing `redirect` is holding a list of links
 * that used to work, and those are the strings in its old sitemap - not ids carrying a document
 * slug the single-document URL never showed. So the id goes in the way the URL had it, and an
 * answer is looked up the same way. A prefixed answer is accepted too, because a multi-document
 * host redirecting *between* documents has no other way to say which one it means.
 */
const redirected = (store: DocumentStore, id: string, slugPrefix: string): NavNode | undefined => {
  const target = store.config.redirect?.(slugPrefix ? stripFirstSegment(id) : id)
  if (!target) {
    return undefined
  }
  return store.bySlug.get(applySlugPrefix(target, slugPrefix)) ?? store.bySlug.get(target)
}

/**
 * Renders whatever a node id points at.
 *
 * An id that matches nothing is a real outcome, not an error: documents change, and a bookmarked
 * URL outlives the operation it pointed at. Saying which id failed is the difference between a bug
 * report and a shrug.
 */
export const renderNodeById = (
  store: DocumentStore | undefined,
  id: string,
  hash = '',
  slugPrefix = '',
): TemplateResult => {
  if (!store) {
    return html`<p class="status" role="status">No document loaded.</p>`
  }

  /*
   * The overview, which is the one page that is not a node.
   *
   * Two spellings, because every id begins with its document's slug: a URL that names the document
   * and nothing else resolves to the slug alone, and one that names nothing at all resolves to the
   * empty string. Both mean "the front of this document".
   */
  if (id === '' || id === store.source.slug) {
    return renderOverview(hash)
  }

  const node = store.bySlug.get(id) ?? redirected(store, id, slugPrefix)
  if (!node) {
    /* Named the way the reader's URL named it, or the message points at a string they never typed. */
    const shown = slugPrefix ? stripFirstSegment(id) : id
    return html`
      <div class="status">
        <h1>Not found</h1>
        <p>Nothing in this document matches <code>${shown}</code>.</p>
      </div>
    `
  }

  return renderNode(node, hash, slugPrefix)
}

import type { DocumentStore, NavNode } from '@openish/core'
import { html, type TemplateResult } from 'lit'

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
export const renderNode = (node: NavNode, hash = ''): TemplateResult => {
  switch (node.type) {
    case 'operation':
    case 'webhook':
      return html`<openish-operation .node=${node}></openish-operation>`
    case 'model':
      return html`<openish-model .node=${node}></openish-model>`
    case 'tag':
    case 'group':
      return html`<openish-tag-section .node=${node}></openish-tag-section>`
    case 'text':
      /* Headings lifted out of `info.description` are anchors on the overview, not pages. */
      return renderOverview(node.id || hash)
  }
}

export const renderOverview = (hash = ''): TemplateResult =>
  html`<openish-overview .hash=${hash}></openish-overview>`

/**
 * Renders whatever a node id points at.
 *
 * An id that matches nothing is a real outcome, not an error: documents change, and a bookmarked
 * URL outlives the operation it pointed at. Saying which id failed is the difference between a bug
 * report and a shrug.
 */
export const renderNodeById = (store: DocumentStore | undefined, id: string, hash = ''): TemplateResult => {
  if (!store) {
    return html`<p class="status" role="status">No document loaded.</p>`
  }

  if (id === '') {
    return renderOverview(hash)
  }

  const node = store.bySlug.get(id)
  if (!node) {
    return html`
      <div class="status">
        <h1>Not found</h1>
        <p>Nothing in this document matches <code>${id}</code>.</p>
      </div>
    `
  }

  return renderNode(node, hash)
}

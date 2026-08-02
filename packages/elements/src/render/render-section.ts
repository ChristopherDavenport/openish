import { html, nothing, type TemplateResult } from 'lit'

import type { Section } from './sections.js'

import '../elements/openish-model.js'
import '../elements/openish-operation.js'
import '../elements/openish-overview.js'
import '../elements/openish-tag-section.js'

/** What a section needs to know that is not a fact about the section. */
export type SectionContext = {
  /**
   * A heading inside `info.description` to scroll to, or `''`.
   *
   * Only ever set on the overview: description headings live inside `<openish-markdown>`'s shadow
   * root, out of reach of the browser's own fragment scrolling, so the element that owns them is the
   * only one that can find them.
   */
  readonly overviewHash: string
  /**
   * Whether this is the section the URL names.
   *
   * Used for one thing: which section the host's per-operation slots are forwarded into. See below.
   */
  readonly active: boolean
}

/**
 * One section of the plane.
 *
 * The sibling of `renderNode`, and deliberately not a replacement for it: a host can still embed a
 * single node, and that path is what `renderNode` is for. What differs here is everything that only
 * makes sense when the whole document is on the page at once - the heading level, the tag header
 * with no index under it, and which section the slots go to.
 */
export const renderSection = (section: Section, context: SectionContext): TemplateResult => {
  switch (section.kind) {
    case 'overview':
      /*
       * The one slot on the plane that needs no scoping.
       *
       * Every other per-section slot has the problem M17 hit: one name, many sections, one shadow
       * root, and only the first in tree order is assigned the host's nodes. A document has exactly
       * one introduction, so `overview-aside` is unambiguous by construction - there is no second
       * section it could land on.
       */
      return html`
        <openish-overview
          .hash=${context.overviewHash}
          .level=${section.level}
          exportparts="overview-header, overview-docs, overview-aside, aside, code, code-toolbar, copy"
        >
          <slot name="overview-aside" slot="aside"></slot>
        </openish-overview>
      `

    case 'header':
      /*
       * A header, with its index beside it rather than under it.
       *
       * On its own page a tag listed what was inside it above the page fold, because that was the
       * only way to get there. On the plane those things follow it down the page, so the list in
       * that position was the same links twice - and for the Models group, six hundred of them
       * between the reader and the first model. In the examples column it is a table of contents:
       * out of the way of the reading order, and the only place the events and models that name this
       * tag from elsewhere in the document can be reached from.
       */
      return html`
        <openish-tag-section
          .node=${section.node as never}
          .level=${section.level}
          exportparts="section-header, section-docs, section-index"
        ></openish-tag-section>
      `

    case 'page':
      if (section.node?.type === 'model') {
        return html`
          <openish-model
            .node=${section.node}
            .level=${section.level}
            exportparts="model-header, model-docs, model-examples, code, code-toolbar, copy"
          ></openish-model>
        `
      }

      return html`
        <openish-operation
          .node=${section.node as never}
          .level=${section.level}
          exportparts="operation-header, operation-docs, operation-examples, request-section, payload-section, parameters-section, body-section, response-section, examples-section, security-section, callbacks-section, code, code-toolbar, copy, dialog, dialog-toolbar"
        >
          ${context.active ? renderOperationSlots() : nothing}
        </openish-operation>
      `
  }
}

/**
 * The host's per-operation slots, forwarded into one section only.
 *
 * A `<slot>` assigned to a parent slot is what carries a host's light-DOM child down through the
 * boundary, and it worked when there was one operation on the page. With every operation on the page
 * there would be one `<slot name="request-start">` per operation in a single shadow root, and only
 * the first in tree order receives the host's nodes - so a host's marker would appear beside
 * whichever operation the document happens to list first, which is arbitrary and useless.
 *
 * Forwarding into the section the URL names is well defined and keeps what the surface was for: a
 * note beside the request on the page the reader is on. It moves as they scroll, which is a change
 * hosts have to be told about, and it is the least bad of three options - the others being to drop
 * the slots from the plane entirely, or to replace them with a render hook, which is its own
 * milestone.
 */
const renderOperationSlots = (): TemplateResult => html`
  <slot name="request-start" slot="request-start"></slot>
  <slot name="request-end" slot="request-end"></slot>
  <slot name="response-start" slot="response-start"></slot>
  <slot name="response-end" slot="response-end"></slot>
`

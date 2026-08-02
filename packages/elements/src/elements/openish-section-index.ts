import { consume } from '@lit/context'
import type { DocumentStore } from '@openish/core'
import { LitElement, html, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { documentContext } from '../context/contexts.js'
import { sectionLinks, type SectionParent } from '../render/section-links.js'
import { baseStyles } from '../styles/shared.js'
import type { OpenishTab } from './openish-tabs.js'
import './openish-section-list.js'
import './openish-tabs.js'

/**
 * What is inside a section, as links, in tabs.
 *
 * A tag's operations are what the reader came for; its events and its models are the two things a
 * document can point at it from elsewhere - `tags` on a webhook, which is standard OpenAPI, and
 * `x-tags` on a schema, which is Redoc's convention. Every row links to a section that already
 * exists further down the plane, so this adds a way in and never a second copy.
 *
 * Tabs rather than one list, because the three answer different questions and a reader has only one
 * of them at a time. A tab with nothing in it is not rendered, so a document that tags nothing shows
 * Operations alone.
 */
@customElement('openish-section-index')
export class OpenishSectionIndex extends LitElement {
  static override styles = [baseStyles]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** The tag or container whose contents this indexes. */
  @property({ attribute: false })
  node!: SectionParent

  override render(): TemplateResult | typeof nothing {
    const groups = sectionLinks(this.store, this.node)
    if (groups.length === 0) {
      return nothing
    }

    /*
     * A tab per kind, and the count on the tab.
     *
     * The count is the tab's `hint`, which is where a media type puts its qualifier too: it answers
     * "is this worth opening" before the reader opens it, and on the Models dictionary it is the
     * difference between a tab and a surprise.
     */
    const tabs: OpenishTab[] = groups.map((group) => ({
      id: group.id,
      label: group.label,
      hint: `${group.items.length}`,
      content: () => html`<openish-section-list .items=${group.items}></openish-section-list>`,
    }))

    return html`<openish-tabs label=${`Inside ${this.node.title}`} .tabs=${tabs}></openish-tabs>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-section-index': OpenishSectionIndex
  }
}

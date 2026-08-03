import { consume } from '@lit/context'
import { declarationFor, type DocumentStore } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { documentContext } from '../context/contexts.js'
import { asideStyles, renderAside } from '../render/aside.js'
import { externalDocsStyles, renderExternalDocs } from '../render/external-docs.js'
import { heading } from '../render/heading.js'
import type { SectionParent } from '../render/section-links.js'
import { baseStyles, planeColumnStyles, titleRowStyles } from '../styles/shared.js'
import './openish-copy-markdown.js'
import './openish-markdown.js'
import './openish-section-index.js'

/**
 * The landing for a tag, a group, or any other node that has children: its prose on one side, and
 * an index of what is inside it on the other.
 *
 * The index sits in the examples column, which is where it belongs on a plane: the things a tag
 * contains follow it down the page, so a list *above* them was the same links twice - and for the
 * Models dictionary, six hundred of them between the reader and the first model. Beside the prose it
 * is a table of contents for the section rather than a wall to climb, and it can carry the two
 * things the page below it cannot show in one place: the events and models that name this tag from
 * elsewhere in the document.
 */
@customElement('openish-tag-section')
export class OpenishTagSection extends LitElement {
  static override styles = [
    baseStyles,
    asideStyles,
    externalDocsStyles,
    titleRowStyles,
    planeColumnStyles,
    css`
      /* Weight from the class, not the tag - see the note in render/heading.ts. */
      .title {
        font: var(--openish-font-heading-1);
        margin: 0 0 var(--openish-space-md);
      }

      /*
       * Stacked, the index is what follows the prose, and it needs air above it. Side by side it is
       * a column of its own, starting level with the title - see the note in openish-operation.
       *
       * A grid rather than margins, for the same reason the overview's facts column is one: what an
       * author wrote goes above the index, and a margin between them would collapse out through a
       * column that has no padding of its own and move the column instead.
       */
      .index {
        display: grid;
        align-content: start;
        gap: var(--openish-space-lg);
        margin-top: var(--openish-space-lg);
      }

    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** The tag or group whose children this indexes. */
  @property({ attribute: false })
  node!: SectionParent

  /** The heading level this section's own title takes. See `<openish-operation>`'s. */
  @property({ type: Number })
  level = 1

  /**
   * The object in the document this section was built from, if the document declares one.
   *
   * `declarationFor` rather than a lookup here, because the markdown export asks the same question
   * of the same node and two answers to "which Tag Object is this" is one too many.
   */
  get #declaration(): object | undefined {
    return declarationFor(this.store?.document, this.node)
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.node) {
      return nothing
    }

    const description = this.node.type === 'tag' ? this.node.description : undefined
    const externalDocs = this.node.type === 'tag' ? this.node.externalDocs : undefined

    return html`
      <div class="columns">
        <div class="docs" part="section-docs">
          <div class="title-row" part="section-header">
            ${heading(this.level, this.node.title, { title: true })}
            <openish-copy-markdown exportparts="copy" .node=${this.node}></openish-copy-markdown>
          </div>
          ${description
            ? html`<openish-markdown .markdown=${description} .headingOffset=${this.level}></openish-markdown>`
            : nothing}
          ${renderExternalDocs(externalDocs, `More about ${this.node.title}`)}
        </div>

        <div class="index" part="section-index">
          ${renderAside(this.#declaration, this.level)}
          <openish-section-index .node=${this.node}></openish-section-index>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-tag-section': OpenishTagSection
  }
}

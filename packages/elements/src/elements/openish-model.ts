import { schemaExample, type DocumentStore, type NavModelNode } from '@openish/core'
import { consume } from '@lit/context'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { documentContext } from '../context/contexts.js'
import { heading } from '../render/heading.js'
import { baseStyles, planeColumnStyles, titleRowStyles } from '../styles/shared.js'
import './openish-code-block.js'
import './openish-copy-markdown.js'
import './openish-markdown.js'
import './openish-schema.js'

/**
 * One schema from `components.schemas`.
 *
 * The property tree and the example both render, because they answer different questions: the tree
 * is the contract, the example is what an instance of it looks like. The tree is
 * `<openish-schema>`, which is cycle-safe - and a model page is where that matters most, since
 * `components.schemas` is exactly where self-referential types live.
 *
 * The same two columns an operation has, and for the same reason: what describes goes left, what is
 * an instance of it goes right.
 */
@customElement('openish-model')
export class OpenishModel extends LitElement {
  static override styles = [
    baseStyles,
    titleRowStyles,
    planeColumnStyles,
    css`
      /* Weight from the class, not the tag - see the note in render/heading.ts. */
      .title {
        font: var(--openish-font-heading-1);
        font-family: var(--openish-font-family-mono);
        margin: 0 0 var(--openish-space-md);
      }

      .section-title {
        font: var(--openish-font-heading-2);
        margin: var(--openish-space-xl) 0 var(--openish-space-sm);
      }

      /*
       * The instance goes where every other instance on the plane goes.
       *
       * A model is the same two kinds of thing an operation is - the contract, and something shaped
       * like it - so it splits the same way and at the same width. Below the schema was the only
       * place for it when a model was a page of its own; on the plane it meant the examples column
       * ran down the page and then stopped dead at the Models group, which is where six hundred
       * examples are.
       *
       * The top margin is dropped only in the two-column arrangement, where the heading has to start
       * level with the title beside it. Stacked, it is the space that separates the example from the
       * tree above it, and zeroing it there would run the two together.
       */
      @container section (min-width: 56rem) {
        .examples {
          grid-column: 2;
        }

        .docs > :first-child,
        .examples > :first-child {
          margin-top: 0;
        }
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** The model to render. */
  @property({ attribute: false })
  node!: NavModelNode

  /** The heading level this section's own title takes. See `<openish-operation>`'s. */
  @property({ type: Number })
  level = 1

  override render(): TemplateResult | typeof nothing {
    const node = this.node
    if (!node) {
      return nothing
    }

    const schema = this.store?.document.components?.schemas?.[node.name]

    return html`
      <div class="columns">
        <div class="docs" part="model-docs">
          <div class="title-row" part="model-header">
            ${heading(this.level, node.title, { title: true })}
            <openish-copy-markdown exportparts="copy" .node=${node}></openish-copy-markdown>
          </div>
          <openish-schema .schema=${schema} pointer=${node.pointer}></openish-schema>
        </div>

        <div class="examples" part="model-examples">
          ${heading(this.level + 1, 'Example', { 'section-title': true })}
          <openish-code-block
            exportparts="code, code-toolbar, copy"
            language="json"
            label="json"
            .code=${JSON.stringify(schemaExample(schema), null, 2)}
          ></openish-code-block>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-model': OpenishModel
  }
}

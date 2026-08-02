import { schemaExample, type DocumentStore, type NavModelNode } from '@openish/core'
import { consume } from '@lit/context'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { documentContext } from '../context/contexts.js'
import { heading } from '../render/heading.js'
import { baseStyles, titleRowStyles } from '../styles/shared.js'
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
 */
@customElement('openish-model')
export class OpenishModel extends LitElement {
  static override styles = [
    baseStyles,
    titleRowStyles,
    css`
      :host {
        display: block;
        /* Prose, so it caps itself at the reading measure however wide the page around it is. */
        max-width: var(--openish-content-max-width);
      }

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
      <div class="title-row">
        ${heading(this.level, node.title, { title: true })}
        <openish-copy-markdown exportparts="copy" .node=${node}></openish-copy-markdown>
      </div>
      <openish-schema .schema=${schema} pointer=${node.pointer}></openish-schema>
      ${heading(this.level + 1, 'Example', { 'section-title': true })}
      <openish-code-block
        language="json"
        label="json"
        .code=${JSON.stringify(schemaExample(schema), null, 2)}
      ></openish-code-block>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-model': OpenishModel
  }
}

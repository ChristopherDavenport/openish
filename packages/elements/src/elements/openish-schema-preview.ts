import { schemaExample } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { baseStyles } from '../styles/shared.js'
import './openish-code-block.js'
import './openish-schema.js'

/**
 * A schema and an example of it, side by side.
 *
 * The property tree is `<openish-schema>`; this element exists to pair it with the example and a
 * media-type label, and to be the single place a request body and a response agree on that layout.
 *
 * The example is worth keeping next to the tree rather than choosing between them: the tree says
 * what is allowed, the example says what one of them looks like, and readers copy the second while
 * checking the first - which is why it is an `<openish-code-block>` like any other code on the page,
 * highlighted and with a copy button, rather than a bare `<pre>`.
 */
@customElement('openish-schema-preview')
export class OpenishSchemaPreview extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      .media-type {
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
        margin-bottom: var(--openish-space-2xs);
      }

      openish-schema {
        margin-bottom: var(--openish-space-md);
      }
    `,
  ]

  /** The schema to render beside its example. */
  @property({ attribute: false })
  schema: unknown = undefined

  /** A caption above the schema, e.g. the media type this one describes. */
  @property({ type: String })
  label = ''

  /** Highlight language for a string example. A generated one is always JSON. */
  @property({ type: String })
  language = 'json'

  /** An example the author supplied. Generated from the schema when absent. */
  @property({ attribute: false })
  example: unknown = undefined

  /** Hide the example block, for callers that show one of their own. */
  @property({ type: Boolean, attribute: 'no-example' })
  noExample = false

  override render(): TemplateResult | typeof nothing {
    if (this.schema === undefined && this.example === undefined) {
      return nothing
    }

    const example = this.example ?? schemaExample(this.schema)
    const written = typeof example === 'string'

    return html`
      ${this.label ? html`<div class="media-type">${this.label}</div>` : nothing}
      ${this.schema === undefined ? nothing : html`<openish-schema .schema=${this.schema}></openish-schema>`}
      ${this.noExample || example === undefined
        ? nothing
        : html`
            <openish-code-block
              label="Example"
              language=${written ? this.language : 'json'}
              .code=${written ? example : JSON.stringify(example, null, 2)}
            ></openish-code-block>
          `}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-schema-preview': OpenishSchemaPreview
  }
}

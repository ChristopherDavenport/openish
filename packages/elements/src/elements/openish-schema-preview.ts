import { schemaExample, type MediaTypeExample } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { baseStyles, controlStyles } from '../styles/shared.js'
import './openish-code-block.js'
import './openish-markdown.js'
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
 *
 * An author who wrote several named examples wrote them because one of them is the reader's case.
 * Showing the first and discarding the rest answers the wrong reader, so more than one becomes a
 * picker.
 */
@customElement('openish-schema-preview')
export class OpenishSchemaPreview extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
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

      .picker {
        display: flex;
        align-items: center;
        gap: var(--openish-space-2xs);
        margin-bottom: var(--openish-space-2xs);
      }

      .picker label {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      select {
        padding: var(--openish-space-3xs) var(--openish-space-2xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-small);
        font-family: inherit;
      }

      .example-summary {
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
        margin-bottom: var(--openish-space-2xs);
      }

      .external {
        font: var(--openish-font-small);
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

  /**
   * One example the author supplied, for a caller that has only one to give.
   *
   * `examples` takes precedence. Generated from the schema when both are empty.
   */
  @property({ attribute: false })
  example: unknown = undefined

  /** Every example the author wrote, in document order. More than one becomes a picker. */
  @property({ attribute: false })
  examples: readonly MediaTypeExample[] = []

  /** Hide the example block, for callers that show one of their own. */
  @property({ type: Boolean, attribute: 'no-example' })
  noExample = false

  /**
   * Hide the property tree, keeping only the example.
   *
   * The complement of `no-example`, and the other half of splitting an operation across two columns:
   * the documentation column takes the tree, the examples column takes this. The schema is still
   * *given* to the element either way, because an example with no author-supplied value is generated
   * from it.
   */
  @property({ type: Boolean, attribute: 'no-schema' })
  noSchema = false

  /** Which example the reader picked. Clamped rather than reset - see `#chosen`. */
  @state()
  private selected = 0

  /**
   * The example on show.
   *
   * Clamped rather than reset when `examples` changes, because a media-type tab switch replaces the
   * list underneath a selection that was made about the old one. Clamping is a getter and cannot go
   * stale; resetting would be state derived from a property in a lifecycle hook, which is the shape
   * this project keeps out of its elements.
   */
  get #chosen(): MediaTypeExample | undefined {
    if (this.examples.length === 0) {
      return this.example === undefined ? undefined : { name: '', value: this.example }
    }
    return this.examples[Math.min(Math.max(this.selected, 0), this.examples.length - 1)]
  }

  /** What to call an example in the picker: what the author wrote, else the key they filed it under. */
  #optionLabel(example: MediaTypeExample, index: number): string {
    return example.summary ?? example.name ?? `Example ${index + 1}`
  }

  #renderPicker(): TemplateResult | typeof nothing {
    if (this.examples.length < 2) {
      return nothing
    }

    const index = Math.min(Math.max(this.selected, 0), this.examples.length - 1)

    return html`
      <div class="picker">
        <label for="example">Example</label>
        <select
          id="example"
          @change=${(event: Event) => {
            this.selected = Number((event.target as HTMLSelectElement).value)
          }}
        >
          ${repeat(
            this.examples,
            (example) => example.name,
            (example, position) => html`
              <option value=${position} ?selected=${position === index}>
                ${this.#optionLabel(example, position)}
              </option>
            `,
          )}
        </select>
      </div>
    `
  }

  /**
   * The example itself, as code - or as a link, when the author put it somewhere else.
   *
   * `externalValue` is deliberately not fetched. It is a URL the document points at, and a
   * documentation page that issues a request the reader did not ask for has made a decision about
   * their network and their privacy that is not its to make.
   */
  #renderExample(chosen: MediaTypeExample | undefined): TemplateResult | typeof nothing {
    const generated = this.examples.length === 0 && this.example === undefined
    const value = generated ? schemaExample(this.schema) : chosen?.value

    if (value === undefined) {
      const external = chosen?.externalValue
      return external === undefined
        ? nothing
        : html`<p class="external"><a href=${external} rel="noreferrer noopener">${external}</a></p>`
    }

    const written = typeof value === 'string'
    return html`
      <openish-code-block
        label="Example"
        language=${written ? this.language : 'json'}
        .code=${written ? value : JSON.stringify(value, null, 2)}
      ></openish-code-block>
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (this.schema === undefined && this.#chosen === undefined && this.examples.length === 0) {
      return nothing
    }

    const chosen = this.#chosen

    return html`
      ${this.label ? html`<div class="media-type">${this.label}</div>` : nothing}
      ${this.schema === undefined || this.noSchema
        ? nothing
        : html`<openish-schema .schema=${this.schema}></openish-schema>`}
      ${this.noExample
        ? nothing
        : html`
            ${this.#renderPicker()}
            ${chosen?.description
              ? html`<openish-markdown
                  class="example-summary"
                  .markdown=${chosen.description}
                  .headingOffset=${4}
                ></openish-markdown>`
              : nothing}
            ${this.#renderExample(chosen)}
          `}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-schema-preview': OpenishSchemaPreview
  }
}

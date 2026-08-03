import {
  groupParameters,
  mediaTypeExamples,
  parameterContentSchema,
  parameterContentType,
  parameterSerialization,
  schemaConstraints,
  schemaTypeLabel,
  type ParameterEntry,
} from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { exampleListStyles, renderExampleList } from '../render/example-list.js'
import { fieldRowStyles, renderFieldRow, type FieldWhere } from '../render/field-row.js'
import { badgeStyles, baseStyles } from '../styles/shared.js'
import './openish-markdown.js'

/**
 * An operation's parameters, as one list of rows.
 *
 * The list handed in is already merged - the path item's parameters plus the operation's, with the
 * operation winning on `{in}:{name}`. That merge lives in `@openish/core` because the HAR builder
 * needs exactly the same answer, and two implementations of an override rule is one too many.
 *
 * Every parameter is listed, including optional ones the sample request leaves out. The snippet
 * shows a request worth copying; the list documents the interface, and those are different jobs.
 *
 * **Where each input travels is a chip on its row, not a heading over a group of them.** It was four
 * headings and four tables - `Path`, `Query`, `Header`, `Cookie` - and a fifth heading beside them
 * for the body, which meant a reader answering one question ("what do I send?") crossed five
 * headings and two different grammars to do it. The rows stay in `groupParameters` order, so every
 * `query` row is still contiguous and the chips read as a run; what the headings were carrying, the
 * chip column carries in the space of one word per row.
 *
 * The body is **not** here. It arrives as a sibling `<openish-schema where="body">` whose rows are
 * the same shape, drawn by the same stylesheet, continuing this list across a shadow boundary - see
 * `renderMediaTypes`. Absorbing it would mean owning level one of a schema, which is not a property
 * list: it is also `oneOf`, `not`, `if`/`then` and `dependentSchemas`, and a second renderer for
 * those would drift from the one in `<openish-schema>`.
 */
@customElement('openish-parameters')
export class OpenishParameters extends LitElement {
  static override styles = [
    badgeStyles,
    baseStyles,
    fieldRowStyles,
    exampleListStyles,
    css`
      :host {
        display: block;
      }
    `,
  ]

  /** Already merged: the path item's parameters plus the operation's. See `collectParameters`. */
  @property({ attribute: false })
  parameters: readonly ParameterEntry[] = []

  #renderParameter(parameter: ParameterEntry): TemplateResult {
    /*
     * A parameter carries either a `schema` or a one-entry `content` map. Reading only the first
     * left the type empty for the second, which reads as "no type" rather than "described another
     * way".
     */
    const mediaType = parameterContentType(parameter)
    const schema = mediaType === undefined ? parameter.schema : parameterContentSchema(parameter)
    const constraints = [...schemaConstraints(schema), ...parameterSerialization(parameter)]
    /* A path parameter is required by definition, whatever the document says. */
    const required = parameter.required === true || parameter.in === 'path'

    return renderFieldRow({
      name: parameter.name,
      where: parameter.in as FieldWhere,
      type: html`${schemaTypeLabel(schema)}${mediaType
        ? html` <span class="media-type">as ${mediaType}</span>`
        : nothing}`,
      required,
      deprecated: parameter.deprecated === true,
      detail: html`
        ${parameter.description
          ? html`<openish-markdown .markdown=${parameter.description} .headingOffset=${4}></openish-markdown>`
          : nothing}
        ${parameter.deprecated ? html`<div class="constraints">Deprecated</div>` : nothing}
        ${constraints.length > 0 ? html`<div class="constraints">${constraints.join(' · ')}</div>` : nothing}
        ${renderExampleList(mediaTypeExamples(parameter))}
      `,
    })
  }

  override render(): TemplateResult | typeof nothing {
    const groups = groupParameters(this.parameters)
    if (groups.length === 0) {
      return nothing
    }

    /*
     * Flattened, but still in group order - which is the whole basis of the chip doing a heading's
     * work. `groupParameters` walks `PARAMETER_LOCATIONS`, so path comes before query comes before
     * header, and a reader scanning the chip column sees three runs rather than an interleaving.
     */
    const parameters = groups.flatMap(([, entries]) => entries)

    return html`
      <ul class="fields" aria-label="Parameters">
        ${repeat(
          parameters,
          (parameter) => `${parameter.in}:${parameter.name}`,
          (parameter) => this.#renderParameter(parameter),
        )}
      </ul>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-parameters': OpenishParameters
  }
}

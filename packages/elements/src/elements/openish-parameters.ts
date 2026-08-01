import { groupParameters, type ParameterEntry, type ParameterLocation } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'

import { schemaConstraints, schemaTypeLabel } from '../schema/summary.js'
import { baseStyles } from '../styles/shared.js'
import type { OpenishTableRow } from './openish-table.js'
import './openish-markdown.js'
import './openish-table.js'

/** Hoisted so the binding does not hand `openish-table` a new array on every render. */
const COLUMNS = ['Name', 'Type', 'Required', 'Description']

const HEADINGS: Record<ParameterLocation, string> = {
  path: 'Path parameters',
  query: 'Query parameters',
  header: 'Header parameters',
  cookie: 'Cookie parameters',
}

/**
 * An operation's parameters, one table per `in` group.
 *
 * The list handed in is already merged - the path item's parameters plus the operation's, with the
 * operation winning on `{in}:{name}`. That merge lives in `@openish/core` because the HAR builder
 * needs exactly the same answer, and two implementations of an override rule is one too many.
 *
 * Every parameter is listed, including optional ones the sample request leaves out. The snippet
 * shows a request worth copying; the table documents the interface, and those are different jobs.
 */
@customElement('openish-parameters')
export class OpenishParameters extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      h3 {
        font: var(--openish-font-heading-3);
        margin: var(--openish-space-lg) 0 var(--openish-space-xs);
      }

      h3:first-of-type {
        margin-top: 0;
      }

      .type {
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
        white-space: nowrap;
      }

      .required {
        color: var(--openish-color-danger);
        font: var(--openish-font-micro);
      }

      .optional {
        color: var(--openish-color-text-muted);
        font: var(--openish-font-micro);
      }

      .constraints {
        margin-top: var(--openish-space-3xs);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      .deprecated {
        text-decoration: line-through;
      }
    `,
  ]

  /** Already merged: the path item's parameters plus the operation's. See `collectParameters`. */
  @property({ attribute: false })
  parameters: readonly ParameterEntry[] = []

  #rows(parameters: readonly ParameterEntry[]): OpenishTableRow[] {
    return parameters.map((parameter) => {
      const constraints = schemaConstraints(parameter.schema)
      /* A path parameter is required by definition, whatever the document says. */
      const required = parameter.required === true || parameter.in === 'path'

      return {
        key: `${parameter.in}:${parameter.name}`,
        cells: [
          html`<span class=${classMap({ deprecated: parameter.deprecated === true })}>${parameter.name}</span>`,
          html`<span class="type">${schemaTypeLabel(parameter.schema)}</span>`,
          required ? html`<span class="required">required</span>` : html`<span class="optional">optional</span>`,
          html`
            ${parameter.description
              ? html`<openish-markdown .markdown=${parameter.description} .headingOffset=${4}></openish-markdown>`
              : nothing}
            ${parameter.deprecated ? html`<div class="constraints">Deprecated</div>` : nothing}
            ${constraints.length > 0 ? html`<div class="constraints">${constraints.join(' · ')}</div>` : nothing}
          `,
        ],
      }
    })
  }

  override render(): TemplateResult | typeof nothing {
    const groups = groupParameters(this.parameters)
    if (groups.length === 0) {
      return nothing
    }

    return html`
      ${groups.map(
        ([location, parameters]) => html`
          <h3>${HEADINGS[location]}</h3>
          <openish-table
            .columns=${COLUMNS}
            .rows=${this.#rows(parameters)}
            caption=${HEADINGS[location]}
          ></openish-table>
        `,
      )}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-parameters': OpenishParameters
  }
}

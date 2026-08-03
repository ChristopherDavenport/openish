import {
  groupParameters,
  mediaTypeExamples,
  parameterContentSchema,
  parameterContentType,
  parameterSerialization,
  schemaConstraints,
  schemaTypeLabel,
  type ParameterEntry,
  type ParameterLocation,
} from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'

import { exampleListStyles, renderExampleList } from '../render/example-list.js'
import { heading } from '../render/heading.js'
import { baseStyles } from '../styles/shared.js'
import type { OpenishTableRow } from './openish-table.js'
import './openish-markdown.js'
import './openish-table.js'

/** Hoisted so the binding does not hand `openish-table` a new array on every render. */
const COLUMNS = ['Name', 'Type', 'Required', 'Description']

/**
 * The heading over each group, and the name of the table under it. They are not the same string.
 *
 * The section above says `Parameters` once, so a heading repeating the word for every group prints it
 * five times on one screen to say what the reader has already been told. Where each input *travels*
 * is the only thing the group adds, so that is all the heading says.
 *
 * The caption is the table's accessible name and stays whole. It is announced when a screen-reader
 * user enters the table, by which point the heading above it is out of earshot - and `Path` alone,
 * read there, names nothing.
 */
const HEADINGS: Record<ParameterLocation, string> = {
  path: 'Path',
  query: 'Query',
  header: 'Header',
  cookie: 'Cookie',
}

const CAPTIONS: Record<ParameterLocation, string> = {
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

      /*
       * Weight from the class, not the tag - the same rule the section titles follow.
       *
       * These were h3s under an h4 section title, which read to anything following the outline as a
       * group *outranking* the section holding it. The level is a property now and the look is this
       * rule, so a group is a group at whatever depth the document put the operation.
       */
      .group {
        font: var(--openish-font-heading-3);
        margin: var(--openish-space-lg) 0 var(--openish-space-xs);
      }

      .group:first-of-type {
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

      .media-type {
        font-family: var(--openish-font-family-mono);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

    `,
    exampleListStyles,
  ]

  /** Already merged: the path item's parameters plus the operation's. See `collectParameters`. */
  @property({ attribute: false })
  parameters: readonly ParameterEntry[] = []

  /**
   * The heading level each group takes.
   *
   * One below whatever level the `Parameters` section above these was written at, which is a fact
   * only the operation knows - on the plane it depends on how deep the document puts the operation.
   * The default is what a caller mounting this element on its own would want: a group under a
   * level-four section, the arrangement an operation had before the plane.
   */
  @property({ type: Number })
  level = 5

  #rows(parameters: readonly ParameterEntry[]): OpenishTableRow[] {
    return parameters.map((parameter) => {
      /*
       * A parameter carries either a `schema` or a one-entry `content` map. Reading only the first
       * left the type column empty for the second, which reads as "no type" rather than "described
       * another way".
       */
      const mediaType = parameterContentType(parameter)
      const schema = mediaType === undefined ? parameter.schema : parameterContentSchema(parameter)
      const constraints = [...schemaConstraints(schema), ...parameterSerialization(parameter)]
      /* A path parameter is required by definition, whatever the document says. */
      const required = parameter.required === true || parameter.in === 'path'

      return {
        key: `${parameter.in}:${parameter.name}`,
        cells: [
          html`<span class=${classMap({ deprecated: parameter.deprecated === true })}>${parameter.name}</span>`,
          html`
            <span class="type">${schemaTypeLabel(schema)}</span>
            ${mediaType ? html`<div class="media-type">as ${mediaType}</div>` : nothing}
          `,
          required ? html`<span class="required">required</span>` : html`<span class="optional">optional</span>`,
          html`
            ${parameter.description
              ? html`<openish-markdown .markdown=${parameter.description} .headingOffset=${4}></openish-markdown>`
              : nothing}
            ${parameter.deprecated ? html`<div class="constraints">Deprecated</div>` : nothing}
            ${constraints.length > 0 ? html`<div class="constraints">${constraints.join(' · ')}</div>` : nothing}
            ${renderExampleList(mediaTypeExamples(parameter))}
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
          ${heading(this.level, HEADINGS[location], { group: true })}
          <openish-table
            .columns=${COLUMNS}
            .rows=${this.#rows(parameters)}
            caption=${CAPTIONS[location]}
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

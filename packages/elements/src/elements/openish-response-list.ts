import { consume } from '@lit/context'
import { getResolvedRef } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { repeat } from 'lit/directives/repeat.js'

import { uiContext, type OpenishUiState } from '../context/contexts.js'
import { renderMediaTypes } from '../render/media-types.js'
import { schemaConstraints, schemaTypeLabel } from '../schema/summary.js'
import { baseStyles } from '../styles/shared.js'
import type { OpenishTableRow } from './openish-table.js'
import type { OpenishTab } from './openish-tabs.js'
import './openish-disclosure.js'
import './openish-markdown.js'
import './openish-table.js'
import './openish-tabs.js'

type Response = {
  description?: string
  headers?: Record<string, unknown>
  content?: unknown
  links?: Record<string, unknown>
}

type Header = {
  description?: string
  required?: boolean
  deprecated?: boolean
  schema?: unknown
}

/** Hoisted so the binding does not hand `openish-table` a new array on every render. */
const HEADER_COLUMNS = ['Name', 'Type', 'Description']

const LINK_COLUMNS = ['Name', 'Operation', 'Description']

/** 2xx reads as success, 3xx as information, everything else as a failure the caller must handle. */
const toneFor = (status: string): OpenishTab['tone'] => {
  if (status.startsWith('2')) {
    return 'success'
  }
  if (status.startsWith('3')) {
    return 'info'
  }
  if (status.startsWith('4') || status.startsWith('5')) {
    return 'danger'
  }
  return undefined
}

/**
 * An operation's responses.
 *
 * Tabs by status code, because a reader is looking for one of them at a time - usually the happy
 * path, occasionally the error they just hit. `default` sorts last however the document ordered it:
 * it is the fallback, and reading it first tells you nothing about what the operation normally does.
 *
 * `config.expandAllResponses` stacks them instead, for readers who want the whole contract at once
 * and for printing, where a tab set shows one panel and hides the rest.
 */
@customElement('openish-response-list')
export class OpenishResponseList extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      h3 {
        display: flex;
        align-items: baseline;
        gap: var(--openish-space-xs);
        font: var(--openish-font-heading-3);
        margin: var(--openish-space-lg) 0 var(--openish-space-xs);
      }

      h3:first-of-type {
        margin-top: 0;
      }

      .status[data-tone='success'] {
        color: var(--openish-color-success);
      }

      .status[data-tone='info'] {
        color: var(--openish-color-info);
      }

      .status[data-tone='danger'] {
        color: var(--openish-color-danger);
      }

      ul.link-parameters {
        margin: var(--openish-space-3xs) 0 0;
        padding: 0;
        list-style: none;
        font: var(--openish-font-micro);
      }

      ul.link-parameters code {
        font-family: var(--openish-font-family-mono);
      }

      .stacked {
        padding-bottom: var(--openish-space-md);
        border-bottom: 1px solid var(--openish-color-border);
      }

      .stacked:last-child {
        border-bottom: 0;
      }

      openish-disclosure {
        margin: var(--openish-space-sm) 0;
      }

      .constraints {
        margin-top: var(--openish-space-3xs);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }
    `,
  ]

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** A Responses Object: status codes to Response Objects. */
  @property({ attribute: false })
  responses: unknown = undefined

  /**
   * Document the response schemas without their examples.
   *
   * Set when the examples are shown in a column of their own beside the page. The same property
   * `<openish-request-body>` has taken since M6, for the same reason: two copies of the same
   * generated JSON is not twice as informative, it is twice as long.
   */
  @property({ type: Boolean, attribute: 'no-example' })
  noExample = false

  /**
   * Render only the example bodies, status by status.
   *
   * What the examples column shows: the same tabs, with the schema tree, the headers, the links and
   * the description all left to the documentation column beside it. Reusing this element rather than
   * writing a second one keeps one answer to "which status codes are there, and in what order".
   */
  @property({ type: Boolean, attribute: 'examples-only' })
  examplesOnly = false

  /** Status codes in document order, with `default` moved to the end. */
  get #entries(): Array<[string, unknown]> {
    const responses = this.responses
    if (typeof responses !== 'object' || responses === null) {
      return []
    }

    /*
     * A `204` has a description and no body, which is a complete answer in the documentation column
     * and an empty tab in the examples one. So the examples column shows only the statuses that
     * actually carry a body - the reader is not missing anything, because the status is still on a
     * tab beside the description.
     */
    const entries = Object.entries(responses as Record<string, unknown>).filter(([, raw]) => {
      if (!this.examplesOnly) {
        return true
      }
      const content = (getResolvedRef(raw) as Response | undefined)?.content
      return typeof content === 'object' && content !== null && Object.keys(content).length > 0
    })

    return [
      ...entries.filter(([status]) => status !== 'default'),
      ...entries.filter(([status]) => status === 'default'),
    ]
  }

  #renderHeaders(headers: Record<string, unknown> | undefined): TemplateResult | typeof nothing {
    const entries = Object.entries(headers ?? {})
    if (entries.length === 0) {
      return nothing
    }

    const rows: OpenishTableRow[] = entries.map(([name, raw]) => {
      const header = getResolvedRef(raw) as Header | undefined
      const constraints = schemaConstraints(header?.schema)
      return {
        key: name,
        cells: [
          name,
          schemaTypeLabel(header?.schema),
          html`
            ${header?.description
              ? html`<openish-markdown .markdown=${header.description} .headingOffset=${4}></openish-markdown>`
              : nothing}
            ${constraints.length > 0 ? html`<div class="constraints">${constraints.join(' · ')}</div>` : nothing}
          `,
        ],
      }
    })

    return html`
      <openish-disclosure summary="Headers" hint=${`${rows.length}`} ?open=${this.ui?.config.expandAllResponses}>
        <openish-table .columns=${HEADER_COLUMNS} .rows=${rows} caption="Response headers"></openish-table>
      </openish-disclosure>
    `
  }

  /**
   * What this response lets the reader do next.
   *
   * A Link Object says "the `id` in this body is the `accountId` of that operation" - the one place
   * OpenAPI describes how two operations join up. Neither Redoc nor Scalar renders it, which is
   * probably why so few documents bother writing it; a reference that shows it is the reason to.
   *
   * `operationId` and `operationRef` are alternatives, and either identifies the target well enough
   * to name. The parameter map is the substance: without it a link is only a cross-reference.
   */
  #renderLinks(links: Record<string, unknown> | undefined): TemplateResult | typeof nothing {
    const entries = Object.entries(links ?? {})
    if (entries.length === 0) {
      return nothing
    }

    const rows = entries.map(([name, raw]) => {
      const link = (getResolvedRef(raw) ?? {}) as {
        operationId?: string
        operationRef?: string
        description?: string
        parameters?: Record<string, unknown>
      }
      const target = link.operationId ?? link.operationRef ?? ''
      const parameters = Object.entries(link.parameters ?? {})

      return {
        key: name,
        cells: [
          html`<code>${name}</code>`,
          target ? html`<code>${target}</code>` : nothing,
          html`
            ${link.description
              ? html`<openish-markdown .markdown=${link.description} .headingOffset=${3}></openish-markdown>`
              : nothing}
            ${parameters.length > 0
              ? html`
                  <ul class="link-parameters">
                    ${repeat(
                      parameters,
                      ([parameter]) => parameter,
                      ([parameter, expression]) => html`
                        <li><code>${parameter}</code> ← <code>${String(expression)}</code></li>
                      `,
                    )}
                  </ul>
                `
              : nothing}
          `,
        ],
      }
    })

    return html`
      <openish-disclosure summary="Links" hint=${`${rows.length}`} ?open=${this.ui?.config.expandAllResponses}>
        <openish-table .columns=${LINK_COLUMNS} .rows=${rows} caption="Response links"></openish-table>
      </openish-disclosure>
    `
  }

  /**
   * One response.
   *
   * A response with no `content` is a complete answer - `204 No Content` says everything by saying
   * nothing - so it renders its description and stops, rather than an empty schema block.
   */
  #renderResponse(raw: unknown): TemplateResult {
    const response = (getResolvedRef(raw) as Response | undefined) ?? {}

    if (this.examplesOnly) {
      return html`${renderMediaTypes(response.content, 'Response media types', { noSchema: true })}`
    }

    return html`
      ${response.description
        ? html`<openish-markdown .markdown=${response.description} .headingOffset=${2}></openish-markdown>`
        : nothing}
      ${this.#renderHeaders(response.headers)}
      ${renderMediaTypes(response.content, 'Response media types', { noExample: this.noExample })}
      ${this.#renderLinks(response.links)}
    `
  }

  override render(): TemplateResult | typeof nothing {
    const entries = this.#entries
    if (entries.length === 0) {
      return nothing
    }

    if (this.ui?.config.expandAllResponses) {
      return html`
        ${repeat(
          entries,
          ([status]) => status,
          ([status, raw]) => html`
            <div class="stacked">
              <h3><span class="status" data-tone=${ifDefined(toneFor(status))}>${status}</span></h3>
              ${this.#renderResponse(raw)}
            </div>
          `,
        )}
      `
    }

    const tabs: OpenishTab[] = entries.map(([status, raw]) => ({
      id: status,
      label: status,
      tone: toneFor(status),
      content: () => this.#renderResponse(raw),
    }))

    return html`<openish-tabs label="Response status codes" .tabs=${tabs}></openish-tabs>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-response-list': OpenishResponseList
  }
}

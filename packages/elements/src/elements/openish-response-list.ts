import { consume } from '@lit/context'
import {
  getResolvedRef,
  mediaTypeExamples,
  schemaConstraints,
  schemaTypeLabel,
  type DocumentStore,
  type VariantChoices,
} from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { exampleListStyles, renderExampleList } from '../render/example-list.js'
import { fieldRowStyles, renderFieldRow } from '../render/field-row.js'
import { renderTypeLabel } from '../render/model-link.js'
import { hasRenderableContent, renderMediaTypes } from '../render/media-types.js'
import { pickMediaType, responseEntries } from '../render/responses.js'
import { badgeStyles, baseStyles } from '../styles/shared.js'
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
  /* The two example spellings, in the shape `mediaTypeExamples` reads off a media type. */
  example?: unknown
  examples?: Record<string, unknown>
}


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
 * **A list in the documentation column, and a tab set in the examples column.** Those are two
 * different questions wearing the same status codes. An example answers one call, so the column that
 * holds it has to pick one status and the code sample beside it asks for that one in `Accept`. The
 * documentation answers "what can this return", and a reader comparing the success case against the
 * error they just hit should not have to click between two tabs to see both.
 *
 * So each status here is a row carrying its own description - which is five descriptions a reader
 * used to have to click to find - and everything under it is behind that row. `default` sorts last
 * however the document ordered it: it is the fallback, and reading it first tells you nothing about
 * what the operation normally does.
 *
 * `config.expandAllResponses` opens every row, for readers who want the whole contract at once and
 * for printing.
 */
@customElement('openish-response-list')
export class OpenishResponseList extends LitElement {
  static override styles = [
    badgeStyles,
    baseStyles,
    fieldRowStyles,
    css`
      :host {
        display: block;
      }

      ul.statuses {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      /*
       * A status with nothing under it is a row, not an expander over an empty region.
       *
       * Padded to match the disclosure button beside it so the codes line up down the column,
       * whichever kind of row each one turned out to be.
       */
      .terse {
        display: flex;
        align-items: baseline;
        gap: var(--openish-space-2xs);
        padding: var(--openish-space-2xs) 0;
      }

      /*
       * Indented past the marker of the button that opened it, so the codes stay the leftmost thing
       * in the column and a region reads as belonging to the row above rather than starting a new one.
       */
      openish-disclosure::part(region) {
        padding-left: var(--openish-space-md);
      }

      /*
       * The shape a response answers with, above the rows that describe it - and the link to the
       * section that documents it. Set like a field row's type rather than like a heading, because
       * it is a caption on the rows below rather than a title over them.
       */
      .payload-identity {
        display: flex;
        align-items: baseline;
        gap: var(--openish-space-xs);
        margin: var(--openish-space-sm) 0 0;
      }

      .payload-identity .type {
        font: var(--openish-font-code-small);
        color: var(--openish-color-text-muted);
        overflow-wrap: anywhere;
      }

      .terse-description {
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
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

      openish-disclosure {
        margin: var(--openish-space-sm) 0;
      }

      .constraints {
        margin-top: var(--openish-space-3xs);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

    `,
    exampleListStyles,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

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

  /**
   * Which status the examples column is showing. Read in `examples-only` mode and nowhere else.
   *
   * The two columns used to move together, and the argument for it was sound while both were tab
   * sets: a reader who moved one and found the other still on `200` had been shown a schema and an
   * example of two different responses, side by side. That cannot happen now, because the
   * documentation column has no selection to fall out of step with - it shows every status at once.
   * The tab set over the examples is the only place a status is chosen, and this is how it says so.
   *
   * Empty leaves the tab set to decide for itself, which is what a host mounting this element on its
   * own gets.
   */
  @property({ type: String })
  status = ''

  /**
   * The media type to show, when something above holds that choice too.
   *
   * Both columns take it and neither asks for it: the question is put once, on the `Returns` heading.
   * A response that does not declare the chosen type falls back to its own first, which is the only
   * sensible answer for a `404` that is only ever JSON.
   */
  @property({ type: String, attribute: 'media-type' })
  mediaType = ''

  /**
   * The caller is asking the media-type question somewhere else, so do not ask it here.
   *
   * See the note on `<openish-request-body>`: a tab set per response was chrome repeated down the
   * page, and the answer is one select beside the heading. Off by default, so a host mounting this
   * element alone keeps a way to change the type.
   */
  @property({ type: Boolean, attribute: 'no-media-tabs' })
  noMediaTabs = false

  /** Which shape the variant choices below belong to, and what they are. */
  @property({ attribute: false })
  variants: VariantChoices | undefined = undefined

  /**
   * Which statuses the reader has opened or closed, by code. Absent means they have not said.
   *
   * A map rather than a bound attribute, and the same shape `<openish-schema>` uses for its own
   * disclosures: `open` has to be the reader's answer once they have given one, and re-binding it
   * from config on every render would reopen a status they had just closed.
   */
  @state()
  private opened: ReadonlyMap<string, boolean> = new Map()

  /** Status codes in document order, with `default` moved to the end. See `render/responses.ts`. */
  get #entries(): Array<[string, unknown]> {
    return responseEntries(this.responses, { withContentOnly: this.examplesOnly })
  }

  /**
   * The headers a response promises, as rows of the same list its body's members are in.
   *
   * They were an `<openish-table>` behind a `Headers 3` disclosure, which is a second nesting inside
   * a status that is already behind one. Badged `header`, they sit beside the body's rows and the
   * chip says which is which - the same device the request side uses to tell a query parameter from
   * a body field.
   *
   * "Always sent" stays a flag and must never move into the required slot, and the reason matters
   * more now than when these were two separate tables: required on a *response* header is a promise
   * the server makes, not something a caller supplies, and the rows a few inches above use
   * "required" for the other meaning. One grammar makes the two adjacent; it must not make them the
   * same word.
   */
  #renderHeaders(headers: Record<string, unknown> | undefined): TemplateResult | typeof nothing {
    const entries = Object.entries(headers ?? {})
    if (entries.length === 0) {
      return nothing
    }

    return html`
      ${repeat(
        entries,
        ([name]) => name,
        ([name, raw]) => {
          const header = getResolvedRef(raw) as Header | undefined
          const constraints = schemaConstraints(header?.schema)
          return renderFieldRow({
            name,
            where: 'header',
            type: schemaTypeLabel(header?.schema),
            deprecated: header?.deprecated === true,
            flags: [
              ...(header?.required ? ['Always sent'] : []),
              ...(header?.deprecated ? ['deprecated'] : []),
            ],
            detail: html`
              ${header?.description
                ? html`<openish-markdown .markdown=${header.description} .headingOffset=${4}></openish-markdown>`
                : nothing}
              ${constraints.length > 0 ? html`<div class="constraints">${constraints.join(' · ')}</div>` : nothing}
              ${renderExampleList(mediaTypeExamples(header))}
            `,
          })
        },
      )}
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
   * What shape this response answers with, named above its rows.
   *
   * The request body says this on the section's heading row, where the reader meets it before the
   * rows. A response has no heading of its own - it is one row in a list of statuses - so it says it
   * here, in the region the row opens.
   *
   * It exists for the link. `renderTypeLabel` is the only route from a body to the section
   * documenting it, and with the root object rendered as rows rather than as a named tree there is
   * no other line to hang it on; without this, following a response's shape to its model page stops
   * working. A bare `object` is suppressed, because it names nothing and standing over a list of
   * that object's own properties it says less than nothing.
   */
  #renderPayloadIdentity(content: unknown): TemplateResult | typeof nothing {
    const picked = pickMediaType(content, this.mediaType)
    const media =
      content !== null && typeof content === 'object'
        ? ((content as Record<string, unknown>)[picked ?? ''] as { schema?: unknown } | undefined)
        : undefined
    const label = schemaTypeLabel(media?.schema)
    if (label === '' || label === 'object') {
      return nothing
    }

    return html`<p class="payload-identity">
      <span class="badge" data-where="body">body</span>
      <span class="type">${renderTypeLabel(this.store, this.ui, media?.schema, label)}</span>
    </p>`
  }

  /**
   * One response.
   *
   * A response with no `content` is a complete answer - `204 No Content` says everything by saying
   * nothing - so it renders its description and stops, rather than an empty schema block.
   */
  #renderResponse(status: string, raw: unknown): TemplateResult {
    const response = (getResolvedRef(raw) as Response | undefined) ?? {}
    const scope = `response:${status}`

    /*
     * The examples column: one media type, no tabs, and the caption saying which one it is. The
     * control that chose it is in the documentation column, where the schema it describes is.
     */
    if (this.examplesOnly) {
      return html`${renderMediaTypes(response.content, 'Response media types', {
        noSchema: true,
        pick: this.mediaType,
        scope,
        ...(this.variants ? { variants: this.variants } : {}),
      })}`
    }

    /*
     * No description here: it is on the row that opens this region, which is what turns a strip of
     * status codes into six readable sentences. A button's label has to be text, so the summary gets
     * the plain string and any Markdown in it goes unrendered - a real loss, and a small one against
     * five descriptions that used to be invisible until clicked.
     */
    return html`
      <ul class="fields" aria-label=${`Response ${status}`}>
        ${this.#renderHeaders(response.headers)}
      </ul>
      ${this.#renderPayloadIdentity(response.content)}
      ${renderMediaTypes(response.content, 'Response media types', {
        noExample: this.noExample,
        ...(this.noMediaTabs ? { pick: this.mediaType, hideLabel: true } : { selected: this.mediaType }),
        scope,
        ...(this.variants ? { variants: this.variants } : {}),
        onSelect: (mediaType) => {
          this.dispatchEvent(
            new CustomEvent<string>('openish-media-type-change', { detail: mediaType, bubbles: true }),
          )
        },
      })}
      ${this.#renderLinks(response.links)}
    `
  }

  /**
   * The status a reader has not touched arrives open, and which one that is.
   *
   * The first success, because it is what the operation normally does and what a reader arrived to
   * see; the first entry otherwise, so an operation that only documents failures still opens with
   * something. `expandAllResponses` overrides both - it means every level, and this is one.
   */
  #openByDefault(status: string): boolean {
    if (this.ui?.config.expandAllResponses) {
      return true
    }
    const entries = this.#entries
    const first = entries.find(([code]) => toneFor(code) === 'success') ?? entries[0]
    return first?.[0] === status
  }

  /**
   * One status: its code and what it means on a row, and everything else behind it.
   *
   * A response with nothing under it renders as a plain row rather than an expander over an empty
   * region - a `204 No Content` says everything by saying nothing, and a control that reveals
   * nothing is worse than no control.
   *
   * Nothing is rendered into a closed region, which is what keeps this cheap: the documentation
   * column now shows every status at once, and if each one built its schema tree on arrival an
   * operation with eight responses would cost eight trees to show six lines of prose.
   */
  #renderStatus(status: string, raw: unknown): TemplateResult {
    const response = (getResolvedRef(raw) as Response | undefined) ?? {}
    const tone = toneFor(status)
    const description = response.description ?? ''
    const inside =
      Object.keys(response.headers ?? {}).length > 0 ||
      hasRenderableContent(raw) ||
      Object.keys(response.links ?? {}).length > 0

    if (!inside) {
      return html`
        <li class="terse">
          <span class="status" data-tone=${ifDefined(tone)}>${status}</span>
          ${description ? html`<span class="terse-description">${description}</span>` : nothing}
        </li>
      `
    }

    const open = this.opened.get(status) ?? this.#openByDefault(status)

    return html`
      <li>
        <openish-disclosure
          summary=${status}
          hint=${description}
          tone=${ifDefined(tone)}
          .open=${open}
          @openish-toggle=${(event: CustomEvent<boolean>) => {
            this.opened = new Map(this.opened).set(status, event.detail)
          }}
        >
          ${open ? this.#renderResponse(status, raw) : nothing}
        </openish-disclosure>
      </li>
    `
  }

  override render(): TemplateResult | typeof nothing {
    const entries = this.#entries
    if (entries.length === 0) {
      return nothing
    }

    /*
     * The examples column keeps its tab set, and it is the only place a status is *chosen*.
     *
     * One answer at a time is right for an example - there is one code sample beside it, asking for
     * one `Accept` - and wrong for the documentation, where a reader comparing the success case with
     * the error they just hit had to click between two tabs to do it.
     */
    if (this.examplesOnly) {
      const tabs: OpenishTab[] = entries.map(([status, raw]) => ({
        id: status,
        label: status,
        tone: toneFor(status),
        content: () => this.#renderResponse(status, raw),
      }))

      return html`
        <openish-tabs
          label="Response status codes"
          selected=${ifDefined(this.status || undefined)}
          .tabs=${tabs}
          @openish-tab-change=${(event: CustomEvent<string>) => {
            this.dispatchEvent(
              new CustomEvent<string>('openish-status-change', { detail: event.detail, bubbles: true }),
            )
          }}
        ></openish-tabs>
      `
    }

    return html`
      <ul class="statuses" aria-label="Responses">
        ${repeat(
          entries,
          ([status]) => status,
          ([status, raw]) => this.#renderStatus(status, raw),
        )}
      </ul>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-response-list': OpenishResponseList
  }

  /** The reader moved to another status code, from either column's tab set. */
  interface HTMLElementEventMap {
    'openish-status-change': CustomEvent<string>
  }
}

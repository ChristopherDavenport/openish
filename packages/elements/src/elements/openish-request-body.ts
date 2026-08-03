import { getResolvedRef, mediaTypeEncoding, type EncodingEntry, type VariantChoices } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { pickMediaType } from '../render/responses.js'
import { renderMediaTypes } from '../render/media-types.js'
import { baseStyles } from '../styles/shared.js'
import type { OpenishTableRow } from './openish-table.js'
import './openish-markdown.js'
import './openish-table.js'

/** Hoisted so the binding does not hand `openish-table` a new array on every render. */
const PART_COLUMNS = ['Part', 'Content type', 'Headers']

type RequestBody = {
  description?: string
  required?: boolean
  content?: unknown
}

/**
 * An operation's request body: what to send, and in which media type.
 *
 * Whether the body is required is still stated in words rather than left to the reader to infer
 * from a missing marker - it is the single most consequential fact on the page after the URL. It is
 * said on the `Parameters` heading row now rather than here, because the body no longer has a
 * heading of its own to hang it under: its members are rows in the one list of inputs, and a lone
 * `Optional` floating above them would attach to the first row rather than to the body.
 */
@customElement('openish-request-body')
export class OpenishRequestBody extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      .parts {
        margin-top: var(--openish-space-sm);
      }

      .parts-label {
        margin-bottom: var(--openish-space-3xs);
        font: var(--openish-font-micro);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--openish-color-text-muted);
      }

      .serialization {
        margin-top: var(--openish-space-3xs);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      code {
        font-family: var(--openish-font-family-mono);
      }
    `,
  ]

  /** A Request Body Object, or a `$ref` to one. */
  @property({ attribute: false })
  requestBody: unknown = undefined

  /**
   * Document the schema without an example.
   *
   * Set when the try-it panel above is showing the same example in an editor. Two copies of the
   * same generated JSON, one of them thousands of pixels tall, is not twice as informative.
   */
  @property({ type: Boolean, attribute: 'no-example' })
  noExample = false

  /**
   * Render only the example body, media type by media type.
   *
   * What the examples column shows for a webhook, which has no request for the reader to send and so
   * no code sample to carry its payload. The schema tree, the description and whether the body is
   * required all stay in the documentation column beside it. The same seam
   * `<openish-response-list examples-only>` has, and reusing this element rather than writing a
   * second one keeps one answer to "which media types are there, and in what order".
   */
  @property({ type: Boolean, attribute: 'examples-only' })
  examplesOnly = false

  /**
   * Which media type the operation is talking about.
   *
   * Set by `<openish-operation>`, which owns the choice because the sample beside these tabs has to
   * be a sample of the one that is showing. Empty leaves the tab set to decide for itself, which is
   * what a host rendering this element on its own gets.
   */
  @property({ type: String, attribute: 'media-type' })
  mediaType = ''

  /**
   * The caller is asking the media-type question somewhere else, so do not ask it here.
   *
   * A tab set naming two content types was a band of chrome across the top of the body, wider and
   * louder than the one line of it a reader ever needs. `<openish-operation>` puts a select on the
   * `Body` heading instead - out of the reading order, at the right-hand end of a row that was
   * already there - and sets this so the answer is not offered twice.
   *
   * The caption goes with the tabs, for the same reason: the select is showing the value.
   *
   * Off by default. A host mounting this element on its own has no such control, and would otherwise
   * be left with a body it cannot change the media type of.
   */
  @property({ type: Boolean, attribute: 'no-media-tabs' })
  noMediaTabs = false

  /**
   * This body's rows continue a list that began in another element.
   *
   * The parameters beside a body are drawn by `<openish-parameters>` in its own shadow root, and the
   * body's promoted rows are drawn here - one list to a reader, two to the DOM. A list's first row
   * draws no rule because whatever is above it already drew one, which is true of the first
   * parameter and false of the first body row. This is how the row learns the difference; it cannot
   * see across the boundary to work it out.
   */
  @property({ type: Boolean, attribute: 'continues-list' })
  continuesList = false

  /** The `oneOf`/`anyOf` branches picked in this body's tree, for the example to honour. */
  @property({ attribute: false })
  variants: VariantChoices | undefined = undefined

  /**
   * How the parts of the body go on the wire, where the document says.
   *
   * Under the schema rather than inside it: the tree describes the *value* of each property, and this
   * describes the envelope one is sent in - which is a different question, and the one an upload
   * endpoint is actually asking. Only the media type on screen, because the encoding belongs to it:
   * the `multipart/form-data` form of a body has parts and the `application/json` form has none.
   */
  #renderEncoding(content: unknown): TemplateResult | typeof nothing {
    const map = getResolvedRef(content)
    if (typeof map !== 'object' || map === null) {
      return nothing
    }

    const name = pickMediaType(map, this.mediaType)
    const entries: EncodingEntry[] = mediaTypeEncoding((map as Record<string, unknown>)[name ?? ''])
    if (entries.length === 0) {
      return nothing
    }

    const rows: OpenishTableRow[] = entries.map((entry) => ({
      key: entry.property,
      cells: [
        html`<code>${entry.property}</code>`,
        entry.contentType ? html`<code>${entry.contentType}</code>` : nothing,
        html`
          ${entry.headers.length > 0
            ? html`${entry.headers.map((header, index) => html`${index > 0 ? ', ' : ''}<code>${header}</code>`)}`
            : nothing}
          ${entry.serialization.length > 0
            ? html`<div class="serialization">${entry.serialization.join(' · ')}</div>`
            : nothing}
        `,
      ],
    }))

    return html`
      <div class="parts">
        <div class="parts-label">Parts</div>
        <openish-table .columns=${PART_COLUMNS} .rows=${rows} caption="Body parts"></openish-table>
      </div>
    `
  }

  override render(): TemplateResult | typeof nothing {
    const body = getResolvedRef(this.requestBody) as RequestBody | undefined
    if (!body) {
      return nothing
    }

    /* A webhook's payload: the one media type the section is being read in, and no picker here. */
    if (this.examplesOnly) {
      return html`${renderMediaTypes(body.content, 'Request media types', {
        noSchema: true,
        pick: this.mediaType,
        scope: 'request',
        ...(this.variants ? { variants: this.variants } : {}),
      })}`
    }

    return html`
      ${body.description
        ? html`<openish-markdown .markdown=${body.description} .headingOffset=${2}></openish-markdown>`
        : nothing}
      ${renderMediaTypes(body.content, 'Request media types', {
        noExample: this.noExample,
        continuesList: this.continuesList,
        ...(this.noMediaTabs ? { pick: this.mediaType, hideLabel: true } : { selected: this.mediaType }),
        scope: 'request',
        ...(this.variants ? { variants: this.variants } : {}),
        onSelect: (mediaType) => {
          /*
           * Bubbles, but not composed, for the reason `<openish-tabs>` gives about its own event:
           * which media type an operation is showing is a control changing, not something the host
           * application has any business hearing.
           */
          this.dispatchEvent(
            new CustomEvent<string>('openish-media-type-change', { detail: mediaType, bubbles: true }),
          )
        },
      })}
      ${this.#renderEncoding(body.content)}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-request-body': OpenishRequestBody
  }

  /**
   * The reader picked a media type for the request, from either of the two controls that offer one.
   *
   * Declared here rather than in `events.ts` because it never leaves the operation: that file is for
   * the cross-cutting events the root re-dispatches to the host, and this is one section reconciling
   * two of its own controls. `<openish-try-it>` raises the same event from its panel's picker.
   */
  interface HTMLElementEventMap {
    'openish-media-type-change': CustomEvent<string>
  }
}

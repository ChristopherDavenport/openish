import { getResolvedRef } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { renderMediaTypes } from '../render/media-types.js'
import { baseStyles } from '../styles/shared.js'
import './openish-markdown.js'

type RequestBody = {
  description?: string
  required?: boolean
  content?: unknown
}

/**
 * An operation's request body: what to send, and in which media type.
 *
 * Whether the body is required is stated in words rather than left to the reader to infer from a
 * missing marker - it is the single most consequential fact on the page after the URL.
 */
@customElement('openish-request-body')
export class OpenishRequestBody extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      .required {
        display: inline-block;
        margin-bottom: var(--openish-space-xs);
        padding: 0 var(--openish-space-xs);
        border-radius: var(--openish-radius-pill);
        background: var(--openish-color-danger-surface);
        color: var(--openish-color-danger);
        font: var(--openish-font-micro);
      }

      .optional {
        display: inline-block;
        margin-bottom: var(--openish-space-xs);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-micro);
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

  override render(): TemplateResult | typeof nothing {
    const body = getResolvedRef(this.requestBody) as RequestBody | undefined
    if (!body) {
      return nothing
    }

    if (this.examplesOnly) {
      return html`${renderMediaTypes(body.content, 'Request media types', { noSchema: true })}`
    }

    return html`
      ${body.required
        ? html`<div class="required">Required</div>`
        : html`<div class="optional">Optional</div>`}
      ${body.description
        ? html`<openish-markdown .markdown=${body.description} .headingOffset=${2}></openish-markdown>`
        : nothing}
      ${renderMediaTypes(body.content, 'Request media types', { noExample: this.noExample })}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-request-body': OpenishRequestBody
  }
}

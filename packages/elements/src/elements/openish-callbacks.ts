import { collectParameters, getResolvedRef, HTTP_METHODS, type ParameterEntry } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { baseStyles, methodStyles } from '../styles/shared.js'
import './openish-disclosure.js'
import './openish-markdown.js'
import './openish-parameters.js'
import './openish-request-body.js'
import './openish-response-list.js'

/** One request the API will make, at one runtime expression, with one method. */
type CallbackOperation = {
  /** The key in `callbacks`, e.g. `onData`. */
  callback: string
  /** The runtime expression saying where it goes, e.g. `{$request.body#/callbackUrl}`. */
  expression: string
  method: string
  summary?: string | undefined
  description?: string | undefined
  parameters: ParameterEntry[]
  requestBody?: unknown
  responses?: unknown
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined

/**
 * Flattens `operation.callbacks` into one row per request the API will make.
 *
 * The nesting is three deep - callback name, then runtime expression, then method - and only the
 * innermost level is an operation. Flattening here rather than in the template keeps the disclosure
 * able to count what is inside it before deciding to render any of it.
 */
const flattenCallbacks = (callbacks: unknown): CallbackOperation[] => {
  const resolved = getResolvedRef(callbacks)
  if (!isPlainObject(resolved)) {
    return []
  }

  const flattened: CallbackOperation[] = []

  for (const [callback, rawCallback] of Object.entries(resolved)) {
    const expressions = getResolvedRef(rawCallback)
    if (!isPlainObject(expressions)) {
      continue
    }

    for (const [expression, rawPathItem] of Object.entries(expressions)) {
      const pathItem = getResolvedRef(rawPathItem)
      if (!isPlainObject(pathItem)) {
        continue
      }

      for (const method of HTTP_METHODS) {
        const raw = pathItem[method]
        if (raw === undefined) {
          continue
        }
        const operation = getResolvedRef(raw)
        if (!isPlainObject(operation)) {
          continue
        }

        flattened.push({
          callback,
          expression,
          method,
          summary: asText(operation['summary']),
          description: asText(operation['description']),
          parameters: collectParameters(pathItem as { parameters?: unknown }, operation as { parameters?: unknown }),
          requestBody: operation['requestBody'],
          responses: operation['responses'],
        })
      }
    }
  }

  return flattened
}

/**
 * The requests this operation will make back, behind a disclosure.
 *
 * A callback is the API calling the reader, which is the reverse of everything else on the page and
 * matters to a minority of readers on a majority of pages - so it is closed by default. That also
 * keeps it free: `<openish-disclosure>` renders nothing inside a closed region, so an operation with
 * six callbacks builds no parameter tables until somebody asks for them.
 *
 * The body is the same three elements the operation itself uses, because a callback *is* an
 * operation - the only thing new here is the two levels of key above it.
 */
@customElement('openish-callbacks')
export class OpenishCallbacks extends LitElement {
  static override styles = [
    baseStyles,
    methodStyles,
    css`
      :host {
        display: block;
      }

      .callback {
        margin-top: var(--openish-space-lg);
      }

      .callback:first-of-type {
        margin-top: var(--openish-space-2xs);
      }

      h3 {
        font: var(--openish-font-heading-3);
        margin: 0 0 var(--openish-space-3xs);
      }

      .expression {
        font-family: var(--openish-font-family-mono);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
        word-break: break-all;
        margin-bottom: var(--openish-space-2xs);
      }

      .head {
        display: flex;
        align-items: baseline;
        gap: var(--openish-space-xs);
        flex-wrap: wrap;
      }

      h4 {
        font: var(--openish-font-heading-4);
        margin: var(--openish-space-md) 0 var(--openish-space-2xs);
      }
    `,
  ]

  /** An operation's `callbacks` map, unresolved. */
  @property({ attribute: false })
  callbacks: unknown = undefined

  /** Whether the reader has opened it. Closed until then, so nothing inside is built. */
  @state()
  private open = false

  #renderOperation(operation: CallbackOperation): TemplateResult {
    return html`
      <div class="head">
        <span class="method" data-method=${operation.method}>${operation.method}</span>
        ${operation.summary ? html`<span>${operation.summary}</span>` : nothing}
      </div>
      ${operation.description
        ? html`<openish-markdown .markdown=${operation.description} .headingOffset=${3}></openish-markdown>`
        : nothing}
      ${operation.parameters.length > 0
        ? html`<openish-parameters .parameters=${operation.parameters}></openish-parameters>`
        : nothing}
      ${operation.requestBody
        ? html`
            <h4>Request body</h4>
            <openish-request-body .requestBody=${operation.requestBody}></openish-request-body>
          `
        : nothing}
      ${operation.responses
        ? html`
            <h4>Responses</h4>
            <openish-response-list .responses=${operation.responses}></openish-response-list>
          `
        : nothing}
    `
  }

  override render(): TemplateResult | typeof nothing {
    const operations = flattenCallbacks(this.callbacks)
    if (operations.length === 0) {
      return nothing
    }

    return html`
      <openish-disclosure
        summary="Callbacks"
        hint=${`${operations.length}`}
        .open=${this.open}
        @openish-toggle=${(event: CustomEvent<boolean>) => {
          this.open = event.detail
        }}
      >
        ${this.open
          ? repeat(
              operations,
              (operation) => `${operation.callback}:${operation.expression}:${operation.method}`,
              (operation) => html`
                <div class="callback">
                  <h3>${operation.callback}</h3>
                  <div class="expression">${operation.expression}</div>
                  ${this.#renderOperation(operation)}
                </div>
              `,
            )
          : nothing}
      </openish-disclosure>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-callbacks': OpenishCallbacks
  }
}

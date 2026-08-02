import { groupParameters, schemaTypeLabel, type ParameterEntry, type ParameterLocation } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { baseStyles, controlStyles, rowStyles } from '../styles/shared.js'

const HEADINGS: Record<ParameterLocation, string> = {
  path: 'Path',
  query: 'Query',
  header: 'Headers',
  cookie: 'Cookies',
}

/** A value the reader typed, keyed the way `collectParameters` keys a parameter. */
export type ParameterChange = { key: string; value: string }

/**
 * How tall to make the body editor, in rows.
 *
 * The editor arrives seeded with a generated example, so a fixed height shows the reader the first
 * few lines of a body they were given rather than the body itself. Sized to the content instead,
 * with a floor so an empty editor still looks like one and a ceiling so a large example does not
 * push Send off the screen - past that the editor scrolls, and the drag handle is still there.
 */
const bodyRows = (body: string): number => Math.min(20, Math.max(6, body.split('\n').length))

/**
 * The inputs an operation takes, as one table of names and values.
 *
 * Grouped by `in` in the same order as `<openish-parameters>` documents them, so the form and the
 * table read as the same list rather than two lists that happen to agree.
 *
 * Values are keyed `"{in}:{name}"` - the key `collectParameters` merges on - which is what lets a
 * field, a table row, and the request builder identify a parameter identically with nothing keeping
 * them in step.
 *
 * @fires openish-parameter-input - A field changed. Bubbles within the operation panel, not beyond.
 * @fires openish-body-input - The body or its media type changed.
 */
@customElement('openish-request-form')
export class OpenishRequestForm extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
    rowStyles,
    css`
      :host {
        display: block;
      }

      /* The editor spans the whole width: a body has no name to put in a key cell. */
      textarea {
        display: block;
        width: 100%;
        padding: var(--openish-space-xs);
        border: 0;
        background: none;
        color: var(--openish-color-text);
        font: var(--openish-font-code-small);
        resize: vertical;
        /* Fills the panel's last band edge to edge, like the cell inputs above it. */
        --openish-focus-ring-offset: calc(-1 * var(--openish-focus-ring-width));
      }

      .body {
        border-top: 1px solid var(--openish-color-border);
      }

      /* Sits in the group bar beside the word "Body", the way a media type is a fact about it. */
      .group select {
        padding: 0 var(--openish-space-3xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        text-transform: none;
      }

    `,
  ]

  /** Already merged: the path item's parameters plus the operation's. */
  @property({ attribute: false })
  parameters: readonly ParameterEntry[] = []

  /** Current values, keyed `"{in}:{name}"`. */
  @property({ attribute: false })
  values: Readonly<Record<string, string>> = {}

  /** The media types the request body declares, in document order. */
  @property({ attribute: false })
  mediaTypes: readonly string[] = []

  @property({ type: String })
  mediaType = ''

  @property({ type: String })
  body = ''

  #emitParameter(key: string, value: string): void {
    this.dispatchEvent(new CustomEvent<ParameterChange>('openish-parameter-input', { detail: { key, value }, bubbles: true }))
  }

  #emitBody(body: string, mediaType: string): void {
    this.dispatchEvent(
      new CustomEvent<{ body: string; mediaType: string }>('openish-body-input', {
        detail: { body, mediaType },
        bubbles: true,
      }),
    )
  }

  #renderField(parameter: ParameterEntry): TemplateResult {
    const key = `${parameter.in}:${parameter.name}`
    const required = parameter.required === true || parameter.in === 'path'
    const id = `field-${key.replace(/[^a-zA-Z0-9]/g, '-')}`

    return html`
      <div class="row">
        <label class="key" for=${id}>
          ${parameter.name}${required ? html`<span class="required" aria-hidden="true">*</span>` : nothing}
        </label>
        <div class="value">
          <input
            id=${id}
            type="text"
            ?required=${required}
            placeholder=${schemaTypeLabel(parameter.schema)}
            .value=${this.values[key] ?? ''}
            @input=${(event: Event) => this.#emitParameter(key, (event.target as HTMLInputElement).value)}
          />
        </div>
        ${parameter.in === 'cookie'
          ? html`<p class="note">A browser will not let a page set this header; it is shown in the sample only.</p>`
          : nothing}
      </div>
    `
  }

  /**
   * The body, and which media type it is.
   *
   * The media type is a `<select>` in the group bar rather than a tab set, and not only for looks:
   * `<openish-tabs>` renders its panel into its own shadow root, so a textarea inside one is out of
   * reach of this element's styles and comes out at the browser's default two rows by twenty
   * columns. A picker beside a field is also what a form does - tabs are for reading alternatives,
   * not for choosing what to send.
   */
  #renderBody(): TemplateResult | typeof nothing {
    if (this.mediaTypes.length === 0) {
      return nothing
    }

    return html`
      <div class="group">
        <span>Body</span>
        ${this.mediaTypes.length === 1
          ? html`<span>${this.mediaType}</span>`
          : html`
              <select
                aria-label="Request media type"
                @change=${(event: Event) => this.#emitBody(this.body, (event.target as HTMLSelectElement).value)}
              >
                ${this.mediaTypes.map(
                  (mediaType) => html`
                    <option value=${mediaType} ?selected=${mediaType === this.mediaType}>${mediaType}</option>
                  `,
                )}
              </select>
            `}
      </div>
      <div class="body">
        <textarea
          id="request-body"
          aria-label="Request body"
          rows=${bodyRows(this.body)}
          spellcheck="false"
          .value=${this.body}
          @input=${(event: Event) => this.#emitBody((event.target as HTMLTextAreaElement).value, this.mediaType)}
        ></textarea>
      </div>
    `
  }

  override render(): TemplateResult | typeof nothing {
    const groups = groupParameters(this.parameters)
    if (groups.length === 0 && this.mediaTypes.length === 0) {
      return nothing
    }

    return html`
      <div class="rows">
        ${repeat(
          groups,
          ([location]) => location,
          ([location, parameters]) => html`
            <div class="group">${HEADINGS[location]}</div>
            ${repeat(parameters, (parameter) => parameter.name, (parameter) => this.#renderField(parameter))}
          `,
        )}
        ${this.#renderBody()}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-request-form': OpenishRequestForm
  }

  interface HTMLElementEventMap {
    'openish-parameter-input': CustomEvent<ParameterChange>
    'openish-body-input': CustomEvent<{ body: string; mediaType: string }>
  }
}

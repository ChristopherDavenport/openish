import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { repeat } from 'lit/directives/repeat.js'

import { baseStyles, visuallyHidden } from '../styles/shared.js'

export type OpenishTableRow = {
  /** Stable row identity. Rows are rendered keyed, so a changed list moves DOM instead of rewriting it. */
  key: string
  /** One entry per column. The first becomes the row header. */
  cells: readonly unknown[]
}

/**
 * A data table.
 *
 * A real `<table>`, because a grid of divs tells a screen reader nothing about which header a cell
 * belongs to. The first cell of each row is a `<th scope="row">` - in this project that column is
 * always the name of the thing, which is what makes the rest of the row meaningful.
 *
 * The table is wrapped in its own scroll container so a wide row scrolls sideways on its own
 * instead of forcing the whole page to. The wrapper is focusable and labelled when it scrolls,
 * which is what lets a keyboard user reach content that is off to the right.
 */
@customElement('openish-table')
export class OpenishTable extends LitElement {
  static override styles = [
    baseStyles,
    visuallyHidden,
    css`
      :host {
        display: block;
      }

      .scroll {
        overflow-x: auto;
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-lg);
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font: var(--openish-font-small);
      }

      th,
      td {
        padding: var(--openish-space-xs) var(--openish-space-sm);
        text-align: left;
        vertical-align: top;
        border-bottom: 1px solid var(--openish-color-border);
      }

      tbody tr:last-child th,
      tbody tr:last-child td {
        border-bottom: 0;
      }

      thead th {
        font: var(--openish-font-micro);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--openish-color-text-muted);
        background: var(--openish-color-surface-muted);
        white-space: nowrap;
      }

      tbody th {
        font: var(--openish-font-body-bold);
        font-family: var(--openish-font-family-mono);
        white-space: nowrap;
      }
    `,
  ]

  /** Column headings, in order. The first column is the row header. */
  @property({ attribute: false })
  columns: readonly string[] = []

  /** Rows, keyed. A cell may be a string or a template. */
  @property({ attribute: false })
  rows: readonly OpenishTableRow[] = []

  /**
   * The table's accessible name, e.g. "Query parameters".
   *
   * Rendered as a `<caption>` rather than an `aria-label`, so it is announced when a screen-reader
   * user enters the table and is available to a magnifier user too.
   */
  @property({ type: String })
  caption = ''

  /** Show the caption. Off by default: the caller usually renders a heading above the table. */
  @property({ type: Boolean, attribute: 'caption-visible' })
  captionVisible = false

  override render(): TemplateResult | typeof nothing {
    if (this.rows.length === 0) {
      return nothing
    }

    return html`
      <div class="scroll" tabindex="0" role="group" aria-label=${ifDefined(this.caption || undefined)}>
        <table>
          ${this.caption
            ? html`<caption class=${classMap({ 'visually-hidden': !this.captionVisible })}>
                ${this.caption}
              </caption>`
            : nothing}
          <thead>
            <tr>
              ${this.columns.map((column) => html`<th scope="col">${column}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${repeat(
              this.rows,
              (row) => row.key,
              (row) => html`
                <tr>
                  ${row.cells.map((cell, index) =>
                    index === 0 ? html`<th scope="row">${cell}</th>` : html`<td>${cell}</td>`,
                  )}
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-table': OpenishTable
  }
}

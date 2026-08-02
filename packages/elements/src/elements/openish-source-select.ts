import { consume } from '@lit/context'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { sourcesContext, type OpenishSourcesState } from '../context/contexts.js'
import { dispatch } from '../events.js'
import { baseStyles, controlStyles, visuallyHidden } from '../styles/shared.js'

/**
 * The document picker, for a reference configured with several `sources`.
 *
 * A native `<select>`, for the same reason `<openish-search>` is a native `<dialog>`: the platform
 * already gives a labelled listbox that opens on click, filters on type-ahead, works with a screen
 * reader, and behaves like the operating system's own control on a phone. A custom listbox is more
 * code and a worse version of all four.
 *
 * It decides nothing. Picking dispatches `openish-source-change` and the root answers by navigating
 * to that document's overview - so what is on screen is decided by the URL, which is the same thing
 * that decides it after a reload.
 *
 * Renders nothing at all with fewer than two documents. A reference showing one document should not
 * grow a control for choosing it, and the single-`url` case synthesises exactly one source.
 *
 * @fires openish-source-change - The reader picked a different document. Carries its slug.
 */
@customElement('openish-source-select')
export class OpenishSourceSelect extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
    visuallyHidden,
    css`
      :host {
        display: block;
      }

      .row {
        display: flex;
        align-items: baseline;
        gap: var(--openish-space-xs);
      }

      label {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      select {
        flex: 1;
        min-width: 0;
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-small);
      }

    `,
  ]

  /** Every document on offer, and which of them are loaded. Provided through context. */
  @consume({ context: sourcesContext, subscribe: true })
  sources: OpenishSourcesState | undefined

  override render(): TemplateResult | typeof nothing {
    const state = this.sources
    if (!state || state.sources.length < 2) {
      return nothing
    }

    return html`
      <div class="row" part="source-select">
        <label for="source">API</label>
        <select
          id="source"
          @change=${(event: Event) =>
            dispatch(this, 'openish-source-change', (event.target as HTMLSelectElement).value)}
        >
          ${repeat(
            state.sources,
            (source) => source.slug,
            (source) => html`
              <option value=${source.slug} ?selected=${source.slug === state.activeSlug}>
                ${source.title}
              </option>
            `,
          )}
        </select>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-source-select': OpenishSourceSelect
  }
}

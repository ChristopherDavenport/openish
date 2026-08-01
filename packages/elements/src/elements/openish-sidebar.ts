import { consume } from '@lit/context'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import type { DocumentStore } from '@openish/core'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { baseStyles } from '../styles/shared.js'
import './openish-search.js'
import './openish-sidebar-item.js'

/**
 * The navigation tree.
 *
 * Reads the document and the presentation state from context, including which node the URL points
 * at. Nothing is threaded through as a property: the tree is recursive, and passing four values
 * down every level would make each item's contract about its ancestors rather than about itself.
 */
@customElement('openish-sidebar')
export class OpenishSidebar extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
        height: 100%;
        overflow-y: auto;
        padding: var(--openish-space-md) var(--openish-space-sm);
        background: var(--openish-color-surface);
        border-right: 1px solid var(--openish-color-border);
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .empty {
        padding: var(--openish-space-md);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
      }

      openish-search {
        margin-bottom: var(--openish-space-md);
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  override render(): TemplateResult | typeof nothing {
    const nodes = this.store?.navigation
    if (!nodes) {
      return nothing
    }

    if (nodes.length === 0) {
      return html`<p class="empty">This document has no operations, models, or webhooks.</p>`
    }

    return html`
      ${this.ui?.config.hideSearch ? nothing : html`<openish-search></openish-search>`}
      <nav aria-label="API reference">
        <ul>
          ${nodes.map(
            (node) => html`
              <li><openish-sidebar-item .node=${node}></openish-sidebar-item></li>
            `,
          )}
        </ul>
      </nav>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-sidebar': OpenishSidebar
  }
}

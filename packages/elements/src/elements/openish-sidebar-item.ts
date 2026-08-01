import { consume } from '@lit/context'
import { LitElement, html, nothing, css, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { repeat } from 'lit/directives/repeat.js'
import type { NavNode } from '@openish/core'

import { uiContext, type OpenishUiState } from '../context/contexts.js'
import { hrefFor, isAncestorId } from '../router/urls.js'
import { baseStyles, methodStyles } from '../styles/shared.js'

/**
 * One row of the navigation tree, plus its children.
 *
 * Built from `<a>` and `<ul>` rather than `<jh-list-item>`: the router intercepts anchor clicks (it
 * reads `composedPath()`, so a shadow root is no obstacle), and jh-list-item has no `href`, so it
 * would render a div that only looks like a link - no middle-click, no "open in new tab", nothing
 * for a screen reader to announce as a link. The JH tokens still do the styling.
 */
@customElement('openish-sidebar-item')
export class OpenishSidebarItem extends LitElement {
  static override styles = [
    baseStyles,
    methodStyles,
    css`
      :host {
        display: block;
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--openish-space-2xs);
      }

      .link {
        display: flex;
        flex: 1;
        min-width: 0;
        align-items: center;
        gap: var(--openish-space-2xs);
        padding: var(--openish-space-2xs) var(--openish-space-xs);
        border-radius: var(--openish-radius-md);
        color: var(--openish-color-text);
        text-decoration: none;
      }

      .link:hover {
        background: var(--openish-color-surface-hover);
        color: var(--openish-color-text);
        text-decoration: none;
      }

      .link.active {
        background: var(--openish-color-surface-selected);
        color: var(--openish-color-accent);
        font: var(--openish-font-body-bold);
      }

      /*
       * min-width: 0 is what lets the label actually shrink. A flex item's floor is its min-content
       * width, so without it a long operation title widens the row past the sidebar instead of
       * ellipsising - which is also what made an accessibility audit report the method chip beside
       * it as "partially obscured".
       */
      .label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .label.deprecated {
        text-decoration: line-through;
        color: var(--openish-color-text-muted);
      }

      .operation-id {
        margin-left: auto;
        padding-left: var(--openish-space-2xs);
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
      }

      /* A disclosure button, not a link: it changes nothing about the current location. */
      .toggle {
        flex: none;
        width: 1.25rem;
        height: 1.25rem;
        padding: 0;
        border: 0;
        background: none;
        color: var(--openish-color-text-muted);
        cursor: pointer;
        line-height: 1;
      }

      .toggle svg {
        display: block;
        width: 100%;
        height: 100%;
        transition: transform 120ms ease;
      }

      .toggle[aria-expanded='true'] svg {
        transform: rotate(90deg);
      }

      @media (prefers-reduced-motion: reduce) {
        .toggle svg {
          transition: none;
        }
      }

      .spacer {
        flex: none;
        width: 1.25rem;
      }

      ul {
        margin: 0;
        padding: 0 0 0 var(--openish-space-sm);
        list-style: none;
      }
    `,
  ]

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** The node this row names. Its children render as nested rows. */
  @property({ attribute: false })
  node!: NavNode

  /**
   * Expansion the reader has toggled. `undefined` means "not touched", in which case the section
   * follows the active route - so navigating to an operation opens its tag without overriding a
   * reader who deliberately collapsed something.
   */
  @state()
  private expandedByUser: boolean | undefined = undefined

  get #children(): NavNode[] {
    return 'children' in this.node && this.node.children ? this.node.children : []
  }

  get #isExpanded(): boolean {
    return this.expandedByUser ?? isAncestorId(this.node.id, this.ui?.activeId ?? '')
  }

  #renderToggle(): TemplateResult {
    if (this.#children.length === 0) {
      return html`<span class="spacer"></span>`
    }

    const expanded = this.#isExpanded
    return html`
      <button
        type="button"
        class="toggle"
        aria-expanded=${expanded}
        aria-label=${expanded ? `Collapse ${this.node.title}` : `Expand ${this.node.title}`}
        @click=${() => {
          this.expandedByUser = !expanded
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <path d="M6 3.5 10.5 8 6 12.5V3.5Z" />
        </svg>
      </button>
    `
  }

  #renderLabel(): TemplateResult {
    const node = this.node
    const deprecated = node.type === 'operation' && node.deprecated === true

    return html`
      ${node.type === 'operation' || node.type === 'webhook'
        ? html`<span class="method" data-method=${node.method}>${node.method}</span>`
        : nothing}
      <span class=${classMap({ label: true, deprecated })} title=${node.title}>${node.title}</span>
      ${this.ui?.config.showOperationId && node.type === 'operation' && node.operationId
        ? html`<code class="operation-id">${node.operationId}</code>`
        : nothing}
    `
  }

  override render(): TemplateResult {
    const active = this.node.id === this.ui?.activeId
    const children = this.#children

    return html`
      <div class="row">
        ${this.#renderToggle()}
        <a
          class=${classMap({ link: true, active })}
          href=${hrefFor(this.node, this.ui?.basePath ?? '')}
          aria-current=${ifDefined(active ? 'page' : undefined)}
        >
          ${this.#renderLabel()}
        </a>
      </div>
      ${children.length > 0 && this.#isExpanded
        ? html`
            <ul>
              ${repeat(
                children,
                (child) => child.id,
                (child) => html`<li><openish-sidebar-item .node=${child}></openish-sidebar-item></li>`,
              )}
            </ul>
          `
        : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-sidebar-item': OpenishSidebarItem
  }
}

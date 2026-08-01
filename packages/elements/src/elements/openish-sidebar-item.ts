import { consume } from '@lit/context'
import { LitElement, html, nothing, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import type { NavNode } from '@openish/core'

import { uiContext, type OpenishUiState } from '../context/contexts.js'
import { dispatch } from '../events.js'
import { hrefFor } from '../router/urls.js'
import { baseStyles, methodStyles } from '../styles/shared.js'

/**
 * One row of the navigation tree.
 *
 * One row, and nothing below it: the tree is flattened into a list by `<openish-sidebar>` and
 * rendered through a virtualiser, so an item can no longer contain its own descendants. What that
 * costs is the nested `<ul>` markup; what it buys is a sidebar whose cost is the size of the
 * viewport rather than the size of the document. A flat list of six hundred models used to be six
 * hundred elements the moment the section opened.
 *
 * Depth is `aria-level` on the row rather than nesting, which is the ARIA tree pattern and is how a
 * screen reader is told about a hierarchy the DOM no longer shows. Expansion is not held here
 * either - a virtualiser recycles rows, so state living in one would follow the wrong node the
 * moment the list scrolled. It goes up as `openish-sidebar-toggle` and comes back as a property.
 *
 * Built from `<a>` rather than a div with a click handler: real anchors give middle-click, "open in
 * new tab", and something for a screen reader to announce as a link.
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
    `,
  ]

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** The node this row names. */
  @property({ attribute: false })
  node!: NavNode

  /** How deep the row sits, 1-based. Rendered as indentation and as `aria-level`. */
  @property({ type: Number })
  level = 1

  /** Whether this node has anything under it, which decides between a toggle and a spacer. */
  @property({ type: Boolean, attribute: 'has-children' })
  hasChildren = false

  /** Whether it is currently open. Decided by `<openish-sidebar>`, never here. */
  @property({ type: Boolean })
  expanded = false

  #renderToggle(): TemplateResult {
    if (!this.hasChildren) {
      return html`<span class="spacer"></span>`
    }

    return html`
      <button
        type="button"
        class="toggle"
        tabindex="-1"
        aria-expanded=${this.expanded}
        aria-label=${this.expanded ? `Collapse ${this.node.title}` : `Expand ${this.node.title}`}
        @click=${this.#onToggle}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <path d="M6 3.5 10.5 8 6 12.5V3.5Z" />
        </svg>
      </button>
    `
  }

  /*
   * The click must not also reach the sidebar's own handler, which would treat it as picking the
   * row. Opening a tag and navigating to it are different intentions, and the toggle is the one
   * control that says so.
   */
  readonly #onToggle = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    dispatch(this, 'openish-sidebar-toggle', { id: this.node.id, expanded: !this.expanded })
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

    /*
     * Indentation is inline rather than a class, because depth is unbounded - a document can nest a
     * group inside a group - and a stylesheet cannot have a rule per level.
     */
    return html`
      <div class="row" style="padding-left: calc(${this.level - 1} * var(--openish-space-sm))">
        ${this.#renderToggle()}
        <a
          class=${classMap({ link: true, active })}
          href=${hrefFor(this.node, this.ui)}
          tabindex="-1"
          aria-current=${ifDefined(active ? 'page' : undefined)}
        >
          ${this.#renderLabel()}
        </a>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-sidebar-item': OpenishSidebarItem
  }
}

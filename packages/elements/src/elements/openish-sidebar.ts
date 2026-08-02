import { consume } from '@lit/context'
import '@lit-labs/virtualizer'
import type { LitVirtualizer } from '@lit-labs/virtualizer/LitVirtualizer.js'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { DocumentStore } from '@openish/core'

import {
  documentContext,
  sourcesContext,
  uiContext,
  type OpenishSourcesState,
  type OpenishUiState,
} from '../context/contexts.js'
import { navRows, type Expansion, type NavRow } from '../navigation/rows.js'
import { baseStyles } from '../styles/shared.js'
import './openish-search.js'
import './openish-sidebar-item.js'
import './openish-source-select.js'

/**
 * The navigation tree, rendered as a virtualised list.
 *
 * The tree is flattened to the rows that are currently visible and handed to `<lit-virtualizer>`,
 * which renders the window on screen and nothing else. Collapsing already kept the tree cheap - a
 * closed branch was never walked - but one *expanded* section could not be: a document with six
 * hundred models put six hundred rows in the DOM the moment the reader opened Models, and the
 * document this project is tested against has exactly that.
 *
 * Flattening moves two things up here from the item:
 *
 * - **Expansion state.** A virtualiser recycles row elements, so state held in one would follow
 *   whichever node scrolled into it. The map lives here and rows receive `expanded` as a property.
 * - **Keyboard navigation.** Nested `<ul>`s of links were navigable with Tab alone. A flat list of
 *   several hundred is not - Tab through six hundred models to reach the footer is not navigation -
 *   so this is a real ARIA `tree` now: one tab stop, arrows to move, Right/Left to open and close.
 */
@customElement('openish-sidebar')
export class OpenishSidebar extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        padding: var(--openish-space-md) var(--openish-space-sm);
        background: var(--openish-color-surface);
        border-right: 1px solid var(--openish-color-border);
      }

      /*
       * The virtualiser scrolls, not the host. It has to own a scroller to know which rows are on
       * screen, and leaving the overflow on the host would have it measuring a container it does
       * not control.
       */
      nav {
        flex: 1;
        min-height: 0;
      }

      lit-virtualizer {
        height: 100%;
      }

      /*
       * The virtualiser positions every row absolutely, and an absolutely positioned block with no
       * width is shrink-to-fit - so each row was only as wide as its own text. The active row's
       * highlight then ended wherever its title did, which made a list of rows look ragged, and a
       * title longer than the sidebar overflowed to the right instead of ellipsising, because there
       * was no width for the label's min-width: 0 to shrink against.
       *
       * Rows are a layout decision of the list, not of the item, so the width belongs here.
       */
      lit-virtualizer > [role='treeitem'] {
        width: 100%;
        box-sizing: border-box;
      }

      /*
       * The keyboard cursor.
       *
       * A tree with aria-activedescendant moves a cursor that the DOM's own focus never leaves the
       * scroller to follow, so nothing draws it unless something here does - and for a long time
       * nothing did: arrowing down six hundred rows moved an invisible position while the only ring
       * on screen was the one around the whole list, which says "you are in the sidebar" and not one
       * thing about where in it.
       *
       * That ring stays - the scroller is the tab stop, and a reader who has just pressed Tab needs
       * to know they landed here before they press an arrow. This is the second half of the answer:
       * the same ring again, on the row the arrows are on, offset inwards because a row is flush with
       * the scroller's edges. The two say different things and both are worth saying.
       *
       * Scoped to :focus-visible on the scroller because a cursor is only meaningful while the tree
       * is the thing being driven - aria-activedescendant is set at all times, since a tree always
       * has a current row, so an unscoped rule would mark row zero permanently.
       *
       * Distinct again from .link.active inside the item, which is a third fact: that one is the page
       * the reader is on, and it stays put while the cursor moves over it and away.
       */
      lit-virtualizer:focus-visible > [role='treeitem'][data-current] {
        outline: var(--openish-focus-ring-width) var(--openish-focus-ring-style)
          var(--openish-focus-ring-color);
        outline-offset: calc(-1 * var(--openish-focus-ring-width));
        border-radius: var(--openish-radius-md);
      }

      @media (forced-colors: active) {
        lit-virtualizer:focus-visible > [role='treeitem'][data-current] {
          outline-color: Highlight;
        }
      }

      .empty {
        padding: var(--openish-space-md);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
      }

      openish-search {
        flex: none;
        margin-bottom: var(--openish-space-md);
      }

      openish-source-select {
        flex: none;
        margin-bottom: var(--openish-space-sm);
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** Every document on offer, so the picker appears only when there is a choice to make. */
  @consume({ context: sourcesContext, subscribe: true })
  sources: OpenishSourcesState | undefined

  /**
   * What the reader has opened or closed. Absent means undecided, in which case the row follows the
   * active route - so navigating to an operation opens its tag without overriding someone who
   * deliberately collapsed it.
   */
  @state()
  private expansion: Expansion = new Map()

  /** The row the arrow keys are on. An index, because the list is what the reader is moving through. */
  @state()
  private focused = 0

  get #rows(): NavRow[] {
    const activeId = this.ui?.activeId ?? ''

    return navRows(this.store?.navigation ?? [], this.expansion, activeId, {
      ...(this.ui?.config.defaultOpenAllTags ? { openAll: true } : {}),
      ...(this.ui?.config.defaultOpenFirstTag ? { openFirstTag: true } : {}),
      /* The overview is the document's own slug, or nothing at all before a store has arrived. */
      atOverview: activeId === '' || activeId === this.store?.source.slug,
    })
  }

  #setExpanded(id: string, expanded: boolean): void {
    const next = new Map(this.expansion)
    next.set(id, expanded)
    this.expansion = next
  }

  readonly #onToggle = (event: CustomEvent<{ id: string; expanded: boolean }>): void => {
    event.stopPropagation()
    this.#setExpanded(event.detail.id, event.detail.expanded)
  }

  /**
   * Arrow-key navigation over the flattened tree.
   *
   * The pattern is the one ARIA specifies for a tree: Down and Up move a row at a time through what
   * is *visible*, Right opens a closed branch and then steps into it, Left closes an open one and
   * otherwise steps out to the parent. Enter follows the row, which is what a link does anyway.
   */
  readonly #onKeydown = (event: KeyboardEvent): void => {
    const rows = this.#rows
    if (rows.length === 0) {
      return
    }

    const index = Math.min(this.focused, rows.length - 1)
    const row = rows[index]!

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this.#focus(Math.min(index + 1, rows.length - 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        this.#focus(Math.max(index - 1, 0))
        return
      case 'Home':
        event.preventDefault()
        this.#focus(0)
        return
      case 'End':
        event.preventDefault()
        this.#focus(rows.length - 1)
        return
      case 'ArrowRight':
        event.preventDefault()
        if (row.hasChildren && !row.expanded) {
          this.#setExpanded(row.node.id, true)
        } else if (row.hasChildren) {
          this.#focus(index + 1)
        }
        return
      case 'ArrowLeft': {
        event.preventDefault()
        if (row.hasChildren && row.expanded) {
          this.#setExpanded(row.node.id, false)
          return
        }
        /* Step out: the nearest row above that is one level shallower is the parent. */
        for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
          if (rows[candidate]!.level < row.level) {
            this.#focus(candidate)
            return
          }
        }
        return
      }
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const anchor = this.#anchorAt(index)
        anchor?.click()
        return
      }
      default:
    }
  }

  /**
   * Bring the cursor into view when the tree is entered.
   *
   * Tab lands on the scroller wherever it happens to be scrolled to, and the current row - row 0
   * until an arrow key says otherwise - may be far above it. Without this the ring exists and cannot
   * be seen, which is the same problem as not drawing it.
   */
  readonly #onFocus = (): void => {
    void this.#focus(this.focused)
  }

  async #focus(index: number): Promise<void> {
    this.focused = index
    await this.updateComplete
    /* A row outside the rendered window has no element yet; the virtualiser has to bring it in. */
    this.#virtualizer?.element(index)?.scrollIntoView({ block: 'nearest' })
  }

  get #virtualizer(): LitVirtualizer<NavRow> | null {
    /*
     * `querySelector` resolves `lit-virtualizer` through `HTMLElementTagNameMap`, where the element
     * is registered with its default `unknown` item type. The cast names the type this sidebar
     * actually gave it.
     */
    return this.renderRoot.querySelector('lit-virtualizer') as LitVirtualizer<NavRow> | null
  }

  /**
   * The link in a row, if that row is currently rendered.
   *
   * Looked up by the row's own id rather than through `virtualizer.element(index)`, which hands back
   * a proxy that can scroll and focus but is not the element and has no shadow root to reach into.
   */
  #anchorAt(index: number): HTMLAnchorElement | undefined {
    const row = this.renderRoot.querySelector(`#row-${index}`)
    return row?.querySelector('openish-sidebar-item')?.shadowRoot?.querySelector('a') ?? undefined
  }

  /**
   * The document picker, above search, when there is more than one document.
   *
   * Rendered before the two early returns below on purpose: a document that failed to load, or that
   * has nothing in it, is exactly when a reader most needs the way back to the other ones.
   */
  #renderPicker(): TemplateResult | typeof nothing {
    return (this.sources?.sources.length ?? 0) > 1
      ? html`<openish-source-select part="source" exportparts="source-select"></openish-source-select>`
      : nothing
  }

  override render(): TemplateResult | typeof nothing {
    const picker = this.#renderPicker()
    const nodes = this.store?.navigation
    if (!nodes) {
      return picker === nothing ? nothing : html`${picker}`
    }

    if (nodes.length === 0) {
      return html`${picker}<p class="empty">This document has no operations, models, or webhooks.</p>`
    }

    const rows = this.#rows
    const focused = Math.min(this.focused, rows.length - 1)

    return html`
      ${picker}
      ${this.ui?.config.hideSearch ? nothing : html`<openish-search part="search" exportparts="dialog"></openish-search>`}
      <nav aria-label="API reference" @openish-sidebar-toggle=${this.#onToggle}>
        <lit-virtualizer
          scroller
          part="tree"
          role="tree"
          tabindex="0"
          aria-label="API reference"
          aria-activedescendant=${rows[focused] ? `row-${focused}` : nothing}
          @keydown=${this.#onKeydown}
          @focus=${this.#onFocus}
          .items=${rows}
          .keyFunction=${(row: NavRow) => row.node.id}
          .renderItem=${(row: NavRow, index: number) => html`
            <div
              id=${`row-${index}`}
              role="treeitem"
              ?data-current=${index === focused}
              aria-level=${row.level}
              aria-posinset=${row.position}
              aria-setsize=${row.setSize}
              aria-selected=${row.node.id === this.ui?.activeId}
              aria-expanded=${row.hasChildren ? String(row.expanded) : nothing}
            >
              <openish-sidebar-item
                .node=${row.node}
                .level=${row.level}
                ?has-children=${row.hasChildren}
                .expanded=${row.expanded}
              ></openish-sidebar-item>
            </div>
          `}
        ></lit-virtualizer>
      </nav>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-sidebar': OpenishSidebar
  }
}

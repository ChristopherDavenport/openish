import { consume } from '@lit/context'
import type { NavNode } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { repeat } from 'lit/directives/repeat.js'

import { uiContext, type OpenishUiState } from '../context/contexts.js'
import { hrefFor } from '../router/urls.js'
import { baseStyles, controlStyles, methodStyles } from '../styles/shared.js'

/**
 * A list of links to sections, built to the design system's list item.
 *
 * `jh-list-item`'s anatomy, expressed in openish's own hooks rather than by importing the component -
 * the binding M16 settled on for every other control. A row is the leading slot (the method chip),
 * the primary text (what the thing is called), and the primary metadata (its route), with the
 * divider between rows that the system uses instead of a gap or a radius.
 *
 * An element of its own because a tab panel is rendered inside `<openish-tabs>`'s shadow root, where
 * this element's styles do not reach. Which is the rule rather than the exception here: everything
 * that goes through a `content` callback arrives as a component, or it arrives unstyled.
 */
@customElement('openish-section-list')
export class OpenishSectionList extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
    methodStyles,
    css`
      /*
       * The list is bounded, and scrolls inside itself once it is.
       *
       * Without this the Models dictionary is a section thirty-four thousand pixels tall - six
       * hundred and eleven rows in a column beside a heading and nothing else - and the reader who
       * scrolls past that heading scrolls all of it before reaching the first model. Which is the
       * wall M17 took the inline index down to remove, rebuilt one column over.
       *
       * A cap in rem as well as in viewport heights, so an embedded reference in a short box gets a
       * list proportional to what it has rather than one taller than itself. Short lists never reach
       * it: a tag with six operations is six operations tall.
       *
       * The contained overscroll keeps the scroll here. Reaching the end of a list and having the
       * whole plane start moving is how a reader loses their place in a document this long.
       */
      :host {
        display: block;
        max-block-size: min(70vh, 40rem);
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      /*
       * A list item, to the design system's anatomy.
       *
       * Vertical rhythm is JH's own - jh-space-400 above and below, which openish binds as space-md.
       * The horizontal padding is the one place this departs from the defaults, and it departs the
       * way the system intends: jh-list-item-space-padding-left and -right are style hooks precisely
       * because a container decides its own inset, and 24px each side inside a column that is
       * already the narrow half of the page would leave the route nowhere to go.
       *
       * The selected edge is reserved on every row rather than added to one, so moving between
       * sections does not shift every label two pixels sideways. Same rule as the sidebar's.
       */
      .item {
        display: flex;
        align-items: center;
        gap: var(--openish-space-xs);
        padding: var(--openish-space-md) var(--openish-space-sm);
        border-inline-start: var(--openish-border-selected-width) solid transparent;
        color: var(--openish-color-text);
        text-decoration: none;
      }

      /* A row is not prose: the link colour and the underline are both reset, as in the sidebar. */
      .item:hover {
        color: var(--openish-color-text);
        text-decoration: none;
      }

      /*
       * The divider, which is what separates one item from the next in this system - not a gap and
       * not a radius. It goes between rows and never below the last, so the list ends where the
       * column does.
       */
      li + li .item {
        border-top: var(--openish-border-decorative-width) solid var(--openish-color-border);
      }

      /*
       * The section the reader is on, if it happens to be one of these: a fill and an edge, the same
       * two signals the sidebar row carries, because it is the same fact stated twice on one screen
       * and the two should not look like different facts.
       */
      .item.active {
        background: var(--openish-color-surface-selected);
        border-inline-start-color: var(--openish-border-selected-color);
        color: var(--openish-color-accent);
        font: var(--openish-font-body-bold);
      }

      @media (forced-colors: active) {
        .item.active {
          border-inline-start-color: LinkText;
        }
      }

      /* Primary text over secondary, and the pair takes whatever the row's two ends leave it. */
      .text {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-width: 0;
      }

      .primary {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .primary.deprecated {
        text-decoration: line-through;
        color: var(--openish-color-text-muted);
      }

      /*
       * Metadata: right-aligned, and allowed to shrink.
       *
       * The system says metadata does not wrap, and it does not. It does *not* say it may push the
       * row wider than its container, which a rigid flex basis would do here - a route is as long as
       * the document made it, and /accounts/{accountId}/transactions in a half-width column would
       * take the whole list with it. So it holds its natural width until there is no room, then
       * ellipsises like the text beside it.
       */
      .metadata {
        flex: 0 1 auto;
        min-width: 0;
        margin-left: var(--openish-space-xs);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: right;
        font: var(--openish-font-small);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
      }

      .count {
        flex: none;
        margin-left: var(--openish-space-xs);
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
      }
    `,
  ]

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** The nodes to list, in the order they should read. */
  @property({ attribute: false })
  items: readonly NavNode[] = []

  /** An accessible name for the list, when it is not already labelled by a tab. */
  @property({ type: String })
  label = ''

  /**
   * One row: the leading chip, the name, and the route.
   *
   * A model has no method and no route, so it is the name alone - which is the whole of what
   * `components.schemas` calls it. A webhook's route is its own name, because that is the key the
   * document files it under and what the payload will arrive as. A tag has neither, and carries the
   * number of operations under it instead: the one fact about a section worth a row of its own.
   */
  #renderItem(child: NavNode): TemplateResult {
    const deprecated = child.type === 'operation' && child.deprecated === true
    const active = child.id === this.ui?.activeId
    const method = child.type === 'operation' || child.type === 'webhook' ? child.method : undefined
    const route = child.type === 'operation' ? child.path : child.type === 'webhook' ? child.name : undefined
    const count = child.type === 'tag' || child.type === 'group' ? child.children.length : undefined

    return html`
      <li>
        <a
          class=${classMap({ item: true, pressable: true, active })}
          href=${hrefFor(child, this.ui)}
          aria-current=${ifDefined(active ? 'page' : undefined)}
        >
          ${method ? html`<span class="method" data-method=${method}>${method}</span>` : nothing}
          <span class="text">
            <span class=${classMap({ primary: true, deprecated })} title=${child.title}>${child.title}</span>
          </span>
          ${route ? html`<code class="metadata">${route}</code>` : nothing}
          ${count === undefined ? nothing : html`<span class="count">${count}</span>`}
        </a>
      </li>
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (this.items.length === 0) {
      return nothing
    }

    /* `role="list"` because `list-style: none` takes the list semantics away in Safari. */
    return html`
      <ul role="list" aria-label=${ifDefined(this.label || undefined)}>
        ${repeat(
          this.items,
          (child) => child.id,
          (child) => this.#renderItem(child),
        )}
      </ul>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-section-list': OpenishSectionList
  }
}

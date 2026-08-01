import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { createRef, ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'

import { baseStyles } from '../styles/shared.js'

/**
 * One tab and the panel behind it.
 *
 * `content` is a callback rather than a template so a panel that is not showing costs nothing to
 * build - an operation with fifteen responses generates one schema example, not fifteen.
 */
export type OpenishTab = {
  /** Stable across renders. Selection is remembered by id, not by position. */
  id: string
  label: string
  /** A short qualifier after the label, e.g. a media type or a response description. */
  hint?: string
  /** Colours the label: `success`, `info`, or `danger`. */
  tone?: 'success' | 'info' | 'danger' | undefined
  content: () => unknown
}

/**
 * A tab set.
 *
 * jh-ui has no tabs component, so this is built to the WAI-ARIA Authoring Practices pattern:
 * `tablist`/`tab`/`tabpanel`, a roving tabindex so the set is a single tab stop, and arrow keys plus
 * Home/End to move between tabs. Activation follows focus, which is the right choice here because
 * switching panels is instant and has no side effects.
 *
 * Only the selected panel is rendered. That is what makes `content` a callback: the alternative -
 * rendering every panel and hiding all but one - would generate every schema example on the page.
 */
@customElement('openish-tabs')
export class OpenishTabs extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      .tablist {
        display: flex;
        flex-wrap: wrap;
        gap: var(--openish-space-3xs);
        border-bottom: 1px solid var(--openish-color-border);
      }

      button {
        display: inline-flex;
        align-items: baseline;
        gap: var(--openish-space-2xs);
        padding: var(--openish-space-xs) var(--openish-space-sm);
        border: 0;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        background: none;
        color: var(--openish-color-text-muted);
        font: var(--openish-font-body);
        font-family: inherit;
        cursor: pointer;
      }

      button:hover {
        color: var(--openish-color-text);
        background: var(--openish-color-surface-hover);
      }

      button[aria-selected='true'] {
        color: var(--openish-color-text);
        border-bottom-color: var(--openish-color-accent);
        font: var(--openish-font-body-bold);
      }

      button[data-tone='success'] {
        color: var(--openish-color-success);
      }

      button[data-tone='info'] {
        color: var(--openish-color-info);
      }

      button[data-tone='danger'] {
        color: var(--openish-color-danger);
      }

      .hint {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      [role='tabpanel'] {
        padding-top: var(--openish-space-md);
      }

      [role='tabpanel']:focus-visible {
        outline: none;
        box-shadow: var(--openish-focus-ring);
        border-radius: var(--openish-radius-md);
      }
    `,
  ]

  /** The tabs, in order. Each carries a callback for its panel, rendered only when selected. */
  @property({ attribute: false })
  tabs: readonly OpenishTab[] = []

  /** Accessible name for the tab list, e.g. "Response status codes". */
  @property({ type: String })
  label = ''

  /** The tab to start on. The reader's own choice takes over from there. */
  @property({ type: String })
  selected = ''

  /**
   * The tab the reader picked, if they have.
   *
   * `undefined` means "not touched", so the `selected` property decides - the same shape as
   * `expandedByUser` in the sidebar and `openedByUser` in the schema tree. Resolving it in a getter
   * is what lets a tab set with no reader interaction follow its property with no lifecycle hook to
   * copy one into the other.
   */
  @state()
  private chosenByUser: string | undefined = undefined

  /**
   * The selected tab button, kept by `ref()` rather than found again with a query.
   *
   * Moving focus is a DOM call and cannot be expressed in a template, but *which* element to move
   * it to can be: the directive hands over whatever the last render put there.
   */
  readonly #selectedTab = createRef<HTMLButtonElement>()

  /** Set only by the key and click handlers, so the first render never steals focus. */
  #focusOnUpdate = false

  /**
   * Which tab is showing.
   *
   * The fallback to zero is what handles a tab set whose tabs were replaced: an id that no longer
   * exists resolves to the first tab, without anything having to notice that the list changed.
   */
  get #activeIndex(): number {
    const index = this.tabs.findIndex((tab) => tab.id === (this.chosenByUser ?? this.selected))
    return index === -1 ? 0 : index
  }

  protected override updated(): void {
    if (this.#focusOnUpdate) {
      this.#focusOnUpdate = false
      this.#selectedTab.value?.focus()
    }
  }

  #select(index: number, focus: boolean): void {
    const tab = this.tabs[index]
    if (!tab) {
      return
    }
    this.#focusOnUpdate = focus
    this.chosenByUser = tab.id
  }

  readonly #onKeydown = (event: KeyboardEvent): void => {
    const last = this.tabs.length - 1
    const current = this.#activeIndex
    let next: number | undefined

    switch (event.key) {
      case 'ArrowRight':
        next = current === last ? 0 : current + 1
        break
      case 'ArrowLeft':
        next = current === 0 ? last : current - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }

    event.preventDefault()
    this.#select(next, true)
  }

  override render(): TemplateResult | typeof nothing {
    if (this.tabs.length === 0) {
      return nothing
    }

    const activeIndex = this.#activeIndex
    const active = this.tabs[activeIndex]!

    return html`
      <div
        class="tablist"
        role="tablist"
        aria-label=${ifDefined(this.label || undefined)}
        @keydown=${this.#onKeydown}
      >
        ${repeat(
          this.tabs,
          (tab) => tab.id,
          (tab, index) => {
            const selected = index === activeIndex
            return html`
              <button
                type="button"
                role="tab"
                id="tab-${index}"
                data-tab=${tab.id}
                data-tone=${ifDefined(tab.tone)}
                aria-selected=${selected ? 'true' : 'false'}
                aria-controls="panel-${index}"
                tabindex=${selected ? 0 : -1}
                ${ref(selected ? this.#selectedTab : undefined)}
                @click=${() => this.#select(index, true)}
              >
                <span>${tab.label}</span>
                ${tab.hint ? html`<span class="hint">${tab.hint}</span>` : nothing}
              </button>
            `
          },
        )}
      </div>
      <div role="tabpanel" id="panel-${activeIndex}" aria-labelledby="tab-${activeIndex}" tabindex="0">
        ${active.content()}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-tabs': OpenishTabs
  }
}

import { consume } from '@lit/context'
import type { DocumentStore } from '@openish/core'
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { createRef, ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'

import {
  documentContext,
  sourcesContext,
  uiContext,
  type OpenishSourcesState,
  type OpenishUiState,
} from '../context/contexts.js'
import { HotkeyController } from '../controllers/hotkey.js'
import { hrefFor } from '../router/urls.js'
import { searchNodes, type SearchResult } from '../search/search.js'
import { baseStyles, methodStyles, visuallyHidden } from '../styles/shared.js'

/**
 * The element that actually has focus, not the host that contains it.
 *
 * `document.activeElement` stops at the outermost shadow host, so restoring focus to it would send
 * a reader back to the top of the reference rather than to the control they were on.
 */
const deepActiveElement = (): HTMLElement | undefined => {
  let current: Element | null = document.activeElement
  while (current?.shadowRoot?.activeElement) {
    current = current.shadowRoot.activeElement
  }
  return current instanceof HTMLElement ? current : undefined
}

/**
 * Search over the navigation tree.
 *
 * Built on `<dialog>` and `showModal()` rather than a hand-rolled overlay: the platform already
 * traps focus, closes on Escape, renders in the top layer above any stacking context, and exposes
 * modal semantics to assistive technology. Reimplementing that correctly is more code and worse.
 * What is added on top is the combobox pattern - focus stays in the field while `aria-activedescendant`
 * moves through the results - and returning focus to the button that opened it.
 *
 * `open` is a reactive property, and `showModal()`/`close()` are called in one place, from
 * `updated()`, in response to it changing. Everything else - a hotkey, the trigger button, the
 * dialog's own `close` event - only assigns state, so there is one description of when the dialog is
 * showing rather than a method call at every site that wants it to.
 *
 * Results are real anchors, so Enter and a click both go through the router's own interception, and
 * a middle-click still opens a result in a new tab.
 */
@customElement('openish-search')
export class OpenishSearch extends LitElement {
  static override styles = [
    baseStyles,
    methodStyles,
    visuallyHidden,
    css`
      :host {
        display: block;
      }

      .trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--openish-space-sm);
        width: 100%;
        padding: var(--openish-space-2xs) var(--openish-space-xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-md);
        background: var(--openish-color-page);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
        font-family: inherit;
        text-align: left;
        cursor: pointer;
      }

      .trigger:hover {
        background: var(--openish-color-surface-hover);
      }

      kbd {
        padding: 0 var(--openish-space-3xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-sm);
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
      }

      dialog {
        width: min(40rem, calc(100vw - 2rem));
        margin: 10vh auto auto;
        padding: 0;
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-lg);
        background: var(--openish-color-surface-raised);
        color: var(--openish-color-text);
        box-shadow: var(--openish-shadow-md);
      }

      dialog::backdrop {
        background: var(--openish-color-overlay);
      }

      input {
        width: 100%;
        padding: var(--openish-space-md);
        border: 0;
        border-bottom: 1px solid var(--openish-color-border);
        background: none;
        color: var(--openish-color-text);
        font: var(--openish-font-body);
        font-family: inherit;
      }

      input:focus-visible {
        outline: none;
        box-shadow: var(--openish-focus-ring);
      }

      .results {
        max-height: 50vh;
        overflow-y: auto;
        padding: var(--openish-space-2xs);
      }

      a {
        display: flex;
        align-items: baseline;
        gap: var(--openish-space-xs);
        padding: var(--openish-space-xs);
        border-radius: var(--openish-radius-md);
        color: var(--openish-color-text);
        text-decoration: none;
      }

      a[aria-selected='true'] {
        background: var(--openish-color-surface-selected);
      }

      .title {
        font: var(--openish-font-body);
      }

      .detail {
        margin-left: auto;
        font-family: var(--openish-font-family-mono);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .context {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      .empty {
        padding: var(--openish-space-md);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
      }

      /* Which document the results below are in. Only rendered when there is more than one. */
      .group {
        position: sticky;
        top: 0;
        margin: 0;
        padding: var(--openish-space-2xs) var(--openish-space-md);
        background: var(--openish-color-surface);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-micro);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  /** Every document on offer, and which of them are loaded. Provided through context. */
  @consume({ context: sourcesContext, subscribe: true })
  sources: OpenishSourcesState | undefined

  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** Whether the dialog is showing. Set it; the element does the rest. */
  @property({ type: Boolean, reflect: true })
  open = false

  @state()
  private query = ''

  @state()
  private active = 0

  @query('dialog')
  private dialog!: HTMLDialogElement

  @query('input')
  private input!: HTMLInputElement

  /** The element to hand focus back to. Restoring it is the difference between a dialog and a trap. */
  #opener: HTMLElement | undefined

  /** The highlighted result, held by the render that made it highlighted. */
  readonly #activeOption = createRef<HTMLAnchorElement>()

  /** The shortcuts that open this dialog. Public because it is part of the element's behaviour. */
  /*
   * The configured key plus Cmd/Ctrl-K, which is not configurable because it is the convention every
   * application shares and a host that changed it would only be surprising people.
   */
  readonly hotkeys = new HotkeyController(this, () => [{ key: this.ui?.config.searchHotKey || '/' }, { key: 'k', modifier: true }], () => {
    this.#show(deepActiveElement())
  })

  /**
   * The matches for the current query.
   *
   * A getter, not derived state: nothing outside this element reads it and nothing needs to know
   * when it changed, so there is no reason for it to exist between renders - and no second copy to
   * keep in step with the query it came from.
   */
  get #results(): SearchResult[] {
    return searchNodes(this.#stores, this.query)
  }

  /**
   * The documents to search, in the order the host configured them.
   *
   * Every document that has *loaded*, not just the one on screen - a reader who types `institution`
   * should find it in the admin API without first having to know it is there. The idle prefetch is
   * what makes that true shortly after first render; until it lands, this is the active document
   * alone, which is the behaviour a single-document reference has always had.
   *
   * Configured order rather than the order they finished loading, or two equally good matches would
   * swap places depending on which document happened to parse first.
   */
  get #stores(): DocumentStore[] {
    const state = this.sources
    if (!state) {
      return this.store ? [this.store] : []
    }
    return state.sources
      .map((source) => state.loaded.get(source.slug))
      .filter((store): store is DocumentStore => store !== undefined)
  }

  /**
   * Opening is one state change with three parts, so it is one function rather than three writes at
   * each of the two places that open the dialog. Clearing the query here rather than in a lifecycle
   * hook matters: an assignment in `updated()` would schedule a second render, and that render
   * arrives after the reader has started typing and, with `live()`, takes back what they typed.
   */
  #show(opener: HTMLElement | undefined): void {
    this.#opener = opener
    this.query = ''
    this.active = 0
    this.open = true
  }

  /**
   * The one place `showModal()` and `close()` are called.
   *
   * A `<dialog>` cannot be opened declaratively - `open` as an attribute makes it non-modal, with no
   * focus trap and no backdrop - so the imperative call has to happen somewhere. Here it happens in
   * response to a property change, which keeps every caller declarative.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open') || !this.dialog) {
      return
    }

    if (this.open && !this.dialog.open) {
      this.dialog.showModal()
      this.input.focus()
    } else if (!this.open && this.dialog.open) {
      this.dialog.close()
    }
  }

  /**
   * The dialog's own event: Escape, a backdrop click, or `close()`. All of them land here.
   *
   * `close` is fired from a queued task, not synchronously, so an event from a dialog that has
   * since been reopened can still arrive - closing and immediately reopening does exactly that.
   * Acting on it would take the reader's new dialog away, so a `close` that does not describe the
   * current state is ignored.
   */
  #onClose(): void {
    if (this.dialog.open) {
      return
    }

    this.open = false
    this.#opener?.focus()
  }

  /* The query and the highlighted row change together, so they are set together. */
  #onInput(event: Event): void {
    this.query = (event.target as HTMLInputElement).value
    this.active = 0
  }

  #onKeydown(event: KeyboardEvent): void {
    const results = this.#results
    if (results.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.active = (this.active + 1) % results.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.active = (this.active - 1 + results.length) % results.length
    } else if (event.key === 'Home') {
      event.preventDefault()
      this.active = 0
    } else if (event.key === 'End') {
      event.preventDefault()
      this.active = results.length - 1
    } else if (event.key === 'Enter') {
      event.preventDefault()
      /*
       * Clicking the anchor rather than navigating here: the router's click handler already does
       * `pushState` plus `goto`, and it reads `composedPath()`, so it sees this one.
       */
      this.#activeOption.value?.click()
    }
  }

  #renderResult(result: SearchResult, index: number): TemplateResult {
    const node = result.node
    const method = node.type === 'operation' || node.type === 'webhook' ? node.method : undefined

    return html`
      <a
        id="result-${index}"
        role="option"
        aria-selected=${index === this.active ? 'true' : 'false'}
        href=${hrefFor(node, this.ui)}
        ${ref(index === this.active ? this.#activeOption : undefined)}
        @click=${() => {
          this.open = false
        }}
        @mousemove=${() => {
          this.active = index
        }}
      >
        ${method ? html`<span class="method" data-method=${method}>${method}</span>` : nothing}
        <span class="title">${node.title}</span>
        ${result.context ? html`<span class="context">${result.context}</span>` : nothing}
        ${result.detail ? html`<span class="detail">${result.detail}</span>` : nothing}
      </a>
    `
  }

  /**
   * The result list, with a heading wherever the document changes.
   *
   * The headings are `role="presentation"` and the options keep one flat, gapless index. A listbox
   * whose options are grouped is still one list to `aria-activedescendant` and to the arrow keys,
   * and interleaving anything the combobox counts would break both.
   */
  #renderRows(results: readonly SearchResult[]): TemplateResult {
    const grouped = (this.sources?.sources.length ?? 0) > 1

    type Row =
      | { kind: 'heading'; key: string; title: string }
      | { kind: 'result'; key: string; result: SearchResult; index: number }

    const rows: Row[] = []
    let shown: string | undefined

    results.forEach((result, index) => {
      if (grouped && result.source.slug !== shown) {
        shown = result.source.slug
        /*
         * The title from the context, not from the store's own descriptor: an untitled document is
         * named from its `info.title` once it has loaded, and that upgrade happens in the root. The
         * descriptor is what the source was called when it was built.
         */
        const named = this.sources?.sources.find((source) => source.slug === result.source.slug)
        rows.push({
          kind: 'heading',
          key: `group-${result.source.slug}`,
          title: named?.title ?? result.source.title,
        })
      }
      rows.push({ kind: 'result', key: result.node.id, result, index })
    })

    return html`
      ${repeat(
        rows,
        (row) => row.key,
        (row) =>
          row.kind === 'heading'
            ? html`<p class="group" role="presentation">${row.title}</p>`
            : this.#renderResult(row.result, row.index),
      )}
    `
  }

  override render(): TemplateResult {
    const results = this.#results

    return html`
      <button
        type="button"
        class="trigger"
        @click=${(event: Event) => this.#show(event.currentTarget as HTMLElement)}
      >
        <span>Search</span>
        <kbd>/</kbd>
      </button>

      <dialog part="dialog" aria-label="Search the API reference" @close=${this.#onClose}>
        <input
          type="text"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search operations, models, and tags"
          aria-label="Search the API reference"
          aria-controls="results"
          aria-expanded=${results.length > 0 ? 'true' : 'false'}
          aria-activedescendant=${ifDefined(results.length > 0 ? `result-${this.active}` : undefined)}
          .value=${live(this.query)}
          @input=${this.#onInput}
          @keydown=${this.#onKeydown}
        />
        <div id="results" class="results" role="listbox" aria-label="Results">
          ${this.#renderRows(results)}
          ${this.query !== '' && results.length === 0
            ? html`<p class="empty">Nothing matches <code>${this.query}</code>.</p>`
            : nothing}
        </div>
        <span class="visually-hidden" role="status">
          ${this.query === '' ? '' : `${results.length} result${results.length === 1 ? '' : 's'}`}
        </span>
      </dialog>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-search': OpenishSearch
  }
}

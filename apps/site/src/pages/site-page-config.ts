import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import '../components/site-code.js'
import '../components/site-example.js'
import { GALAXY } from '../data/documents.js'
import { CONFIG_CONTROLS, STRUCTURED_KEYS, type ConfigControl } from '../data/config-matrix.js'
import type { SiteExampleSpec } from '../data/example.js'
import { siteControlStyles, siteProseStyles, siteStyles } from '../styles/shared.js'

/**
 * The configuration matrix, as controls.
 *
 * Every control is generated from `DEFAULT_CONFIG`, so an option added to `@openish/core` appears
 * here the day it lands - see `config-matrix.ts`, and the test that keeps the two in step.
 *
 * The reference is *not* rebuilt when an option changes. `<site-example>` mutates the live element's
 * properties when only `props` differ, which matters more here than anywhere else on the site: a
 * reader toggling twenty options would otherwise lose their scroll position, their open disclosures
 * and their chosen tab twenty times.
 */
@customElement('site-page-config')
export class SitePageConfig extends LitElement {
  static override styles = [
    siteStyles,
    siteControlStyles,
    siteProseStyles,
    css`
      :host {
        display: block;
      }

      .layout {
        display: grid;
        gap: var(--openish-space-lg);
        grid-template-columns: minmax(18rem, 24rem) 1fr;
        align-items: start;
      }

      @media (max-width: 70rem) {
        .layout {
          grid-template-columns: 1fr;
        }
      }

      .controls {
        max-block-size: 40rem;
        overflow-y: auto;
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-lg);
        padding: var(--openish-space-sm);
      }

      .control {
        padding: var(--openish-space-2xs) 0;
        border-bottom: 1px solid var(--openish-color-border);
      }

      .control:last-child {
        border-bottom: none;
      }

      label {
        display: flex;
        align-items: center;
        gap: var(--openish-space-2xs);
        font: var(--openish-font-body);
      }

      .key {
        font: var(--openish-font-code-small);
        color: var(--openish-color-text-muted);
      }

      .blurb {
        margin: var(--openish-space-3xs) 0 0;
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
        max-width: none;
      }

      select,
      input[type='text'] {
        font: var(--openish-font-small);
        color: var(--openish-color-text);
        background: var(--openish-color-surface-raised);
        border: var(--openish-border-control-width) solid var(--openish-border-control-color);
        border-radius: var(--openish-radius-sm);
        padding: var(--openish-space-3xs) var(--openish-space-2xs);
      }

      .actions {
        display: flex;
        align-items: center;
        gap: var(--openish-space-xs);
        margin-bottom: var(--openish-space-sm);
      }

      .count {
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
      }

      .structured {
        display: flex;
        flex-wrap: wrap;
        gap: var(--openish-space-2xs);
        padding: 0;
        margin: 0 0 var(--openish-space-md);
        list-style: none;
        max-width: none;
      }

      .structured li {
        margin: 0;
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        font: var(--openish-font-code-small);
        background: var(--openish-color-surface-muted);
        border-radius: var(--openish-radius-pill);
      }
    `,
  ]

  /** Only what the reader changed, so the printed config is the one they would actually write. */
  @state()
  private chosen: Record<string, unknown> = {}

  #set(key: string, value: unknown): void {
    this.chosen = { ...this.chosen, [key]: value }
  }

  #reset(): void {
    this.chosen = {}
  }

  /**
   * A new spec object each render, with the same markup.
   *
   * The identity change is what tells Lit to update; the unchanged `markup` is what tells
   * `<site-example>` to assign rather than remount.
   */
  get #example(): SiteExampleSpec {
    return {
      markup: `<openish-api-reference url="${GALAXY.url}" routing="none"></openish-api-reference>`,
      props: { config: this.chosen },
      height: 'min(70vh, 34rem)',
      /*
       * A fresh element for every configuration, rather than assigning to the live one.
       *
       * `<openish-api-reference>` resolves its configuration while building a document store, and
       * the resolved copy is what the rendered page reads from then on - so a `config` assigned
       * after a document has loaded does not reach the page. Mounting a new element means the
       * config is in place before the store is built, which is the path that works.
       *
       * The cost is a reader's scroll position on every toggle, and it is worth naming: this is the
       * one page on the site that pays it.
       */
      remountOn: JSON.stringify(this.chosen),
    }
  }

  #control(control: ConfigControl): TemplateResult {
    const current = this.chosen[control.key]

    const body = (): TemplateResult => {
      switch (control.kind) {
        case 'boolean':
          return html`
            <label>
              <input
                type="checkbox"
                .checked=${current === undefined ? control.value : current === true}
                @change=${(event: Event) =>
                  this.#set(control.key, (event.target as HTMLInputElement).checked)}
              />
              <span>${control.label}</span>
              <span class="key">${control.key}</span>
            </label>
          `
        case 'choice':
          return html`
            <label>
              <span>${control.label}</span>
              <select
                @change=${(event: Event) =>
                  this.#set(control.key, (event.target as HTMLSelectElement).value)}
              >
                ${repeat(
                  control.choices,
                  (choice) => choice,
                  (choice) => html`
                    <option value=${choice} ?selected=${(current ?? control.value) === choice}>
                      ${choice}
                    </option>
                  `,
                )}
              </select>
              <span class="key">${control.key}</span>
            </label>
          `
        default:
          return html`
            <label>
              <span>${control.label}</span>
              <input
                type="text"
                .value=${String(current ?? control.value)}
                @change=${(event: Event) =>
                  this.#set(control.key, (event.target as HTMLInputElement).value)}
              />
              <span class="key">${control.key}</span>
            </label>
          `
      }
    }

    return html`
      <div class="control">
        ${body()} ${control.blurb ? html`<p class="blurb">${control.blurb}</p>` : ''}
      </div>
    `
  }

  get #printed(): string {
    const entries = Object.entries(this.chosen)
    if (entries.length === 0) {
      return '/* Change something on the left, and the config you would write appears here. */'
    }
    return `reference.config = ${JSON.stringify(this.chosen, null, 2)}`
  }

  override render(): TemplateResult {
    const changed = Object.keys(this.chosen).length

    return html`
      <h1>The configuration matrix</h1>
      <p class="lede">
        ${CONFIG_CONTROLS.length} options, every one of them generated from the library’s own
        <code>DEFAULT_CONFIG</code> — so an option added to <code>@openish/core</code> appears here
        the day it lands, rather than the day someone remembers this page exists.
      </p>

      <div class="actions">
        <button type="button" @click=${this.#reset} ?disabled=${changed === 0}>Reset</button>
        <span class="count">
          ${changed === 0 ? 'Everything at its default' : `${changed} changed`}
        </span>
      </div>

      <div class="layout">
        <div class="controls">
          ${repeat(CONFIG_CONTROLS, (control) => control.key, (control) => this.#control(control))}
        </div>
        <site-example .example=${this.#example}></site-example>
      </div>

      <h2>What you chose</h2>
      <site-code .code=${this.#printed} label="config"></site-code>

      <h2>The ones without a control</h2>
      <p>
        These take structured values or callbacks — <code>slugs</code> is a record of functions,
        <code>redirect</code> is one — and a text box for a function would be a worse lie than an
        absence. They are listed rather than hidden, so the matrix reads as complete, which it is:
        this list, the controls above, and a short set of options that only mean anything against a
        real authorization server.
      </p>
      <ul class="structured">
        ${repeat(STRUCTURED_KEYS, (key) => key, (key) => html`<li>${key}</li>`)}
      </ul>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-config': SitePageConfig
  }
}

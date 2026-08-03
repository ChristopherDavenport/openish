import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { createRef, ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'

import '../components/site-code.js'
import '../components/site-demo-scope.js'
import { ElementsLoader } from '../controllers/elements-loader.js'
import { GALAXY } from '../data/documents.js'
import { isColour, type Token } from '../data/parse-tokens.js'
import { TOKENS, TOKENS_SOURCE, TOKEN_GROUPS } from '../data/tokens.js'
import { repoFile } from '../data/repo.js'
import { siteControlStyles, siteProseStyles, siteStyles } from '../styles/shared.js'

/**
 * The token editor.
 *
 * Every control on this page was parsed out of `tokens.css`, so the page gains a row the day the
 * theme gains a hook. Nothing here lists a token by name and nothing states how many there are -
 * see `parse-tokens.ts` for why that matters more than it looks like it should.
 *
 * **Overrides are scoped to the preview, not to `:root`.** Writing them at the document level would
 * restyle the editor along with the thing being edited, which sounds like a fuller demonstration
 * and is actually a way to make the controls unreadable the moment someone picks a dark surface in
 * a light page. One `<style>` element, one selector, and "reset" is emptying it.
 *
 * **Values are read through a probe.** `getComputedStyle().getPropertyValue()` on a custom property
 * returns what was *specified* - `light-dark(#ffffff, #0f1419)` - not what it resolves to, so the
 * swatches would all show the same string in both schemes. Assigning `color: var(--token)` to a
 * probe element and reading back the computed `color` is what makes the browser do the resolving.
 * `packages/elements/test/contrast.test.ts` measures the palette the same way and for the same
 * reason.
 */
@customElement('site-page-tokens')
export class SitePageTokens extends LitElement {
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
        grid-template-columns: minmax(18rem, 22rem) 1fr;
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

      h3 {
        position: sticky;
        inset-block-start: 0;
        margin: var(--openish-space-sm) 0 var(--openish-space-2xs);
        padding: var(--openish-space-3xs) 0;
        background: var(--openish-color-page);
        font: var(--openish-font-small-bold);
        color: var(--openish-color-text-muted);
      }

      .row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--openish-space-2xs);
        align-items: center;
        padding: var(--openish-space-3xs) 0;
      }

      .name {
        font: var(--openish-font-code-small);
        overflow-wrap: anywhere;
      }

      .row input[type='color'] {
        inline-size: 2.5rem;
        block-size: 1.6rem;
        padding: 0;
        border: 1px solid var(--openish-color-border-strong);
        border-radius: var(--openish-radius-sm);
        background: none;
      }

      .row input[type='text'] {
        inline-size: 10rem;
        font: var(--openish-font-code-small);
        color: var(--openish-color-text);
        background: var(--openish-color-surface-raised);
        border: var(--openish-border-control-width) solid var(--openish-border-control-color);
        border-radius: var(--openish-radius-sm);
        padding: var(--openish-space-3xs) var(--openish-space-2xs);
      }

      .changed .name {
        font: var(--openish-font-small-bold);
        font-family: var(--openish-font-family-mono);
      }

      .actions {
        display: flex;
        gap: var(--openish-space-xs);
        align-items: center;
        margin-bottom: var(--openish-space-sm);
      }

      .count {
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
      }

      .probe {
        position: absolute;
        visibility: hidden;
        pointer-events: none;
      }
    `,
  ]

  readonly #elements = new ElementsLoader(this)
  readonly #probe = createRef<HTMLSpanElement>()

  /** Only what the reader changed. The theme owns everything else, and stays owning it. */
  @state()
  private overrides: Record<string, string> = {}

  #set(token: Token, value: string): void {
    this.overrides = { ...this.overrides, [token.name]: value }
  }

  #reset(): void {
    this.overrides = {}
  }

  /**
   * The resolved value of a token, as the browser would paint it.
   *
   * The probe lives in this shadow root, inside the preview scope, so it resolves against the same
   * overrides the preview does. A probe in the light DOM would answer with the site's values and
   * every swatch would be a lie the moment anything was changed.
   */
  #resolved(token: Token): string {
    const probe = this.#probe.value
    if (!probe) {
      return ''
    }
    probe.style.color = ''
    probe.style.color = `var(${token.name})`
    return getComputedStyle(probe).color
  }

  /** The overrides, as something a host can paste into their own stylesheet. */
  get #stylesheet(): string {
    const entries = Object.entries(this.overrides)
    if (entries.length === 0) {
      return '/* Change something on the left, and your theme appears here. */'
    }
    return `:root {\n${entries.map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}`
  }

  #row(token: Token): TemplateResult {
    const changed = token.name in this.overrides
    const value = this.overrides[token.name] ?? ''
    return html`
      <div class="row ${changed ? 'changed' : ''}">
        <span class="name" title=${token.declared}>${token.name}</span>
        ${isColour(token)
          ? html`<input
              type="color"
              aria-label=${token.name}
              .value=${value || rgbToHex(this.#resolved(token))}
              @input=${(event: Event) => this.#set(token, (event.target as HTMLInputElement).value)}
            />`
          : html`<input
              type="text"
              aria-label=${token.name}
              .value=${value || token.declared}
              @change=${(event: Event) => this.#set(token, (event.target as HTMLInputElement).value)}
            />`}
      </div>
    `
  }

  override render(): TemplateResult {
    const changed = Object.keys(this.overrides).length

    return html`
      <h1>Every hook, live</h1>
      <p class="lede">
        ${TOKENS.length} custom properties, read out of
        <a href=${repoFile(TOKENS_SOURCE)} rel="external"><code>${TOKENS_SOURCE}</code></a> when this
        page was built — not listed by hand. Change one and the reference beside it changes; nothing
        else on the page does.
      </p>

      <div class="actions">
        <button type="button" @click=${this.#reset} ?disabled=${changed === 0}>Reset</button>
        <span class="count">
          ${changed === 0 ? 'Nothing changed yet' : `${changed} of ${TOKENS.length} changed`}
        </span>
      </div>

      <div class="layout">
        <div class="controls">
          ${repeat(
            TOKEN_GROUPS,
            (group) => group.title,
            (group) => html`
              <h3>${group.title}</h3>
              ${repeat(group.tokens, (token) => token.name, (token) => this.#row(token))}
            `,
          )}
        </div>

        <div>
          <site-demo-scope .height=${'min(70vh, 34rem)'} style=${inlineOverrides(this.overrides)}>
            <span class="probe" ${ref(this.#probe)}></span>
            ${this.#elements.ready
              ? html`<openish-api-reference url=${GALAXY.url} routing="none"></openish-api-reference>`
              : html`<p class="count">Loading the reference…</p>`}
          </site-demo-scope>
        </div>
      </div>

      <h2>Take it with you</h2>
      <p>Only what you changed. Everything else is still the theme’s.</p>
      <site-code .code=${this.#stylesheet} label="Your overrides"></site-code>
    `
  }
}

/**
 * The overrides as an inline style, which is how they reach the preview *and only* the preview.
 *
 * A `<style>` element with a selector would work too, and would need a selector that could not
 * collide with anything else on the page. Custom properties inherit, so setting them on the one
 * element that contains the preview is the same result with nothing to name.
 */
const inlineOverrides = (overrides: Record<string, string>): string =>
  Object.entries(overrides)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ')

/**
 * `rgb(11, 87, 208)` as `#0b57d0`, because `<input type="color">` accepts nothing else.
 *
 * The probe resolves a token to a computed colour, and a computed colour is always `rgb()` or
 * `rgba()` - never the hex the theme wrote. Anything unparseable falls back to black rather than
 * throwing: an input showing the wrong swatch is a small problem, and a page that fails to render
 * is a large one.
 */
const rgbToHex = (colour: string): string => {
  const parts = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(colour)
  if (!parts) {
    return '#000000'
  }
  const hex = (value: string | undefined): string =>
    Math.round(Number(value ?? 0))
      .toString(16)
      .padStart(2, '0')
  return `#${hex(parts[1])}${hex(parts[2])}${hex(parts[3])}`
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-tokens': SitePageTokens
  }
}

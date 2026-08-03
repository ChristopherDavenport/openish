import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import type { ColorSchemePreference } from '@openish/core'

import { siteControlStyles, siteStyles } from '../styles/shared.js'
import { routePath } from './paths.js'

const LABELS: Record<ColorSchemePreference, string> = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
}

/**
 * The bar across the top: the wordmark, the scheme toggle, and the way out to the repository.
 *
 * @fires site-scheme-toggle - The reader asked for the next colour scheme. No detail: which one is
 * next is the host's arithmetic, and this button's job is to say that it was pressed.
 */
@customElement('site-header')
export class SiteHeader extends LitElement {
  static override styles = [
    siteStyles,
    siteControlStyles,
    css`
      :host {
        display: block;
        background: var(--openish-color-surface);
        border-bottom: 1px solid var(--openish-color-border);
      }

      .bar {
        display: flex;
        align-items: center;
        gap: var(--openish-space-md);
        padding: var(--openish-space-sm) var(--openish-space-lg);
      }

      .wordmark {
        font: var(--openish-font-heading-3);
        color: var(--openish-color-text);
      }

      .wordmark:hover {
        text-decoration: none;
      }

      .tagline {
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
      }

      .spacer {
        flex: 1;
      }

      /* Below the two-column breakpoint the tagline is the first thing worth losing. */
      @media (max-width: 60rem) {
        .tagline {
          display: none;
        }
      }
    `,
  ]

  /** The reader's colour-scheme preference, for the toggle's label. */
  @property({ type: String })
  scheme: ColorSchemePreference = 'auto'

  #toggle(): void {
    /* Bubbles and composes: `<site-app>` owns the preference, and it is two shadow roots up. */
    this.dispatchEvent(new CustomEvent('site-scheme-toggle', { bubbles: true, composed: true }))
  }

  override render(): TemplateResult {
    return html`
      <div class="bar">
        <a class="wordmark" href=${routePath('')}>openish</a>
        <span class="tagline">Lit web components for OpenAPI documents</span>
        <span class="spacer"></span>
        <button
          type="button"
          @click=${this.#toggle}
          aria-label="Colour scheme: ${LABELS[this.scheme]}. Change it."
        >
          ${LABELS[this.scheme]}
        </button>
        <a href="https://github.com/ChristopherDavenport/openish" rel="external">GitHub</a>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-header': SiteHeader
  }

  interface HTMLElementEventMap {
    'site-scheme-toggle': CustomEvent<void>
  }
}

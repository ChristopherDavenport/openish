import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { siteStyles } from '../styles/shared.js'

/**
 * A block of code, with no highlighting and no dependencies.
 *
 * openish ships `<openish-code-block>`, which is better than this in every way except the one that
 * matters here: reaching it means importing `@openish/elements`, which registers thirty-one
 * elements, and rendering it means pulling the markdown and highlight chunk - about 176 kB gzipped.
 * That is the correct trade on a page that is *about* the highlight pipeline, and the wrong one for
 * the four lines of install instructions above the fold on the front page.
 *
 * So this exists, it is deliberately dumb, and the pages that show off the real one use the real
 * one. A site arguing that openish keeps its entry chunk small should not ship a component library
 * to render a `npm install` line.
 */
@customElement('site-code')
export class SiteCode extends LitElement {
  static override styles = [
    siteStyles,
    css`
      :host {
        display: block;
      }

      pre {
        margin: 0;
        font: var(--openish-font-code);
        color: var(--openish-color-code-content);
        background: var(--openish-color-code-surface);
        border-radius: var(--openish-radius-md);
        padding: var(--openish-space-md);
        overflow-x: auto;
      }

      .label {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
        display: block;
        margin-bottom: var(--openish-space-3xs);
      }
    `,
  ]

  /** The code. Rendered as text, so it needs no escaping at the call site. */
  @property({ type: String })
  code = ''

  /** An optional caption above the block, e.g. a filename or "without a bundler". */
  @property({ type: String })
  label = ''

  override render(): TemplateResult {
    return html`
      ${this.label ? html`<span class="label">${this.label}</span>` : ''}
      <pre><code>${this.code}</code></pre>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-code': SiteCode
  }
}

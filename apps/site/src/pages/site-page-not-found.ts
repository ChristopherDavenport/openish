import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'

import { siteProseStyles, siteStyles } from '../styles/shared.js'
import { routePath } from '../app/paths.js'

/**
 * The page a URL that names nothing gets.
 *
 * It says which path missed, rather than redirecting to the front page. That is the same choice the
 * reference makes for an id it cannot resolve, and for the same reason: a bookmark that has outlived
 * the thing it pointed at should still be able to say so.
 *
 * On GitHub Pages this is also what a deep link renders for an instant before the router resolves —
 * `dist/404.html` is a copy of `index.html`, so Pages serves the application for an unknown path and
 * the application then decides. Which means this page has to be honest even when it is wrong.
 */
@customElement('site-page-not-found')
export class SitePageNotFound extends LitElement {
  static override styles = [
    siteStyles,
    siteProseStyles,
    css`
      :host {
        display: block;
      }

      code {
        background: var(--openish-color-surface-muted);
        border-radius: var(--openish-radius-sm);
        padding: 0 var(--openish-space-3xs);
      }
    `,
  ]

  override render(): TemplateResult {
    return html`
      <h1>Not found</h1>
      <p class="lede">
        Nothing on this site is at <code>${window.location.pathname}</code>.
      </p>
      <p><a href=${routePath('')}>Go to the front page</a>.</p>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-not-found': SitePageNotFound
  }
}

import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'

import '../components/site-live-reference.js'
import { GALAXY } from '../data/documents.js'
import { siteStyles } from '../styles/shared.js'

/**
 * The reference, full bleed, owning the fragment.
 *
 * This is the one page on the site where `<openish-api-reference>` uses `routing="hash"`, and it is
 * deliberate rather than incidental. The site's router matches `location.pathname`; the reference
 * reads and writes `location.hash`. Neither can see the other's half, so
 * `/openish/labs/reference#/tags/planets` is a URL both of them resolve at once - the site to this
 * page, the reference to that operation - and a reader can bookmark it.
 *
 * Every other page embeds with `routing="none"`, which is `<site-live-reference>`'s default,
 * because two references in `hash` mode on one page would both follow the address bar and both
 * rewrite it on scroll. Here there is exactly one, and it says so explicitly.
 */
@customElement('site-page-reference')
export class SitePageReference extends LitElement {
  static override styles = [
    siteStyles,
    css`
      /*
       * The page *is* the reference, so it takes the height it was given rather than the height of
       * its content - the full-bleed half of the chain that starts on the root element in site.css.
       */
      :host {
        display: flex;
        flex-direction: column;
        block-size: 100%;
        min-block-size: 0;
      }

      site-live-reference {
        flex: 1;
        min-block-size: 0;
      }
    `,
  ]

  override render(): TemplateResult {
    return html`
      <site-live-reference bare height="100%" routing="hash" url=${GALAXY.url}></site-live-reference>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-reference': SitePageReference
  }
}

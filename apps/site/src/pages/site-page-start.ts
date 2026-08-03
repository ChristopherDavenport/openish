import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'

import '../components/site-code.js'
import { siteProseStyles, siteStyles } from '../styles/shared.js'

const INSTALL = 'npm install @openish/elements @openish/theme'

const BUNDLED = `import '@openish/elements'
import '@openish/theme/index.css'`

const MARKUP = `<openish-api-reference url="/openapi.yaml"></openish-api-reference>`

const STANDALONE = `<script type="module" src="https://unpkg.com/@openish/elements/dist/standalone.js"></script>
<openish-api-reference url="/openapi.yaml"></openish-api-reference>`

/**
 * Getting started.
 *
 * Two ways in, and the second one is the interesting claim: the standalone build inlines the theme,
 * so a page with no bundler and no resolver gets a working reference from one script tag.
 */
@customElement('site-page-start')
export class SitePageStart extends LitElement {
  static override styles = [
    siteStyles,
    siteProseStyles,
    css`
      :host {
        display: block;
      }

      site-code {
        max-width: 68ch;
        margin-bottom: var(--openish-space-md);
      }
    `,
  ]

  override render(): TemplateResult {
    return html`
      <h1>Getting started</h1>
      <p class="lede">Two ways in: a package, or one script tag.</p>

      <h2>With a bundler</h2>
      <site-code .code=${INSTALL}></site-code>
      <p>
        Importing the entry registers every <code>openish-*</code> tag as a side effect. Pair it with
        a stylesheet from <code>@openish/theme</code>, which declares the <code>--openish-*</code>
        hooks the components read — a reference with none of them resolves every colour to nothing
        and renders as unstyled text.
      </p>
      <site-code .code=${BUNDLED}></site-code>
      <site-code .code=${MARKUP}></site-code>

      <h2>Without one</h2>
      <p>
        The standalone build has the stylesheet inside it. A consumer with no resolver cannot import
        <code>@openish/theme/index.css</code> by package specifier, so that file is flattened and
        inlined at build time and injected as the first thing in <code>&lt;head&gt;</code> — first,
        not last, so anything the host already loaded still wins at equal specificity. Adopting a
        reference should not restyle the page it was dropped into.
      </p>
      <site-code .code=${STANDALONE} label="No build step, no bundler"></site-code>
      <p>
        Nothing is injected if the hooks already resolve, so a host that imported the theme itself —
        or one using <code>@openish/theme/jh.css</code> — keeps what it chose.
      </p>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-start': SitePageStart
  }
}

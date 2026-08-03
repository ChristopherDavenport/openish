import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import '../components/site-code.js'
import '../components/site-live-reference.js'
import { routePath } from '../app/paths.js'
import { GALAXY } from '../data/documents.js'
import { siteProseStyles, siteStyles } from '../styles/shared.js'

const DROP_IN = `<link rel="stylesheet" href="@openish/theme/index.css" />
<openish-api-reference url="/openapi.yaml"></openish-api-reference>`

const IMPORT = `import '@openish/elements'`

/** A number, what it means, and the page that proves it rather than repeats it. */
type Claim = {
  readonly number: string
  readonly what: string
  readonly href: string
  readonly link: string
}

const CLAIMS: readonly Claim[] = [
  {
    number: '101.7 kB',
    what: 'gzipped entry chunk — everything that has to arrive before the page exists. The markdown pipeline, the highlighter and the snippet generator are fetched later, because none of them is needed for a page to be a page.',
    href: routePath('why'),
    link: 'See the whole table',
  },
  {
    number: 'No Vue',
    what: 'Six runtime dependencies. A guard fails the build if a seventh one brings Vue — which several @scalar/* packages do, so this is enforcement rather than intention.',
    href: routePath('why'),
    link: 'What the guards check',
  },
  {
    number: 'AA or better',
    what: 'Contrast measured in both themes and both schemes — twelve combinations — plus axe over five surfaces, one focus ring, and forced-colors mode. Checked by the suite, not asserted here.',
    href: routePath('why'),
    link: 'Read the receipts',
  },
  {
    number: 'One page',
    what: 'Every operation on a single virtualised plane, so a 221-operation document opens in under half a second and the URL names a position rather than choosing a page.',
    href: routePath('labs/reference'),
    link: 'Open a document',
  },
]

/**
 * The front page.
 *
 * The reference below the pitch is a real one, rendering a real document, and it is the argument:
 * the two lines of markup above it are the two lines that produced it. A screenshot would make the
 * same claim and prove none of it.
 *
 * It costs the page nothing to say so. `<site-live-reference>` fetches `@openish/elements` after
 * this page has rendered, so the prose and the claims are on screen while the component library is
 * still arriving - which is the same trade openish makes with its own deferred chunks, and a fair
 * thing for the page making that argument to be seen doing.
 */
@customElement('site-page-home')
export class SitePageHome extends LitElement {
  static override styles = [
    siteStyles,
    siteProseStyles,
    css`
      :host {
        display: block;
      }

      .drop-in {
        display: grid;
        gap: var(--openish-space-sm);
        max-width: 68ch;
        margin-bottom: var(--openish-space-lg);
      }

      site-live-reference {
        margin-bottom: var(--openish-space-2xl);
      }

      .claims {
        display: grid;
        gap: var(--openish-space-md);
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
        padding: 0;
        margin: 0;
        list-style: none;
        max-width: none;
      }

      .claims li {
        margin: 0;
        padding: var(--openish-space-md);
        background: var(--openish-color-surface);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-lg);
      }

      .number {
        display: block;
        font: var(--openish-font-heading-2);
        color: var(--openish-color-text);
      }

      .claims p {
        margin: var(--openish-space-2xs) 0 var(--openish-space-sm);
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
        max-width: none;
      }

      .claims a {
        font: var(--openish-font-small);
      }
    `,
  ]

  override render(): TemplateResult {
    return html`
      <h1>openish</h1>
      <p class="lede">
        Lit web components for viewing OpenAPI documents. It keeps the framework-agnostic half of
        <a href="https://github.com/scalar/scalar" rel="external">Scalar</a> — the parser, the
        <code>$ref</code> machinery, the type definitions, the snippet generator, the markdown and
        highlight pipeline — and replaces only the Vue render layer, with Lit.
      </p>
      <p>
        If you already ship web components, you should not have to adopt a second framework to render
        API docs.
      </p>

      <h2>The whole of it</h2>
      <div class="drop-in">
        <site-code .code=${IMPORT} label="Registers every openish-* tag"></site-code>
        <site-code .code=${DROP_IN}></site-code>
      </div>
      <p>
        Below is that markup, running, against
        <a href="https://github.com/scalar/scalar/tree/main/packages/galaxy" rel="external"
          >Scalar’s Galaxy</a
        >
        document — not a picture of it. <a href=${routePath('start')}>Getting started</a> has the
        version for a page with no bundler, which is one script tag.
      </p>

      <site-live-reference url=${GALAXY.url}></site-live-reference>

      <h2>What it costs, and what is checked</h2>
      <ul class="claims">
        ${repeat(
          CLAIMS,
          (claim) => claim.number,
          (claim) => html`
            <li>
              <span class="number">${claim.number}</span>
              <p>${claim.what}</p>
              <a href=${claim.href}>${claim.link}</a>
            </li>
          `,
        )}
      </ul>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-home': SitePageHome
  }
}

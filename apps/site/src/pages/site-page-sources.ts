import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'

import '../components/site-code.js'
import '../components/site-example.js'
import { TWO_SOURCES } from '../data/examples.js'
import { siteProseStyles, siteStyles } from '../styles/shared.js'

const SHAPE = `reference.sources = [
  { slug: 'consumer', title: 'Consumer API', url: '/consumer.yaml' },
  { slug: 'admin', title: 'Admin API', url: '/admin.yaml', default: true },
]`

const REDIRECT = `reference.config = {
  // Sees and returns URLs the way the address bar has them, prefix and all.
  redirect: (url) => url.replace('#/tags/', '#/consumer/tags/'),
}`

/**
 * Several documents at once.
 *
 * The two things a host has to know are both consequences rather than options - the URLs change
 * shape, and authentication stops being one thing - so both are stated before the example rather
 * than after it.
 */
@customElement('site-page-sources')
export class SitePageSources extends LitElement {
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
      <h1>Several documents</h1>
      <p class="lede">
        One reference can show more than one API, with a picker. Below is exactly that: Scalar’s
        Galaxy and a small fixture, in one element.
      </p>

      <site-code .code=${SHAPE}></site-code>
      <p>
        <code>slug</code> and <code>title</code> are both optional — a title becomes a slug, and a
        source with neither is <code>api-2</code> / <code>API #2</code>. <code>content</code> takes
        an inline document instead of a <code>url</code>, <code>default</code> picks the one shown
        when the URL names none, and <code>config</code> overrides the reference-level options for
        that document alone. The picker appears only when there is more than one.
      </p>

      <site-example .example=${TWO_SOURCES} label="Two documents, one element"></site-example>

      <h2>Two things this changes</h2>
      <h3>Every URL gains the document</h3>
      <p>
        An operation is at <code>#/consumer/tags/accounts/listAccounts</code>, not
        <code>#/tags/accounts/listAccounts</code>. The slug decides which document the rest of the id
        is <em>about</em>, so it has to come before the rest of it means anything. A reference
        configured with a single <code>url</code> or <code>spec</code> keeps exactly the URLs it
        always had — its ids are namespaced internally too, and the slug is dropped at the URL
        boundary — so this is a change only for a host adopting <code>sources</code>.
      </p>
      <p>
        <code>config.redirect</code> is the seam for keeping old links working:
      </p>
      <site-code .code=${REDIRECT}></site-code>
      <p>
        <code>?api=&lt;slug&gt;</code> selects a document from outside and then rewrites itself out
        of the URL — for a link that knows which API it means but not the id scheme.
      </p>

      <h3>Authentication and servers are per document</h3>
      <p>
        Each source gets its own session and its own selected server, so two documents that both
        declare <code>oauth2</code> — usually two different authorization servers — cannot send each
        other’s tokens. A <code>credentialStore</code> is namespaced per document for the same
        reason; with a single <code>url</code> or <code>spec</code> it is passed through untouched,
        so anything already persisted still reads back.
      </p>

      <h2>What loading looks like</h2>
      <p>
        Documents load lazily. The one being shown is fetched and parsed first, and the rest are
        warmed while the browser is idle, one at a time — so first render does not scale with how
        many documents are configured. Search spans every document that has landed rather than only
        the one on screen, and groups its results under the document they are in.
      </p>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-sources': SitePageSources
  }
}

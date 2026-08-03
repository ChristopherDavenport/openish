import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'

import '../components/site-code.js'
import { routePath } from '../app/paths.js'
import { siteProseStyles, siteStyles } from '../styles/shared.js'

const OAUTH = `reference.config = {
  oauth: {
    // Per security scheme: the public client id, and the scopes to ask for.
    petstore_auth: { clientId: 'public-client-id', scopes: ['read:pets'] },
  },
  // 'popup' keeps the page and everything typed into it; 'redirect' survives a popup blocker.
  oauthRedirectMode: 'popup',
}`

const PROXY = `reference.config = {
  // Yours. openish neither ships nor hosts one — a proxy sees every credential
  // that passes through it, so it has to be under your control.
  proxyUrl: 'https://proxy.example.com',
}`

const REVEAL = `reference.config = { revealCredentialsInSamples: true }`

/**
 * Try-it.
 *
 * There is no live demonstration on this page, and that is the honest answer rather than a gap: a
 * try-it panel needs an API that accepts requests from this origin and an authorization server that
 * has registered it. Standing up either would mean the page was demonstrating a fixture rather than
 * the feature. The reference lab has the real panel, against a real document, and it is one link
 * away.
 */
@customElement('site-page-try-it')
export class SitePageTryIt extends LitElement {
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

      .note {
        border-inline-start: var(--openish-border-selected-width) solid
          var(--openish-border-selected-color);
        padding: var(--openish-space-2xs) 0 var(--openish-space-2xs) var(--openish-space-sm);
        margin-bottom: var(--openish-space-md);
        max-width: 68ch;
      }

      .note p {
        margin: 0;
      }
    `,
  ]

  override render(): TemplateResult {
    return html`
      <h1>Sending the request</h1>
      <p class="lede">
        An operation page sends the request its code sample describes. One function builds that
        request and both consume it, so the snippet above the button is the request the button
        sends — with one deliberate difference.
      </p>

      <div class="note">
        <p>
          Open the panel on any operation in
          <a href=${routePath('labs/reference')}>the reference</a>. It is not demonstrated here
          because a try-it panel needs an API that accepts requests from this origin; a demo against
          something stubbed would be showing a fixture rather than the feature.
        </p>
      </div>

      <h2>The one deliberate difference</h2>
      <p>
        The credential is real on the wire and a placeholder in the sample. A documentation page
        should not be the thing that puts a production token into someone’s shell history — so the
        request that is <em>sent</em> always carries the real value, and the code you can copy does
        not. Opt out if your situation differs:
      </p>
      <site-code .code=${REVEAL}></site-code>

      <h2>Authentication is not a paste field</h2>
      <p>
        Most real documents — including the one this project is tested against — declare
        <code>openIdConnect</code> with nothing but a <code>.well-known</code> URL, so there is no
        token to paste until someone has completed a flow. openish reads the provider’s metadata,
        offers its scopes, and runs the authorization code flow with PKCE.
      </p>
      <site-code .code=${OAUTH}></site-code>
      <p>
        Tokens live in memory on the root element. They are not written anywhere unless a host passes
        a <code>credentialStore</code>, because how long a credential survives on a reader’s machine
        is the host’s decision and not a default anyone should inherit. With several documents
        configured, each gets its own session — two APIs that both declare <code>oauth2</code> are
        usually two different authorization servers, and neither should be able to send the other’s
        token.
      </p>

      <h2>When the API will not talk to the page</h2>
      <p>
        Cross-origin rules are the API’s to relax, not openish’s to work around. Where that is not
        possible, a forwarder is the seam:
      </p>
      <site-code .code=${PROXY}></site-code>
      <p>
        The contract is in <code>@openish/client</code>’s README. A client secret only ever travels
        through a proxy — never from the page — because anything the page holds, the reader holds.
      </p>

      <h2>What does not survive</h2>
      <p>
        The document is one continuous virtualised page, so a try-it panel scrolled far out of range
        is recycled: typed values and a displayed response go with it. Credentials do not — the auth
        session lives on the root element rather than in the section.
      </p>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-try-it': SitePageTryIt
  }
}

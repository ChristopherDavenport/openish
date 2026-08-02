import { consume } from '@lit/context'
import {
  authorizeInPopup,
  authorizeUrl,
  beginRedirect,
  createPkce,
  createState,
  discoverOidc,
  exchangeCode,
  isSameOrigin,
  requestClientCredentials,
  requestPasswordToken,
  tokenFromFragment,
  type OidcConfiguration,
} from '@openish/client'
import { describeSecurityScheme, type SecurityEntry } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { requestContext, uiContext, type OpenishRequestState, type OpenishUiState } from '../context/contexts.js'
import { dispatch } from '../events.js'
import { baseStyles, controlStyles, rowStyles, statusStyles, visuallyHidden } from '../styles/shared.js'
import './openish-markdown.js'

type OAuthFlows = Record<string, { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }>

/**
 * What the reader has to supply before an operation will answer.
 *
 * One field per scheme for the simple types, and for OAuth the whole flow: discovery, scopes, and a
 * button that comes back with a token. The reference document in this repo is why the flow is here
 * at all - its schemes carry a `.well-known` URL and nothing else, so there is no token to paste
 * until someone has completed one.
 *
 * Nothing here writes to the session. Every change leaves as `openish-auth-change` and comes back as
 * context, so there is one description of what the reader is holding and one thing that writes it.
 *
 * @fires openish-auth-change - The reader signed in, signed out, or pasted a credential.
 */
@customElement('openish-auth-form')
export class OpenishAuthForm extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
    rowStyles,
    statusStyles,
    visuallyHidden,
    css`
      :host {
        display: block;
      }

      /* The scheme's own name and kind, as the bar that introduces its rows. */
      .group .name {
        font-family: var(--openish-font-family-mono);
        text-transform: none;
        letter-spacing: normal;
        color: var(--openish-color-text);
      }

      button {
        flex: none;
        margin: var(--openish-space-3xs) var(--openish-space-3xs) var(--openish-space-3xs) 0;
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        border: var(--openish-border-action-width) solid var(--openish-border-action-color);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface-raised);
        color: var(--openish-color-text);
        font: var(--openish-font-small);
      }

      /*
       * Scopes wrap rather than stack. A provider that advertises thirty of them - which the
       * reference document in this repo does - is a thirty-row column otherwise, and the reader
       * came here to press Authorize.
       */
      .scopes {
        display: flex;
        flex-wrap: wrap;
        gap: var(--openish-space-3xs) var(--openish-space-xs);
        max-height: 7rem;
        overflow-y: auto;
        padding: var(--openish-space-3xs) 0;
      }

      .scope {
        display: flex;
        align-items: center;
        gap: var(--openish-space-3xs);
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        overflow-wrap: anywhere;
      }

      .scope input {
        flex: none;
        margin: 0;
      }

      openish-markdown,
      .kind {
        margin: 0;
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      .group select {
        padding: 0 var(--openish-space-3xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        text-transform: none;
      }

      .state {
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      .state.active {
        color: var(--openish-color-success);
      }

      .state.failed {
        color: var(--openish-color-danger);
      }
    `,
  ]

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** The server and credentials the reader has chosen. Provided through context. */
  @consume({ context: requestContext, subscribe: true })
  request: OpenishRequestState | undefined

  /** The schemes this operation accepts, from `securitySchemesFor`. */
  @property({ attribute: false })
  schemes: readonly SecurityEntry[] = []

  /** Which scheme's fields are showing. Empty means the first one. */
  @state()
  private shown = ''

  /** Discovered metadata per scheme, and the scopes the reader ticked. */
  @state()
  private discovered: Record<string, OidcConfiguration> = {}

  @state()
  private discoveryError: Record<string, string> = {}

  @state()
  private chosenScopes: Record<string, string[]> = {}

  @state()
  private clientIds: Record<string, string> = {}

  /**
   * What the two direct grants need, per scheme.
   *
   * Held here and never dispatched: a password is not a credential the session should learn about,
   * it is an input to obtaining one. Only the resulting token leaves as `openish-auth-change`.
   */
  @state()
  private secrets: Record<string, string> = {}

  @state()
  private usernames: Record<string, string> = {}

  @state()
  private passwords: Record<string, string> = {}

  #configFor(scheme: string) {
    return this.ui?.config.oauth?.[scheme]
  }

  #clientId(scheme: string): string {
    return this.clientIds[scheme] ?? this.#configFor(scheme)?.clientId ?? ''
  }

  /** The endpoints for a scheme: declared by an `oauth2` flow, or discovered for `openIdConnect`. */
  #endpointsFor(entry: SecurityEntry): { authorizationEndpoint: string; tokenEndpoint: string } | undefined {
    const discovered = this.discovered[entry.name]
    if (discovered) {
      return discovered
    }

    const flows = (entry.scheme as { flows?: OAuthFlows } | undefined)?.flows ?? {}
    const code = flows['authorizationCode']
    if (code?.authorizationUrl && code.tokenUrl) {
      return { authorizationEndpoint: code.authorizationUrl, tokenEndpoint: code.tokenUrl }
    }

    /* Implicit has an authorization endpoint and no token endpoint, because it never exchanges. */
    const implicit = flows['implicit']
    if (implicit?.authorizationUrl) {
      return { authorizationEndpoint: implicit.authorizationUrl, tokenEndpoint: '' }
    }

    return undefined
  }

  /**
   * Which grant this scheme is going to use.
   *
   * Ordered by what is actually safe in a browser: the authorization code flow first (it is the only
   * one designed for a public client), then the two that post directly to the token endpoint, then
   * implicit last because OAuth 2.1 removes it and its token arrives in a URL fragment.
   *
   * `openIdConnect` discovery answers for the code flow, so a discovered scheme is always `code`.
   */
  #grantFor(entry: SecurityEntry): 'code' | 'clientCredentials' | 'password' | 'implicit' | undefined {
    if (this.discovered[entry.name]) {
      return 'code'
    }

    const flows = (entry.scheme as { flows?: OAuthFlows } | undefined)?.flows ?? {}
    if (flows['authorizationCode']?.authorizationUrl && flows['authorizationCode'].tokenUrl) {
      return 'code'
    }
    if (flows['clientCredentials']?.tokenUrl) {
      return 'clientCredentials'
    }
    if (flows['password']?.tokenUrl) {
      return 'password'
    }
    if (flows['implicit']?.authorizationUrl) {
      return 'implicit'
    }
    return undefined
  }

  /** The token endpoint for a grant that posts to one directly. */
  #tokenEndpointFor(entry: SecurityEntry, grant: 'clientCredentials' | 'password'): string {
    const flows = (entry.scheme as { flows?: OAuthFlows } | undefined)?.flows ?? {}
    return flows[grant]?.tokenUrl ?? ''
  }

  /** Every scope on offer: the operation's own, plus whatever the flow or the provider advertises. */
  #scopesFor(entry: SecurityEntry): string[] {
    const flows = (entry.scheme as { flows?: OAuthFlows } | undefined)?.flows ?? {}
    const declared = Object.values(flows).flatMap((flow) => Object.keys(flow?.scopes ?? {}))
    const discovered = this.discovered[entry.name]?.scopesSupported ?? []

    return [...new Set([...entry.scopes, ...declared, ...discovered])]
  }

  #selectedScopes(entry: SecurityEntry): string[] {
    /* What the operation asks for is ticked to begin with: it is the minimum that will work. */
    return this.chosenScopes[entry.name] ?? this.#configFor(entry.name)?.scopes ?? [...entry.scopes]
  }

  protected override updated(): void {
    void this.#discover()
  }

  /**
   * Reads a provider's metadata once per scheme; an `openIdConnect` scheme is unusable without it.
   *
   * Only for the scheme on screen. A document offering seven alternatives should not make a reader's
   * browser call seven providers' well-known endpoints to render a page they may only be reading.
   */
  async #discover(): Promise<void> {
    for (const entry of this.#shown ? [this.#shown] : []) {
      const url = (entry.scheme as { openIdConnectUrl?: string } | undefined)?.openIdConnectUrl
      if (!url || this.discovered[entry.name] || this.discoveryError[entry.name]) {
        continue
      }

      const result = await discoverOidc(url)
      if (result.ok) {
        this.discovered = { ...this.discovered, [entry.name]: result.configuration }
      } else {
        this.discoveryError = { ...this.discoveryError, [entry.name]: result.message }
      }
    }
  }

  #redirectUri(scheme: string): string {
    const configured = this.#configFor(scheme)?.redirectUri ?? this.ui?.config.oauthRedirectUri ?? ''
    return new URL(configured || window.location.pathname, window.location.origin).toString()
  }

  /**
   * Starts an authorization code flow.
   *
   * Nothing is awaited before the window opens: a pop-up opened after an `await` is one the browser
   * did not see the reader ask for, and it gets blocked. The URL is handed over as a promise
   * instead, which is why `authorizeInPopup` takes one.
   */
  #authorize(entry: SecurityEntry): void {
    const clientId = this.#clientId(entry.name)
    const redirectUri = this.#redirectUri(entry.name)
    const scopes = this.#selectedScopes(entry)
    const endpoints = this.#endpointsFor(entry)
    const proxyUrl = this.ui?.config.proxyUrl ?? ''

    if (!endpoints) {
      dispatch(this, 'openish-auth-change', {
        scheme: entry.name,
        kind: 'failed',
        message: this.discoveryError[entry.name] ?? 'This scheme declares no flow openish can start.',
      })
      return
    }

    if (!isSameOrigin(redirectUri)) {
      dispatch(this, 'openish-auth-change', {
        scheme: entry.name,
        kind: 'failed',
        message: 'The redirect URI has to be on this origin, or the code cannot be read when it comes back.',
      })
      return
    }

    dispatch(this, 'openish-auth-change', { scheme: entry.name, kind: 'authorizing' })

    const prepared = createPkce().then(async (pkce) => {
      const state = createState()
      const implicit = this.#grantFor(entry) === 'implicit'
      const url = authorizeUrl({
        authorizationEndpoint: endpoints.authorizationEndpoint,
        clientId,
        redirectUri,
        scopes,
        state,
        ...(implicit ? { responseType: 'token' as const } : { challenge: pkce.challenge }),
        ...(this.#configFor(entry.name)?.extraParams ? { extraParams: this.#configFor(entry.name)!.extraParams! } : {}),
      })

      if (this.ui?.config.oauthRedirectMode === 'redirect') {
        beginRedirect(url, {
          scheme: entry.name,
          verifier: pkce.verifier,
          state,
          redirectUri,
          tokenEndpoint: endpoints.tokenEndpoint,
          clientId,
          /*
           * The fragment is part of where the reader was: in the default routing mode it *is* the
           * page. Dropping it sent them back to the overview after every redirect flow.
           */
          returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        })
      }

      return { url, state, verifier: pkce.verifier }
    })

    if (this.ui?.config.oauthRedirectMode === 'redirect') {
      /* The page is leaving; there is nothing here to wait for. */
      return
    }

    void authorizeInPopup(prepared).then(async (outcome) => {
      if (!outcome.ok) {
        dispatch(this, 'openish-auth-change', { scheme: entry.name, kind: 'failed', message: outcome.message })
        return
      }

      /*
       * The implicit flow has nothing to exchange - the provider put the access token itself in the
       * fragment, which is exactly why it is deprecated. Read it and stop; there is no code, no
       * verifier, and no refresh token to come.
       */
      if (outcome.accessToken !== undefined) {
        const implicit = tokenFromFragment(outcome.fragment)
        dispatch(
          this,
          'openish-auth-change',
          implicit
            ? {
                scheme: entry.name,
                kind: 'token',
                token: {
                  accessToken: implicit.accessToken,
                  tokenType: implicit.tokenType,
                  scope: implicit.scope,
                  ...(implicit.expiresAt !== undefined ? { expiresAt: implicit.expiresAt } : {}),
                },
              }
            : { scheme: entry.name, kind: 'failed', message: 'The provider returned no usable token.' },
        )
        return
      }

      const { verifier } = await prepared
      const result = await exchangeCode(
        { tokenEndpoint: endpoints.tokenEndpoint, code: outcome.code, verifier, clientId, redirectUri },
        proxyUrl ? { proxyUrl } : {},
      )

      dispatch(
        this,
        'openish-auth-change',
        result.ok
          ? { scheme: entry.name, kind: 'token', token: result.token }
          : { scheme: entry.name, kind: 'failed', message: result.message },
      )
    })
  }

  #renderState(entry: SecurityEntry): TemplateResult | typeof nothing {
    const grant = this.request?.session.get(entry.name)
    if (!grant || grant.status === 'idle') {
      return nothing
    }

    if (grant.status === 'authorizing') {
      return html`<p class="state" role="status">Waiting for the authorization server…</p>`
    }
    if (grant.status === 'failed') {
      return html`<p class="state failed" role="status">${grant.message}</p>`
    }
    if (grant.status === 'expired') {
      return html`<p class="state failed" role="status">That token has expired. Authorize again to continue.</p>`
    }
    if (grant.kind === 'pasted') {
      return html`<p class="state active" role="status">Using the value you entered.</p>`
    }

    const seconds = this.request?.session.expiresInSeconds(entry.name)
    return html`
      <p class="state active" role="status">
        Signed in${seconds === undefined ? '' : ` — expires in ${Math.floor(seconds / 60)}m ${seconds % 60}s`}
      </p>
    `
  }

  /**
   * The two grants that are one POST, with no round trip through a provider's page.
   *
   * No popup, no redirect, no PKCE - the whole flow is a form and a request. What they share with
   * the code flow is the ending: a token, announced upward, written by the one thing that writes.
   */
  async #requestDirectToken(entry: SecurityEntry, grant: 'clientCredentials' | 'password'): Promise<void> {
    const tokenEndpoint = this.#tokenEndpointFor(entry, grant)
    const clientId = this.#clientId(entry.name)
    const scopes = this.#selectedScopes(entry)
    const proxyUrl = this.ui?.config.proxyUrl ?? ''
    const clientSecret = this.secrets[entry.name] ?? ''
    const extraParams = this.#configFor(entry.name)?.extraParams

    dispatch(this, 'openish-auth-change', { scheme: entry.name, kind: 'authorizing' })

    const result =
      grant === 'clientCredentials'
        ? await requestClientCredentials(
            {
              tokenEndpoint,
              clientId,
              scopes,
              ...(clientSecret ? { clientSecret } : {}),
              ...(extraParams ? { extraParams } : {}),
            },
            proxyUrl ? { proxyUrl } : {},
          )
        : await requestPasswordToken(
            {
              tokenEndpoint,
              clientId,
              username: this.usernames[entry.name] ?? '',
              password: this.passwords[entry.name] ?? '',
              scopes,
              ...(clientSecret ? { clientSecret } : {}),
              ...(extraParams ? { extraParams } : {}),
            },
            proxyUrl ? { proxyUrl } : {},
          )

    /* The password is not kept after it has been spent. */
    if (grant === 'password') {
      this.passwords = { ...this.passwords, [entry.name]: '' }
    }

    dispatch(
      this,
      'openish-auth-change',
      result.ok
        ? { scheme: entry.name, kind: 'token', token: result.token }
        : { scheme: entry.name, kind: 'failed', message: result.message },
    )
  }

  /** A labelled input row, since the direct grants need three of the same shape. */
  #renderField(
    entry: SecurityEntry,
    id: string,
    label: string,
    type: 'text' | 'password',
    value: string,
    onInput: (value: string) => void,
  ): TemplateResult {
    return html`
      <div class="row">
        <label class="key" for="${id}-${entry.name}">${label}</label>
        <div class="value">
          <input
            id="${id}-${entry.name}"
            type=${type}
            autocomplete="off"
            spellcheck="false"
            .value=${value}
            @input=${(event: Event) => onInput((event.target as HTMLInputElement).value)}
          />
        </div>
      </div>
    `
  }

  #renderOAuth(entry: SecurityEntry): TemplateResult {
    const scopes = this.#scopesFor(entry)
    const selected = new Set(this.#selectedScopes(entry))
    const grant = this.request?.session.get(entry.name)
    const busy = grant?.status === 'authorizing'
    const clientId = this.#clientId(entry.name)
    const error = this.discoveryError[entry.name]
    const flow = this.#grantFor(entry)
    const direct = flow === 'clientCredentials' || flow === 'password'
    const proxied = (this.ui?.config.proxyUrl ?? '') !== ''

    return html`
      ${error ? html`<p class="state failed">${error}</p>` : nothing}
      ${flow === 'implicit'
        ? html`<p class="state">
            This scheme declares only the implicit flow, which returns the token in the URL. OAuth 2.1
            removes it; prefer the authorization code flow where the provider offers one.
          </p>`
        : nothing}
      ${flow === 'password'
        ? html`<p class="state">
            This scheme declares the password grant, which asks for credentials on a page that is not
            the identity provider. OAuth 2.1 removes it too.
          </p>`
        : nothing}
      <div class="row">
        <label class="key" for="client-${entry.name}">client id</label>
        <div class="value">
          <input
            id="client-${entry.name}"
            type="text"
            autocomplete="off"
            .value=${clientId}
            @input=${(event: Event) => {
              this.clientIds = { ...this.clientIds, [entry.name]: (event.target as HTMLInputElement).value }
            }}
          />
          <button
            type="button"
            aria-busy=${busy ? 'true' : nothing}
            ?disabled=${busy || clientId === ''}
            @click=${() => (direct ? void this.#requestDirectToken(entry, flow) : this.#authorize(entry))}
          >
            ${busy ? 'Authorizing…' : direct ? 'Request token' : 'Authorize'}
          </button>
        ${grant?.status === 'active' || grant?.status === 'expired'
          ? html`
              <button
                type="button"
                @click=${() => dispatch(this, 'openish-auth-change', { scheme: entry.name, kind: 'clear' })}
              >
                Sign out
              </button>
            `
          : nothing}
        </div>
      </div>
      ${flow === 'password'
        ? html`
            ${this.#renderField(entry, 'username', 'username', 'text', this.usernames[entry.name] ?? '', (value) => {
              this.usernames = { ...this.usernames, [entry.name]: value }
            })}
            ${this.#renderField(entry, 'password', 'password', 'password', this.passwords[entry.name] ?? '', (value) => {
              this.passwords = { ...this.passwords, [entry.name]: value }
            })}
          `
        : nothing}
      ${direct && proxied
        ? this.#renderField(entry, 'secret', 'client secret', 'password', this.secrets[entry.name] ?? '', (value) => {
            this.secrets = { ...this.secrets, [entry.name]: value }
          })
        : nothing}
      ${direct && !proxied
        ? html`<p class="state">
            A client secret would be sent from this page, so openish will not send one. Configure
            <code>proxyUrl</code> if the provider requires one.
          </p>`
        : nothing}
      ${scopes.length > 0
        ? html`
            <div class="row">
              <span class="key">scopes</span>
              <div class="value scopes" role="group" aria-label="Scopes for ${entry.name}">
              ${repeat(
                scopes,
                (scope) => scope,
                (scope) => html`
                  <label class="scope">
                    <input
                      type="checkbox"
                      .checked=${selected.has(scope)}
                      @change=${(event: Event) => {
                        const next = new Set(selected)
                        if ((event.target as HTMLInputElement).checked) {
                          next.add(scope)
                        } else {
                          next.delete(scope)
                        }
                        this.chosenScopes = { ...this.chosenScopes, [entry.name]: [...next] }
                      }}
                    />
                    <span>${scope}</span>
                  </label>
                `,
              )}
              </div>
            </div>
          `
        : nothing}
    `
  }

  #renderScheme(entry: SecurityEntry): TemplateResult {
    const type = entry.scheme?.type
    const oauth = type === 'oauth2' || type === 'openIdConnect'
    const grant = this.request?.session.get(entry.name)
    const pasted = grant?.status === 'active' && grant.kind === 'pasted' ? grant.value : ''

    return html`
      <p class="kind">
        ${entry.scheme ? describeSecurityScheme(entry.scheme) : 'required, but this document never declares it'}
      </p>
      ${entry.scheme?.description
        ? html`<openish-markdown .markdown=${entry.scheme.description} .headingOffset=${4}></openish-markdown>`
        : nothing}
      ${oauth ? this.#renderOAuth(entry) : nothing}
      ${entry.scheme
        ? html`
            <div class="row">
              <label class="key" for="paste-${entry.name}">${oauth ? 'or paste a token' : 'value'}</label>
              <div class="value">
                <input
                  id="paste-${entry.name}"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  .value=${pasted}
                  @change=${(event: Event) =>
                    dispatch(this, 'openish-auth-change', {
                      scheme: entry.name,
                      kind: 'pasted',
                      value: (event.target as HTMLInputElement).value,
                    })}
                />
              </div>
            </div>
          `
        : nothing}
      ${this.#renderState(entry)}
    `
  }

  /**
   * One scheme at a time.
   *
   * An operation that accepts seven alternatives - which the reference document in this repo does -
   * needs one credential, not seven, and rendering all seven asks the reader to work out which of
   * the forms in front of them is the one they are meant to fill in. The picker answers that
   * question before it is asked.
   *
   * Only what is filled in ends up on the wire, so switching the picker does not discard anything:
   * a credential entered under another scheme is still in the session and still applies.
   */
  get #shown(): SecurityEntry | undefined {
    return this.schemes.find((entry) => entry.name === this.shown) ?? this.schemes[0]
  }

  override render(): TemplateResult | typeof nothing {
    const shown = this.#shown
    if (!shown) {
      return nothing
    }

    return html`
      <div class="rows">
        <div class="group">
          <span>Authentication</span>
          ${this.schemes.length > 1
            ? html`
                <select
                  aria-label="Authentication scheme"
                  @change=${(event: Event) => {
                    this.shown = (event.target as HTMLSelectElement).value
                  }}
                >
                  ${repeat(
                    this.schemes,
                    (entry) => entry.name,
                    (entry) => html`
                      <option value=${entry.name} ?selected=${entry.name === shown.name}>
                        ${entry.name}${this.#held(entry) ? ' ✓' : ''}
                      </option>
                    `,
                  )}
                </select>
              `
            : html`<span class="name">${shown.name}</span>`}
        </div>
        ${this.#renderScheme(shown)}
      </div>
    `
  }

  /** Whether the reader is already holding a credential for a scheme, so the picker can say so. */
  #held(entry: SecurityEntry): boolean {
    return this.request?.session.get(entry.name)?.status === 'active'
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-auth-form': OpenishAuthForm
  }
}

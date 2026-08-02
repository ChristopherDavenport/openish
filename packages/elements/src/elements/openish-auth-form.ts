import { consume } from '@lit/context'
import { Task } from '@lit/task'
import {
  authorizeInPopup,
  authorizeUrl,
  beginRedirect,
  createPkce,
  createState,
  discoverOidc,
  expiresInSeconds,
  isSameOrigin,
  requestClientCredentials,
  requestPasswordToken,
  type DiscoveryResult,
  type OidcConfiguration,
} from '@openish/client'
import { describeSecurityScheme, type SecurityEntry } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { completeAuthorization } from '../auth/complete-authorization.js'
import {
  clientIdFor,
  endpointsFor,
  grantFor,
  isDirectGrant,
  openIdConnectUrl,
  scopesFor,
  selectedScopes,
  tokenEndpointFor,
} from '../auth/oauth-flows.js'
import { requestContext, uiContext, type OpenishRequestState, type OpenishUiState } from '../context/contexts.js'
import { dispatch } from '../events.js'
import { renderAuthField } from '../render/auth-field.js'
import { baseStyles, controlStyles, rowStyles, statusStyles, visuallyHidden } from '../styles/shared.js'
import './openish-markdown.js'

/**
 * What the reader has typed into one scheme's form, before any of it becomes a credential.
 *
 * One record rather than the five parallel `Record<string, string>` maps this used to keep. They
 * were always indexed by the same key and written by the same shape of handler, and five of
 * anything is five places to forget.
 *
 * `secret` and `password` are held here and never dispatched: a password is not a credential the
 * session should learn about, it is an input to obtaining one. Only the resulting token leaves.
 */
type SchemeDraft = {
  readonly clientId?: string
  readonly secret?: string
  readonly username?: string
  readonly password?: string
  readonly scopes?: readonly string[]
}

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

  /** What the reader has typed, per scheme. */
  @state()
  private drafts: Readonly<Record<string, SchemeDraft>> = {}

  /**
   * What a provider's metadata said, per scheme - including that it could not be read.
   *
   * The union rather than a pair of maps: "discovered" and "failed to discover" are alternatives,
   * and two maps let a scheme be in both at once or be checked against only one of them.
   */
  @state()
  private discovery: Readonly<Record<string, DiscoveryResult>> = {}

  /** One write for every field on every form. */
  #patch(scheme: string, patch: SchemeDraft): void {
    this.drafts = { ...this.drafts, [scheme]: { ...this.drafts[scheme], ...patch } }
  }

  #draft(scheme: string): SchemeDraft {
    return this.drafts[scheme] ?? {}
  }

  #configFor(scheme: string) {
    return this.ui?.config.oauth?.[scheme]
  }

  /** The provider metadata for a scheme, when it was read successfully. */
  #discovered(scheme: string): OidcConfiguration | undefined {
    const result = this.discovery[scheme]
    return result?.ok ? result.configuration : undefined
  }

  /** Why a scheme's metadata could not be read, when that is what happened. */
  #discoveryError(scheme: string): string | undefined {
    const result = this.discovery[scheme]
    return result && !result.ok ? result.message : undefined
  }

  #clientId(scheme: string): string {
    return clientIdFor(this.#draft(scheme).clientId, this.#configFor(scheme))
  }

  /**
   * Reads a provider's metadata; an `openIdConnect` scheme is unusable without it.
   *
   * Only for the scheme on screen. A document offering seven alternatives should not make a
   * reader's browser call seven providers' well-known endpoints to render a page they may only be
   * reading - so the task is keyed on the scheme showing, and moving the picker starts the next one.
   *
   * A `Task` rather than a call from `updated()`, which is what this was. That version fired on
   * every render, was guarded only by its own result having arrived, and had nothing to cancel it
   * when the element went away - which is three ways of saying it was a side effect in a lifecycle
   * hook rather than a value derived from an input.
   *
   * Constructed rather than kept: a task registers itself with its host, and nothing here reads a
   * result. What it produces is the {@link discovery} entry, which is reactive state like any other.
   */
  constructor() {
    super()

    new Task(this, {
      task: async ([scheme, url]: readonly [string, string | undefined]) => {
        if (!url || this.discovery[scheme]) {
          return
        }
        this.discovery = { ...this.discovery, [scheme]: await discoverOidc(url) }
      },
      args: () => {
        const entry = this.#shown
        return [entry?.name ?? '', entry ? openIdConnectUrl(entry) : undefined] as const
      },
    })
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
    const scopes = selectedScopes(entry, this.#draft(entry.name).scopes, this.#configFor(entry.name))
    const endpoints = endpointsFor(entry, this.#discovered(entry.name))
    const proxyUrl = this.ui?.config.proxyUrl ?? ''

    if (!endpoints) {
      dispatch(this, 'openish-auth-change', {
        scheme: entry.name,
        kind: 'failed',
        message: this.#discoveryError(entry.name) ?? 'This scheme declares no flow openish can start.',
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
      const implicit = grantFor(entry, this.#discovered(entry.name)) === 'implicit'
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

    /*
     * The same finish as a redirect that came back, and deliberately the same code: the two used to
     * be written out separately, one dispatching an event and one writing the session, and the two
     * spellings had already drifted. See `auth/complete-authorization.ts`.
     */
    void authorizeInPopup(prepared).then(async (outcome) => {
      const pending = {
        scheme: entry.name,
        tokenEndpoint: endpoints.tokenEndpoint,
        verifier: outcome.ok && outcome.accessToken === undefined ? (await prepared).verifier : '',
        clientId,
        redirectUri,
      }
      dispatch(this, 'openish-auth-change', await completeAuthorization(outcome, pending, { proxyUrl }))
    })
  }

  #renderState(entry: SecurityEntry): TemplateResult | typeof nothing {
    const grant = this.request?.grants[entry.name]
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

    const seconds = expiresInSeconds(this.request?.grants[entry.name])
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
    const tokenEndpoint = tokenEndpointFor(entry, grant)
    const clientId = this.#clientId(entry.name)
    const draft = this.#draft(entry.name)
    const scopes = selectedScopes(entry, draft.scopes, this.#configFor(entry.name))
    const proxyUrl = this.ui?.config.proxyUrl ?? ''
    const clientSecret = draft.secret ?? ''
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
              username: draft.username ?? '',
              password: draft.password ?? '',
              scopes,
              ...(clientSecret ? { clientSecret } : {}),
              ...(extraParams ? { extraParams } : {}),
            },
            proxyUrl ? { proxyUrl } : {},
          )

    /* The password is not kept after it has been spent. */
    if (grant === 'password') {
      this.#patch(entry.name, { password: '' })
    }

    dispatch(
      this,
      'openish-auth-change',
      result.ok
        ? { scheme: entry.name, kind: 'token', token: result.token }
        : { scheme: entry.name, kind: 'failed', message: result.message },
    )
  }

  #renderOAuth(entry: SecurityEntry): TemplateResult {
    const discovered = this.#discovered(entry.name)
    const draft = this.#draft(entry.name)
    const scopes = scopesFor(entry, discovered)
    const selected = new Set(selectedScopes(entry, draft.scopes, this.#configFor(entry.name)))
    const grant = this.request?.grants[entry.name]
    const busy = grant?.status === 'authorizing'
    const clientId = this.#clientId(entry.name)
    const error = this.#discoveryError(entry.name)
    const flow = grantFor(entry, discovered)
    const direct = isDirectGrant(flow)
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
              this.#patch(entry.name, { clientId: (event.target as HTMLInputElement).value })
            }}
          />
          <button
            type="button"
            aria-busy=${busy ? 'true' : 'false'}
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
            ${renderAuthField({
              scheme: entry.name,
              id: 'username',
              label: 'username',
              type: 'text',
              value: draft.username ?? '',
              onInput: (value) => this.#patch(entry.name, { username: value }),
            })}
            ${renderAuthField({
              scheme: entry.name,
              id: 'password',
              label: 'password',
              type: 'password',
              value: draft.password ?? '',
              onInput: (value) => this.#patch(entry.name, { password: value }),
            })}
          `
        : nothing}
      ${direct && proxied
        ? renderAuthField({
            scheme: entry.name,
            id: 'secret',
            label: 'client secret',
            type: 'password',
            value: draft.secret ?? '',
            onInput: (value) => this.#patch(entry.name, { secret: value }),
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
                        this.#patch(entry.name, { scopes: [...next] })
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
    const grant = this.request?.grants[entry.name]
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
    return this.request?.grants[entry.name]?.status === 'active'
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-auth-form': OpenishAuthForm
  }
}

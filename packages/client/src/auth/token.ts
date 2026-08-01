import type { FetchLike } from '../send.js'

export type TokenSet = {
  accessToken: string
  tokenType: string
  scope: readonly string[]
  refreshToken?: string
  idToken?: string
  /** Epoch milliseconds, or `undefined` when the provider did not say. */
  expiresAt?: number
}

export type TokenResult = { ok: true; token: TokenSet } | { ok: false; message: string }

export type TokenOptions = {
  fetch?: FetchLike
  /** Required before a client secret will be sent. See {@link exchangeCode}. */
  proxyUrl?: string
  now?: () => number
}

/**
 * The rule every grant here obeys: a client secret leaves this page only through a proxy.
 *
 * A secret in a browser is not a secret. Sending one on a direct cross-origin request hands it to
 * the provider *and* to anything that can read the page or the network tab. Providers that require
 * one for a browser client are misconfigured for that use, so the honest answer is to refuse and say
 * why rather than to leak it and appear to work.
 */
const refuseSecret = (what: string): TokenResult => ({
  ok: false,
  message: `This ${what} needs a client secret, which openish will not send from a browser. Configure a proxyUrl so the secret is applied where it can be kept.`,
})

const post = async (
  tokenEndpoint: string,
  body: Record<string, string>,
  options: TokenOptions,
): Promise<TokenResult> => {
  const send = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const target = options.proxyUrl
    ? `${options.proxyUrl}?target=${encodeURIComponent(tokenEndpoint)}`
    : tokenEndpoint

  let response: Response
  try {
    response = await send(target, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
    })
  } catch {
    return {
      ok: false,
      message: `${tokenEndpoint} could not be reached. A token endpoint has to allow this page's origin, or the exchange has to go through a proxy.`,
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, message: `${tokenEndpoint} answered ${response.status} with something that was not JSON.` }
  }

  const data = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>

  if (!response.ok || typeof data['access_token'] !== 'string') {
    /*
     * OAuth error responses carry `error` and `error_description`, and they are usually the most
     * specific thing anyone will tell you - "invalid_grant: PKCE verification failed" beats "400".
     */
    const error = typeof data['error'] === 'string' ? data['error'] : `HTTP ${response.status}`
    const description = typeof data['error_description'] === 'string' ? `: ${data['error_description']}` : ''
    return { ok: false, message: `${error}${description}` }
  }

  const expiresIn = data['expires_in']
  const scope = typeof data['scope'] === 'string' ? data['scope'].split(/\s+/).filter(Boolean) : []

  return {
    ok: true,
    token: {
      accessToken: data['access_token'],
      tokenType: typeof data['token_type'] === 'string' ? data['token_type'] : 'Bearer',
      scope,
      ...(typeof data['refresh_token'] === 'string' ? { refreshToken: data['refresh_token'] } : {}),
      ...(typeof data['id_token'] === 'string' ? { idToken: data['id_token'] } : {}),
      ...(typeof expiresIn === 'number' ? { expiresAt: now() + expiresIn * 1000 } : {}),
    },
  }
}

export type ExchangeRequest = {
  tokenEndpoint: string
  code: string
  verifier: string
  clientId: string
  redirectUri: string
  /** Only sent through a proxy. See below. */
  clientSecret?: string
}

/**
 * Trades an authorization code for a token.
 *
 * **A client secret is only ever sent through `proxyUrl`.** A secret in a page is not a secret, and
 * putting one on a direct cross-origin request hands it to the provider *and* to anything that can
 * read the page. Providers that require one for a browser client are misconfigured for that use, so
 * the honest answer is to refuse and say why rather than to leak it and work.
 */
export const exchangeCode = async (request: ExchangeRequest, options: TokenOptions = {}): Promise<TokenResult> => {
  if (request.clientSecret && !options.proxyUrl) {
    return refuseSecret('exchange')
  }

  return post(
    request.tokenEndpoint,
    {
      grant_type: 'authorization_code',
      code: request.code,
      code_verifier: request.verifier,
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      ...(request.clientSecret ? { client_secret: request.clientSecret } : {}),
    },
    options,
  )
}

export type RefreshRequest = {
  tokenEndpoint: string
  refreshToken: string
  clientId: string
  scopes?: readonly string[]
  clientSecret?: string
}

export const refreshAccessToken = async (
  request: RefreshRequest,
  options: TokenOptions = {},
): Promise<TokenResult> => {
  if (request.clientSecret && !options.proxyUrl) {
    return refuseSecret('refresh')
  }

  return post(
    request.tokenEndpoint,
    {
      grant_type: 'refresh_token',
      refresh_token: request.refreshToken,
      client_id: request.clientId,
      ...(request.scopes && request.scopes.length > 0 ? { scope: request.scopes.join(' ') } : {}),
      ...(request.clientSecret ? { client_secret: request.clientSecret } : {}),
    },
    options,
  )
}

export type ClientCredentialsRequest = {
  tokenEndpoint: string
  clientId: string
  scopes?: readonly string[]
  clientSecret?: string
  /** Anything the provider needs beyond the standard set, e.g. `audience`. */
  extraParams?: Record<string, string>
}

/**
 * The client credentials grant: the application is the principal, and there is no reader in the loop.
 *
 * Almost every provider requires a secret for this one, which means in practice it needs a
 * `proxyUrl`. That is not a limitation openish invented - a browser page cannot hold a client secret,
 * and a grant whose whole premise is that the *client* is trusted does not have a browser-safe form.
 * It is offered because a documentation page fronted by a proxy is a real deployment, and because a
 * provider that issues a public client for it exists too.
 */
export const requestClientCredentials = async (
  request: ClientCredentialsRequest,
  options: TokenOptions = {},
): Promise<TokenResult> => {
  if (request.clientSecret && !options.proxyUrl) {
    return refuseSecret('grant')
  }

  return post(
    request.tokenEndpoint,
    {
      grant_type: 'client_credentials',
      client_id: request.clientId,
      ...(request.scopes && request.scopes.length > 0 ? { scope: request.scopes.join(' ') } : {}),
      ...(request.clientSecret ? { client_secret: request.clientSecret } : {}),
      ...(request.extraParams ?? {}),
    },
    options,
  )
}

export type PasswordRequest = {
  tokenEndpoint: string
  clientId: string
  username: string
  password: string
  scopes?: readonly string[]
  clientSecret?: string
  extraParams?: Record<string, string>
}

/**
 * The resource owner password grant.
 *
 * OAuth 2.1 removes this grant, and it is the wrong thing to reach for in almost every case: it asks
 * a reader to type their credentials into a page that is not the identity provider, which is the
 * habit phishing depends on. It is here because documents in the wild still declare it and a
 * reference that cannot exercise what the document declares is not describing the API - not because
 * it is a good idea. Anything that renders it should say so.
 */
export const requestPasswordToken = async (
  request: PasswordRequest,
  options: TokenOptions = {},
): Promise<TokenResult> => {
  if (request.clientSecret && !options.proxyUrl) {
    return refuseSecret('grant')
  }

  return post(
    request.tokenEndpoint,
    {
      grant_type: 'password',
      client_id: request.clientId,
      username: request.username,
      password: request.password,
      ...(request.scopes && request.scopes.length > 0 ? { scope: request.scopes.join(' ') } : {}),
      ...(request.clientSecret ? { client_secret: request.clientSecret } : {}),
      ...(request.extraParams ?? {}),
    },
    options,
  )
}

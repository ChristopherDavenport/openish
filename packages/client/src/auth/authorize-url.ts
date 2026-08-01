export type AuthorizeRequest = {
  authorizationEndpoint: string
  clientId: string
  /** Where the provider sends the reader back. Must be one the provider has registered. */
  redirectUri: string
  scopes: readonly string[]
  state: string
  /** The S256 challenge from {@link createPkce}. Omitted for the implicit flow, which has no exchange. */
  challenge?: string
  /**
   * `code` for the authorization code flow, `token` for implicit.
   *
   * Implicit is here because documents declare it, not because it is a good idea: the provider hands
   * the access token back in the URL fragment, where it lands in history and in anything that logs a
   * URL, and there is no refresh token. OAuth 2.1 drops it. `code` with PKCE is the default and
   * should stay the default.
   */
  responseType?: 'code' | 'token'
  /** Anything the provider needs beyond the standard set, e.g. `audience` or `prompt`. */
  extraParams?: Record<string, string>
}

/**
 * The URL that starts an authorization flow.
 *
 * Built rather than templated so the parameters are encoded once, by `URLSearchParams`, and so an
 * endpoint that already carries a query string keeps it - some providers route by one.
 */
export const authorizeUrl = (request: AuthorizeRequest): string => {
  const url = new URL(request.authorizationEndpoint)

  const parameters: Record<string, string> = {
    response_type: request.responseType ?? 'code',
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    state: request.state,
    /*
     * A challenge only means something to a flow that later presents a verifier. Sending one with
     * `response_type=token` is at best ignored and at worst rejected as an unknown parameter.
     */
    ...(request.challenge && (request.responseType ?? 'code') === 'code'
      ? { code_challenge: request.challenge, code_challenge_method: 'S256' }
      : {}),
    ...request.extraParams,
  }

  if (request.scopes.length > 0) {
    parameters['scope'] = request.scopes.join(' ')
  }

  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value)
  }

  return url.toString()
}

/**
 * The token an implicit flow left in a redirect fragment.
 *
 * The provider answers by navigating back to `redirect_uri#access_token=…&state=…` - a fragment, not
 * a query, so the value never reaches a server. Returns `undefined` when the fragment carries no
 * token, which is every other navigation the page will ever see.
 *
 * `state` is verified by the caller, which is where the expected value lives.
 */
export const tokenFromFragment = (
  fragment: string,
  now: () => number = Date.now,
): { accessToken: string; tokenType: string; scope: string[]; expiresAt?: number; state?: string } | undefined => {
  const parameters = new URLSearchParams(fragment.replace(/^#/, ''))
  const accessToken = parameters.get('access_token')
  if (!accessToken) {
    return undefined
  }

  const expiresIn = Number(parameters.get('expires_in'))
  const state = parameters.get('state')

  return {
    accessToken,
    tokenType: parameters.get('token_type') ?? 'Bearer',
    scope: (parameters.get('scope') ?? '').split(/\s+/).filter(Boolean),
    ...(Number.isFinite(expiresIn) && expiresIn > 0 ? { expiresAt: now() + expiresIn * 1000 } : {}),
    ...(state ? { state } : {}),
  }
}

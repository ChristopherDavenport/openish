import { exchangeCode, tokenFromFragment, type AuthorizationOutcome } from '@openish/client'

import type { OpenishAuthChange } from '../events.js'

/** What finishing a flow needs, whichever way the reader was sent to the provider. */
export type PendingAuthorization = {
  readonly scheme: string
  readonly tokenEndpoint: string
  readonly verifier: string
  readonly clientId: string
  readonly redirectUri: string
}

/**
 * Turning a provider's answer into the one thing that changes what the reader is holding.
 *
 * There are two ways to come back from an authorization server - a popup that resolves a promise,
 * and a redirect that reloads the page - and until this existed each of them finished the flow in
 * its own code, one dispatching an event and the other writing the session directly. Two writers is
 * two ideas of what the reader is holding, and the two spellings had already drifted.
 *
 * So the answer is an `OpenishAuthChange` rather than a side effect. Both callers dispatch it, the
 * root applies it, and the session has one writer.
 */
export const completeAuthorization = async (
  outcome: AuthorizationOutcome,
  pending: PendingAuthorization,
  options: { readonly proxyUrl?: string | undefined } = {},
): Promise<OpenishAuthChange> => {
  const scheme = pending.scheme

  if (!outcome.ok) {
    return { scheme, kind: 'failed', message: outcome.message }
  }

  /*
   * A redirect or popup that came back with a token rather than a code is an implicit flow, which
   * has nothing to exchange - the provider put the access token itself in the fragment, which is
   * exactly why the grant is deprecated. The transport has already verified the state.
   */
  if (outcome.accessToken !== undefined) {
    const implicit = tokenFromFragment(outcome.fragment)
    if (!implicit) {
      return { scheme, kind: 'failed', message: 'The provider returned no usable token.' }
    }

    return {
      scheme,
      kind: 'token',
      token: {
        accessToken: implicit.accessToken,
        tokenType: implicit.tokenType,
        scope: implicit.scope,
        ...(implicit.expiresAt !== undefined ? { expiresAt: implicit.expiresAt } : {}),
      },
    }
  }

  const proxyUrl = options.proxyUrl
  const result = await exchangeCode(
    {
      tokenEndpoint: pending.tokenEndpoint,
      code: outcome.code,
      verifier: pending.verifier,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
    },
    proxyUrl ? { proxyUrl } : {},
  )

  return result.ok
    ? { scheme, kind: 'token', token: result.token }
    : { scheme, kind: 'failed', message: result.message }
}

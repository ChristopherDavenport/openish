import type { OidcConfiguration } from '@openish/client'
import type { OAuthSchemeConfig, SecurityEntry } from '@openish/core'

/**
 * Reading an OAuth security scheme, with no form around it.
 *
 * Which grant a scheme is going to use, where its endpoints are, and which scopes are on offer are
 * all decided from three things: what the document declares, what a provider's metadata added, and
 * what the host configured. None of them is a fact about the element showing the answer, and every
 * one of them is a precedence rule worth being able to state a case about on its own.
 */

/**
 * The flows an `oauth2` scheme declares, as a bag rather than a union.
 *
 * `SecuritySchemeObject` narrows by `type`, and this code probes several flow names before it knows
 * which one it holds - the trap PLAN.md records about `SchemaObject`, in the same shape.
 */
type OAuthFlows = Record<string, { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }>

/** The grants openish can start, in the order it prefers them. */
export type OAuthGrant = 'code' | 'clientCredentials' | 'password' | 'implicit'

/** Where a flow starts, and where it exchanges. `tokenEndpoint` is `''` for implicit, which never does. */
export type OAuthEndpoints = {
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
}

const flowsOf = (entry: SecurityEntry): OAuthFlows =>
  (entry.scheme as { flows?: OAuthFlows } | undefined)?.flows ?? {}

/** The discovery URL an `openIdConnect` scheme carries, if it is one. */
export const openIdConnectUrl = (entry: SecurityEntry): string | undefined =>
  (entry.scheme as { openIdConnectUrl?: string } | undefined)?.openIdConnectUrl

/** The endpoints for a scheme: declared by an `oauth2` flow, or discovered for `openIdConnect`. */
export const endpointsFor = (
  entry: SecurityEntry,
  discovered: OidcConfiguration | undefined,
): OAuthEndpoints | undefined => {
  if (discovered) {
    return discovered
  }

  const flows = flowsOf(entry)
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
export const grantFor = (entry: SecurityEntry, discovered: OidcConfiguration | undefined): OAuthGrant | undefined => {
  if (discovered) {
    return 'code'
  }

  const flows = flowsOf(entry)
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

/** Whether a grant posts to the token endpoint itself rather than sending the reader to a provider. */
export const isDirectGrant = (grant: OAuthGrant | undefined): grant is 'clientCredentials' | 'password' =>
  grant === 'clientCredentials' || grant === 'password'

/** The token endpoint for a grant that posts to one directly. */
export const tokenEndpointFor = (entry: SecurityEntry, grant: 'clientCredentials' | 'password'): string =>
  flowsOf(entry)[grant]?.tokenUrl ?? ''

/** Every scope on offer: the operation's own, plus whatever the flow or the provider advertises. */
export const scopesFor = (entry: SecurityEntry, discovered: OidcConfiguration | undefined): string[] => {
  const declared = Object.values(flowsOf(entry)).flatMap((flow) => Object.keys(flow?.scopes ?? {}))
  return [...new Set([...entry.scopes, ...declared, ...(discovered?.scopesSupported ?? [])])]
}

/**
 * The scopes that will actually be asked for.
 *
 * What the operation asks for is ticked to begin with: it is the minimum that will work. A host's
 * configured list replaces that, and the reader's own choice replaces both.
 */
export const selectedScopes = (
  entry: SecurityEntry,
  chosen: readonly string[] | undefined,
  config: OAuthSchemeConfig | undefined,
): string[] => [...(chosen ?? config?.scopes ?? entry.scopes)]

/** The client id in force: what the reader typed, else what the host configured, else nothing. */
export const clientIdFor = (typed: string | undefined, config: OAuthSchemeConfig | undefined): string =>
  typed ?? config?.clientId ?? ''

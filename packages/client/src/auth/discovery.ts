import type { FetchLike } from '../send.js'

/**
 * The parts of an OpenID Provider Metadata document a docs page needs.
 *
 * An `openIdConnect` security scheme carries a discovery URL and nothing else - no endpoints, no
 * scopes. Everything needed to start a flow is in the document behind that URL, so without this
 * step such a scheme cannot be rendered, let alone used. Both schemes in the reference document in
 * this repo are of that shape.
 */
export type OidcConfiguration = {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  scopesSupported: readonly string[]
  codeChallengeMethodsSupported: readonly string[]
}

export type DiscoveryResult =
  | { ok: true; configuration: OidcConfiguration }
  | { ok: false; message: string }

const cache = new Map<string, OidcConfiguration>()

/** Forgets what has been discovered. For tests, and for a host that swaps documents. */
export const clearDiscoveryCache = (): void => cache.clear()

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

/**
 * Reads a provider's metadata.
 *
 * Only successes are cached: a provider that was unreachable a moment ago is worth asking again,
 * while one that answered is not going to answer differently within a page view.
 *
 * `authorization_endpoint` and `token_endpoint` are required here even though the specification
 * marks the first optional, because a provider without them cannot do the one flow this supports,
 * and finding that out at the point of a click is worse than finding it out now.
 */
export const discoverOidc = async (
  url: string,
  options: { fetch?: FetchLike } = {},
): Promise<DiscoveryResult> => {
  const cached = cache.get(url)
  if (cached) {
    return { ok: true, configuration: cached }
  }

  const send = options.fetch ?? globalThis.fetch

  let payload: unknown
  try {
    const response = await send(url, { headers: { accept: 'application/json' } })
    if (!response.ok) {
      return { ok: false, message: `${url} answered ${response.status} ${response.statusText}.` }
    }
    payload = await response.json()
  } catch {
    return {
      ok: false,
      message: `${url} could not be read. The provider may not allow this page's origin to fetch its metadata.`,
    }
  }

  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, message: `${url} did not answer with a metadata document.` }
  }

  const metadata = payload as Record<string, unknown>
  const authorizationEndpoint = metadata['authorization_endpoint']
  const tokenEndpoint = metadata['token_endpoint']

  if (typeof authorizationEndpoint !== 'string' || typeof tokenEndpoint !== 'string') {
    return {
      ok: false,
      message: `${url} declares no authorization or token endpoint, so an authorization code flow cannot start.`,
    }
  }

  const configuration: OidcConfiguration = {
    issuer: typeof metadata['issuer'] === 'string' ? metadata['issuer'] : url,
    authorizationEndpoint,
    tokenEndpoint,
    scopesSupported: asStrings(metadata['scopes_supported']),
    codeChallengeMethodsSupported: asStrings(metadata['code_challenge_methods_supported']),
  }

  cache.set(url, configuration)
  return { ok: true, configuration }
}

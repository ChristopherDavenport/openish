import { afterEach, describe, expect, it, vi } from 'vitest'

import { authorizeUrl, tokenFromFragment } from '../src/auth/authorize-url.js'
import { clearDiscoveryCache, discoverOidc } from '../src/auth/discovery.js'
import { codeChallenge, createPkce, createState } from '../src/auth/pkce.js'
import { AuthSession, type Grant } from '../src/auth/session.js'
import {
  exchangeCode,
  refreshAccessToken,
  requestClientCredentials,
  requestPasswordToken,
} from '../src/auth/token.js'

afterEach(() => {
  clearDiscoveryCache()
})

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })

const stub = (responses: Array<Response | Error>) => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let index = 0
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = responses[Math.min(index, responses.length - 1)]
    index += 1
    if (next instanceof Error) {
      throw next
    }
    return next!.clone()
  })
  return { fetch, calls }
}

const METADATA = {
  issuer: 'https://digital.example.com',
  authorization_endpoint: 'https://digital.example.com/a/oauth2/authorize',
  token_endpoint: 'https://digital.example.com/a/oauth2/token',
  scopes_supported: ['openid', 'https://example.com/abilities/read'],
  code_challenge_methods_supported: ['S256'],
}

describe('PKCE', () => {
  it('produces the challenge RFC 7636 says it should', async () => {
    /* The vector from the RFC itself, so this is checked against the standard and not against us. */
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('makes verifiers of a legal length, from the unreserved alphabet, and never the same twice', async () => {
    const first = await createPkce()
    const second = await createPkce()

    expect(first.verifier).toHaveLength(43)
    expect(first.verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    expect(first.challenge).toBe(await codeChallenge(first.verifier))
    expect(first.method).toBe('S256')
    expect(first.verifier).not.toBe(second.verifier)
  })

  it('makes unguessable state', () => {
    expect(createState()).not.toBe(createState())
  })
})

describe('discovery', () => {
  it('reads the endpoints and scopes a provider advertises', async () => {
    const { fetch } = stub([json(METADATA)])
    const result = await discoverOidc('https://digital.example.com/.well-known/openid-configuration', { fetch })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.configuration.authorizationEndpoint).toBe('https://digital.example.com/a/oauth2/authorize')
    expect(result.configuration.tokenEndpoint).toBe('https://digital.example.com/a/oauth2/token')
    expect(result.configuration.scopesSupported).toContain('https://example.com/abilities/read')
  })

  it('asks once and remembers the answer', async () => {
    const { fetch } = stub([json(METADATA)])
    const url = 'https://digital.example.com/.well-known/openid-configuration'

    await discoverOidc(url, { fetch })
    await discoverOidc(url, { fetch })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not remember a failure, so a provider that comes back can be reached', async () => {
    const url = 'https://digital.example.com/.well-known/openid-configuration'
    const failing = stub([new TypeError('Failed to fetch')])
    expect((await discoverOidc(url, { fetch: failing.fetch })).ok).toBe(false)

    const working = stub([json(METADATA)])
    expect((await discoverOidc(url, { fetch: working.fetch })).ok).toBe(true)
  })

  it('says so when the metadata cannot start a flow', async () => {
    const { fetch } = stub([json({ issuer: 'https://x.example.com' })])
    const result = await discoverOidc('https://x.example.com/.well-known/openid-configuration', { fetch })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('authorization or token endpoint')
    }
  })

  it('names the origin when the metadata cannot be read at all', async () => {
    const { fetch } = stub([new TypeError('Failed to fetch')])
    const result = await discoverOidc('https://x.example.com/.well-known/openid-configuration', { fetch })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('origin')
    }
  })
})

describe('the authorization URL', () => {
  it('carries everything the flow needs, encoded once', () => {
    const url = new URL(
      authorizeUrl({
        authorizationEndpoint: 'https://digital.example.com/a/oauth2/authorize?tenant=garden',
        clientId: 'docs',
        redirectUri: 'https://docs.example.com/oauth-callback',
        scopes: ['openid', 'https://example.com/abilities/read'],
        state: 'st4te',
        challenge: 'ch4llenge',
      }),
    )

    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('docs')
    expect(url.searchParams.get('redirect_uri')).toBe('https://docs.example.com/oauth-callback')
    expect(url.searchParams.get('scope')).toBe('openid https://example.com/abilities/read')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    /* A query the endpoint already carried is how some providers route; it survives. */
    expect(url.searchParams.get('tenant')).toBe('garden')
  })

  it('omits scope entirely rather than sending an empty one', () => {
    const url = new URL(
      authorizeUrl({
        authorizationEndpoint: 'https://x.example.com/authorize',
        clientId: 'docs',
        redirectUri: 'https://docs.example.com/cb',
        scopes: [],
        state: 's',
        challenge: 'c',
      }),
    )

    expect(url.searchParams.has('scope')).toBe(false)
  })
})

describe('the token exchange', () => {
  const request = {
    tokenEndpoint: 'https://digital.example.com/a/oauth2/token',
    code: 'abc',
    verifier: 'v',
    clientId: 'docs',
    redirectUri: 'https://docs.example.com/cb',
  }

  it('posts the grant as a form and reads the token back', async () => {
    const { fetch, calls } = stub([
      json({ access_token: 'at', token_type: 'Bearer', expires_in: 3600, refresh_token: 'rt', scope: 'openid read' }),
    ])
    const result = await exchangeCode(request, { fetch, now: () => 1_000_000 })

    const body = new URLSearchParams(String(calls[0]?.init.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code_verifier')).toBe('v')
    expect(body.get('redirect_uri')).toBe('https://docs.example.com/cb')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.token.accessToken).toBe('at')
      expect(result.token.refreshToken).toBe('rt')
      expect(result.token.scope).toEqual(['openid', 'read'])
      expect(result.token.expiresAt).toBe(1_000_000 + 3_600_000)
    }
  })

  it('surfaces the provider’s own error, which is the most specific thing anyone will say', async () => {
    const { fetch } = stub([
      json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, { status: 400 }),
    ])
    const result = await exchangeCode(request, { fetch })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe('invalid_grant: PKCE verification failed')
    }
  })

  it('refuses to send a client secret from a browser, and says why', async () => {
    const { fetch } = stub([json({ access_token: 'at' })])
    const result = await exchangeCode({ ...request, clientSecret: 'shhh' }, { fetch })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('proxyUrl')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the secret once there is a proxy to apply it', async () => {
    const { fetch, calls } = stub([json({ access_token: 'at', token_type: 'Bearer' })])
    const result = await exchangeCode(
      { ...request, clientSecret: 'shhh' },
      { fetch, proxyUrl: 'https://proxy.example.com/f' },
    )

    expect(result.ok).toBe(true)
    expect(calls[0]?.url).toContain('https://proxy.example.com/f?target=')
    expect(new URLSearchParams(String(calls[0]?.init.body)).get('client_secret')).toBe('shhh')
  })

  it('refreshes with the refresh token', async () => {
    const { fetch, calls } = stub([json({ access_token: 'new', token_type: 'Bearer' })])
    const result = await refreshAccessToken(
      { tokenEndpoint: request.tokenEndpoint, refreshToken: 'rt', clientId: 'docs' },
      { fetch },
    )

    expect(new URLSearchParams(String(calls[0]?.init.body)).get('grant_type')).toBe('refresh_token')
    expect(result.ok && result.token.accessToken).toBe('new')
  })
})

describe('the session', () => {
  it('hands out exactly the credentials a request builder takes', () => {
    const session = new AuthSession()
    session.setPasted('apiKey', 'k')
    session.setToken('oauth', { accessToken: 'at', tokenType: 'Bearer', scope: [] })

    expect(session.credentials()).toEqual({ apiKey: 'k', oauth: 'at' })
  })

  it('treats an expired token as expired, and stops offering it', () => {
    let now = 1_000
    const session = new AuthSession({ now: () => now })
    session.setToken('oauth', { accessToken: 'at', tokenType: 'Bearer', scope: [], expiresAt: 2_000 })

    expect(session.get('oauth').status).toBe('active')
    expect(session.expiresInSeconds('oauth')).toBe(1)

    now = 3_000

    expect(session.get('oauth').status).toBe('expired')
    /* Sending it would produce a 401 that reads like the API's fault. */
    expect(session.credentials()).toEqual({})
    expect(session.refreshTokenFor('oauth')).toBeUndefined()
  })

  it('moves through authorizing and failure, and tells whoever is listening', () => {
    const session = new AuthSession()
    const seen: string[] = []
    const unsubscribe = session.subscribe(() => seen.push(session.get('oauth').status))

    session.beginAuthorizing('oauth')
    session.fail('oauth', 'invalid_grant')
    const grant = session.get('oauth')

    expect(seen).toEqual(['authorizing', 'failed'])
    expect(grant.status === 'failed' && grant.message).toBe('invalid_grant')

    unsubscribe()
    session.clear('oauth')
    expect(seen).toHaveLength(2)
  })

  it('clearing a pasted value is the same as never having had one', () => {
    const session = new AuthSession()
    session.setPasted('apiKey', 'k')
    session.setPasted('apiKey', '')

    expect(session.get('apiKey').status).toBe('idle')
  })
})

describe('the client credentials grant', () => {
  const bodyOf = (calls: Array<{ init: RequestInit }>) => new URLSearchParams(String(calls[0]!.init.body))

  it('asks for a token with no reader in the loop', async () => {
    const { fetch, calls } = stub([json({ access_token: 'machine-token', token_type: 'Bearer', expires_in: 60 })])

    const result = await requestClientCredentials(
      { tokenEndpoint: 'https://issuer.example.com/token', clientId: 'svc', scopes: ['read', 'write'] },
      { fetch, now: () => 1_000 },
    )

    expect(result.ok).toBe(true)
    expect(bodyOf(calls).get('grant_type')).toBe('client_credentials')
    expect(bodyOf(calls).get('client_id')).toBe('svc')
    expect(bodyOf(calls).get('scope')).toBe('read write')
    expect(result.ok && result.token.expiresAt).toBe(61_000)
  })

  it('refuses a client secret unless a proxy will carry it', async () => {
    const { fetch, calls } = stub([json({})])

    const result = await requestClientCredentials(
      { tokenEndpoint: 'https://issuer.example.com/token', clientId: 'svc', clientSecret: 'shhh' },
      { fetch },
    )

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('proxyUrl')
    /* Nothing left the page: the refusal happens before the request, not after it. */
    expect(calls).toHaveLength(0)
  })

  it('sends the secret once a proxy is configured', async () => {
    const { fetch, calls } = stub([json({ access_token: 'machine-token' })])

    await requestClientCredentials(
      { tokenEndpoint: 'https://issuer.example.com/token', clientId: 'svc', clientSecret: 'shhh' },
      { fetch, proxyUrl: 'https://proxy.example.com/forward' },
    )

    expect(calls[0]!.url).toContain('proxy.example.com')
    expect(bodyOf(calls).get('client_secret')).toBe('shhh')
  })
})

describe('the password grant', () => {
  it('sends the credentials it was given', async () => {
    const { fetch, calls } = stub([json({ access_token: 'reader-token' })])

    const result = await requestPasswordToken(
      {
        tokenEndpoint: 'https://issuer.example.com/token',
        clientId: 'docs',
        username: 'ada',
        password: 'lovelace',
      },
      { fetch },
    )

    expect(result.ok).toBe(true)
    const body = new URLSearchParams(String(calls[0]!.init.body))
    expect(body.get('grant_type')).toBe('password')
    expect(body.get('username')).toBe('ada')
    expect(body.get('password')).toBe('lovelace')
  })
})

describe('the implicit flow', () => {
  it('omits the PKCE challenge, which it has no exchange to present', () => {
    const url = new URL(
      authorizeUrl({
        authorizationEndpoint: 'https://issuer.example.com/authorize',
        clientId: 'docs',
        redirectUri: 'https://docs.example.com/callback',
        scopes: ['read'],
        state: 'xyz',
        challenge: 'ignored',
        responseType: 'token',
      }),
    )

    expect(url.searchParams.get('response_type')).toBe('token')
    expect(url.searchParams.get('code_challenge')).toBeNull()
    expect(url.searchParams.get('code_challenge_method')).toBeNull()
  })

  it('keeps sending the challenge for the code flow', () => {
    const url = new URL(
      authorizeUrl({
        authorizationEndpoint: 'https://issuer.example.com/authorize',
        clientId: 'docs',
        redirectUri: 'https://docs.example.com/callback',
        scopes: [],
        state: 'xyz',
        challenge: 'the-challenge',
      }),
    )

    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge')).toBe('the-challenge')
  })

  it('reads the token the provider left in the fragment', () => {
    const token = tokenFromFragment(
      '#access_token=abc&token_type=Bearer&expires_in=30&scope=read%20write&state=xyz',
      () => 5_000,
    )

    expect(token?.accessToken).toBe('abc')
    expect(token?.scope).toEqual(['read', 'write'])
    expect(token?.expiresAt).toBe(35_000)
    expect(token?.state).toBe('xyz')
  })

  it('answers undefined for every other fragment, which is most of them', () => {
    expect(tokenFromFragment('#/tags/accounts')).toBeUndefined()
    expect(tokenFromFragment('')).toBeUndefined()
  })
})

describe('a host-supplied credential store', () => {
  const memoryStore = (initial: Record<string, Grant> = {}) => {
    let held: Record<string, Grant> | undefined = Object.keys(initial).length > 0 ? initial : undefined
    return {
      read: () => held,
      write: (grants: Record<string, Grant>) => {
        held = grants
      },
      clear: () => {
        held = undefined
      },
      get held() {
        return held
      },
    }
  }

  it('keeps nothing when the host supplies no store', () => {
    const session = new AuthSession()
    session.setPasted('key', 'value')

    /* Nothing to assert against but the absence of a crash - which is the point: memory only. */
    expect(session.credentials()).toEqual({ key: 'value' })
  })

  it('writes an active grant to the store', () => {
    const store = memoryStore()
    const session = new AuthSession({ store })

    session.setPasted('key', 'value')

    expect(store.held).toEqual({ key: { status: 'active', kind: 'pasted', value: 'value' } })
  })

  it('restores an active grant on construction', () => {
    const store = memoryStore({ key: { status: 'active', kind: 'pasted', value: 'restored' } })
    const session = new AuthSession({ store })

    expect(session.credentials()).toEqual({ key: 'restored' })
  })

  it('refuses to restore a flow that was interrupted, or an error from a session that has gone', () => {
    const store = memoryStore({
      half: { status: 'authorizing' },
      broken: { status: 'failed', message: 'from last time' },
      good: { status: 'active', kind: 'pasted', value: 'ok' },
    })
    const session = new AuthSession({ store })

    expect(session.get('half').status).toBe('idle')
    expect(session.get('broken').status).toBe('idle')
    expect(session.get('good').status).toBe('active')
  })

  it('clears the store when the last credential goes', () => {
    const store = memoryStore()
    const session = new AuthSession({ store })

    session.setPasted('key', 'value')
    expect(store.held).toBeDefined()

    session.clearAll()
    expect(store.held).toBeUndefined()
  })

  it('does not persist an expired token, which could not be used anyway', () => {
    const store = memoryStore()
    let clock = 1_000
    const session = new AuthSession({ store, now: () => clock })

    session.setToken('oauth', { accessToken: 'abc', tokenType: 'Bearer', scope: [], expiresAt: 2_000 })
    expect(store.held).toBeDefined()

    clock = 3_000
    session.clear('oauth')
    expect(store.held).toBeUndefined()
  })
})

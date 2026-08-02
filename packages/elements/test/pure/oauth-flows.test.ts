import type { OidcConfiguration } from '@openish/client'
import type { SecurityEntry } from '@openish/core'
import { describe, expect, it } from 'vitest'

import {
  clientIdFor,
  endpointsFor,
  grantFor,
  isDirectGrant,
  openIdConnectUrl,
  scopesFor,
  selectedScopes,
  tokenEndpointFor,
} from '../../src/auth/oauth-flows.js'

const entry = (scheme: unknown, scopes: readonly string[] = []): SecurityEntry => ({
  name: 'consumer',
  scheme: scheme as SecurityEntry['scheme'],
  scopes,
})

const oauth = (flows: Record<string, unknown>) => ({ type: 'oauth2', flows })

const AUTHORIZATION_CODE = {
  authorizationUrl: 'https://issuer.test/authorize',
  tokenUrl: 'https://issuer.test/token',
  scopes: { read: 'Read', write: 'Write' },
}

const DISCOVERED: OidcConfiguration = {
  issuer: 'https://issuer.test',
  authorizationEndpoint: 'https://issuer.test/oidc/authorize',
  tokenEndpoint: 'https://issuer.test/oidc/token',
  scopesSupported: ['openid', 'profile'],
  codeChallengeMethodsSupported: ['S256'],
}

describe('grantFor', () => {
  /*
   * Ordered by what is safe in a browser, not by what the document lists first: the code flow is the
   * only one designed for a public client, and implicit is last because OAuth 2.1 removes it.
   */
  it('prefers the authorization code flow over every other one on offer', () => {
    const scheme = oauth({
      implicit: { authorizationUrl: 'https://issuer.test/authorize', scopes: {} },
      password: { tokenUrl: 'https://issuer.test/token', scopes: {} },
      clientCredentials: { tokenUrl: 'https://issuer.test/token', scopes: {} },
      authorizationCode: AUTHORIZATION_CODE,
    })
    expect(grantFor(entry(scheme), undefined)).toBe('code')
  })

  it('prefers client credentials over password and implicit', () => {
    const scheme = oauth({
      implicit: { authorizationUrl: 'https://issuer.test/authorize', scopes: {} },
      password: { tokenUrl: 'https://issuer.test/token', scopes: {} },
      clientCredentials: { tokenUrl: 'https://issuer.test/token', scopes: {} },
    })
    expect(grantFor(entry(scheme), undefined)).toBe('clientCredentials')
  })

  it('prefers password over implicit', () => {
    const scheme = oauth({
      implicit: { authorizationUrl: 'https://issuer.test/authorize', scopes: {} },
      password: { tokenUrl: 'https://issuer.test/token', scopes: {} },
    })
    expect(grantFor(entry(scheme), undefined)).toBe('password')
  })

  it('falls back to implicit when it is the only thing declared', () => {
    const scheme = oauth({ implicit: { authorizationUrl: 'https://issuer.test/authorize', scopes: {} } })
    expect(grantFor(entry(scheme), undefined)).toBe('implicit')
  })

  /* A code flow missing half of itself cannot be started, so it is not on offer. */
  it('ignores an authorization code flow with no token endpoint', () => {
    const scheme = oauth({ authorizationCode: { authorizationUrl: 'https://issuer.test/authorize', scopes: {} } })
    expect(grantFor(entry(scheme), undefined)).toBeUndefined()
  })

  it('is undefined for a scheme that declares no usable flow at all', () => {
    expect(grantFor(entry({ type: 'http', scheme: 'bearer' }), undefined)).toBeUndefined()
    expect(grantFor(entry(undefined), undefined)).toBeUndefined()
  })

  /* Discovery answers for the code flow, so a discovered scheme is always `code`. */
  it('is code once a provider has been discovered, whatever the document said', () => {
    const scheme = oauth({ implicit: { authorizationUrl: 'https://issuer.test/authorize', scopes: {} } })
    expect(grantFor(entry(scheme), DISCOVERED)).toBe('code')
  })
})

describe('isDirectGrant', () => {
  it('is the two that post to the token endpoint themselves', () => {
    expect(isDirectGrant('clientCredentials')).toBe(true)
    expect(isDirectGrant('password')).toBe(true)
    expect(isDirectGrant('code')).toBe(false)
    expect(isDirectGrant('implicit')).toBe(false)
    expect(isDirectGrant(undefined)).toBe(false)
  })
})

describe('endpointsFor', () => {
  it('takes the discovered endpoints in preference to the declared ones', () => {
    const scheme = oauth({ authorizationCode: AUTHORIZATION_CODE })
    expect(endpointsFor(entry(scheme), DISCOVERED)).toMatchObject({
      authorizationEndpoint: DISCOVERED.authorizationEndpoint,
      tokenEndpoint: DISCOVERED.tokenEndpoint,
    })
  })

  it('reads the authorization code flow when nothing has been discovered', () => {
    expect(endpointsFor(entry(oauth({ authorizationCode: AUTHORIZATION_CODE })), undefined)).toEqual({
      authorizationEndpoint: AUTHORIZATION_CODE.authorizationUrl,
      tokenEndpoint: AUTHORIZATION_CODE.tokenUrl,
    })
  })

  /* Implicit has an authorization endpoint and no token endpoint, because it never exchanges. */
  it('gives implicit an empty token endpoint rather than omitting it', () => {
    const scheme = oauth({ implicit: { authorizationUrl: 'https://issuer.test/authorize', scopes: {} } })
    expect(endpointsFor(entry(scheme), undefined)).toEqual({
      authorizationEndpoint: 'https://issuer.test/authorize',
      tokenEndpoint: '',
    })
  })

  it('is undefined for a scheme openish cannot start a flow for', () => {
    expect(endpointsFor(entry(oauth({})), undefined)).toBeUndefined()
  })
})

describe('tokenEndpointFor', () => {
  it('reads the endpoint the named direct grant posts to', () => {
    const scheme = oauth({
      clientCredentials: { tokenUrl: 'https://issuer.test/machine', scopes: {} },
      password: { tokenUrl: 'https://issuer.test/person', scopes: {} },
    })
    expect(tokenEndpointFor(entry(scheme), 'clientCredentials')).toBe('https://issuer.test/machine')
    expect(tokenEndpointFor(entry(scheme), 'password')).toBe('https://issuer.test/person')
  })

  it('is empty rather than undefined when the grant is not declared', () => {
    expect(tokenEndpointFor(entry(oauth({})), 'password')).toBe('')
  })
})

describe('scopesFor', () => {
  it('unions what the operation asks for, what the flows declare, and what the provider advertises', () => {
    const scheme = oauth({ authorizationCode: AUTHORIZATION_CODE })
    expect(scopesFor(entry(scheme, ['accounts:read']), DISCOVERED)).toEqual([
      'accounts:read',
      'read',
      'write',
      'openid',
      'profile',
    ])
  })

  it('lists a scope named twice only once', () => {
    const scheme = oauth({ authorizationCode: AUTHORIZATION_CODE })
    expect(scopesFor(entry(scheme, ['read']), undefined)).toEqual(['read', 'write'])
  })
})

describe('selectedScopes', () => {
  /* What the operation asks for is ticked to begin with: it is the minimum that will work. */
  it("starts at the operation's own scopes", () => {
    expect(selectedScopes(entry(undefined, ['accounts:read']), undefined, undefined)).toEqual(['accounts:read'])
  })

  it("prefers the host's configured list to the operation's", () => {
    expect(selectedScopes(entry(undefined, ['accounts:read']), undefined, { scopes: ['openid'] })).toEqual(['openid'])
  })

  it('prefers what the reader ticked to either', () => {
    expect(selectedScopes(entry(undefined, ['accounts:read']), ['write'], { scopes: ['openid'] })).toEqual(['write'])
  })

  /* An empty selection is a choice, not an absence: the reader unticked everything. */
  it('honours an empty selection rather than falling back', () => {
    expect(selectedScopes(entry(undefined, ['accounts:read']), [], { scopes: ['openid'] })).toEqual([])
  })

  it('copies, so the caller cannot edit the entry through it', () => {
    const source = entry(undefined, ['accounts:read'])
    const selected = selectedScopes(source, undefined, undefined)
    selected.push('write')
    expect(source.scopes).toEqual(['accounts:read'])
  })
})

describe('clientIdFor and openIdConnectUrl', () => {
  it('prefers what the reader typed, then what the host configured', () => {
    expect(clientIdFor('typed', { clientId: 'configured' })).toBe('typed')
    expect(clientIdFor(undefined, { clientId: 'configured' })).toBe('configured')
    expect(clientIdFor(undefined, undefined)).toBe('')
  })

  /* An empty string is the reader having cleared the field, which is not the config coming back. */
  it('treats a cleared field as a cleared field', () => {
    expect(clientIdFor('', { clientId: 'configured' })).toBe('')
  })

  it('finds the discovery URL only on an openIdConnect scheme', () => {
    expect(openIdConnectUrl(entry({ type: 'openIdConnect', openIdConnectUrl: 'https://issuer.test/.well-known' }))).toBe(
      'https://issuer.test/.well-known',
    )
    expect(openIdConnectUrl(entry(oauth({})))).toBeUndefined()
  })
})

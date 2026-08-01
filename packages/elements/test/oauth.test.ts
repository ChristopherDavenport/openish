import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { OAUTH_SPEC } from './fixtures.js'
import { deepQuery, deepTextOf, disposeAll, mountReference, openTryIt, textOf, type Harness } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const METADATA = {
  issuer: 'https://issuer.example.com',
  authorization_endpoint: 'https://issuer.example.com/authorize',
  token_endpoint: 'https://issuer.example.com/token',
  scopes_supported: ['openid', 'accounts.read'],
  code_challenge_methods_supported: ['S256'],
}

/** The popup, with the lifecycle a real one has: ours, then the provider's, then ours again. */
const fakePopup = () => {
  let href = 'about:blank'
  let readable = true
  const location = {
    get href() {
      if (!readable) {
        throw new DOMException('cross-origin', 'SecurityError')
      }
      return href
    },
    set href(value: string) {
      href = value
      readable = false
    },
  }
  const popup = { closed: false, close() {}, location }

  return {
    popup: popup as unknown as Window,
    /** The URL the flow sent it to, once it has been set. */
    get authorizeUrl() {
      return href
    },
    returnTo(url: string) {
      href = url
      readable = true
    },
  }
}

/** Serves discovery and the token endpoint, and records everything else the page sends. */
const stubNetwork = (frameWindow: Window) => {
  const sent: Array<{ url: string; init: RequestInit }> = []

  ;(frameWindow as Window & { fetch: typeof fetch }).fetch = (async (input: string, init: RequestInit = {}) => {
    const url = String(input)
    sent.push({ url, init })

    if (url.includes('.well-known')) {
      return new Response(JSON.stringify(METADATA), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/token')) {
      return new Response(
        JSON.stringify({ access_token: 'at_live', token_type: 'Bearer', expires_in: 3600, scope: 'openid' }),
        { headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  return sent
}

/** Mounts with the network already stubbed, and with a popup the test drives. */
const mount = async (config: Record<string, unknown> = {}) => {
  let sent: Array<{ url: string; init: RequestInit }> = []
  const fake = fakePopup()

  const harness = await mountReference({
    path: '/tags/accounts/listAccounts',
    spec: OAUTH_SPEC,
    config: { oauth: { consumer: { clientId: 'docs-playground' } }, ...config },
    beforeMount: (frameWindow) => {
      sent = stubNetwork(frameWindow)
      frameWindow.open = (() => fake.popup) as Window['open']
    },
  })

  await new Promise((resolve) => setTimeout(resolve, 250))
  await harness.settle()

  /* The auth form lives in the client, so every test here starts by opening it. */
  await openTryIt(harness)
  await new Promise((resolve) => setTimeout(resolve, 250))
  await harness.settle()

  return { harness, sent, fake }
}

const authForm = (harness: Harness) => deepQuery(harness.element.shadowRoot!, 'openish-auth-form')!

const click = async (harness: Harness, root: ShadowRoot, label: string) => {
  const button = [...root.querySelectorAll('button')].find((candidate) => textOf(candidate).startsWith(label))
  if (!button) {
    throw new Error(`No "${label}" button. Found: ${[...root.querySelectorAll('button')].map((b) => textOf(b)).join(', ')}`)
  }
  button.click()
  await new Promise((resolve) => setTimeout(resolve, 200))
  await harness.settle()
}

describe('an OpenID Connect scheme', () => {
  it('reads the provider’s metadata, because the document carries none', async () => {
    const { harness, sent } = await mount()

    /* The scopes on offer come from the provider; the document names only `openid`. */
    expect(deepTextOf(authForm(harness).shadowRoot!)).toContain('accounts.read')
    expect(sent.some((call) => call.url.includes('.well-known'))).toBe(true)
  })

  it('completes the flow and then sends the token it obtained', async () => {
    const { harness, sent, fake } = await mount()

    await click(harness, authForm(harness).shadowRoot!, 'Authorize')

    /* The URL carries what an authorization code flow with PKCE has to carry. */
    const authorize = new URL(fake.authorizeUrl)
    expect(authorize.origin + authorize.pathname).toBe('https://issuer.example.com/authorize')
    expect(authorize.searchParams.get('response_type')).toBe('code')
    expect(authorize.searchParams.get('client_id')).toBe('docs-playground')
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('code_challenge')).toBeTruthy()

    fake.returnTo(`${window.location.origin}/cb?code=abc123&state=${authorize.searchParams.get('state')}`)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await harness.settle()

    /* The code was exchanged, with the verifier that matches the challenge above. */
    const exchange = sent.find((call) => call.url.includes('/token'))!
    const body = new URLSearchParams(String(exchange.init.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('abc123')
    expect(body.get('code_verifier')).toBeTruthy()

    expect(deepTextOf(authForm(harness).shadowRoot!)).toContain('Signed in')

    /* And the request that follows carries it. */
    const panel = deepQuery(harness.element.shadowRoot!, 'openish-try-it')!
    await click(harness, panel.shadowRoot!, 'Send')

    const request = sent.find((call) => call.url.startsWith('https://api.example.com'))!
    expect((request.init.headers as Record<string, string>)['Authorization']).toBe('Bearer at_live')
  })

  it('refuses a code that comes back under a state it did not send', async () => {
    const { harness, fake } = await mount()
    await click(harness, authForm(harness).shadowRoot!, 'Authorize')

    fake.returnTo(`${window.location.origin}/cb?code=abc123&state=somebody-elses`)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await harness.settle()

    expect(deepTextOf(authForm(harness).shadowRoot!)).toContain('state we did not send')
    expect(deepTextOf(authForm(harness).shadowRoot!)).not.toContain('Signed in')
  })

  it('says so when the provider refuses, and leaves the paste field usable', async () => {
    const { harness, fake } = await mount()
    await click(harness, authForm(harness).shadowRoot!, 'Authorize')

    fake.returnTo(`${window.location.origin}/cb?error=access_denied&error_description=No`)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await harness.settle()

    expect(deepTextOf(authForm(harness).shadowRoot!)).toContain('access_denied')
    expect(authForm(harness).shadowRoot!.querySelector('input[type="password"]')).not.toBeNull()
  })

  it('leaves nothing behind when the reader signs out', async () => {
    const { harness, fake } = await mount()
    await click(harness, authForm(harness).shadowRoot!, 'Authorize')
    const state = new URL(fake.authorizeUrl).searchParams.get('state')
    fake.returnTo(`${window.location.origin}/cb?code=abc&state=${state}`)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await harness.settle()

    await click(harness, authForm(harness).shadowRoot!, 'Sign out')

    expect(deepTextOf(authForm(harness).shadowRoot!)).not.toContain('Signed in')
  })
})

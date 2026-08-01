import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, deepTextOf, disposeAll, mountReference, openTryIt, type Harness } from './helpers.js'

afterEach(() => {
  disposeAll()
})

type Sent = { url: string; body: string }

/** Records what the page posts to a token endpoint, and answers with a token. */
const interceptToken = (harness: Harness, payload: Record<string, unknown> = { access_token: 'granted' }) => {
  const sent: Sent[] = []
  const frameWindow = harness.frame.contentWindow as Window & { fetch: typeof fetch }

  frameWindow.fetch = (async (input: string, init: RequestInit = {}) => {
    sent.push({ url: String(input), body: typeof init.body === 'string' ? init.body : '' })
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  return sent
}

const client = async (id: string, config?: Record<string, unknown>): Promise<Harness> => {
  const { GRANTS_SPEC } = await import('./fixtures.js')
  const harness = await mountReference({ path: `/tags/grants/${id}`, spec: GRANTS_SPEC, ...(config ? { config } : {}) })
  await new Promise((resolve) => setTimeout(resolve, 150))
  await harness.settle()
  await openTryIt(harness)
  return harness
}

const fieldValue = (harness: Harness, idPrefix: string, value: string) => {
  const input = deepQueryAll<HTMLInputElement>(harness.element.shadowRoot!, 'input').find((el) =>
    el.id.startsWith(idPrefix),
  )!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
}

const press = async (harness: Harness, label: string) => {
  const button = deepQueryAll<HTMLButtonElement>(harness.element.shadowRoot!, 'button').find(
    (b) => b.textContent?.trim() === label,
  )!
  button.click()
  await new Promise((resolve) => setTimeout(resolve, 150))
  await harness.settle()
}

describe('the client credentials grant, in the form', () => {
  it('offers Request token rather than Authorize, because there is no round trip', async () => {
    const harness = await client('machine')

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('Request token')
    expect(deepTextOf(harness.element.shadowRoot!)).not.toContain('Authorize')
  })

  it('posts the grant to the declared token endpoint', async () => {
    const harness = await client('machine')
    fieldValue(harness, 'client-', 'svc')
    await harness.settle()

    const sent = interceptToken(harness)
    await press(harness, 'Request token')

    expect(sent[0]!.url).toBe('https://issuer.example.com/token')
    const body = new URLSearchParams(sent[0]!.body)
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('client_id')).toBe('svc')
    expect(body.get('scope')).toBe('read')
  })

  it('explains that a secret needs a proxy, and offers no field for one without it', async () => {
    const harness = await client('machine')

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('will not send one')
    expect(deepQueryAll<HTMLInputElement>(harness.element.shadowRoot!, 'input').some((i) => i.id.startsWith('secret-'))).toBe(
      false,
    )
  })

  it('offers the secret field once a proxy is configured', async () => {
    const harness = await client('machine', { proxyUrl: 'https://proxy.example.com/forward' })

    expect(
      deepQueryAll<HTMLInputElement>(harness.element.shadowRoot!, 'input').some((i) => i.id.startsWith('secret-')),
    ).toBe(true)
  })
})

describe('the password grant, in the form', () => {
  it('warns that it is the wrong shape, because it is', async () => {
    const harness = await client('person')

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('not the identity provider')
  })

  it('posts the credentials and then forgets the password', async () => {
    const harness = await client('person')
    fieldValue(harness, 'client-', 'docs')
    fieldValue(harness, 'username-', 'ada')
    fieldValue(harness, 'password-', 'lovelace')
    await harness.settle()

    const sent = interceptToken(harness)
    await press(harness, 'Request token')

    const body = new URLSearchParams(sent[0]!.body)
    expect(body.get('grant_type')).toBe('password')
    expect(body.get('username')).toBe('ada')
    expect(body.get('password')).toBe('lovelace')

    /* A spent password is not kept in the form. */
    const field = deepQueryAll<HTMLInputElement>(harness.element.shadowRoot!, 'input').find((el) =>
      el.id.startsWith('password-'),
    )!
    expect(field.value).toBe('')
  })
})

describe('the implicit flow, in the form', () => {
  it('says what it is, rather than offering it as an equal', async () => {
    const harness = await client('legacy')

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('OAuth 2.1')
    expect(deepTextOf(harness.element.shadowRoot!)).toContain('returns the token in the URL')
  })

  it('still offers Authorize, since it does need a round trip', async () => {
    const harness = await client('legacy')

    expect(deepQuery(harness.element.shadowRoot!, 'button')).not.toBeNull()
    expect(deepTextOf(harness.element.shadowRoot!)).toContain('Authorize')
  })
})

describe('a host-supplied credential store, through the element', () => {
  it('restores what the host kept, before the first render', async () => {
    const { GRANTS_SPEC } = await import('./fixtures.js')
    const held = { machine: { status: 'active' as const, kind: 'pasted' as const, value: 'kept-token' } }

    const harness = await mountReference({
      path: '/tags/grants/machine',
      spec: GRANTS_SPEC,
      config: { revealCredentialsInSamples: true },
      credentialStore: {
        read: () => held,
        write: () => {},
        clear: () => {},
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    /* The restored token is on the wire, which is the only assertion that means anything. */
    expect(deepTextOf(harness.element.shadowRoot!)).toContain('kept-token')
  })

  it('writes through when the reader signs in', async () => {
    const { GRANTS_SPEC } = await import('./fixtures.js')
    const writes: Array<Record<string, unknown>> = []

    const harness = await mountReference({
      path: '/tags/grants/machine',
      spec: GRANTS_SPEC,
      credentialStore: {
        read: () => undefined,
        write: (grants) => writes.push(grants),
        clear: () => {},
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()
    await openTryIt(harness)

    const paste = deepQueryAll<HTMLInputElement>(harness.element.shadowRoot!, 'input').find((el) =>
      el.id.startsWith('paste-'),
    )!
    paste.value = 'typed-token'
    paste.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    await harness.settle()

    expect(writes.at(-1)).toEqual({ machine: { status: 'active', kind: 'pasted', value: 'typed-token' } })
  })
})

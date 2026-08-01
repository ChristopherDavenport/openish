import { describe, expect, it } from 'vitest'

import {
  authorizeInPopup,
  beginRedirect,
  clearPendingRedirect,
  isSameOrigin,
  resumeRedirect,
  type PendingFlow,
} from '../src/auth/transport.js'

/**
 * These need a browser, which is why they carry the `.browser` suffix and run in the Chromium
 * project rather than the Node one. The rest of `@openish/client` has no DOM at all, and its suite
 * would fail loudly if that changed.
 */

/**
 * A stand-in for the popup, with the lifecycle a real one has.
 *
 * Freshly opened it is `about:blank` and ours, so it can be pointed somewhere. Once it is on the
 * provider's origin, reading `location.href` throws - the `location` object itself is still there,
 * which is exactly how a browser behaves. Coming back to our origin makes it readable again.
 */
const fakePopup = () => {
  let href = 'about:blank'
  let readable = true

  const location = {
    get href() {
      if (!readable) {
        throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError')
      }
      return href
    },
    set href(value: string) {
      href = value
      readable = false
    },
  }

  const popup = {
    closed: false,
    close() {
      this.closed = true
    },
    location,
  }

  return {
    popup: popup as unknown as Window,
    /** The provider redirected back to our origin, so the URL is readable again. */
    returnTo(url: string) {
      href = url
      readable = true
    },
    close() {
      popup.closed = true
    },
  }
}

const memoryStorage = () => {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    size: () => entries.size,
  }
}

const pending = (overrides: Partial<PendingFlow> = {}): PendingFlow => ({
  scheme: 'oauth',
  verifier: 'v3r1f13r',
  state: 'st4te',
  redirectUri: `${window.location.origin}/oauth-callback`,
  tokenEndpoint: 'https://provider.example.com/token',
  clientId: 'docs',
  returnTo: '/tags/accounts/getAccount',
  ...overrides,
})

describe('isSameOrigin', () => {
  it('accepts our own origin and refuses anyone else', () => {
    expect(isSameOrigin(`${window.location.origin}/oauth-callback`)).toBe(true)
    /* A relative reference is same-origin by definition, which is the property that matters. */
    expect(isSameOrigin('/oauth-callback')).toBe(true)
    expect(isSameOrigin('https://somewhere-else.example.com/cb')).toBe(false)
    /* The sneaky one: protocol-relative, which reads like a path and is not. */
    expect(isSameOrigin('//somewhere-else.example.com/cb')).toBe(false)
  })
})

describe('the popup transport', () => {
  it('waits through the cross-origin leg and reads the code when it comes home', async () => {
    const fake = fakePopup()
    const outcome = authorizeInPopup(
      { url: 'https://provider.example.com/authorize', state: 'st4te' },
      { open: () => fake.popup, intervalMs: 5 },
    )

    /* While the popup is on the provider's origin, reading its location throws; nothing happens. */
    await new Promise((resolve) => setTimeout(resolve, 20))
    fake.returnTo(`${window.location.origin}/oauth-callback?code=abc123&state=st4te`)

    expect(await outcome).toEqual({ ok: true, code: 'abc123', state: 'st4te' })
  })

  it('refuses a code that comes back under a state we never sent', async () => {
    const fake = fakePopup()
    const outcome = authorizeInPopup(
      { url: 'https://provider.example.com/authorize', state: 'st4te' },
      { open: () => fake.popup, intervalMs: 5 },
    )

    /* The window has to reach the provider before it can come back from it. */
    await new Promise((resolve) => setTimeout(resolve, 20))
    fake.returnTo(`${window.location.origin}/oauth-callback?code=abc123&state=somebody-elses`)
    const result = await outcome

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('state we did not send')
    }
  })

  it('passes on the provider’s refusal', async () => {
    const fake = fakePopup()
    const outcome = authorizeInPopup(
      { url: 'https://provider.example.com/authorize', state: 'st4te' },
      { open: () => fake.popup, intervalMs: 5 },
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    fake.returnTo(`${window.location.origin}/cb?error=access_denied&error_description=User%20said%20no`)
    const result = await outcome

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe('access_denied: User said no')
    }
  })

  it('notices a window the reader closed', async () => {
    const fake = fakePopup()
    const outcome = authorizeInPopup(
      { url: 'https://provider.example.com/authorize', state: 'st4te' },
      { open: () => fake.popup, intervalMs: 5 },
    )

    fake.close()
    const result = await outcome

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('closed')
    }
  })

  it('says what happened when the browser blocks the window', async () => {
    const result = await authorizeInPopup(
      { url: 'https://provider.example.com/authorize', state: 's' },
      { open: () => null },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('pop-ups')
    }
  })

  it('opens the window before it knows where to send it, so nothing blocks the pop-up', async () => {
    const fake = fakePopup()
    let resolveRequest: (request: { url: string; state: string }) => void = () => {}
    const pending = new Promise<{ url: string; state: string }>((resolve) => {
      resolveRequest = resolve
    })

    /* Discovery is still in flight here; the window is already open. */
    const outcome = authorizeInPopup(pending, { open: () => fake.popup, intervalMs: 5 })
    resolveRequest({ url: 'https://provider.example.com/authorize', state: 'st4te' })

    await new Promise((resolve) => setTimeout(resolve, 20))
    fake.returnTo(`${window.location.origin}/cb?code=abc&state=st4te`)

    expect(await outcome).toEqual({ ok: true, code: 'abc', state: 'st4te' })
  })

  it('gives up rather than polling forever', async () => {
    const fake = fakePopup()
    const result = await authorizeInPopup(
      { url: 'https://provider.example.com/authorize', state: 's' },
      { open: () => fake.popup, intervalMs: 5, timeoutMs: 10 },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('timed out')
    }
  })
})

describe('the redirect transport', () => {
  it('writes down what the return trip needs, then leaves', () => {
    const storage = memoryStorage()
    const visited: string[] = []

    beginRedirect('https://provider.example.com/authorize?x=1', pending(), {
      storage,
      assign: (url) => visited.push(url),
    })

    expect(visited).toEqual(['https://provider.example.com/authorize?x=1'])
    expect(JSON.parse(storage.getItem('openish:oauth-flow')!)).toMatchObject({ state: 'st4te', verifier: 'v3r1f13r' })
  })

  it('picks the flow up on the way back, and takes the code out of the URL', () => {
    const storage = memoryStorage()
    const replaced: string[] = []
    beginRedirect('https://provider.example.com/authorize', pending(), { storage, assign: () => {} })

    const resumed = resumeRedirect({
      storage,
      location: {
        href: `${window.location.origin}/tags/accounts/getAccount?keep=1&code=abc&state=st4te`,
        search: '?keep=1&code=abc&state=st4te',
      },
      replaceState: (url) => replaced.push(url),
    })

    expect(resumed?.outcome).toEqual({ ok: true, code: 'abc', state: 'st4te' })
    expect(resumed?.pending.verifier).toBe('v3r1f13r')
    expect(resumed?.pending.returnTo).toBe('/tags/accounts/getAccount')

    /* The code must not survive in history, a bookmark, or whatever the host logs. */
    expect(replaced).toEqual(['/tags/accounts/getAccount?keep=1'])
    /* And the verifier is spent: a second exchange cannot be attempted with it. */
    expect(storage.size()).toBe(0)
  })

  it('ignores an ordinary page load', () => {
    const storage = memoryStorage()

    expect(
      resumeRedirect({
        storage,
        location: { href: `${window.location.origin}/tags/accounts`, search: '' },
        replaceState: () => {},
      }),
    ).toBeUndefined()
  })

  it('ignores a callback it has no pending flow for', () => {
    const storage = memoryStorage()

    expect(
      resumeRedirect({
        storage,
        location: { href: `${window.location.origin}/x?code=abc&state=s`, search: '?code=abc&state=s' },
        replaceState: () => {},
      }),
    ).toBeUndefined()
  })

  it('refuses a mismatched state on the way back too', () => {
    const storage = memoryStorage()
    beginRedirect('https://provider.example.com/authorize', pending(), { storage, assign: () => {} })

    const resumed = resumeRedirect({
      storage,
      location: { href: `${window.location.origin}/x?code=abc&state=wrong`, search: '?code=abc&state=wrong' },
      replaceState: () => {},
    })

    expect(resumed?.outcome.ok).toBe(false)
  })

  it('can throw away a flow that never came back', () => {
    const storage = memoryStorage()
    beginRedirect('https://provider.example.com/authorize', pending(), { storage, assign: () => {} })

    clearPendingRedirect({ storage })

    expect(storage.size()).toBe(0)
  })
})

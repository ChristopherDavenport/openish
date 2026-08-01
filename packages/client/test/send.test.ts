import { describe, expect, it, vi } from 'vitest'

import type { HarRequest } from '../src/har.js'
import { requestUrl, sendRequest, unsendableCookies } from '../src/send.js'

const har = (overrides: Partial<HarRequest> = {}): HarRequest => ({
  method: 'GET',
  url: 'https://api.example.com/v1/accounts',
  httpVersion: 'HTTP/1.1',
  headers: [],
  queryString: [],
  cookies: [],
  headersSize: -1,
  bodySize: -1,
  ...overrides,
})

/** A `fetch` that records what it was asked to do and answers with whatever the test wants. */
const stubFetch = (response: Response | Error) => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    if (response instanceof Error) {
      throw response
    }
    return response.clone()
  })
  return { fetch, calls }
}

const ok = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' }, ...init })

describe('requestUrl', () => {
  it('appends the HAR query string to whatever the URL already had', () => {
    expect(
      requestUrl(
        har({
          url: 'https://api.example.com/v1/accounts?existing=1',
          queryString: [
            { name: 'limit', value: '10' },
            { name: 'tag', value: 'a b' },
          ],
        }),
      ),
    ).toBe('https://api.example.com/v1/accounts?existing=1&limit=10&tag=a+b')
  })
})

describe('sendRequest', () => {
  it('sends the method, headers, and body the HAR describes', async () => {
    const { fetch, calls } = stubFetch(ok('{}'))

    await sendRequest(
      har({
        method: 'POST',
        headers: [{ name: 'Authorization', value: 'Bearer abc' }],
        queryString: [{ name: 'limit', value: '10' }],
        postData: { mimeType: 'application/json', text: '{"a":1}' },
      }),
      { fetch },
    )

    expect(calls[0]?.url).toBe('https://api.example.com/v1/accounts?limit=10')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.headers).toEqual({ Authorization: 'Bearer abc' })
    expect(calls[0]?.init.body).toBe('{"a":1}')
  })

  it('sends no body when the request has none, rather than an empty one', async () => {
    const { fetch, calls } = stubFetch(ok('{}'))

    await sendRequest(har(), { fetch })

    expect('body' in (calls[0]?.init ?? {})).toBe(false)
  })

  it('reports the response, its timing, and its size', async () => {
    const { fetch } = stubFetch(ok('{"id":"acct_1"}'))
    const result = await sendRequest(har(), { fetch })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.status).toBe(200)
    expect(result.body).toBe('{"id":"acct_1"}')
    expect(result.mediaType).toBe('application/json')
    expect(result.headers['content-type']).toBe('application/json')
    expect(result.size).toBe(15)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('treats an HTTP error as an answer, not a failure', async () => {
    const { fetch } = stubFetch(new Response('nope', { status: 404, statusText: 'Not Found' }))
    const result = await sendRequest(har(), { fetch })

    /* A 404 is what the reader was testing for. Hiding it behind an error state hides the answer. */
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe(404)
      expect(result.body).toBe('nope')
    }
  })

  it('explains a rejected fetch instead of repeating "Failed to fetch"', async () => {
    const { fetch } = stubFetch(new TypeError('Failed to fetch'))
    const result = await sendRequest(har(), { fetch })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.reason).toBe('network')
    expect(result.message).toContain('https://api.example.com')
    expect(result.message).toContain('CORS')
    expect(result.message).not.toContain('Failed to fetch')
  })

  it('says the proxy failed when there is a proxy in the way', async () => {
    const { fetch, calls } = stubFetch(new TypeError('Failed to fetch'))
    const result = await sendRequest(har(), { fetch, proxyUrl: 'https://proxy.example.com/forward' })

    expect(calls[0]?.url).toBe(
      'https://proxy.example.com/forward?target=https%3A%2F%2Fapi.example.com%2Fv1%2Faccounts',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('proxy')
      expect(result.message).toContain('https://proxy.example.com')
    }
  })

  it('forwards through the proxy with the request otherwise intact', async () => {
    const { fetch, calls } = stubFetch(ok('{}'))

    await sendRequest(
      har({
        method: 'PUT',
        headers: [{ name: 'X-Key', value: 'k' }],
        postData: { mimeType: 'application/json', text: '{}' },
      }),
      { fetch, proxyUrl: 'https://proxy.example.com/forward' },
    )

    expect(calls[0]?.init.method).toBe('PUT')
    expect(calls[0]?.init.headers).toEqual({ 'X-Key': 'k' })
    expect(calls[0]?.init.body).toBe('{}')
  })

  it('reports a cancellation as its own outcome', async () => {
    const controller = new AbortController()
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const { fetch } = stubFetch(abort)

    const result = await sendRequest(har(), { fetch, signal: controller.signal })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('aborted')
    }
  })

  it('passes the abort signal on, so cancelling reaches the transport', async () => {
    const controller = new AbortController()
    const { fetch, calls } = stubFetch(ok('{}'))

    await sendRequest(har(), { fetch, signal: controller.signal })

    expect(calls[0]?.init.signal).toBe(controller.signal)
  })

  it('refuses a URL that is not one', async () => {
    const { fetch } = stubFetch(ok('{}'))
    const result = await sendRequest(har({ url: 'not a url' }), { fetch })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid')
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('unsendableCookies', () => {
  it('names the cookie parameters a browser will not let us send', () => {
    /* Script cannot set `Cookie` on a fetch. Saying so beats dropping them quietly. */
    expect(unsendableCookies(har({ cookies: [{ name: 'session', value: 'abc' }] }))).toEqual(['session'])
    expect(unsendableCookies(har())).toEqual([])
  })
})

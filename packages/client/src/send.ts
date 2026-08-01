import type { HarRequest } from './har.js'

/** The `fetch` to use. Injected so this is testable in Node and replaceable by a host. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type SendOptions = {
  fetch?: FetchLike
  /**
   * Forward through a host-run proxy for APIs that do not allow the docs origin.
   *
   * The contract is one line to implement: the request arrives at `${proxyUrl}?target=<encoded url>`
   * with its method, headers, and body intact, and whatever the target answers is returned verbatim.
   * openish neither ships nor hosts one - a proxy sees every credential that passes through it, so
   * it has to be the reader's own infrastructure.
   */
  proxyUrl?: string
  signal?: AbortSignal
}

export type SendSuccess = {
  ok: true
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  mediaType: string
  /** Round trip in milliseconds, measured here rather than reported by the server. */
  durationMs: number
  /** Bytes of the body as received. */
  size: number
}

export type SendFailureReason = 'network' | 'aborted' | 'invalid'

export type SendFailure = {
  ok: false
  reason: SendFailureReason
  message: string
  durationMs: number
}

export type SendResult = SendSuccess | SendFailure

/** Cookie parameters cannot be sent: script may not set `Cookie` on a `fetch`. */
export const unsendableCookies = (request: HarRequest): string[] =>
  request.cookies.map((cookie) => cookie.name)

/** The URL with the HAR's query string applied, leaving whatever the URL already carried alone. */
export const requestUrl = (request: HarRequest): string => {
  const url = new URL(request.url)
  for (const entry of request.queryString) {
    url.searchParams.append(entry.name, entry.value)
  }
  return url.toString()
}

const headersOf = (response: Response): Record<string, string> => {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    headers[name] = value
  })
  return headers
}

/**
 * Sends the request a HAR describes.
 *
 * Returns a result rather than throwing, because every interesting failure here is an ordinary
 * outcome a reader needs explained: a browser refusing a cross-origin request looks identical to the
 * network being down - both arrive as `TypeError: Failed to fetch` with nothing else - and showing
 * that string to someone reading documentation tells them nothing they can act on. The origin is
 * named instead, with the two things that are actually true about it.
 *
 * An HTTP error is *not* a failure: a 404 is an answer, and an API reference that hides it behind an
 * error state is hiding the thing the reader was testing for.
 */
export const sendRequest = async (request: HarRequest, options: SendOptions = {}): Promise<SendResult> => {
  const send = options.fetch ?? globalThis.fetch
  const started = Date.now()
  const elapsed = () => Date.now() - started

  let url: string
  try {
    url = requestUrl(request)
  } catch {
    return { ok: false, reason: 'invalid', message: `Not a valid URL: ${request.url}`, durationMs: 0 }
  }

  const target = options.proxyUrl ? `${options.proxyUrl}?target=${encodeURIComponent(url)}` : url
  const headers: Record<string, string> = {}
  for (const header of request.headers) {
    headers[header.name] = header.value
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    ...(request.postData?.text === undefined ? {} : { body: request.postData.text }),
    ...(options.signal ? { signal: options.signal } : {}),
  }

  try {
    const response = await send(target, init)
    const body = await response.text()

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: headersOf(response),
      body,
      mediaType: (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '',
      durationMs: elapsed(),
      size: new TextEncoder().encode(body).length,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, reason: 'aborted', message: 'The request was cancelled.', durationMs: elapsed() }
    }

    return {
      ok: false,
      reason: 'network',
      message: describeNetworkFailure(target, options.proxyUrl !== undefined),
      durationMs: elapsed(),
    }
  }
}

/**
 * What a rejected `fetch` almost always means, said in a way a reader can act on.
 *
 * The browser deliberately withholds the reason - telling a page why a cross-origin request failed
 * would itself leak information - so this cannot be certain. It says which of the two it is likely
 * to be, and names the origin, which is the thing the API owner needs to hear about.
 */
const describeNetworkFailure = (url: string, proxied: boolean): string => {
  let origin = url
  try {
    origin = new URL(url).origin
  } catch {
    /* Keep the whole string if it will not parse; it is still better than nothing. */
  }

  return proxied
    ? `The proxy at ${origin} could not be reached, or it refused the request.`
    : `${origin} could not be reached. If it is running, it is most likely refusing this page's origin — an API has to send CORS headers before a browser will let a page read its response. A host-configured proxyUrl is the way around that.`
}

/**
 * Getting the reader to the authorization server and back.
 *
 * The only part of this package that needs a browser, and still no framework. Two shapes, because
 * the two are genuinely different: a popup resolves a promise while the page stays where it is; a
 * redirect never resolves, because the page is gone by the time it would.
 */
export type AuthorizationOutcome =
  /** The authorization code flow: a code to exchange. */
  | { ok: true; code: string; state: string; accessToken?: undefined }
  /** The implicit flow: the token itself, straight off the fragment, with nothing to exchange. */
  | { ok: true; accessToken: string; fragment: string; state: string; code?: undefined }
  | { ok: false; message: string }

/**
 * What a redirect has to survive a page load with. Never a token, and never for long.
 *
 * The endpoint and client id travel with it so that coming back needs nothing else: discovery may
 * have been reachable when the flow started and not be when it returns, and a code that cannot be
 * exchanged expires in about a minute.
 */
export type PendingFlow = {
  scheme: string
  verifier: string
  state: string
  redirectUri: string
  tokenEndpoint: string
  clientId: string
  /** Where the reader was, so they end up back there rather than at the top of the document. */
  returnTo: string
}

const STORAGE_KEY = 'openish:oauth-flow'

/**
 * The redirect URI must be same-origin, and this is not a formality.
 *
 * Both transports read the authorization code off a URL the browser landed on. A cross-origin one
 * cannot be read at all, and asking a provider to send a code somewhere we do not control is asking
 * it to hand the code to someone else.
 */
export const isSameOrigin = (uri: string, origin: string = window.location.origin): boolean => {
  try {
    return new URL(uri, origin).origin === origin
  } catch {
    return false
  }
}

/**
 * Reads the provider's answer, or its refusal, from a callback URL.
 *
 * Two shapes, because two flows. The authorization code flow answers in the query string; the
 * implicit flow answers in the *fragment*, with the access token itself rather than a code - which
 * is exactly why implicit is deprecated, since a fragment lands in history and in anything that logs
 * a URL. An error can arrive in either half, so both are checked before either is trusted.
 */
const outcomeFrom = (url: URL, expectedState: string): AuthorizationOutcome => {
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))

  const error = url.searchParams.get('error') ?? fragment.get('error')
  if (error) {
    const description = url.searchParams.get('error_description') ?? fragment.get('error_description')
    return { ok: false, message: description ? `${error}: ${description}` : error }
  }

  const accessToken = fragment.get('access_token')
  if (accessToken) {
    const state = fragment.get('state') ?? ''
    if (state !== expectedState) {
      return { ok: false, message: 'The authorization server came back with a state we did not send. Ignored.' }
    }
    return { ok: true, accessToken, fragment: url.hash, state }
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''

  if (!code) {
    return { ok: false, message: 'The authorization server came back without a code.' }
  }

  /*
   * The whole point of `state`. A code that arrives under a state we did not issue was not issued
   * for us, and exchanging it would be exchanging someone else's.
   */
  if (state !== expectedState) {
    return { ok: false, message: 'The authorization server came back with a state we did not send. Ignored.' }
  }

  return { ok: true, code, state }
}

export type PopupOptions = {
  open?: (url: string, target: string, features: string) => Window | null
  intervalMs?: number
  timeoutMs?: number
}

/** Where to send the popup, and the state that answer must come back under. */
export type AuthorizationRequest = { url: string; state: string }

/**
 * Runs the flow in a popup, leaving the page - and everything typed into it - alone.
 *
 * **The window is opened before anything is awaited.** `window.open` outside the click that asked
 * for it is an unsolicited pop-up, and browsers block it - so when the URL is still being worked out
 * (discovery usually is), a promise may be passed and the blank window is pointed at the result when
 * it arrives. That ordering is the whole reason this takes a promise at all.
 *
 * The popup is polled rather than listened to. While it is on the provider's origin, reading its
 * location throws and there is nothing to hear; once it comes back to ours, the URL is readable and
 * carries the answer. A `postMessage` would need a page we control at the redirect URI to send it,
 * and this works whether or not the host has one.
 */
export const authorizeInPopup = (
  request: AuthorizationRequest | Promise<AuthorizationRequest>,
  options: PopupOptions = {},
): Promise<AuthorizationOutcome> => {
  const open = options.open ?? ((target, name, features) => window.open(target, name, features))
  const intervalMs = options.intervalMs ?? 60
  const timeoutMs = options.timeoutMs ?? 300_000

  const popup = open('about:blank', 'openish-authorize', 'width=620,height=760,menubar=no,toolbar=no')
  if (!popup) {
    return Promise.resolve({
      ok: false,
      message: 'The browser blocked the authorization window. Allow pop-ups for this page and try again.',
    })
  }

  return new Promise((resolve) => {
    const started = Date.now()
    let expectedState: string | undefined

    void Promise.resolve(request).then(
      (resolved) => {
        expectedState = resolved.state
        try {
          popup.location.href = resolved.url
        } catch {
          finish({ ok: false, message: 'The authorization window could not be sent to the provider.' })
        }
      },
      (error: unknown) => {
        finish({ ok: false, message: error instanceof Error ? error.message : 'Could not start authorization.' })
      },
    )

    const finish = (outcome: AuthorizationOutcome) => {
      clearInterval(timer)
      try {
        popup.close()
      } catch {
        /* Already gone, which is the same thing as closed. */
      }
      resolve(outcome)
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        finish({ ok: false, message: 'The authorization window was closed before it finished.' })
        return
      }

      if (Date.now() - started > timeoutMs) {
        finish({ ok: false, message: 'The authorization window timed out.' })
        return
      }

      let href: string
      try {
        href = popup.location.href
      } catch {
        /* Still on the provider's origin, where reading is not allowed. Keep waiting. */
        return
      }

      /* `about:blank` is the popup before it has gone anywhere. */
      if (!href || href.startsWith('about:')) {
        return
      }

      const location = new URL(href)
      const fragment = new URLSearchParams(location.hash.replace(/^#/, ''))
      const answered =
        location.searchParams.has('code') ||
        location.searchParams.has('error') ||
        fragment.has('access_token') ||
        fragment.has('error')
      if (!answered) {
        return
      }

      finish(outcomeFrom(location, expectedState ?? ''))
    }, intervalMs)
  })
}

export type RedirectOptions = {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  assign?: (url: string) => void
  location?: { href: string; search: string }
  replaceState?: (url: string) => void
}

/**
 * Leaves for the authorization server, having written down what the return trip will need.
 *
 * `sessionStorage`, not `localStorage`: this has to survive one navigation, not one machine. It
 * holds a verifier and a state - never a token - and {@link resumeRedirect} removes it the moment it
 * is used, so a verifier is never available to a second exchange.
 */
export const beginRedirect = (url: string, pending: PendingFlow, options: RedirectOptions = {}): void => {
  const storage = options.storage ?? window.sessionStorage
  const assign = options.assign ?? ((target: string) => window.location.assign(target))

  storage.setItem(STORAGE_KEY, JSON.stringify(pending))
  assign(url)
}

export type ResumedFlow = { pending: PendingFlow; outcome: AuthorizationOutcome }

/**
 * Picks the flow back up after the provider sent the reader home.
 *
 * Returns `undefined` when this is an ordinary page load, which is almost every page load. When it
 * is not, the stored flow is consumed and the callback parameters are stripped from the URL: leaving
 * `?code=` in the address bar leaves it in history, in a bookmark, and in whatever the host logs.
 */
export const resumeRedirect = (options: RedirectOptions = {}): ResumedFlow | undefined => {
  const storage = options.storage ?? window.sessionStorage
  const current = options.location ?? window.location
  const replaceState =
    options.replaceState ?? ((url: string) => window.history.replaceState(window.history.state, '', url))

  const parameters = new URLSearchParams(current.search)
  if (!parameters.has('code') && !parameters.has('error')) {
    return undefined
  }

  const stored = storage.getItem(STORAGE_KEY)
  if (!stored) {
    return undefined
  }

  storage.removeItem(STORAGE_KEY)

  let pending: PendingFlow
  try {
    pending = JSON.parse(stored) as PendingFlow
  } catch {
    return undefined
  }

  const url = new URL(current.href)
  const outcome = outcomeFrom(url, pending.state)

  for (const name of ['code', 'state', 'error', 'error_description', 'session_state', 'iss']) {
    url.searchParams.delete(name)
  }
  replaceState(`${url.pathname}${url.search}${url.hash}`)

  return { pending, outcome }
}

/** Throws away a flow that was started and never came back. */
export const clearPendingRedirect = (options: RedirectOptions = {}): void => {
  ;(options.storage ?? window.sessionStorage).removeItem(STORAGE_KEY)
}

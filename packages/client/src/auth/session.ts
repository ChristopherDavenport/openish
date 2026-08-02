import type { TokenSet } from './token.js'

export type GrantStatus = 'idle' | 'authorizing' | 'active' | 'expired' | 'failed'

export type Grant =
  | { status: 'idle' }
  | { status: 'authorizing' }
  | { status: 'failed'; message: string }
  /** A credential the reader pasted. There is nothing to refresh and no expiry to know about. */
  | { status: 'active'; kind: 'pasted'; value: string }
  | { status: 'active' | 'expired'; kind: 'oauth'; token: TokenSet }

/**
 * Somewhere a host has decided it is acceptable to keep credentials.
 *
 * openish does not implement one, and that is the point: how long a token should survive, and where,
 * is a decision with a threat model attached, and the threat model belongs to the application, not
 * to its documentation viewer. `sessionStorage` is reasonable for an internal tool and wrong for a
 * public docs site, and neither openish nor a default can tell which one it is in.
 *
 * Synchronous on purpose. A store that has to be awaited would mean the session could not answer
 * "what am I holding" during a render, and every consumer would need a loading state for a question
 * that is nearly always already answered.
 */
export type CredentialStore = {
  read(): Record<string, Grant> | undefined
  write(grants: Record<string, Grant>): void
  clear(): void
}

/**
 * Everything the reader is holding, frozen, with expiry already applied.
 *
 * The read model, and the only form of it that crosses out of this package into a component tree.
 * A live {@link AuthSession} handed downward is a mutable object any consumer could write to, and
 * one whose identity never changes when it does - so the thing rendering it has to be told by hand
 * that something happened. A snapshot is replaced wholesale instead, which makes "has this changed"
 * an identity comparison and "may I change it" a type error.
 *
 * A scheme with no entry has no grant. That is the same statement as `{ status: 'idle' }` and one
 * fewer object to build for every scheme a document declares and the reader has not touched.
 */
export type AuthSnapshot = Readonly<Record<string, Grant>>

/**
 * Seconds until a token expires, or `undefined` when there is no expiry to report.
 *
 * A function over a grant rather than a method on the session, so that something holding only the
 * read model can still say how long is left.
 */
export const expiresInSeconds = (grant: Grant | undefined, now: number = Date.now()): number | undefined => {
  if (grant?.status !== 'active' || grant.kind !== 'oauth' || grant.token.expiresAt === undefined) {
    return undefined
  }
  return Math.max(0, Math.round((grant.token.expiresAt - now) / 1000))
}

/**
 * What can be sent right now, keyed by scheme.
 *
 * Exactly the shape `operationToHar`'s `credentials` option takes - the seam between holding a
 * credential and putting one on a request. An expired token is not included: sending it would
 * produce a 401 that looks like the API's fault.
 */
export const credentialsFrom = (grants: AuthSnapshot): Record<string, string> => {
  const credentials: Record<string, string> = {}

  for (const [scheme, grant] of Object.entries(grants)) {
    if (grant.status !== 'active') {
      continue
    }
    credentials[scheme] = grant.kind === 'pasted' ? grant.value : grant.token.accessToken
  }

  return credentials
}

/**
 * What openish holds on behalf of the reader, per security scheme.
 *
 * In memory for the life of the page by default, and nowhere else - persisting a token is the host's
 * decision, which is why every change is also re-dispatched as an event. A host that has made that
 * decision passes a {@link CredentialStore} and the session reads from it on construction and writes
 * back on every change; one that has not passes nothing and gets exactly the previous behaviour.
 *
 * A plain class with `subscribe`: this package has no framework, and the Lit layer adapts it in
 * about fifteen lines. Anything that can call a function can use it.
 */
export class AuthSession {
  readonly #grants = new Map<string, Grant>()
  readonly #listeners = new Set<() => void>()
  readonly #now: () => number
  readonly #store: CredentialStore | undefined

  /** Bumped by every change, so {@link snapshot} knows when the one it built is still the answer. */
  #version = 0
  #snapshot: AuthSnapshot | undefined
  #snapshotVersion = -1
  #snapshotExpired = ''

  constructor(options: { now?: () => number; store?: CredentialStore } = {}) {
    this.#now = options.now ?? Date.now
    this.#store = options.store

    /*
     * Restored grants are filtered, not trusted. A stored `authorizing` is a flow that was
     * interrupted by a reload and will never complete, and a stored `failed` is an error message
     * about something that happened in a session the reader has left - neither is worth restoring,
     * and both would render as a state the reader cannot act on.
     */
    for (const [scheme, grant] of Object.entries(this.#store?.read() ?? {})) {
      if (grant.status === 'active') {
        this.#grants.set(scheme, grant)
      }
    }
  }

  /** Persists whatever is worth persisting, which is only what could still be used. */
  #persist(): void {
    if (!this.#store) {
      return
    }

    const durable: Record<string, Grant> = {}
    for (const [scheme, grant] of this.#grants) {
      if (grant.status === 'active') {
        durable[scheme] = grant
      }
    }

    if (Object.keys(durable).length === 0) {
      this.#store.clear()
      return
    }
    this.#store.write(durable)
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #announce(): void {
    this.#version += 1
    this.#persist()
    for (const listener of this.#listeners) {
      listener()
    }
  }

  /**
   * The grant for a scheme, with expiry applied.
   *
   * Expiry is computed on read rather than by a timer: a timer that fires in a tab nobody is looking
   * at is work for nothing, and the answer is only ever needed when something is about to be
   * rendered or sent.
   */
  get(scheme: string): Grant {
    const grant = this.#grants.get(scheme) ?? { status: 'idle' }

    if (grant.status === 'active' && grant.kind === 'oauth') {
      const expiresAt = grant.token.expiresAt
      if (expiresAt !== undefined && expiresAt <= this.#now()) {
        return { ...grant, status: 'expired' }
      }
    }

    return grant
  }

  /** Seconds until a token expires, or `undefined` when there is no expiry to report. */
  expiresInSeconds(scheme: string): number | undefined {
    return expiresInSeconds(this.get(scheme), this.#now())
  }

  /**
   * The read model, as one frozen object, with the same identity while it says the same thing.
   *
   * Identity is what a consumer compares - `sameRequestState` and `@lit/context` both do - so a new
   * object on every update would re-render every element that reads a credential on every render of
   * the root. It is rebuilt when something announced a change, and also when a token has passed its
   * expiry, which nothing announces: expiry is time rather than an event, so it is part of the key.
   */
  snapshot(): AuthSnapshot {
    const expired = [...this.#grants.keys()].filter((scheme) => this.get(scheme).status === 'expired').join(',')
    if (this.#snapshot && this.#snapshotVersion === this.#version && this.#snapshotExpired === expired) {
      return this.#snapshot
    }

    const next: Record<string, Grant> = {}
    for (const scheme of this.#grants.keys()) {
      next[scheme] = this.get(scheme)
    }

    this.#snapshot = Object.freeze(next)
    this.#snapshotVersion = this.#version
    this.#snapshotExpired = expired
    return this.#snapshot
  }

  setPasted(scheme: string, value: string): void {
    if (value === '') {
      this.clear(scheme)
      return
    }
    this.#grants.set(scheme, { status: 'active', kind: 'pasted', value })
    this.#announce()
  }

  beginAuthorizing(scheme: string): void {
    this.#grants.set(scheme, { status: 'authorizing' })
    this.#announce()
  }

  setToken(scheme: string, token: TokenSet): void {
    this.#grants.set(scheme, { status: 'active', kind: 'oauth', token })
    this.#announce()
  }

  fail(scheme: string, message: string): void {
    this.#grants.set(scheme, { status: 'failed', message })
    this.#announce()
  }

  clear(scheme: string): void {
    this.#grants.delete(scheme)
    this.#announce()
  }

  clearAll(): void {
    this.#grants.clear()
    this.#announce()
  }

  /** The refresh token for a scheme, when there is one to refresh with. */
  refreshTokenFor(scheme: string): string | undefined {
    const grant = this.#grants.get(scheme)
    return grant?.status === 'active' || grant?.status === 'expired'
      ? grant.kind === 'oauth'
        ? grant.token.refreshToken
        : undefined
      : undefined
  }

  /** What is currently sendable, keyed by scheme name. See {@link credentialsFrom}. */
  credentials(): Record<string, string> {
    return credentialsFrom(this.snapshot())
  }
}

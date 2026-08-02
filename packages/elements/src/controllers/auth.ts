import { AuthSession, resumeRedirect, type CredentialStore } from '@openish/client'
import type { ReactiveController, ReactiveControllerHost } from 'lit'

import { completeAuthorization } from '../auth/complete-authorization.js'
import { scopedCredentialStore } from '../auth/scoped-credential-store.js'
import type { OpenishAuthChange } from '../events.js'

export type AuthOptions = {
  /** The document on screen. One session per document, so this decides which one is current. */
  readonly activeSlug: () => string
  /** Whether several documents are configured, which is the only case that can collide. */
  readonly usesSources: () => boolean
  /** Where the host wants credentials kept between page loads, if anywhere. */
  readonly store: () => CredentialStore | undefined
  /** Credentials the host already has - after its own login, say. Applied once, as a starting state. */
  readonly prefilled: () => Record<string, string> | undefined
  /** Where a token exchange should be sent, when the provider will not answer a browser directly. */
  readonly proxyUrl: () => string
  /**
   * A change the reader made, on its way to being applied.
   *
   * The host re-dispatches it, so a page that finished an authorization by being reloaded announces
   * the same event a form would have. Applying is this controller's job; saying so is not.
   */
  readonly onChange: (change: OpenishAuthChange) => void
}

/**
 * What the reader is holding, for the life of this page.
 *
 * Owned above the panel that shows it, because a reader authorises once and every operation uses
 * it - and because there has to be exactly one writer. Every change arrives here as an
 * `OpenishAuthChange` travelling up from a form; nothing below writes to a session directly.
 *
 * One session per document, because two documents that both declare `oauth2` are usually two
 * different authorization servers, and one session would send the first one's token to the second.
 */
export class AuthController implements ReactiveController {
  readonly #host: ReactiveControllerHost
  readonly #options: AuthOptions

  readonly #sessions = new Map<string, AuthSession>()
  #store: CredentialStore | undefined
  #storeSeen = false

  /** Prefilled credentials are a starting state, not something to reapply over the reader's edits. */
  #applied = false

  constructor(host: ReactiveControllerHost, options: AuthOptions) {
    this.#host = host
    this.#options = options
    host.addController(this)
  }

  /**
   * The session for the document on screen, built against whatever store the host has given by now.
   *
   * There is no single moment when "now" is late enough for a field initialiser: the root's
   * `requestContext` initial value names a session, so it is asked for before any property
   * assignment has happened. So it is built on first use *and* rebuilt when the store changes -
   * which covers `element.credentialStore = …; parent.append(element)`, the ordering a host is most
   * likely to use. Rebuilding costs nothing: the session it replaces cannot have anything in it yet.
   */
  get session(): AuthSession {
    return this.sessionFor(this.#options.activeSlug())
  }

  sessionFor(slug: string): AuthSession {
    if (!this.#storeSeen || this.#store !== this.#options.store()) {
      this.#storeSeen = true
      this.#store = this.#options.store()
      this.#sessions.clear()
    }

    const existing = this.#sessions.get(slug)
    if (existing) {
      return existing
    }

    /*
     * A single-document reference is handed the host's store untouched, so anything it has already
     * persisted still reads back. Only `sources` namespaces, because only `sources` can collide.
     */
    const host = this.#options.store()
    const store = host && this.#options.usesSources() ? scopedCredentialStore(host, slug) : host

    const session = new AuthSession(store ? { store } : {})
    this.#sessions.set(slug, session)
    return session
  }

  hostConnected(): void {
    /* Reads the getter, which is what rebuilds the session against a store set before append. */
    void this.session
  }

  /**
   * The one thing that writes to a session.
   *
   * A form that set a credential itself would be a second writer, and two writers is two ideas of
   * what the reader is holding. Both paths that can produce a credential - a form's own flow and an
   * authorization the reader was redirected away for - come through here, as the same event.
   */
  apply(change: OpenishAuthChange): void {
    const session = this.session

    switch (change.kind) {
      case 'pasted':
        session.setPasted(change.scheme, change.value)
        break
      case 'authorizing':
        session.beginAuthorizing(change.scheme)
        break
      case 'token':
        session.setToken(change.scheme, change.token)
        break
      case 'failed':
        session.fail(change.scheme, change.message)
        break
      case 'clear':
        session.clear(change.scheme)
        break
    }

    this.#host.requestUpdate()
  }

  /** A host's prefilled credentials, applied once as the starting state rather than on every update. */
  applyPrefilled(): void {
    const prefilled = this.#options.prefilled()
    if (!prefilled || this.#applied) {
      return
    }
    this.#applied = true

    const session = this.session
    for (const [scheme, value] of Object.entries(prefilled)) {
      session.setPasted(scheme, value)
    }
  }

  /**
   * Finishes an authorization that navigated away and came back.
   *
   * Run once, on the host's first update, because that is when the URL carrying the code is still
   * there - `resumeRedirect` strips it immediately, so nothing downstream ever sees a code in the
   * address bar. The reader is then sent back to the page they left, which may not be where the
   * provider returned them.
   *
   * The outcome goes through {@link apply} rather than being written to the session here, which is
   * what makes this path and a form's popup path the same path.
   */
  async resume(): Promise<void> {
    const resumed = resumeRedirect()
    if (!resumed) {
      return
    }

    const { pending, outcome } = resumed
    if (!outcome.ok) {
      this.#announce({ scheme: pending.scheme, kind: 'failed', message: outcome.message })
      return
    }

    this.#announce({ scheme: pending.scheme, kind: 'authorizing' })
    this.#announce(await completeAuthorization(outcome, pending, { proxyUrl: this.#options.proxyUrl() }))

    /*
     * An implicit flow stops here, as it always has: it never exchanged anything, and the return
     * trip below belongs to the code flow. Whether it *should* also be put back where it started is
     * a separate question from this one, and not one a refactor gets to answer.
     */
    if (outcome.accessToken !== undefined) {
      return
    }

    /*
     * `resumeRedirect` has already stripped the provider's `code` and `state` out of the URL, so
     * what is left differing from `returnTo` is the page the reader was on before they were sent
     * away. Restoring it is a `replaceState` rather than a push: the authorization round trip is not
     * a place the back button should be able to return to.
     */
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (pending.returnTo && pending.returnTo !== here) {
      window.history.replaceState(window.history.state, '', pending.returnTo)
      this.#host.requestUpdate()
    }
  }

  #announce(change: OpenishAuthChange): void {
    this.apply(change)
    this.#options.onChange(change)
  }
}

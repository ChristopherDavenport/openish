import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * The current URL, as a reactive input.
 *
 * `window.location` is external mutable state: nothing about reading it tells Lit when it changed.
 * A controller is the answer to exactly that - it subscribes for the host's connected lifetime and
 * requests an update when the browser moves, so a URL change causes a render like any other input.
 *
 * `popstate` and `hashchange` are the browser's own signals. Navigations openish performs itself go
 * through `@lit-labs/router`, which calls `requestUpdate()` on its host, so there is nothing to
 * subscribe to and nothing to keep in sync.
 *
 * The values are getters rather than a snapshot taken in `hostUpdate()`, and that ordering is not
 * incidental: Lit runs `willUpdate()` *before* a controller's `hostUpdate()`, so a snapshot would
 * always be one navigation behind the state derived from it. Read them in `willUpdate` and hand the
 * result down as reactive state - which is what `<openish-api-reference>` does - and `render()`
 * still touches nothing but its own fields.
 */
export class LocationController implements ReactiveController {
  readonly #host: ReactiveControllerHost

  constructor(host: ReactiveControllerHost) {
    this.#host = host
    host.addController(this)
  }

  /** The path, e.g. `/tags/accounts`. */
  get pathname(): string {
    return window.location.pathname
  }

  /** The fragment with no leading `#`, e.g. `overview/getting-started`. */
  get hash(): string {
    return window.location.hash.replace(/^#/, '')
  }

  hostConnected(): void {
    window.addEventListener('popstate', this.#onChange)
    window.addEventListener('hashchange', this.#onChange)
  }

  hostDisconnected(): void {
    window.removeEventListener('popstate', this.#onChange)
    window.removeEventListener('hashchange', this.#onChange)
  }

  readonly #onChange = (): void => {
    this.#host.requestUpdate()
  }
}

import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * A module that is loaded on demand, as a value rather than as a side effect of rendering.
 *
 * The markdown pipeline and the syntax highlighter are both large, both optional to a first paint,
 * and both cached at module level once they arrive. Both elements used to reach for them from inside
 * `render()` and bump a counter in the `.then()` to ask for a second pass - which is a side effect
 * in `render`, the one thing the project's rules forbid outright, and it was written out twice.
 *
 * Here the render reads {@link value} and nothing else. The request is made when the host connects,
 * once, and the one update it asks for is the one that arrives with the module.
 *
 * `now` rather than the promise's result, because the cache belongs to the module being loaded and
 * not to this controller: a second element mounting after the first has finished loading gets its
 * answer on the first render, with no request and no extra update.
 */
export class LazyModuleController<T> implements ReactiveController {
  readonly #host: ReactiveControllerHost
  readonly #now: () => T | undefined
  readonly #load: () => Promise<unknown>

  #requested = false

  constructor(host: ReactiveControllerHost, now: () => T | undefined, load: () => Promise<unknown>) {
    this.#host = host
    this.#now = now
    this.#load = load
    host.addController(this)
  }

  hostConnected(): void {
    this.#request()
  }

  /** The module, or `undefined` while it is still on its way. */
  get value(): T | undefined {
    const value = this.#now()
    if (value === undefined) {
      /*
       * A host that was disconnected before the module landed, then reconnected, has already had its
       * one request made and answered by the module-level cache. Asking again is free either way -
       * `#requested` is what makes it free rather than what makes it correct.
       */
      this.#request()
    }
    return value
  }

  #request(): void {
    if (this.#requested || this.#now() !== undefined) {
      return
    }
    this.#requested = true

    void this.#load().then(() => this.#host.requestUpdate())
  }
}

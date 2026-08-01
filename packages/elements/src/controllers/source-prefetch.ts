import type { ReactiveController, ReactiveControllerHost } from 'lit'

export type SourcePrefetchOptions = {
  /** The slugs still worth warming, newest answer each time it is asked. */
  pending: () => readonly string[]
  /** Builds one. Rejection is not fatal: a document that cannot load is skipped, not retried. */
  load: (slug: string) => Promise<void>
}

/** How long to wait for an idle moment before warming a document anyway. */
const IDLE_TIMEOUT = 1500

/** Fallback delay where `requestIdleCallback` is not implemented. */
const FALLBACK_DELAY = 200

/**
 * Warms the documents the reader has not selected yet, while the browser is idle.
 *
 * Switching documents is then instant, and cross-document search has something to search - a reader
 * who types into the dialog without having visited the other APIs still finds their operations.
 *
 * Three properties are load-bearing, and openish's port of Scalar's `preloadDocumentsWhenIdle`
 * keeps all three:
 *
 * - **Idle, not eager.** The whole point of loading lazily is that first render does not scale with
 *   how many documents a host configured. Fetching them all up front gives that back.
 * - **One at a time.** A burst of fetches and parses competes with the document the reader is
 *   actually looking at, on the same main thread.
 * - **Cancelled when the host disconnects.** Without it an orphaned reference - a view transition,
 *   a re-mount - keeps fetching and parsing into a store nothing will ever render.
 *
 * A `ReactiveController` rather than a pair of lifecycle overrides, because the thing being managed
 * is a subscription to time and its lifetime is exactly the host's connected lifetime.
 */
export class SourcePrefetchController implements ReactiveController {
  #cancel: (() => void) | undefined
  #stopped = false
  #started = false

  constructor(host: ReactiveControllerHost, private readonly options: SourcePrefetchOptions) {
    host.addController(this)
  }

  /**
   * Begins warming, if it has not already.
   *
   * Called once the first document is on screen rather than on connect: until then there is a
   * document the reader is waiting for, and an idle callback that fires before it lands would be
   * competing with the only fetch that matters.
   */
  start(): void {
    if (this.#started || this.#stopped || typeof window === 'undefined') {
      return
    }
    this.#started = true
    this.#schedule(() => this.#loadNext())
  }

  hostDisconnected(): void {
    this.#stopped = true
    this.#cancel?.()
    this.#cancel = undefined
  }

  hostConnected(): void {
    /* A reconnected element may warm again; `start()` is what decides whether it should. */
    this.#stopped = false
  }

  #schedule(callback: () => void): void {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT })
      this.#cancel = () => window.cancelIdleCallback(handle)
      return
    }
    const handle = window.setTimeout(callback, FALLBACK_DELAY)
    this.#cancel = () => window.clearTimeout(handle)
  }

  #loadNext(): void {
    if (this.#stopped) {
      return
    }

    const slug = this.options.pending()[0]
    if (slug === undefined) {
      return
    }

    void this.options
      .load(slug)
      .catch(() => {
        /*
         * A document that will not load is the host's problem to see, and it will see it the moment
         * the reader selects it - where there is somewhere to say so. Warming is not that moment,
         * and stopping here would punish every other document for one bad URL.
         */
      })
      .finally(() => {
        if (!this.#stopped) {
          this.#schedule(() => this.#loadNext())
        }
      })
  }
}

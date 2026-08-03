import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * Fetches `@openish/elements` when a reader reaches the thing that needs it, and keeps the page
 * from being scrolled out from under them when it mounts.
 *
 * Two components need this and neither of them is about it, which is what a controller is for. The
 * repo's own rule - external state through a `ReactiveController` - applies exactly: an
 * `IntersectionObserver`, a dynamic import and the window's scroll position are three pieces of
 * state outside the host, and nothing about reading them tells Lit when they changed.
 *
 * **Why it waits for the reader.** Importing the package registers all thirty-one elements and
 * fetches about 134 kB gzipped. A reader who never scrolls past the pitch never pays for it, which
 * is the argument the site is making, being made.
 *
 * **Why it holds the scroll position.** `<openish-sidebar>` reveals its active row with
 * `scrollIntoView({ block: 'nearest' })`. That is right inside a reference that owns its viewport,
 * and `nearest` still walks *every* scrolling ancestor - including the document - so a reference
 * embedded part-way down a scrolling page pulls the page down to itself the moment it mounts. The
 * front page opened six hundred pixels in, past its own headline, with nothing clicked.
 *
 * The reference is not misbehaving. The page it was dropped into is the thing with an opinion about
 * where it should be scrolled, and that opinion is the host's to hold - which is the general lesson
 * for anyone embedding one in a document that scrolls, not a quirk of this site.
 */
export class ElementsLoader implements ReactiveController {
  readonly #host: ReactiveControllerHost & Element

  #observer: IntersectionObserver | undefined
  #started = false

  /** The elements are registered and the host may render them. */
  ready = false

  /** The chunk did not arrive. A network problem, not a bug, but the host has to say something. */
  failed = false

  constructor(host: ReactiveControllerHost & Element) {
    this.#host = host
    host.addController(this)
  }

  hostConnected(): void {
    /*
     * `rootMargin` starts the fetch slightly before the element arrives, so the placeholder is
     * usually gone by the time a reader is looking at where it was.
     */
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.#stop()
          void this.#load()
        }
      },
      { rootMargin: '200px' },
    )
    this.#observer.observe(this.#host)
  }

  hostDisconnected(): void {
    this.#stop()
  }

  #stop(): void {
    this.#observer?.disconnect()
    this.#observer = undefined
  }

  async #load(): Promise<void> {
    if (this.#started) {
      return
    }
    this.#started = true

    const release = this.#holdScrollPosition()

    try {
      await import('@openish/elements')
      await customElements.whenDefined('openish-api-reference')
      this.ready = true
      this.#host.requestUpdate()
      await this.#host.updateComplete
    } catch {
      this.failed = true
      this.#host.requestUpdate()
    }

    release()
  }

  /**
   * Holds the document where it is, until the mount has settled or the reader takes over.
   *
   * A window rather than a moment, and that is not caution - restoring once a few frames later was
   * the first version and it did nothing. The scroll happens after the sidebar's virtualiser has
   * laid out, which is several asynchronous steps past the host's own update: the document, the
   * parse, the context propagation, the first measured layout. No single frame is reliably "after".
   *
   * Reader intent *retargets* rather than cancels. Abandoning on the first wheel event was the
   * second version, and it left the worst case unfixed: a reader who scrolled while the reference
   * was still loading had their scroll honoured for a moment and then thrown away by the mount.
   *
   * The recursion this looks like it should cause does not happen: the corrective scroll only runs
   * when the position is wrong, so the event it fires finds the position right and stops.
   */
  #holdScrollPosition(): () => void {
    let target = window.scrollY
    let lastIntentAt = 0

    const noteIntent = (): void => {
      lastIntentAt = performance.now()
    }
    const intents = ['wheel', 'touchmove', 'keydown'] as const

    const onScroll = (): void => {
      /* A scroll that closely follows a wheel, a drag or a key *is* the reader. Take it as the new
       * target - the grace period is what separates their scroll from the reference's own. */
      if (performance.now() - lastIntentAt < 200) {
        target = window.scrollY
        return
      }
      if (window.scrollY !== target) {
        window.scrollTo({ top: target, behavior: 'instant' })
      }
    }

    for (const intent of intents) {
      window.addEventListener(intent, noteIntent, { passive: true })
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const release = (): void => {
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
      for (const intent of intents) {
        window.removeEventListener(intent, noteIntent)
      }
    }
    /* A ceiling, so a document that never settles cannot pin the page indefinitely. */
    const timer = setTimeout(release, 2000)

    return () => {
      onScroll()
      setTimeout(release, 1200)
    }
  }
}

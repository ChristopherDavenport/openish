import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * How wide the host element is, as a reactive input.
 *
 * The same argument as `MediaQueryController` and `LocationController`: a measurement taken during
 * `render()` is output Lit has no reason to revisit. Subscribing makes the width an ordinary input,
 * which is what lets an element render a different *thing* below a threshold rather than only paint
 * itself differently - a CSS query cannot stop rendering a panel or change an `aria-expanded`.
 *
 * What it measures is the difference from a media query, and it is the whole point of this file. A
 * media query answers "how wide is the window", and the window is not what a reference is laid out
 * in: a host that puts one in a six-hundred-pixel column of a wide page has a narrow reference on a
 * wide viewport, and asking the viewport gets the answer for a page nobody is looking at - an
 * eighteen-rem navigation column beside a content pane with nothing like room for one. Asking the
 * element is the same question the container queries inside each section already ask.
 *
 * Rems, not pixels, because every other threshold in this project is a rem and a reader who has
 * scaled their text has moved all of them together.
 *
 * The observer reports during layout, so a write here can land in the frame that is already being
 * painted. Lit's `requestUpdate` schedules rather than renders, which is what keeps that from being
 * a resize loop; the guard against re-notifying for an unchanged answer is what keeps it from being
 * a re-render on every pixel of a drag.
 */
export class ElementWidthController implements ReactiveController {
  readonly #host: ReactiveControllerHost & Element
  readonly #maxRem: number
  #observer: ResizeObserver | undefined

  /** Whether the host is at or below the threshold. False until it has been measured once. */
  narrow = false

  constructor(host: ReactiveControllerHost & Element, maxRem: number) {
    this.#host = host
    this.#maxRem = maxRem
    host.addController(this)
  }

  hostConnected(): void {
    this.#observer = new ResizeObserver(() => {
      this.#measure()
    })
    this.#observer.observe(this.#host)
    /*
     * Measured now as well as observed, because the first observation arrives a frame later and the
     * first render happens before it. Without this the element renders the wide arrangement once and
     * then corrects itself, which a reader sees as the sidebar appearing and leaving again.
     */
    this.#measure()
  }

  hostDisconnected(): void {
    this.#observer?.disconnect()
    this.#observer = undefined
  }

  #measure(): void {
    const width = this.#host.getBoundingClientRect().width
    /*
     * An element with no width has not been laid out yet - it is detached, or display: none, or the
     * host has not sized it. Reporting "narrow" for that would swap the arrangement on the way in.
     */
    if (width === 0) {
      return
    }

    /* The host's own document, not this module's: the element may be inside a frame. */
    const documentElement = this.#host.ownerDocument.documentElement
    const root = parseFloat(getComputedStyle(documentElement).fontSize) || 16
    const narrow = width / root <= this.#maxRem

    if (narrow !== this.narrow) {
      this.narrow = narrow
      this.#host.requestUpdate()
    }
  }
}

import type { ReactiveController, ReactiveControllerHost } from 'lit'

/**
 * A media query, as a reactive input.
 *
 * The same argument as `LocationController`: the viewport is external state, and an element that
 * reads it while rendering produces output Lit has no reason to revisit. Subscribing turns a
 * breakpoint into an ordinary input, which is what lets a component *render* something different at
 * a different width rather than only paint it differently - a CSS media query cannot remove a
 * control from the tab order's meaning, change an `aria-expanded`, or stop rendering a panel.
 *
 * Unlike the URL, a media query only changes by firing its own event, so the value is cached and
 * refreshed by that event. There is nothing that can change it behind the controller's back.
 */
export class MediaQueryController implements ReactiveController {
  readonly #host: ReactiveControllerHost
  readonly #media: string
  #query: MediaQueryList | undefined

  matches = false

  constructor(host: ReactiveControllerHost, media: string) {
    this.#host = host
    this.#media = media
    host.addController(this)
  }

  hostConnected(): void {
    this.#query = window.matchMedia(this.#media)
    this.matches = this.#query.matches
    this.#query.addEventListener('change', this.#onChange)
  }

  hostDisconnected(): void {
    this.#query?.removeEventListener('change', this.#onChange)
    this.#query = undefined
  }

  readonly #onChange = (event: MediaQueryListEvent): void => {
    this.matches = event.matches
    this.#host.requestUpdate()
  }
}

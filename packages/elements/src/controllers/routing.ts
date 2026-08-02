import type { ReactiveControllerHost } from 'lit'

import {
  activeIdFrom,
  idFromHash,
  idFromLink,
  stripFirstSegment,
  urlId,
  urlWithId,
  type RoutingMode,
  type UrlState,
} from '../router/urls.js'
import { LocationController } from './location.js'

/** What the reference has been told about how it is mounted. Read fresh on every use. */
export type RoutingInputs = {
  readonly mode: RoutingMode
  readonly basePath: string
  /** The host's answer when `routing="none"`. */
  readonly selected: string
  /** The document slug the URL leaves out, or `''` when the URL carries it. */
  readonly slugPrefix: string
}

export type RoutingOptions = {
  readonly inputs: () => RoutingInputs
  /**
   * A click landed on the section the reader is already on.
   *
   * The URL does not change, so no `hashchange` fires and nothing would move - but a reader who has
   * scrolled away and clicked the current sidebar row means "take me back to it", and that request
   * has nowhere else to be answered.
   */
  readonly onSameId: () => void
  /** A navigation the host has to perform, in the spelling `selected` takes. */
  readonly onNavigate: (urlId: string) => void
  /** Whether the URL names anything the document has. One that names nothing is left as typed. */
  readonly resolves: () => boolean
  /** Whether `?api=` names a configured document. */
  readonly hasSource: (slug: string) => boolean
  /** Whether several documents are configured at all, which is the only case `?api=` means anything in. */
  readonly usesSources: () => boolean
}

/**
 * The URL, read and written in one place.
 *
 * There is no route table and no router. Navigation ids minted by `@openish/core` *are* URL paths,
 * so `store.bySlug` resolves a URL to a node in one lookup - which is all a route table was ever
 * arriving at. What is left is reading the id out of the address bar, which differs by mode and is
 * `router/urls.ts`, and putting it back, which is the three `history` calls below.
 *
 * Everything reactive about the URL comes from `LocationController`, which this owns rather than
 * extends: the subscription and the maths are different jobs, and only one of them has a lifetime.
 */
export class RoutingController {
  readonly #host: ReactiveControllerHost
  readonly #options: RoutingOptions

  /**
   * The URL as a reactive input, rather than a `window.location` read inside `render()`.
   *
   * Every element below reads the active id from `uiContext`, so this is the only place in the
   * project that touches the global at all.
   */
  readonly #location: LocationController

  /** The id the spy last wrote into the URL, so a follow can be told from a navigation. */
  #writtenId: string | undefined

  /** Whether `?api=` has been dealt with. Once only, however late the documents arrive. */
  #adoptedApiParam = false

  constructor(host: ReactiveControllerHost, options: RoutingOptions) {
    this.#host = host
    this.#options = options
    this.#location = new LocationController(host)
  }

  /** The address bar, as the one object every id derivation reads. */
  get url(): UrlState {
    const inputs = this.#options.inputs()
    return {
      routing: inputs.mode,
      pathname: this.#location.pathname,
      hash: this.#location.hash,
      selected: inputs.selected,
      basePath: inputs.basePath,
    }
  }

  /** Which node the reference is showing, according to whatever is authoritative in this mode. */
  get activeId(): string {
    return activeIdFrom(this.url, this.#options.inputs().slugPrefix)
  }

  /**
   * The id as the URL has it, before the implied document slug is put back.
   *
   * Which document the URL names has to be decided from this rather than from {@link activeId},
   * because deciding the prefix is the very thing that read is in the middle of.
   */
  get urlId(): string {
    return urlId(this.url)
  }

  /**
   * The browser's own fragment, when there is one to spare.
   *
   * Only `history` mode has one: in the other two the id is *in* the fragment, and a heading from
   * `info.description` is a navigation node in its own right rather than a position within a page.
   */
  get hash(): string {
    return this.#options.inputs().mode === 'history' ? this.#location.hash : ''
  }

  /** The routing state `hrefFor` and friends take. */
  get state(): { routing: RoutingMode; basePath: string; slugPrefix: string } {
    const inputs = this.#options.inputs()
    return { routing: inputs.mode, basePath: inputs.basePath, slugPrefix: inputs.slugPrefix }
  }

  /**
   * Click interception, for the two modes that need it.
   *
   * `hash` needs none: a fragment link is navigation the browser performs itself, and the
   * `hashchange` that follows is already a reactive input through `LocationController`. That is the
   * whole reason it is the default.
   *
   * `history` needs `pushState` instead of a page load. `none` needs the click to become a request
   * for the host - without this a sidebar link in that mode navigated the browser to a URL the host
   * had never agreed to serve.
   *
   * Bound in a template rather than with `addEventListener`, and reading `composedPath()` so that
   * anchors inside a nested shadow root - which is all of them - are seen.
   */
  readonly onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0) {
      return
    }
    /* A modified click is the reader asking for a new tab or a download. Leave it to the browser. */
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }

    const anchor = event
      .composedPath()
      .find((target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement)
    if (!anchor || anchor.target !== '' || anchor.hasAttribute('download') || anchor.origin !== window.location.origin) {
      return
    }

    const { mode, basePath, slugPrefix } = this.#options.inputs()

    if (mode !== 'none' && idFromLink(anchor, basePath, slugPrefix) === this.activeId) {
      event.preventDefault()
      this.#options.onSameId()
      return
    }

    /* A fragment link is navigation the browser performs itself; `hashchange` is already an input. */
    if (mode === 'hash') {
      return
    }

    event.preventDefault()

    if (mode === 'none') {
      /*
       * `none` renders fragment hrefs - see `hrefFor` - so the id is in the anchor's hash, not its
       * path. This is the *request*, and it is the only one this mode sends: the host answers by
       * setting `selected`, and re-announcing that back at it would be telling the host what the
       * host just decided.
       */
      this.#options.onNavigate(idFromHash(anchor.hash))
      return
    }

    window.history.pushState({}, '', anchor.href)
    /* `pushState` fires nothing; `LocationController` is listening for the browser's own signal. */
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  /**
   * The spy has decided the reader is somewhere else.
   *
   * It writes the URL and asks for an update; it does not set a second copy of the active id. The
   * URL stays the one authority and the next update re-reads it, which is the same trick
   * {@link onClick} uses after a `pushState`.
   *
   * `replaceState`, and not the alternatives. `pushState` would make every section the reader passes
   * a history entry, so Back would walk them back up the document and never leave the reference.
   * Assigning `location.hash` *is* a navigation - it pushes an entry and fires `hashchange`, which
   * re-renders, which scrolls: the feedback loop written out. `replaceState` fires nothing, which is
   * exactly what is wanted, because the URL is being made to describe the position rather than to
   * cause it.
   */
  follow(id: string): void {
    if (typeof window === 'undefined' || id === this.activeId) {
      return
    }

    /*
     * A URL that names nothing is left exactly as the reader typed it.
     *
     * There is nothing to scroll to, so the plane opens at the top and the spy - doing its job -
     * reported the overview and rewrote the URL to it. That threw away both halves of the only
     * useful thing this case has: the banner saying which id failed, and the id itself. A bookmark
     * that has outlived its operation should still be able to say so after a reload.
     */
    if (!this.#options.resolves()) {
      return
    }

    const { mode, slugPrefix } = this.#options.inputs()

    if (mode === 'none') {
      /* The host is the one navigating; this is the request, in the channel that mode already has. */
      this.#options.onNavigate(slugPrefix ? stripFirstSegment(id) : id)
      return
    }

    this.#writtenId = id
    window.history.replaceState(
      window.history.state,
      '',
      urlWithId(new URL(window.location.href), id, this.state).toString(),
    )
    this.#host.requestUpdate()
  }

  /**
   * Whether the URL arrived at this id by following the reader rather than by taking them somewhere.
   *
   * A navigation moves the reader; the URL following them does not. The spy writes the URL and asks
   * for an update, which arrives looking exactly like a navigation - and scrolling then would put
   * the reader back where they had just scrolled away from. This one field is the whole of the
   * feedback-loop defence.
   */
  followingAt(activeId: string): boolean {
    return this.#writtenId === activeId
  }

  /** The follow has been accounted for; the next update is free to treat the URL as a navigation. */
  settle(): void {
    this.#writtenId = undefined
  }

  /** Whether a write of the spy's is still outstanding. */
  get writing(): boolean {
    return this.#writtenId !== undefined
  }

  /**
   * `?api=<slug>` selects a document, then takes itself back out of the URL.
   *
   * A link into a reference has to name an id to be a deep link, and an id begins with a slug the
   * linker may not know - a host publishing "the admin API" from its own navigation knows the slug
   * and nothing else. This is the shape for that, ported from Scalar. It is rewritten to the
   * canonical URL immediately, with `replaceState` rather than `pushState`, so the reader's Back
   * button does not land on a URL that only redirects again.
   *
   * Called from `updated` rather than `firstUpdated`: a host that fetches its own list of documents
   * assigns `sources` after the element is in the DOM, so the first update is usually too early to
   * know whether the param names anything.
   */
  adoptApiParam(): void {
    if (this.#adoptedApiParam || typeof window === 'undefined' || !this.#options.usesSources()) {
      return
    }
    this.#adoptedApiParam = true

    const url = new URL(window.location.href)
    const slug = url.searchParams.get('api')
    if (!slug || !this.#options.hasSource(slug)) {
      return
    }

    url.searchParams.delete('api')
    /*
     * `slugPrefix: ''`, always: `?api=` only means anything with several documents configured, and
     * that is exactly the case where the slug has to appear in the URL.
     */
    const { mode, basePath } = this.#options.inputs()
    const target = urlWithId(url, slug, { routing: mode, basePath, slugPrefix: '' })
    window.history.replaceState(window.history.state, '', target.toString())
    this.#host.requestUpdate()
  }
}

import { virtualizerRef, type VirtualizerHostElement } from '@lit-labs/virtualizer/virtualize.js'
import type { VisibilityChangedEvent } from '@lit-labs/virtualizer/events.js'
import type { ReactiveController, ReactiveControllerHost } from 'lit'

import { sectionIndex, type Section } from '../render/sections.js'

/** How long the reader has to stop scrolling before the URL is told where they are. */
const QUIET_MS = 120

/**
 * How long a programmatic scroll is allowed to be in flight before the spy is trusted again.
 *
 * A backstop, not the mechanism: the mute normally lifts the moment the target section reports
 * itself, which is the same event that would have written the URL. This covers the case where it
 * never can - the last section of a short document cannot reach the top of the scroller, so nothing
 * would ever clear the mute and the spy would be deaf for the rest of the session.
 */
const SETTLE_MS = 1000

/** How many frames to wait for the virtualiser to exist before giving up on a scroll. */
const REACH_TRIES = 20

/** How many frames the convergence loop is allowed, and how many quiet ones end it. */
const CONVERGE_FRAMES = 45
const STABLE_FRAMES = 3

export type SectionsOptions = {
  /** The reader is at this section. Never called for a section a programmatic scroll passed over. */
  readonly onActive: (id: string) => void
}

/**
 * Where the reader is on the plane, and how to put them somewhere else.
 *
 * Mounting is the virtualiser's job and scrolling accurately is the virtualiser's job - which is
 * most of why this is small. `element(index).scrollIntoView()` with the default behaviour hands the
 * index to the layout as a *pin*, and a pinned layout re-anchors on every reflow until the target
 * stops moving. That is exactly the problem a deep link into a document of unmeasured sections has,
 * and it is solved upstream: the naive version - scroll once, then correct after `updateComplete` -
 * is the double-scroll, because `updateComplete` resolves long before a schema has recursed and the
 * lazy prose and highlight pipelines have landed.
 *
 * What is left is the part the virtualiser cannot know: which of its items the reader is *at*, and
 * that a scroll it was asked to perform must not be reported back as the reader having gone there.
 *
 * Mounting and spying share this one controller because they share one mute. Splitting them would
 * mean passing the mute between them, which is the coupling the split was meant to avoid.
 */
export class SectionsController implements ReactiveController {
  readonly #host: ReactiveControllerHost
  readonly #options: SectionsOptions

  #sections: readonly Section[] = []
  #plane: VirtualizerHostElement | undefined

  /**
   * The section a scroll was asked for, while that scroll is in flight.
   *
   * A token rather than a boolean, so a stale clear from a scroll the reader interrupted cannot
   * unmute a live one.
   */
  #programmatic: string | undefined
  /** The section the reader is on their way to, kept so a rebuilt plane can be told again. */
  #target: string | undefined
  #reattached: VirtualizerHostElement | undefined
  #settle: ReturnType<typeof setTimeout> | undefined
  #quiet: ReturnType<typeof setTimeout> | undefined
  #reported: string | undefined

  constructor(host: ReactiveControllerHost, options: SectionsOptions) {
    this.#host = host
    this.#options = options
    host.addController(this)
  }

  hostDisconnected(): void {
    clearTimeout(this.#settle)
    clearTimeout(this.#quiet)
  }

  /** The section list, handed over on each update so nothing here reads the store. */
  observe(sections: readonly Section[]): void {
    this.#sections = sections
  }

  /**
   * The plane element, from a `ref` in the template.
   *
   * Re-attached as well as recorded, and that is not defensive tidying. A virtualiser works out
   * which ancestor clips it - the thing it will scroll - once, in `connected()`, and caches the
   * answer. The directive connects while the template is still being committed, when the plane has
   * no ancestors to walk, so it finds none and falls back to scrolling the document: every deep link
   * rendered the right section and left the reader at the top of the page, with no error anywhere.
   *
   * Reconnecting once the element is actually in the tree makes it look again, and by then `main` is
   * there with its `overflow` on it.
   */
  set plane(element: Element | undefined) {
    const host = element as VirtualizerHostElement | undefined
    if (host === this.#plane) {
      return
    }

    this.#plane = host
    this.#reattached = undefined
  }

  /**
   * Once the plane is in the tree, make the virtualiser look for its scroller again.
   *
   * Not in the `ref` callback, which runs while the template is still committing - the directive has
   * not built the virtualiser yet at that point, so there is nothing there to tell. This is the
   * first moment both are true, and it happens once per plane.
   */
  hostUpdated(): void {
    const host = this.#plane
    const virtualizer = host?.[virtualizerRef]
    if (!host?.isConnected || !virtualizer || this.#reattached === host) {
      return
    }

    this.#reattached = host
    virtualizer.disconnected()
    virtualizer.connected()

    /*
     * And ask again for wherever the reader was going.
     *
     * A deep link asks for its scroll on the very first update, which is the update this reattach
     * happens in - and reconnecting drops the pin it had just set. Without this the section renders
     * and the reader stays at the top of the document, which is the bug this whole sequence exists
     * to fix, arriving one step later.
     */
    if (this.#target !== undefined) {
      const index = sectionIndex(this.#sections).get(this.#target)
      if (index !== undefined) {
        this.#reach(index, 0)
      }
    }
  }

  /** A document swap: nothing that was true of the last plane is true of this one. */
  reset(): void {
    clearTimeout(this.#settle)
    clearTimeout(this.#quiet)
    this.#programmatic = undefined
    this.#reported = undefined
    this.#target = undefined
  }

  /**
   * Put the reader at a section.
   *
   * Silently does nothing for an id the document has no section for - which is not a swallowed
   * error but the ordinary case of a bookmarked URL outliving the operation it named. The banner
   * above the plane is what says so; scrolling somewhere arbitrary as well would be worse.
   */
  scrollTo(id: string): void {
    const index = sectionIndex(this.#sections).get(id)
    if (index === undefined) {
      return
    }

    this.#target = id
    this.#programmatic = id
    clearTimeout(this.#settle)
    this.#settle = setTimeout(() => {
      this.#programmatic = undefined
    }, SETTLE_MS)

    this.#reach(index, 0)
  }

  /**
   * Get at the virtualiser, which is not there on the update that renders it.
   *
   * The directive builds it while committing, and its layout is initialised asynchronously - so a
   * deep link, which asks for a scroll on the very first update, arrives before there is anything to
   * ask. Waiting on `layoutComplete` is the honest signal that there is; the frame-by-frame retry in
   * front of it is for the update where the host element itself does not exist yet.
   *
   * Bounded, because a plane that never appears is a plane with nothing to scroll to, and a retry
   * loop with no end would sit there for the life of the page looking for it.
   */
  #reach(index: number, tries: number): void {
    const virtualizer = this.#plane?.[virtualizerRef]
    if (!virtualizer) {
      if (tries < REACH_TRIES && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => this.#reach(index, tries + 1))
      }
      return
    }

    /*
     * Never `smooth` across sections. A smooth scroll through several hundred of them drags the
     * rendered window across the whole document on the way, mounting everything it passes - and it
     * is also the one behaviour for which the virtualiser does *not* pin, so the jump would be made
     * from estimates with nothing correcting it afterwards.
     */
    void virtualizer.layoutComplete
      .then(() => {
        virtualizer.element(index)?.scrollIntoView({ block: 'start' })
        this.#converge(index, 0, 0)
      })
      .catch(() => undefined)
  }

  /**
   * Keep correcting until the section stops moving.
   *
   * The jump itself is an estimate: the sections above the target have never been measured, so their
   * heights are a running average of whatever has been. When they mount and turn out to be shorter,
   * the document shrinks above the reader and the target slides up past them - landing two thousand
   * pixels into an operation whose title was the thing they asked for.
   *
   * The virtualiser's pin is meant to absorb exactly this, and it does until something scrolls: a
   * scroll unpins the layout, and the first correction *is* a scroll. So the correction is here
   * instead, measured off the DOM, which is also the only thing that can be right about a section
   * whose own prose and highlighting land a few frames after it does.
   *
   * Two states, one loop. With nothing rendered at all the range has gone empty - which happens when
   * the estimate overshoots the end of the document, the scroll clamps, and the layout settles
   * waiting for a scroll event that will never come because the only thing scrolling was itself - so
   * a pixel each way wakes it. With the section rendered, the gap between where it is and where it
   * should be is closed directly.
   *
   * It ends on three consecutive frames that need no correction, or at the cap. Bounded, because a
   * document whose prose keeps arriving could otherwise be chased for the life of the page.
   */
  #converge(index: number, tries: number, stable: number): void {
    if (tries >= CONVERGE_FRAMES || stable >= STABLE_FRAMES || typeof requestAnimationFrame !== 'function') {
      this.#arrived()
      return
    }

    requestAnimationFrame(() => {
      const plane = this.#plane
      const scroller = this.#scroller
      const id = this.#target
      if (!plane || !scroller || id === undefined) {
        return
      }

      if (!plane.querySelector('.section')) {
        /*
         * One pixel, and left there. Moving and moving back within a frame is a net change of zero,
         * which the browser is free to coalesce into no scroll event at all - which is precisely
         * what this is trying to produce. Walking up a pixel a frame produces real ones, and the
         * correction below puts the section where it belongs as soon as one of them lands.
         */
        scroller.scrollTop -= 1
        this.#converge(index, tries + 1, 0)
        return
      }

      const section = plane.querySelector(`.section[data-id="${CSS.escape(id)}"]`)
      if (!section) {
        /*
         * Out of range, so walk towards it rather than asking again.
         *
         * Asking again re-runs the same estimate and lands in the same wrong place - which is how a
         * section two thirds down a document of tall operations gets guessed past the end, clamps at
         * the bottom, and stays there however many times it is asked. What *is* reliable is which
         * way to go: the rendered sections have ids, the ids have indices, and comparing one with
         * the target says up or down. A viewport at a time closes it, and every step measures more
         * of the document, so the estimates behind the scrollbar improve as it goes.
         */
        const showing = plane.querySelector('.section')?.getAttribute('data-id') ?? ''
        const at = sectionIndex(this.#sections).get(showing)
        scroller.scrollTop += at !== undefined && at > index ? -scroller.clientHeight : scroller.clientHeight
        this.#converge(index, tries + 1, 0)
        return
      }

      const delta = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      if (Math.abs(delta) > 1) {
        scroller.scrollTop += delta
        this.#converge(index, tries + 1, 0)
        return
      }

      this.#converge(index, tries + 1, stable + 1)
    })
  }

  /** The scroll is over: what the plane says about itself can be believed again. */
  #arrived(): void {
    clearTimeout(this.#settle)
    this.#reported = this.#target
    this.#programmatic = undefined
  }

  /**
   * The virtualiser's own report of what is on screen, turned into where the reader is.
   *
   * `first` is the topmost item intersecting the viewport, which is the section whose text is under
   * the reader's eye rather than the one that has just appeared at the bottom of the window. The two
   * ends are read from the scroller instead, because a line-based answer cannot express them: at the
   * very top the first section may be shorter than the gap above it, and at the very bottom a short
   * final section is never topmost and would be unreachable.
   */
  readonly onVisibilityChanged = (event: VisibilityChangedEvent): void => {
    if (this.#sections.length === 0) {
      return
    }

    let index = event.first
    const scroller = this.#scroller
    if (scroller) {
      if (scroller.scrollTop <= 1) {
        index = 0
      } else if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
        index = this.#sections.length - 1
      }
    }

    const id = this.#sections[Math.max(0, Math.min(index, this.#sections.length - 1))]?.id
    if (id !== undefined) {
      this.#report(id)
    }
  }

  /**
   * The scroller, which is whatever clips the plane.
   *
   * Read rather than held, because a host that gives the reference no height gets a page that
   * scrolls as one and there is no element here to hold. `closest` crosses no shadow boundary: the
   * plane and `main` are in the same root.
   */
  get #scroller(): Element | null {
    const main = this.#plane?.closest('main')
    return main && main.scrollHeight > main.clientHeight ? main : (this.#plane?.ownerDocument.scrollingElement ?? null)
  }

  /**
   * Say where the reader is, once they have stopped moving.
   *
   * Debounced because a fling through two hundred sections would otherwise write the URL two hundred
   * times, and browsers rate-limit `replaceState` to roughly a hundred calls in thirty seconds -
   * past which the call is dropped in silence and the URL and the page disagree with no way to tell.
   */
  #report(id: string): void {
    /*
     * A scroll this controller asked for is not the reader arriving somewhere.
     *
     * The mute lasts until the scroll *stops*, not until the target is first reported. Those are not
     * the same moment: a jump into an unmeasured document is corrected over several frames, and the
     * sections it passes over on the way each announce themselves. Lifting on the first match let one
     * of those later announcements through, and the URL - and the sidebar with it - ended up naming
     * the section above the one the reader had asked for.
     */
    if (this.#programmatic !== undefined) {
      return
    }

    if (id === this.#reported) {
      return
    }

    clearTimeout(this.#quiet)
    this.#quiet = setTimeout(() => {
      this.#reported = id
      this.#options.onActive(id)
      this.#host.requestUpdate()
    }, QUIET_MS)
  }
}

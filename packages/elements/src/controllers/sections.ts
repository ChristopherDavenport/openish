import { virtualizerRef, type VirtualizerHostElement } from '@lit-labs/virtualizer/virtualize.js'
import type { VisibilityChangedEvent } from '@lit-labs/virtualizer/events.js'
import type { ReactiveController, ReactiveControllerHost } from 'lit'

import { deepQuery } from '../dom/deep-query.js'
import { correction, indexFromVisibility, stepTowards, worthCorrecting } from '../render/converge.js'
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

/**
 * How many frames the convergence loop is allowed, and how many quiet ones end it.
 *
 * Eight quiet frames rather than three, because a section is not finished when it stops moving the
 * first time: its prose and its highlighting arrive on their own schedule, and each of them changes
 * a height somewhere above the target. Three was enough to catch the walk and not the settling, and
 * the reference ended up one operation past the one it was asked for.
 *
 * Three hundred frames rather than ninety, because ninety was a budget measured against short header
 * sections. M18 gave every header an index, which made some of them seven hundred pixels tall, and a
 * walk of one step per frame through taller sections spends more of them - on a loaded machine the
 * jump ran out mid-correction and stopped fourteen hundred pixels short, which is indistinguishable
 * to a reader from the plane ignoring them. The cap costs nothing in the ordinary case: the loop
 * ends on eight quiet frames, which a settled document reaches in a dozen or so. It is a bound on
 * chasing a document whose prose never stops arriving, not a schedule.
 */
const CONVERGE_FRAMES = 300
const STABLE_FRAMES = 8

/**
 * How long to wait for a frame that may never come.
 *
 * Roughly two frames' worth: long enough that a page being painted normally always wins the race
 * with its own animation frame, short enough that a page which is not being painted still converges
 * in the same handful of steps rather than in a visible crawl.
 */
const TICK_MS = 32

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
  /**
   * A heading *inside* that section to land on instead of its top, in the form the DOM stamps ids.
   *
   * Kept beside the target rather than folded into it, because the two answer different questions:
   * which item the virtualiser has to mount, and where in it the reader asked to be.
   */
  #anchor: string | undefined
  #reattached: VirtualizerHostElement | undefined
  #frame: number | undefined
  #tick: ReturnType<typeof setTimeout> | undefined
  #settle: ReturnType<typeof setTimeout> | undefined
  #quiet: ReturnType<typeof setTimeout> | undefined
  #reported: string | undefined

  /**
   * Where the plane was left when the scroll it was asked for finished.
   *
   * Cleared the moment it moves off that, which is the only thing that makes what the spy says news
   * again. `undefined` when no scroll has been asked for, which is the ordinary reading session.
   */
  #restedAt: number | undefined

  /**
   * Where the reader has already been taken, so arriving there twice does nothing.
   *
   * A section, and the heading inside it when the URL named one - the two together are the request,
   * and a section id on its own cannot tell two headings of one section apart.
   */
  #asked: string | undefined

  constructor(host: ReactiveControllerHost, options: SectionsOptions) {
    this.#host = host
    this.#options = options
    host.addController(this)
  }

  hostDisconnected(): void {
    clearTimeout(this.#settle)
    clearTimeout(this.#quiet)
    this.#stopFrames()
  }

  /**
   * Stop asking for frames.
   *
   * The convergence loop schedules itself, and a host that goes away mid-scroll leaves it running
   * against a detached document for the rest of its budget - forty-five frames of nothing, taken
   * from whatever is on screen now. In a browser that is a leak nobody sees; in a test run, where
   * several references are mounted and disposed in a second, it is the previous test stealing the
   * frames the next one is waiting on.
   */
  #stopFrames(): void {
    if (this.#frame !== undefined && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.#frame)
    }
    clearTimeout(this.#tick)
    this.#frame = undefined
    this.#tick = undefined
  }

  /**
   * The next chance to look: a frame if the page is being painted, a timer if it is not.
   *
   * Frames alone were the whole mechanism, and they are the right clock - a correction is only worth
   * making once the layout it measures has happened. But a page that is not being rendered gets no
   * frames at all, and openish is a component a host embeds wherever it likes: a reference resolving
   * a deep link in a tab the reader has not switched to yet, or in an offscreen frame, had its
   * correction loop suspended mid-jump and stayed wherever the estimate had left it - fourteen
   * hundred pixels short, in this repo's own suite, whenever the browser had something better to do.
   *
   * So the two race and the first to fire wins, with the loser cancelled: sixty times a second while
   * anyone is looking, thirty-odd times a second when nobody is, and the same answer either way.
   */
  #schedule(run: () => void): void {
    this.#stopFrames()

    const fire = () => {
      this.#stopFrames()
      run()
    }

    if (typeof requestAnimationFrame === 'function') {
      this.#frame = requestAnimationFrame(fire)
    }
    this.#tick = setTimeout(fire, TICK_MS)
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

  /**
   * Records where the URL now points, and says whether that is news.
   *
   * The pair is the request, not the section alone: two headings of one section resolve to the same
   * section id, and keying on that alone meant the second of them was a navigation the plane
   * ignored. An empty section is not a request at all - the document has not arrived yet.
   *
   * It records rather than scrolls, because the caller has one more thing to weigh: whether the URL
   * moved because the reader did, or the reader is being moved because the URL did. Only the second
   * of those is a scroll, and both look identical from here.
   */
  arriveAt(section: string, anchor: string): boolean {
    if (section === '') {
      return false
    }

    const asked = anchor ? `${section}#${anchor}` : section
    if (asked === this.#asked) {
      return false
    }
    this.#asked = asked
    return true
  }

  /** A document swap: nothing that was true of the last plane is true of this one. */
  reset(): void {
    clearTimeout(this.#settle)
    clearTimeout(this.#quiet)
    this.#programmatic = undefined
    this.#reported = undefined
    this.#restedAt = undefined
    this.#target = undefined
    this.#anchor = undefined
    this.#asked = undefined
  }

  /**
   * Put the reader at a section, or at a heading inside one.
   *
   * Silently does nothing for an id the document has no section for - which is not a swallowed
   * error but the ordinary case of a bookmarked URL outliving the operation it named. The banner
   * above the plane is what says so; scrolling somewhere arbitrary as well would be worse.
   *
   * `anchor` is what makes a heading from `info.description` reachable. Those are navigation entries
   * with no section of their own - the overview renders them, and stamps their ids - so the element
   * that owns them has always been the one to scroll to them, and on a plane it can only do that
   * while it happens to be mounted. From anywhere further down the document it is not mounted at
   * all, and the click did nothing whatsoever. Here the section is mounted first, and the heading
   * inside it is what the correction measures against.
   */
  scrollTo(id: string, anchor = ''): void {
    const index = sectionIndex(this.#sections).get(id)
    if (index === undefined) {
      return
    }

    /* One scroll at a time: a second target makes the first one's corrections wrong, not late. */
    this.#stopFrames()

    this.#target = id
    this.#anchor = anchor || undefined
    this.#programmatic = id
    this.#restedAt = undefined
    /*
     * And drop a report the reader's own scrolling had queued.
     *
     * The mute stops new ones; a debounce already ticking is behind it, and it lands a tenth of a
     * second into the jump naming wherever they were before they clicked.
     */
    clearTimeout(this.#quiet)
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
      if (tries < REACH_TRIES && this.#alive) {
        this.#schedule(() => this.#reach(index, tries + 1))
      }
      return
    }

    /*
     * Straight at it, rather than behind `layoutComplete`.
     *
     * That promise only resolves when a reflow is *pending*, so waiting on it worked for a deep link
     * - where the plane is still being built - and hung forever for a reader who edited the fragment
     * of a page that had already settled. The scroll was queued behind a promise nothing would ever
     * settle, and the reference sat where it was with the right URL and no error.
     *
     * The layout is initialised asynchronously, so the first attempt can land before there is one to
     * pin: that throws, and `#reach` tries again next frame. Every attempt after the first is a real
     * one, and the convergence loop is what makes it accurate either way.
     *
     * Never `smooth` across sections. A smooth scroll through several hundred of them drags the
     * rendered window across the whole document on the way, mounting everything it passes - and it
     * is also the one behaviour for which the virtualiser does *not* pin.
     */
    /*
     * The jump waits for the layout; the correction does not.
     *
     * `element(index).scrollIntoView()` hands the layout a pin, and a pin is only worth setting once
     * the layout has measured enough to place it - which is what `layoutComplete` says. But that
     * promise only resolves when a reflow is *pending*: on a plane that has already settled, a reader
     * who edits the fragment would wait behind it forever, and the reference would sit where it was
     * with the right URL and no error anywhere.
     *
     * So the convergence loop starts immediately and independently. It can reach any section on its
     * own - a viewport at a time towards it, then a direct correction once it is rendered - and the
     * pin, when it fires, is an optimisation that gets it most of the way there in one go.
     *
     * Never `smooth` across sections. A smooth scroll through several hundred of them drags the
     * rendered window across the whole document on the way, mounting everything it passes - and it
     * is also the one behaviour for which the virtualiser does *not* pin.
     */
    void virtualizer.layoutComplete
      .then(() => {
        if (this.#alive && this.#target !== undefined && sectionIndex(this.#sections).get(this.#target) === index) {
          virtualizer.element(index)?.scrollIntoView({ block: 'start' })
          /*
           * And correct *after* it, which is the half that was missing.
           *
           * The pin is built from the same estimates the jump was, so it lands accurately only when
           * the sections above the target happen to be the average height. It resolves on its own
           * schedule - `layoutComplete` is a promise, and on a long jump it settles after the loop
           * below has already run out of corrections to make. What the reader got then was a plane
           * that moved *once more* after everything watching it had stopped, and stayed there: on
           * this repo's own test document, fourteen hundred pixels above the section they asked for,
           * frozen, with the right URL.
           *
           * So the loop is started again behind the pin. The frames of whichever run is still going
           * are cancelled first - two loops correcting the same scroll would each undo the other's
           * last move - and the second run costs nothing when the pin was accurate, because it ends
           * on eight quiet frames like any other.
           */
          this.#stopFrames()
          this.#converge(index, 0, 0)
        }
      })
      .catch(() => undefined)

    this.#converge(index, 0, 0)
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
    if (tries >= CONVERGE_FRAMES || stable >= STABLE_FRAMES || !this.#alive) {
      this.#arrived()
      return
    }

    this.#schedule(() => {
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
         * the bottom, and stays there however many times it is asked. What *is* reliable is where
         * the reader currently is: the rendered sections have ids, the ids have indices, and the gap
         * between one and the target says both which way to go and how far. Every step measures more
         * of the document, so the estimates behind the scrollbar improve as it goes.
         */
        const showing = plane.querySelector('.section')?.getAttribute('data-id') ?? ''
        scroller.scrollTop += stepTowards(
          sectionIndex(this.#sections).get(showing),
          index,
          this.#sections.length,
          scroller,
        )
        this.#converge(index, tries + 1, 0)
        return
      }

      /*
       * The heading, once the section that owns it has rendered one.
       *
       * Missing is the ordinary state for the first frames rather than a failure: the section has
       * only just been mounted, and its prose arrives with the markdown pipeline a turn or two
       * later. Until it does the correction aims at the top of the section - which is where the
       * reader is going anyway, only less far - and the frame does not count as a stable one, so the
       * loop cannot declare itself finished short of the heading that was asked for.
       */
      const anchor = this.#anchor
      const heading = anchor === undefined ? section : deepQuery(section, `[id="${CSS.escape(anchor)}"]`)

      const delta = correction((heading ?? section).getBoundingClientRect(), scroller.getBoundingClientRect())
      if (worthCorrecting(delta)) {
        scroller.scrollTop += delta
        this.#converge(index, tries + 1, 0)
        return
      }

      this.#converge(index, tries + 1, heading ? stable + 1 : 0)
    })
  }

  /** Whether there is still a plane in a document worth scrolling. */
  get #alive(): boolean {
    return this.#plane?.isConnected === true
  }

  /** The scroll is over: what the plane says about itself can be believed again, once it moves. */
  #arrived(): void {
    this.#frame = undefined
    clearTimeout(this.#settle)
    this.#reported = this.#target
    this.#programmatic = undefined
    this.#restedAt = this.#scroller?.scrollTop
  }

  /**
   * The virtualiser's own report of what is on screen, turned into where the reader is.
   *
   * The reading of it is `indexFromVisibility`; what is left here is handing it the scroller and
   * turning the answer back into an id.
   */
  readonly onVisibilityChanged = (event: VisibilityChangedEvent): void => {
    if (this.#sections.length === 0) {
      return
    }

    const index = indexFromVisibility(event.first, this.#sections.length, this.#scroller ?? undefined)
    const id = this.#sections[index]?.id
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

    /*
     * Nor is a report about a plane that has not moved since it was put here.
     *
     * A jump parks its target against the top edge and stops as soon as the gap is not worth
     * correcting, so the section above it ends within a pixel of that edge - and whether it still
     * overlaps the viewport is decided by how the headings above it happened to lay out. The
     * virtualiser reports what it *renders*, and the rendered range goes on changing after the scroll
     * is over as prose and highlighting land, so one of those late reports named the parent header
     * and the URL, the sidebar and the reader's bookmark all followed it off the section that had
     * been asked for. Under load and never on its own, because load is what moves the sub-pixel
     * arithmetic across the line.
     *
     * The mute cannot cover this: the scroll genuinely has finished, and holding it open on a longer
     * timer would move the race rather than settle it. What is true without a margin in it is that
     * the reader has not gone anywhere while the page has not moved.
     */
    if (this.#restedAt !== undefined) {
      if (this.#scroller?.scrollTop === this.#restedAt) {
        return
      }
      this.#restedAt = undefined
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

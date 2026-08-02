/**
 * The arithmetic behind a scroll onto a virtualised plane, with the DOM taken out of it.
 *
 * `SectionsController` owns the frame loop, the mute, and the measuring; what is left here is the
 * three sums it makes, which have no scroller in them and are the part that has ever been wrong.
 * Each of them was arrived at by a failure recorded in PLAN.md (M17, M18, M19) rather than derived,
 * so they are worth being able to state a case about without mounting a virtualiser to do it.
 */

/** What the loop needs to know about the element doing the scrolling. */
export type ScrollBox = {
  readonly scrollTop: number
  readonly clientHeight: number
  readonly scrollHeight: number
}

/**
 * How far to jump when the target section is out of the rendered range.
 *
 * A viewport a frame is safe and, on a long document, far too slow: from the bottom of six hundred
 * models back to the overview is a hundred thousand pixels, which is more frames than the loop is
 * allowed - so the walk ran out of budget somewhere in the middle and the reader was left where the
 * click had not taken them, with the spy then writing *that* into the URL. Scaling the step by how
 * many sections lie between here and there closes the same distance in a handful of frames: the mean
 * section height is a poor description of any one section and a good one of a hundred, and every
 * jump measures more of the document, so the next estimate is better than the last.
 *
 * A viewport is the floor: a gap of one section is worth one mean height, which on a document of
 * short models is a step small enough to render nothing new and get taken again next frame.
 *
 * Signed: negative walks back up the document, positive walks down.
 */
export const stepTowards = (
  at: number | undefined,
  index: number,
  sectionCount: number,
  box: Pick<ScrollBox, 'clientHeight' | 'scrollHeight'>,
): number => {
  const viewport = box.clientHeight
  if (at === undefined) {
    return viewport
  }

  const average = box.scrollHeight / Math.max(sectionCount, 1)
  const distance = Math.max(Math.abs(index - at) * average, viewport)
  return at > index ? -distance : distance
}

/**
 * The virtualiser's own report of what is on screen, turned into which section the reader is at.
 *
 * `first` is the topmost item intersecting the viewport, which is the section whose text is under
 * the reader's eye rather than the one that has just appeared at the bottom of the window. The two
 * ends are read from the scroller instead, because a line-based answer cannot express them: at the
 * very top the first section may be shorter than the gap above it, and at the very bottom a short
 * final section is never topmost and would be unreachable.
 *
 * Clamped into range, so a report that arrives after the document has shrunk names a section that
 * still exists.
 */
export const indexFromVisibility = (first: number, sectionCount: number, box: ScrollBox | undefined): number => {
  let index = first
  if (box) {
    if (box.scrollTop <= 1) {
      index = 0
    } else if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) {
      index = sectionCount - 1
    }
  }

  return Math.max(0, Math.min(index, sectionCount - 1))
}

/**
 * How far the scroller is from having the target at its top edge.
 *
 * Measured off the DOM rather than from the layout's estimates, because a section whose own prose
 * and highlighting land a few frames after it does is only described accurately by where it now is.
 * A pixel either way is not worth a correction - and correcting inside that margin is how a loop
 * that should have gone quiet keeps finding work to do.
 */
export const correction = (target: { readonly top: number }, scroller: { readonly top: number }): number =>
  target.top - scroller.top

/** Whether a measured gap is worth another scroll. */
export const worthCorrecting = (delta: number): boolean => Math.abs(delta) > 1

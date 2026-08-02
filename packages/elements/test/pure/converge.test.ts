import { describe, expect, it } from 'vitest'

import { correction, indexFromVisibility, stepTowards, worthCorrecting } from '../../src/render/converge.js'

/* A hundred sections over a hundred thousand pixels: a mean section of a thousand. */
const BOX = { scrollTop: 50_000, clientHeight: 800, scrollHeight: 100_000 }

describe('stepTowards', () => {
  it('walks a viewport when it has no idea where the reader is', () => {
    expect(stepTowards(undefined, 40, 100, BOX)).toBe(BOX.clientHeight)
  })

  it('walks down towards a section further into the document', () => {
    expect(stepTowards(10, 40, 100, BOX)).toBe(30 * 1000)
  })

  it('walks up towards a section behind the reader', () => {
    expect(stepTowards(40, 10, 100, BOX)).toBe(-30 * 1000)
  })

  /*
   * The failure this exists for: a gap of one section on a document of short models is a step that
   * renders nothing new, so the next frame takes the same step again and the loop never converges.
   */
  it('never steps less than a viewport, however close the target', () => {
    const short = { scrollTop: 0, clientHeight: 800, scrollHeight: 1000 }
    expect(stepTowards(10, 11, 100, short)).toBe(800)
    expect(stepTowards(11, 10, 100, short)).toBe(-800)
  })

  it('does not divide by zero on a document with no sections', () => {
    expect(Number.isFinite(stepTowards(0, 0, 0, BOX))).toBe(true)
  })
})

describe('indexFromVisibility', () => {
  it('takes the virtualiser at its word in the middle of the document', () => {
    expect(indexFromVisibility(42, 100, { scrollTop: 50_000, clientHeight: 800, scrollHeight: 100_000 })).toBe(42)
  })

  /*
   * The two ends cannot be expressed by "topmost item intersecting the viewport": at the top the
   * first section may be shorter than the gap above it, and at the bottom a short final section is
   * never topmost and would be unreachable.
   */
  it('reports the first section at the top of the scroller', () => {
    expect(indexFromVisibility(3, 100, { scrollTop: 0, clientHeight: 800, scrollHeight: 100_000 })).toBe(0)
  })

  it('reports the last section at the bottom of the scroller', () => {
    expect(indexFromVisibility(90, 100, { scrollTop: 99_200, clientHeight: 800, scrollHeight: 100_000 })).toBe(99)
  })

  it('clamps a report that names a section the document no longer has', () => {
    expect(indexFromVisibility(500, 10, undefined)).toBe(9)
    expect(indexFromVisibility(-3, 10, undefined)).toBe(0)
  })

  it('trusts the report when there is no scroller to read the ends off', () => {
    expect(indexFromVisibility(4, 100, undefined)).toBe(4)
  })
})

describe('correction', () => {
  it('is the gap between the target and the top of the scroller', () => {
    expect(correction({ top: 1400 }, { top: 0 })).toBe(1400)
    expect(correction({ top: -200 }, { top: 100 })).toBe(-300)
  })

  /* Correcting inside a pixel is how a loop that should have gone quiet keeps finding work. */
  it('leaves a sub-pixel gap alone', () => {
    expect(worthCorrecting(0.5)).toBe(false)
    expect(worthCorrecting(-1)).toBe(false)
    expect(worthCorrecting(1.5)).toBe(true)
  })
})

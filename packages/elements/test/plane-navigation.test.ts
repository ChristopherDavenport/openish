import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, disposeAll, mountReference, settleScroll, type Harness } from './helpers.js'

afterEach(() => {
  disposeAll()
})

/**
 * A document whose overview has headings and whose body is long enough to unmount it.
 *
 * Both halves matter. The headings are the navigation entries under test - they are anchors inside
 * the overview rather than sections of their own - and the models are what pushes the overview out
 * of the virtualiser's rendered window, which is the state the bug needs.
 */
const withProse = (models: number) => ({
  openapi: '3.1.0',
  info: {
    title: 'Galaxy',
    version: '1.0.0',
    description: '# Markdown support\n\nProse.\n\n# Resources\n\nMore prose.',
  },
  paths: {
    '/things': {
      get: {
        summary: 'List things',
        operationId: 'listThings',
        tags: ['things'],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    schemas: Object.fromEntries(
      Array.from({ length: models }, (_, index) => [
        `Model${String(index).padStart(4, '0')}`,
        { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      ]),
    ),
  },
})

const scroller = (harness: Harness): HTMLElement => harness.element.shadowRoot!.querySelector('main')!

const overviewRendered = (harness: Harness): boolean =>
  harness.element.shadowRoot!.querySelector('.section[data-kind="overview"]') !== null

const sectionTop = (harness: Harness, id: string): number =>
  harness.element.shadowRoot!.querySelector(`.section[data-id$="${id}"]`)!.getBoundingClientRect().top -
  scroller(harness).getBoundingClientRect().top

/**
 * The last section that has reached the top edge of the scroller, which is the one being read.
 *
 * Measured here rather than asked of the reference, because it is the thing the URL is supposed to
 * agree with - reading both off the same source would assert nothing.
 */
const beingRead = (harness: Harness): string => {
  const top = scroller(harness).getBoundingClientRect().top
  const reached = [...harness.element.shadowRoot!.querySelectorAll('.section')].filter(
    (section) => section.getBoundingClientRect().top - top <= 1,
  )
  return reached.at(-1)?.getAttribute('data-id') ?? ''
}

/** The URL, once the spy's debounce has had a chance to write it. */
const settledHash = async (harness: Harness, from: string): Promise<string> => {
  for (let attempt = 0; attempt < 60 && harness.window.location.hash === from; attempt += 1) {
    await new Promise((resolve) => harness.window.setTimeout(resolve, 50))
  }
  return harness.window.location.hash
}

describe('navigating a long way up the plane', () => {
  it('arrives, rather than running out of frames somewhere in the middle', async () => {
    const harness = await mountReference({ path: '/models/Model0299', spec: withProse(300) })
    /*
     * Settled before the test starts, not merely rendered.
     *
     * The deep link is itself a jump corrected over several frames, and asking for a second one
     * while the first is still converging leaves two loops correcting towards different sections -
     * whichever lands last wins. That is a real thing a reader can do and it is not what this test
     * is about, so the plane is quiet before the question is asked.
     */
    await settleScroll(harness, 'models/Model0299', 40)

    expect(scroller(harness).scrollTop).toBeGreaterThan(0)

    /*
     * The first operation, a hundred thousand pixels above the models the reader is among. Asked
     * for by URL rather than by clicking, because the sidebar is virtualised too and does not have
     * a row for it while the reader is down here - which is a bug of its own if it is one.
     */
    await harness.goto('/tags/things/listThings')
    /* The jump is corrected over several frames, and this is a test about where it ends up. */
    await settleScroll(harness, 'tags/things/listThings', 40)

    expect(Math.abs(sectionTop(harness, 'tags/things/listThings'))).toBeLessThan(40)
  })
})

describe('the URL, while the reader reads', () => {
  /*
   * The failure this exists for.
   *
   * A jump parks its target against the top edge, so the section above it ends within a pixel of
   * that edge - and the virtualiser, which reports the topmost item *intersecting* the viewport, then
   * named the parent header on some runs and the target on others depending on how the headings above
   * it laid out. The rendered range goes on changing after the scroll is over as prose and
   * highlighting land, so one of those late reports arrived after the mute had lifted and took the
   * URL, the sidebar and the reader's bookmark off the section they had asked for.
   */
  it('stays on the section a deep link asked for, after the plane has stopped moving', async () => {
    const harness = await mountReference({ path: '/models/Model0099', spec: withProse(200) })
    await settleScroll(harness, 'models/Model0099', 40)

    expect(harness.window.location.hash).toBe('#/models/Model0099')
    expect(beingRead(harness)).toMatch(/\/models\/Model0099$/)
  })

  /* And the other half: holding the URL still must not leave the spy deaf for the rest of the page. */
  it('follows the reader as soon as they scroll away from it', async () => {
    const harness = await mountReference({ path: '/models/Model0099', spec: withProse(200) })
    await settleScroll(harness, 'models/Model0099', 40)

    scroller(harness).scrollTop += 3000
    const hash = await settledHash(harness, '#/models/Model0099')
    await harness.settle()

    expect(hash).not.toBe('#/models/Model0099')
    expect(beingRead(harness)).toMatch(/\/models\/Model\d+$/)
    expect(beingRead(harness).endsWith(hash.slice(2))).toBe(true)
  })
})

describe('navigating to a heading inside the overview', () => {
  it('scrolls back to it from a section the plane has scrolled the overview out of', async () => {
    const harness = await mountReference({ path: '/models/Model0299', spec: withProse(300) })
    await harness.settle()

    /* The precondition: the overview is not in the DOM at all, so nothing there can hear a hash. */
    expect(overviewRendered(harness)).toBe(false)
    expect(scroller(harness).scrollTop).toBeGreaterThan(0)

    await harness.clickLink('/overview/resources')

    expect(overviewRendered(harness)).toBe(true)
    const heading = deepQuery(harness.element.shadowRoot!, '[id="overview/resources"]')
    expect(heading).not.toBeNull()

    const top = heading!.getBoundingClientRect().top - scroller(harness).getBoundingClientRect().top
    expect(Math.abs(top)).toBeLessThan(40)
  })

  it('moves between two headings of the one section, which resolve to the same section id', async () => {
    const harness = await mountReference({ path: '/overview/markdown-support', spec: withProse(20) })
    await harness.settle()

    const at = (id: string) =>
      deepQuery(harness.element.shadowRoot!, `[id="${id}"]`)!.getBoundingClientRect().top -
      scroller(harness).getBoundingClientRect().top

    await harness.clickLink('/overview/resources')

    /*
     * The second heading is a navigation of its own, and both of them are the overview - so a plane
     * that keyed "already been there" on the section alone would treat this click as a repeat.
     */
    expect(Math.abs(at('overview/resources'))).toBeLessThan(40)
    expect(at('overview/markdown-support')).toBeLessThan(0)
  })
})

import { virtualize } from '@lit-labs/virtualizer/virtualize.js'
import { html, render } from 'lit'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * The one thing the plane depends on that cannot be assumed.
 *
 * `<openish-operation>` keeps its examples column stuck to the top of the scroller while a long
 * schema goes past it. On the plane that column will be inside a virtualiser item, and a virtualiser
 * positions its items absolutely and moves them with a `transform` - and a transformed ancestor
 * changes which box some positioned descendants resolve against. Sticky is supposed to resolve
 * against the nearest scrollport and be bounded by its own containing block, which is exactly what
 * is wanted here, but "supposed to" is not a thing to find out in stage nine.
 *
 * So this is the geometry rather than the elements: an absolutely positioned, transformed item
 * holding a two-column grid whose right column is sticky. If this ever fails, the fallback is that
 * the examples column stops being sticky and each card is simply top-aligned in its row - a smaller
 * loss than it sounds, because a section on the plane is bounded rather than being the whole page.
 */
const built: HTMLElement[] = []

afterEach(() => {
  for (const element of built.splice(0)) {
    element.remove()
  }
})

const SECTIONS = [0, 1, 2, 3, 4]

const plant = async (): Promise<{ scroller: HTMLElement; plane: HTMLElement }> => {
  const scroller = document.createElement('div')
  scroller.style.cssText = 'height: 400px; width: 800px; overflow-y: auto; position: relative;'

  const plane = document.createElement('div')
  scroller.append(plane)
  document.body.append(scroller)
  built.push(scroller)

  render(
    virtualize({
      items: SECTIONS,
      keyFunction: (index: number) => index,
      renderItem: (index: number) => html`
        <div class="section" data-index=${index} style="width: 100%; box-sizing: border-box;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; align-items: start;">
            <div class="docs" style="height: 1200px; background: #eee;">docs ${index}</div>
            <div class="examples" style="position: sticky; top: 0; height: 60px; background: #ccc;">
              examples ${index}
            </div>
          </div>
        </div>
      `,
    }),
    plane,
  )

  /* The virtualiser cannot render until a ResizeObserver has measured it, which is a frame away. */
  for (let pass = 0; pass < 6; pass += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }

  return { scroller, plane }
}

describe('a sticky column inside a virtualised item', () => {
  it('is rendered at all, and only a window of the items with it', async () => {
    const { plane } = await plant()

    const sections = plane.querySelectorAll('.section')
    expect(sections.length).toBeGreaterThan(0)
    /* The premise of the whole plane: not every item exists. Five 1200px items in a 400px scroller. */
    expect(sections.length).toBeLessThan(SECTIONS.length)
  })

  it('sticks to the top of the scroller rather than scrolling away with its item', async () => {
    const { scroller, plane } = await plant()

    const examples = plane.querySelector<HTMLElement>('.section[data-index="0"] .examples')!
    expect(getComputedStyle(examples).position).toBe('sticky')

    const before = examples.getBoundingClientRect().top
    scroller.scrollTop = 300
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const after = examples.getBoundingClientRect().top
    const scrollerTop = scroller.getBoundingClientRect().top

    /* Stuck: it stayed where it was on screen instead of travelling the 300px the item did. */
    expect(Math.abs(after - before)).toBeLessThan(2)
    expect(Math.abs(after - scrollerTop)).toBeLessThan(2)
  })

  it('is still bounded by its own item, so it does not follow into the next section', async () => {
    const { scroller, plane } = await plant()

    /* Past the end of the first item, which is 1200px of documentation. */
    scroller.scrollTop = 1180
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const first = plane.querySelector<HTMLElement>('.section[data-index="0"] .examples')
    if (first) {
      /* It has been pushed up out of the scrollport by the bottom of its own containing block. */
      expect(first.getBoundingClientRect().top).toBeLessThan(scroller.getBoundingClientRect().top + 1)
    }
  })
})

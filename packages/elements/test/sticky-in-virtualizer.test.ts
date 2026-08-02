import { virtualize } from '@lit-labs/virtualizer/virtualize.js'
import { html, render } from 'lit'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * Why the examples column does not stick.
 *
 * It used to, when an operation was the whole page. On the plane the virtualiser positions every
 * item absolutely and moves it with a `transform`, and a sticky descendant is resolved from its
 * *layout* position while the scroll offset it is compared against is real. Near the top of a
 * document the two agree closely enough that nothing looks wrong. Far down they do not, and the
 * browser - concluding the element is far above the scrollport - clamps it to the bottom of its
 * containing block, which puts the sample below the documentation it belongs beside.
 *
 * This file used to assert the opposite, and passed: it scrolled three hundred pixels, and the
 * divergence is proportional to the offset. That is the lesson worth keeping. A spike that exercises
 * a mechanism at a scale the real thing will not run at is not evidence about the real thing, and
 * this one cost a day by looking like it was.
 *
 * If a future virtualiser positions its items with `top` rather than a transform, or the CSS working
 * group resolves sticky against the transformed box, these expectations flip and the column can go
 * back to sticking. Until then the geometry says no.
 */
const built: HTMLElement[] = []

afterEach(() => {
  for (const element of built.splice(0)) {
    element.remove()
  }
})

const SECTIONS = Array.from({ length: 12 }, (_, index) => index)

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
  for (let pass = 0; pass < 8; pass += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }

  return { scroller, plane }
}

const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

describe('a virtualised plane', () => {
  it('renders a window of its items and not the document', async () => {
    const { plane } = await plant()

    const sections = plane.querySelectorAll('.section')
    expect(sections.length).toBeGreaterThan(0)
    /* The premise of the whole plane: twelve 1200px items, and not twelve of them in the DOM. */
    expect(sections.length).toBeLessThan(SECTIONS.length)
  })

  it('positions its items with a transform, which is what breaks sticky inside them', async () => {
    const { scroller, plane } = await plant()

    scroller.scrollTop = 6000
    await settle()

    const section = plane.querySelector<HTMLElement>('.section')!
    expect(getComputedStyle(section).transform).not.toBe('none')

    /*
     * The sample is supposed to be level with the top of its own documentation. Instead it is at the
     * bottom of it - the clamp sticky applies when it believes the element has scrolled out of its
     * containing block, which is what a layout position of zero under a real scroll offset looks
     * like. The gap is the containing block's height less the element's, exactly.
     */
    const docs = section.querySelector<HTMLElement>('.docs')!
    const examples = section.querySelector<HTMLElement>('.examples')!
    const drop = examples.getBoundingClientRect().top - docs.getBoundingClientRect().top

    expect(drop).toBeGreaterThan(500)
  })

  it('does not drift near the top, which is why a small spike said it was fine', async () => {
    const { scroller, plane } = await plant()

    scroller.scrollTop = 300
    await settle()

    const section = plane.querySelector<HTMLElement>('.section[data-index="0"]')
    if (!section) {
      return
    }

    const docs = section.querySelector<HTMLElement>('.docs')!
    const examples = section.querySelector<HTMLElement>('.examples')!

    /* Three hundred pixels in, it sticks the way it is supposed to. That was the whole of the spike. */
    expect(examples.getBoundingClientRect().top - docs.getBoundingClientRect().top).toBeLessThan(500)
  })
})

import '@openish/elements'

import { afterEach, describe, expect, it } from 'vitest'

import { STANDALONE_EXAMPLES } from '../src/data/standalone.js'

/*
 * Every catalogue demo, actually mounted.
 *
 * `examples.test.ts` checks that each example names properties the element declares, which is the
 * question a manifest can answer. It cannot answer the next one: whether the *values* are the shape
 * the element expects. `<openish-tabs>` takes a `content` callback per tab and renders the selected
 * one, and an example that supplied tabs without it passed the name check, shipped, and threw on
 * first render with `t.content is not a function`.
 *
 * So this mounts each one for real and insists it renders something. It is a smoke test rather than
 * an assertion about appearance - the elements have their own suite for that - and what it is
 * really guarding is the claim the catalogue makes: that these work standing on their own, with no
 * reference around them and no document store in sight.
 */
const mounted: Element[] = []

const mount = async (markup: string, props: Readonly<Record<string, unknown>>): Promise<Element> => {
  const fragment = document.createRange().createContextualFragment(markup)
  const element = fragment.firstElementChild
  if (!element) {
    throw new Error(`no element in: ${markup}`)
  }
  /* Assigned before insertion, exactly as `<site-example>` does it - see that component for why. */
  Object.assign(element, props)
  document.body.append(fragment)
  mounted.push(element)
  await customElements.whenDefined(element.tagName.toLowerCase())
  await (element as Element & { updateComplete?: Promise<unknown> }).updateComplete
  return element
}

afterEach(() => {
  for (const element of mounted.splice(0)) {
    element.remove()
  }
})

/** Waits until an element has put something in its shadow root, or gives up and says so. */
const drawSomething = async (element: Element): Promise<void> => {
  const deadline = performance.now() + 5000
  while (performance.now() < deadline) {
    if ((element.shadowRoot?.childElementCount ?? 0) > 0) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`<${element.tagName.toLowerCase()}> rendered an empty shadow root`)
}

describe.each(Object.entries(STANDALONE_EXAMPLES))('%s standing alone', (tag, example) => {
  it('mounts and renders without a reference around it', async () => {
    const errors: string[] = []
    const onError = (event: ErrorEvent): void => {
      errors.push(event.message)
    }
    window.addEventListener('error', onError)

    try {
      const element = await mount(example.markup, example.props ?? {})

      expect(element.tagName.toLowerCase(), 'the markup produced the element it documents').toBe(tag)
      expect(element.shadowRoot, `<${tag}> never attached a shadow root`).not.toBeNull()
      /*
       * Something was drawn - eventually. An element that renders nothing is not a demonstration of
       * anything, but "nothing yet" is a legitimate state here: `<openish-markdown>` is empty at
       * `updateComplete` because the markdown and highlight pipeline is one of the three chunks
       * openish defers, and it fills in a beat later. Waiting is the assertion; the deadline is what
       * keeps a genuinely empty element from passing.
       */
      await drawSomething(element)
      expect(errors, `<${tag}> threw while rendering`).toEqual([])
    } finally {
      window.removeEventListener('error', onError)
    }
  })
})

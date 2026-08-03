import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, disposeAll, mountReference, shadowOf, textOf, type Harness, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const menuOf = (harness: Harness): HTMLButtonElement | null =>
  harness.element.shadowRoot!.querySelector('.menu')

/** Narrows the frame and lets the element re-measure, the way a phone-sized viewport would. */
const narrow = async (harness: Harness): Promise<void> => {
  harness.frame.style.width = '380px'
  await new Promise((resolve) => setTimeout(resolve, 50))
  await harness.settle()
}

describe('the navigation column', () => {
  it('renders beside the page at a comfortable width, with no disclosure to open', async () => {
    const { element } = await mountReference({ path: '/' })

    expect(element.shadowRoot!.querySelector('openish-sidebar')).not.toBeNull()
    expect(element.shadowRoot!.querySelector('.menu')).toBeNull()
  })
})

describe('the stacked navigation, which a narrow viewport gets', () => {
  it('is what a narrow viewport gets, and it starts closed', async () => {
    const harness = await mountReference({ path: '/' })
    await narrow(harness)

    expect(menuOf(harness)?.getAttribute('aria-expanded')).toBe('false')
    /* Not merely hidden: an invisible tree that is still focusable is the bug this replaced. */
    expect(harness.element.shadowRoot!.querySelector('openish-sidebar')).toBeNull()
  })

  it('names itself, so the control says what it opens', async () => {
    const harness = await mountReference({ path: '/' })
    await narrow(harness)

    expect(menuOf(harness)).not.toBeNull()
    expect(textOf(menuOf(harness))).toContain('Navigation')
  })

  it('opens and closes the navigation, and says which it is', async () => {
    const harness = await mountReference({ path: '/' })
    await narrow(harness)
    const menu = menuOf(harness)!

    menu.click()
    await harness.settle()

    expect(menu.getAttribute('aria-expanded')).toBe('true')
    expect(deepQuery(harness.element.shadowRoot!, 'openish-sidebar')).not.toBeNull()
    expect(harness.element.shadowRoot!.querySelector('#navigation')).not.toBeNull()

    menu.click()
    await harness.settle()

    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(harness.element.shadowRoot!.querySelector('openish-sidebar')).toBeNull()
  })

  it('closes itself once the reader has picked a page', async () => {
    const harness = await mountReference({ path: '/' })
    await narrow(harness)
    menuOf(harness)!.click()
    await harness.settle()

    await harness.clickLink('/tags/accounts')

    expect(menuOf(harness)?.getAttribute('aria-expanded')).toBe('false')
    expect(deepQuery(sectionOf(harness), 'openish-tag-section')).not.toBeNull()
  })

  it('closes on Escape from inside, and hands focus back to the button', async () => {
    const harness = await mountReference({ path: '/' })
    await narrow(harness)
    const menu = menuOf(harness)!

    menu.click()
    await harness.settle()

    deepQuery<HTMLAnchorElement>(harness.element.shadowRoot!, 'a[href="#/tags/accounts"]')!.focus()
    await userEvent.keyboard('{Escape}')
    await harness.settle()

    expect(menu.getAttribute('aria-expanded')).toBe('false')
    expect(harness.element.shadowRoot!.activeElement).toBe(menu)
  })

  it('keeps the way back to the navigation on screen while the page scrolls', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await narrow(harness)
    const menu = menuOf(harness)!

    /*
     * Two things have to hold, and the second is the safety net for a host that breaks the first:
     * the page content scrolls inside `main` rather than moving the whole document, and the
     * disclosure is sticky, so it is reachable either way.
     */
    const main = harness.element.shadowRoot!.querySelector('main')!
    main.scrollTop = 400
    await harness.settle()

    expect(main.scrollTop).toBeGreaterThan(0)
    expect(harness.frame.contentWindow!.getComputedStyle(menu).position).toBe('sticky')
    expect(Math.round(menu.getBoundingClientRect().top)).toBe(
      Math.round(harness.element.getBoundingClientRect().top),
    )
  })

  it('scrolls the page inside itself, so a host that gives it a height keeps its chrome', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    const main = harness.element.shadowRoot!.querySelector('main')!

    /* The element fills its container; `main` is the scroller, not the document. */
    expect(main.scrollHeight).toBeGreaterThan(main.clientHeight)
    expect(harness.element.getBoundingClientRect().height).toBeLessThanOrEqual(
      harness.frame.contentWindow!.innerHeight,
    )
  })

  /*
   * The switch measures the element, not the window. A host that puts a reference in a column of its
   * own on a wide page used to get the eighteen-rem sidebar and whatever was left of six hundred
   * pixels, because the only thing being asked was how wide the window was.
   */
  it('stacks an embedded reference that is narrow on a wide page', async () => {
    const harness = await mountReference({ path: '/' })
    harness.frame.style.width = '1600px'
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(menuOf(harness)).toBeNull()

    harness.element.style.width = '600px'
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(menuOf(harness)).not.toBeNull()
    expect(harness.element.shadowRoot!.querySelector('openish-sidebar')).toBeNull()
  })

  it('goes back to a navigation column when there is room again', async () => {
    const harness = await mountReference({ path: '/' })
    await narrow(harness)
    expect(menuOf(harness)).not.toBeNull()

    harness.frame.style.width = '1024px'
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(menuOf(harness)).toBeNull()
    expect(harness.element.shadowRoot!.querySelector('openish-sidebar')).not.toBeNull()
  })
})

/**
 * The examples column, which is the third band.
 *
 * The navigation switch measures the element in JavaScript; this one is a container query on the
 * content pane, because the pane's width depends on whether the sidebar is beside it. Both are
 * therefore tested by driving the same thing a reader drives - the window - and asserting on where
 * the panes actually landed rather than on which rule fired.
 */
describe('the examples column', () => {
  const panesOf = (harness: Harness) => {
    /*
     * Named, not "whichever section is active". Resizing the window re-lays the plane out and the
     * spy reports wherever that leaves the reader, so a test that widens the frame and then asks for
     * the current section is asking a question whose answer it just changed.
     */
    const operation = shadowOf(sectionOf(harness, 'tags/accounts/getAccount'), 'openish-operation')
    const docs = operation.querySelector('[part~="operation-docs"]')!
    const examples = operation.querySelector('[part~="operation-examples"]')!
    /* The title lives at the top of the documentation column now, which is most of what these assert. */
    const title = operation.querySelector('[part~="operation-header"]')!
    return { title, docs, examples }
  }

  const widen = async (harness: Harness, width: string): Promise<void> => {
    harness.frame.style.width = width
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()
  }

  it('sits beside the documentation when the page is wide enough', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await widen(harness, '1600px')
    const { title, docs, examples } = panesOf(harness)

    /* Side by side: the examples pane starts to the right of where the docs pane starts. */
    expect(examples.getBoundingClientRect().left).toBeGreaterThan(docs.getBoundingClientRect().left)

    /*
     * The example starts level with the title, because the title is the top of the documentation
     * column rather than a band above both. It used to span the two, so a paragraph of prose ran the
     * width of the page and the sample it described began a screen further down.
     */
    expect(Math.round(examples.getBoundingClientRect().top)).toBe(Math.round(docs.getBoundingClientRect().top))
    expect(title.getBoundingClientRect().right).toBeLessThanOrEqual(examples.getBoundingClientRect().left)
  })

  it('stacks the whole of the left column above the whole of the right when it is not', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await widen(harness, '820px')
    const { docs, examples } = panesOf(harness)

    /*
     * The operation described, then the operation demonstrated. There is no ordering rule involved -
     * that is simply what two elements in a single column do, which is the point of there being two
     * of them rather than three.
     */
    expect(Math.round(examples.getBoundingClientRect().left)).toBe(Math.round(docs.getBoundingClientRect().left))
    expect(docs.getBoundingClientRect().bottom).toBeLessThanOrEqual(examples.getBoundingClientRect().top + 1)
  })

  /*
   * The band the threshold actually falls in, which nothing asserted before: the old widths were
   * 820 and 1600, and the cliff was at about 1247 - so every laptop between them got the stacked
   * arrangement and the suite was equally happy either way.
   */
  it('arrives at the width a laptop is actually read at', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    const beside = async (width: string): Promise<boolean> => {
      await widen(harness, width)
      const { docs, examples } = panesOf(harness)
      return examples.getBoundingClientRect().left > docs.getBoundingClientRect().left
    }

    /* A window at 1152 or 1200 is two columns. It was one. */
    expect(await beside('1200px')).toBe(true)
    expect(await beside('1152px')).toBe(true)

    /*
     * And 1024 is still one, on purpose: 43rem of content divided in two is two columns of
     * twenty-one, which is narrower than either half is worth. The cliff is a decision, so it is
     * asserted rather than left to whatever the arithmetic happens to produce.
     */
    expect(await beside('1024px')).toBe(false)
  })

  it('follows the window across the threshold, both ways', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })

    await widen(harness, '1600px')
    expect(panesOf(harness).examples.getBoundingClientRect().left).toBeGreaterThan(
      panesOf(harness).docs.getBoundingClientRect().left,
    )

    await widen(harness, '820px')
    expect(Math.round(panesOf(harness).examples.getBoundingClientRect().left)).toBe(
      Math.round(panesOf(harness).docs.getBoundingClientRect().left),
    )

    await widen(harness, '1600px')
    expect(panesOf(harness).examples.getBoundingClientRect().left).toBeGreaterThan(
      panesOf(harness).docs.getBoundingClientRect().left,
    )
  })

  /**
   * The two sections that are not an operation and still have an instance to show.
   *
   * A model has one - what the type looks like filled in - and a webhook has its payload, which is
   * the whole of what it sends. Both used to render below their own schema, in the documentation
   * column, so the right-hand band ran down the page and then stopped at Webhooks and Models.
   */
  const columnsOf = (harness: Harness, id: string, tag: 'openish-model' | 'openish-operation') => {
    const section = shadowOf(sectionOf(harness, id), tag)
    const kind = tag.replace('openish-', '')
    return {
      docs: section.querySelector(`[part~="${kind}-docs"]`)!,
      examples: section.querySelector(`[part~="${kind}-examples"]`)!,
    }
  }

  it("puts a model's example beside the tree it is an instance of", async () => {
    const harness = await mountReference({ path: '/models/Account' })
    await widen(harness, '1600px')
    const { docs, examples } = columnsOf(harness, 'models/Account', 'openish-model')

    expect(examples.getBoundingClientRect().left).toBeGreaterThan(docs.getBoundingClientRect().left)
    expect(Math.round(examples.getBoundingClientRect().top)).toBe(Math.round(docs.getBoundingClientRect().top))

    /* The contract on the left, one instance of it on the right, and neither of them twice. */
    expect(deepQuery(docs, 'openish-schema')).not.toBeNull()
    expect(deepQuery(docs, 'openish-code-block')).toBeNull()
    expect(deepQuery(examples, 'openish-code-block')).not.toBeNull()
  })

  it("stacks a model's example under its tree when there is no room beside it", async () => {
    const harness = await mountReference({ path: '/models/Account' })
    await widen(harness, '820px')
    const { docs, examples } = columnsOf(harness, 'models/Account', 'openish-model')

    expect(Math.round(examples.getBoundingClientRect().left)).toBe(Math.round(docs.getBoundingClientRect().left))
    expect(docs.getBoundingClientRect().bottom).toBeLessThanOrEqual(examples.getBoundingClientRect().top + 1)
  })

  it("puts a section's index beside its prose rather than under it", async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    await widen(harness, '1600px')
    const section = shadowOf(sectionOf(harness, 'tags/accounts'), 'openish-tag-section')
    const docs = section.querySelector('[part~="section-docs"]')!
    const index = section.querySelector('[part~="section-index"]')!

    expect(index.getBoundingClientRect().left).toBeGreaterThan(docs.getBoundingClientRect().left)
    expect(Math.round(index.getBoundingClientRect().top)).toBe(Math.round(docs.getBoundingClientRect().top))
  })

  it("puts a webhook's payload in the examples column, where a request sample would be", async () => {
    const harness = await mountReference({ path: '/webhooks/post-accountcreated' })
    await widen(harness, '1600px')
    const { docs, examples } = columnsOf(harness, 'webhooks/post-accountcreated', 'openish-operation')

    expect(examples.getBoundingClientRect().left).toBeGreaterThan(docs.getBoundingClientRect().left)

    /*
     * Asked of the body element itself rather than of the column, because the responses on either
     * side render code blocks and schemas of their own.
     */
    const documented = deepQuery(docs, 'openish-request-body')!.shadowRoot!
    expect(deepQuery(documented, 'openish-schema')).not.toBeNull()
    expect(deepQuery(documented, 'openish-code-block')).toBeNull()

    const shown = deepQuery(examples, 'openish-request-body')!.shadowRoot!
    expect(deepQuery(shown, 'openish-code-block')).not.toBeNull()
    expect(deepQuery(shown, 'openish-schema')).toBeNull()
  })

  it('documents the schema on one side and shows the example on the other, never both', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await widen(harness, '1600px')
    const { docs, examples } = panesOf(harness)

    /*
     * `deepQuery` descends into descendants' shadow roots but not the root's own, so each list is
     * asked about its shadow root rather than about the element.
     */
    const docsResponses = deepQuery(docs, 'openish-response-list')!.shadowRoot!
    expect(deepQuery(docsResponses, 'openish-schema')).not.toBeNull()
    expect(deepQuery(docsResponses, 'openish-code-block')).toBeNull()

    /* The examples pane is the other half: a code block, and no tree to go with it. */
    const exampleResponses = deepQueryAll(examples, 'openish-response-list').at(-1)!.shadowRoot!
    expect(deepQuery(exampleResponses, 'openish-code-block')).not.toBeNull()
    expect(deepQuery(exampleResponses, 'openish-schema')).toBeNull()
  })
})

/**
 * Nothing scrolls the page sideways.
 *
 * `main` carries `overflow-y: auto`, and a box that says that and nothing about x gets `auto` on
 * both - so a single long line anywhere in the document used to put a horizontal scrollbar under the
 * whole page rather than overflowing its own column. What legitimately scrolls sideways - a wide
 * table, a long line of code - wraps its own scroller and is not this.
 */
describe('horizontal overflow', () => {
  /* A schema deep enough to reach the indent cap, with names long enough to have to wrap. */
  const DEEP_SPEC = (() => {
    let schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        aPropertyNameLongEnoughToNeedToWrapInsideANarrowColumn: {
          type: 'string',
          pattern: '^(?:[a-z0-9!#$%&*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$',
        },
      },
    }
    for (let level = 0; level < 10; level += 1) {
      schema = { type: 'object', properties: { nested: schema } }
    }

    return {
      openapi: '3.1.0',
      info: { title: 'Deep', version: '1.0.0' },
      paths: {
        '/deep': {
          post: {
            tags: ['deep'],
            summary: 'Send the deep thing',
            operationId: 'sendDeep',
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Deep' } } } },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: { schemas: { Deep: schema } },
    }
  })()

  /*
   * Measured on the section, not on `main`: `main` clips, so its scrollWidth can never exceed its
   * clientWidth and asserting there would be asserting that hidden means hidden. The section is
   * where the content actually is, and it has no overflow rule of its own - so what it reports is
   * whether anything inside it needed room the column does not have.
   */
  it('stays inside its column at every width', async () => {
    const harness = await mountReference({
      path: '/models/Deep',
      spec: DEEP_SPEC,
      config: { expandAllSchemaProperties: true },
    })

    for (const width of ['380px', '1024px', '1600px']) {
      harness.frame.style.width = width
      await new Promise((resolve) => setTimeout(resolve, 50))
      await harness.settle()

      const section = harness.element.shadowRoot!.querySelector('.section')!
      expect({ width, over: section.scrollWidth - section.clientWidth }).toEqual({ width, over: 0 })
    }
  })
})

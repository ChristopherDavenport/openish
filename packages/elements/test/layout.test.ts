import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, disposeAll, mountReference, shadowOf, textOf, type Harness, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const menuOf = (harness: Harness): HTMLButtonElement | null =>
  harness.element.shadowRoot!.querySelector('.menu')

/** Narrows the frame and lets the media query fire, the way a phone-sized viewport would. */
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
 * The navigation switch is a media query on the element; this one is a container query on the
 * content pane, because the pane's width depends on whether the sidebar is beside it. The two are
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
    /* The column stretches to the row; the thing inside it is what sticks. */
    const pinned = operation.querySelector('.examples .pinned')!
    return { title, docs, examples, pinned }
  }

  const widen = async (harness: Harness, width: string): Promise<void> => {
    harness.frame.style.width = width
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()
  }

  it('sits beside the documentation when the page is wide enough', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await widen(harness, '1600px')
    const { title, docs, examples, pinned } = panesOf(harness)

    /* Side by side: the examples pane starts to the right of where the docs pane starts. */
    expect(examples.getBoundingClientRect().left).toBeGreaterThan(docs.getBoundingClientRect().left)
    expect(harness.frame.contentWindow!.getComputedStyle(pinned).position).toBe('sticky')

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
    expect(harness.frame.contentWindow!.getComputedStyle(panesOf(harness).pinned).position).toBe('static')
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

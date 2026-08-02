import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, disposeAll, mountReference, shadowOf, textOf, type Harness } from './helpers.js'

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
    expect(deepQuery(harness.element.shadowRoot!, 'openish-tag-section')).not.toBeNull()
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
    const operation = shadowOf(harness.element.shadowRoot!, 'openish-operation')
    const intro = operation.querySelector('.intro')!
    const docs = operation.querySelector('[part~="operation-docs"]')!
    const examples = operation.querySelector('[part~="operation-examples"]')!
    return { intro, docs, examples }
  }

  const widen = async (harness: Harness, width: string): Promise<void> => {
    harness.frame.style.width = width
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()
  }

  it('sits beside the documentation when the page is wide enough', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await widen(harness, '1600px')
    const { intro, docs, examples } = panesOf(harness)

    /* Side by side: the examples pane starts to the right of where the docs pane starts. */
    expect(examples.getBoundingClientRect().left).toBeGreaterThan(docs.getBoundingClientRect().left)
    expect(harness.frame.contentWindow!.getComputedStyle(examples).position).toBe('sticky')

    /*
     * The example starts level with the *title*, not with the first documentation section below it.
     * The intro used to span both columns, so a paragraph of prose ran the width of the page and the
     * sample it was describing began a screen further down.
     */
    expect(Math.round(examples.getBoundingClientRect().top)).toBe(Math.round(intro.getBoundingClientRect().top))
    expect(intro.getBoundingClientRect().right).toBeLessThanOrEqual(examples.getBoundingClientRect().left)
  })

  it('stacks under the description when the page is not, with the sample above the tables', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await widen(harness, '820px')
    const { docs, examples } = panesOf(harness)

    /* One column, and the worked example comes first - which is where a reader copying a call looks. */
    expect(Math.round(examples.getBoundingClientRect().left)).toBe(Math.round(docs.getBoundingClientRect().left))
    expect(examples.getBoundingClientRect().top).toBeLessThan(docs.getBoundingClientRect().top)
    expect(harness.frame.contentWindow!.getComputedStyle(examples).position).toBe('static')

    /* Still under the description, though: stacked, the reading order is what it always was. */
    expect(panesOf(harness).intro.getBoundingClientRect().top).toBeLessThan(
      examples.getBoundingClientRect().top,
    )
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

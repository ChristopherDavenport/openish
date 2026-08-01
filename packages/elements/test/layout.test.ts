import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, disposeAll, mountReference, textOf, type Harness } from './helpers.js'

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

describe('the two-column layout', () => {
  it('renders the navigation beside the page, with no disclosure to open', async () => {
    const { element } = await mountReference({ path: '/' })

    expect(element.shadowRoot!.querySelector('openish-sidebar')).not.toBeNull()
    expect(element.shadowRoot!.querySelector('.menu')).toBeNull()
  })
})

describe('the stacked layout', () => {
  it('is what a narrow viewport gets, and it starts closed', async () => {
    const harness = await mountReference({ path: '/' })
    await narrow(harness)

    expect(menuOf(harness)?.getAttribute('aria-expanded')).toBe('false')
    /* Not merely hidden: an invisible tree that is still focusable is the bug this replaced. */
    expect(harness.element.shadowRoot!.querySelector('openish-sidebar')).toBeNull()
  })

  it('is what `layout="classic"` asks for at any width', async () => {
    const { element } = await mountReference({ path: '/', layout: 'classic' })

    expect(element.shadowRoot!.querySelector('.menu')).not.toBeNull()
    expect(textOf(element.shadowRoot!.querySelector('.menu'))).toContain('Navigation')
  })

  it('opens and closes the navigation, and says which it is', async () => {
    const harness = await mountReference({ path: '/', layout: 'classic' })
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
    const harness = await mountReference({ path: '/', layout: 'classic' })
    menuOf(harness)!.click()
    await harness.settle()

    await harness.clickLink('/tags/accounts')

    expect(menuOf(harness)?.getAttribute('aria-expanded')).toBe('false')
    expect(deepQuery(harness.element.shadowRoot!, 'openish-tag-section')).not.toBeNull()
  })

  it('closes on Escape from inside, and hands focus back to the button', async () => {
    const harness = await mountReference({ path: '/', layout: 'classic' })
    const menu = menuOf(harness)!

    menu.click()
    await harness.settle()

    deepQuery<HTMLAnchorElement>(harness.element.shadowRoot!, 'a[href="/tags/accounts"]')!.focus()
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

  it('goes back to two columns when there is room again', async () => {
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

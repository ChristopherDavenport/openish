import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'

import '../src/index.js'
import { deepQuery, disposeAll, mountReference, type Harness } from './helpers.js'

/**
 * Windows High Contrast, and the other forced-colors modes.
 *
 * Not a niche: it is what a reader with low vision or light sensitivity has switched their whole
 * operating system to, and it replaces the page's palette with theirs whether the page agrees or
 * not. What it *drops* is the part worth testing - background images, and every `box-shadow` - which
 * is why the focus ring being a shadow used to mean there was no focus ring here at all. Nothing in
 * this repo covered the mode before, so nothing would have said so.
 *
 * There is no way to ask for the mode from script, so this drives it through CDP, which is the same
 * lever Playwright's `emulateMedia` pulls. It applies to the whole page, so the harness frames
 * inherit it.
 */
const forceColors = async (active: boolean): Promise<void> => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'forced-colors', value: active ? 'active' : 'none' }],
  })
}

const computed = (harness: Harness, element: Element): CSSStyleDeclaration =>
  harness.frame.contentWindow!.getComputedStyle(element)

beforeEach(async () => {
  await forceColors(true)
})

afterEach(async () => {
  await forceColors(false)
  disposeAll()
})

describe('forced colors', () => {
  it('still draws a focus ring, which a shadow would not have', async () => {
    const harness = await mountReference({ path: '/' })
    const body = harness.frame.contentDocument!.body

    body.setAttribute('tabindex', '-1')
    body.focus()
    await userEvent.keyboard('{Tab}')

    let active = harness.frame.contentDocument!.activeElement as HTMLElement | null
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement as HTMLElement
    }
    expect(active).not.toBeNull()

    const ring = computed(harness, active!)
    expect(ring.outlineStyle).not.toBe('none')
    expect(Number.parseFloat(ring.outlineWidth)).toBeGreaterThan(0)
  })

  /*
   * The chip says GET or DELETE in words, so the colour was never the only carrier of the method -
   * but eight flat chips with no edges read as part of the title beside them rather than as a label
   * on it. The border is what keeps it a chip when the fill is gone.
   */
  it('keeps the method chip a chip once its colour is thrown away', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const chip = deepQuery(harness.element.shadowRoot!, '.method')
    expect(chip).not.toBeNull()

    const style = computed(harness, chip!)
    expect(style.borderTopStyle).toBe('solid')
    expect(Number.parseFloat(style.borderTopWidth)).toBeGreaterThan(0)
  })

  it('marks the page the reader is on, which the selected fill no longer can', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    await harness.settle()

    const active = deepQuery(harness.element.shadowRoot!, 'a.link.active')
    expect(active).not.toBeNull()

    expect(Number.parseFloat(computed(harness, active!).borderInlineStartWidth)).toBeGreaterThan(0)
  })
})

import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, disposeAll, mountReference, type Harness, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const computed = (harness: Harness, element: Element): CSSStyleDeclaration =>
  harness.frame.contentWindow!.getComputedStyle(element)

/** What `--openish-border-selected-color` resolves to right now, as the browser paints it. */
const selectedColour = (harness: Harness): string => {
  const probe = harness.frame.contentDocument!.createElement('div')
  harness.frame.contentDocument!.body.append(probe)
  probe.style.color = 'var(--openish-border-selected-color)'
  const value = harness.frame.contentWindow!.getComputedStyle(probe).color.trim()
  probe.remove()
  return value
}

/**
 * Every style rule an element has adopted, flattened, including the ones inside a media query.
 *
 * Needed for the pressed state, which cannot be measured by painting it: `:active` is only entered
 * for a genuine pointer press, and the input channel this suite has puts its coordinates in the
 * orchestrator page's space rather than the tester frame's, so a synthesised press lands nowhere.
 * Reading the rule is the honest second-best - it catches the two ways this actually regresses,
 * which are the rule being dropped and the token being renamed out from under it.
 */
const rulesOf = (element: Element): CSSStyleRule[] => {
  /*
   * Duck-typed rather than `instanceof CSSStyleRule`. These sheets belong to the harness frame, and
   * every DOM constructor in there is a different object from the one in this realm - so the check
   * that reads correctly silently matches nothing.
   */
  const flatten = (rules: CSSRuleList): CSSStyleRule[] =>
    [...rules].flatMap((rule) =>
      'selectorText' in rule
        ? [rule as CSSStyleRule]
        : 'cssRules' in rule
          ? flatten((rule as CSSGroupingRule).cssRules)
          : [],
    )

  return (element.shadowRoot?.adoptedStyleSheets ?? []).flatMap((sheet) => flatten(sheet.cssRules))
}

/**
 * The border a thing wears while it is the selected one.
 *
 * The design system names this concept and openish had no use for it: selection was a fill plus a
 * weight change, which is a few percent of lightness and one of the first things to go on a poor
 * screen or under a colour-vision difference. These are the three places something is genuinely
 * *selected* rather than merely focused - the open tab, the page the sidebar is on, and a control for
 * as long as it is being pressed.
 */
describe('the selected border', () => {
  it('marks the open tab, and reserves the space on the others', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const tabs = deepQuery(sectionOf(harness), 'openish-tabs')
    expect(tabs).not.toBeNull()

    const buttons = [...tabs!.shadowRoot!.querySelectorAll('button[role="tab"]')]
    expect(buttons.length).toBeGreaterThan(1)

    const selected = buttons.find((button) => button.getAttribute('aria-selected') === 'true')!
    const other = buttons.find((button) => button.getAttribute('aria-selected') !== 'true')!

    expect(computed(harness, selected).borderBottomColor).toBe(selectedColour(harness))

    /* Reserved, not added: selecting a tab must not shift the ones beside it. */
    expect(computed(harness, other).borderBottomWidth).toBe(computed(harness, selected).borderBottomWidth)
    expect(computed(harness, other).borderBottomColor).not.toBe(selectedColour(harness))
  })

  it('marks the page the sidebar is on, with an edge and not only a fill', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    await harness.settle()

    const active = deepQuery(harness.element.shadowRoot!, 'a.link.active')
    expect(active).not.toBeNull()

    expect(computed(harness, active!).borderInlineStartColor).toBe(selectedColour(harness))
  })

  it('leaves the rows either side of it unmarked, and unshifted', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    await harness.settle()

    const links = [...harness.element.shadowRoot!.querySelectorAll('*')].length
    expect(links).toBeGreaterThan(0)

    const items = deepQuery(harness.element.shadowRoot!, 'openish-sidebar')!.shadowRoot!.querySelectorAll(
      'openish-sidebar-item',
    )
    const rows = [...items].map((item) => item.shadowRoot!.querySelector('a.link')).filter(Boolean) as Element[]
    const inactive = rows.filter((row) => !row.classList.contains('active'))
    expect(inactive.length).toBeGreaterThan(0)

    const width = computed(harness, rows[0]!).borderInlineStartWidth
    for (const row of inactive) {
      expect(computed(harness, row).borderInlineStartColor).not.toBe(selectedColour(harness))
      /* Every row reserves the same edge, so the labels stay in one column. */
      expect(computed(harness, row).borderInlineStartWidth).toBe(width)
    }
  })

  it('is what a control wears while it is pressed, over and above the tint', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const block = deepQuery(sectionOf(harness), 'openish-code-block')!
    const pressed = rulesOf(block).find((rule) => rule.selectorText.includes(':active'))

    expect(pressed).toBeDefined()
    /* The ring, which is the half that survives a bad screen - and the tint, which is the half that
     * does not. Both, or the press is only a few percent of lightness again. */
    expect(pressed!.style.boxShadow).toContain('currentColor')
    expect(pressed!.style.boxShadow).toContain('--openish-state-active-tint')
    /* Drawn at the width the selected concept sets, so the two stay one idea. */
    expect(pressed!.style.boxShadow).toContain('--openish-border-selected-width')
  })

  /*
   * The reason the ring is `currentColor` rather than the selected colour, asserted as itself.
   *
   * `--openish-color-accent` and `--openish-border-selected-color` are the same blue on purpose - one
   * idea, two names - so a selected-coloured ring inside the primary button, whose fill *is* that
   * blue, was invisible. The one control on a page whose press most needs acknowledging was the one
   * that acknowledged nothing. Any ring drawn from the control's own text colour cannot repeat that,
   * and this is the check that the two are still different on the control that caught it.
   */
  it('draws a ring the primary button can actually show', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const tryIt = deepQuery(sectionOf(harness), 'openish-try-it')!
    const primary = tryIt.shadowRoot!.querySelector('button.run')!
    const style = computed(harness, primary)

    /* The fill is the selected colour, which is exactly why the ring may not be. */
    expect(style.backgroundColor).toBe(selectedColour(harness))
    expect(style.color).not.toBe(style.backgroundColor)
  })

  it('is not painted while the control is merely sitting there', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const block = deepQuery(sectionOf(harness), 'openish-code-block')!
    const copy = deepQuery(block.shadowRoot!, 'button[part="copy"]')!

    expect(computed(harness, copy).boxShadow).not.toContain(computed(harness, copy).color)
  })

  /*
   * A sidebar row is a link because it goes somewhere, and a control because a reader presses it.
   * `controlStyles` reaches real controls only, so the row said nothing at all when pressed - it went
   * straight from hover to being the active page with no acknowledgement in between.
   */
  it('reaches a navigation row, which is an anchor and still a control', async () => {
    const harness = await mountReference({ path: '/' })
    await harness.settle()

    const item = deepQuery(harness.element.shadowRoot!, 'openish-sidebar-item')!
    const row = item.shadowRoot!.querySelector('a.link')!

    expect(row.classList.contains('pressable')).toBe(true)

    const pressed = rulesOf(item).find(
      (rule) => rule.selectorText.includes(':active') && rule.selectorText.includes('pressable'),
    )
    expect(pressed).toBeDefined()
  })
})

import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, disposeAll, mountReference, openTryIt, type Harness, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

/**
 * Where focus actually is, through however many shadow roots it took to get there.
 *
 * `document.activeElement` stops at the outermost shadow host, so on this page it answers
 * `<openish-api-reference>` for every stop in the reference. Descending through `activeElement` on
 * each root is the only way to name the control a reader is on.
 */
const deepActive = (harness: Harness): HTMLElement | undefined => {
  let element = harness.frame.contentDocument!.activeElement as HTMLElement | null
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement as HTMLElement
  }
  return element ?? undefined
}

/** A readable name for a failure message: the tag, plus whatever identifies it in the tree. */
const describeElement = (element: Element): string => {
  const tag = element.tagName.toLowerCase()
  const label =
    element.getAttribute('aria-label') ??
    element.getAttribute('part') ??
    element.className ??
    (element.textContent ?? '').trim().slice(0, 24)
  return label ? `${tag}[${label}]` : tag
}

/**
 * Whether an element is drawing a focus ring right now.
 *
 * The ring is an outline, so this is one question about two properties: is there a style, and does
 * it have width. Before this pass it would have had to ask about `box-shadow` instead, and could
 * not have told a ring apart from a card's elevation - which is a good part of why the sixteen
 * copies were never checked by anything.
 */
const ringOn = (harness: Harness, element: Element): { style: string; width: number } => {
  const computed = harness.frame.contentWindow!.getComputedStyle(element)
  return { style: computed.outlineStyle, width: Number.parseFloat(computed.outlineWidth) || 0 }
}

const hasRing = (harness: Harness, element: Element): boolean => {
  const { style, width } = ringOn(harness, element)
  return style !== 'none' && width > 0
}

/** One stop on the way through: the element, and whether it was drawing a ring while it was on it. */
type Stop = { element: HTMLElement; ringed: boolean }

/**
 * Tabs through the frame, reporting every stop.
 *
 * Focus arrives by a real key press rather than by `.focus()`, because `:focus-visible` is about
 * *how* focus arrived: a ring that only appears for the keyboard is the entire point of the rule, so
 * a test that focused elements programmatically could pass against a stylesheet with no rule in it.
 *
 * Measured at each stop rather than afterwards, for the same reason - the ring exists only while the
 * element has focus, so a list of elements collected first and inspected later reports every one of
 * them as unringed, whatever the stylesheet says.
 *
 * Stops when focus leaves the frame, which is what Tab does at the end of a document.
 */
const tabThrough = async (harness: Harness, limit: number): Promise<Stop[]> => {
  const stops: Stop[] = []
  const body = harness.frame.contentDocument!.body

  body.setAttribute('tabindex', '-1')
  body.focus()

  for (let step = 0; step < limit; step += 1) {
    await userEvent.keyboard('{Tab}')
    const active = deepActive(harness)
    if (!active || active === body || active === harness.frame.contentDocument!.documentElement) {
      break
    }
    if (stops.some((stop) => stop.element === active)) {
      break
    }
    stops.push({ element: active, ringed: hasRing(harness, active) })
  }

  body.removeAttribute('tabindex')
  return stops
}

/** The stops that showed no ring, named readably. */
const unringed = (stops: Stop[]): string[] =>
  stops.filter((stop) => !stop.ringed).map((stop) => describeElement(stop.element))

describe('the focus ring', () => {
  /*
   * The regression test for the whole pass.
   *
   * Sixteen components each drew their own ring, and the way that was found was by reading all
   * sixteen. This walks the page the way a reader does instead, and it fails the moment a control
   * anywhere in the tree stops showing one - including a control added later that nobody thought
   * about, which is the case the sixteen copies never covered.
   */
  it('is on every stop of the overview', async () => {
    const harness = await mountReference({ path: '/' })

    const stops = await tabThrough(harness, 25)
    expect(stops.length).toBeGreaterThan(2)
    expect(unringed(stops)).toEqual([])
  })

  it('is on every stop of an operation, code blocks and tables included', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const stops = await tabThrough(harness, 40)
    expect(stops.length).toBeGreaterThan(4)
    expect(unringed(stops)).toEqual([])
  })

  it('is on every field of the request client, whose inputs fill their cells', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()
    await openTryIt(harness)

    const stops = await tabThrough(harness, 30)
    expect(stops.length).toBeGreaterThan(3)
    expect(unringed(stops)).toEqual([])
  })

  /*
   * The cell case, asserted as itself.
   *
   * A borderless input inside a bordered cell negates the offset rather than turning the ring off,
   * and "rather than turning it off" is the part worth pinning: the previous shape here was
   * `outline: none` plus an inset shadow, which is invisible in forced colors.
   */
  it('goes inside a control that fills its cell, not outside it', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()
    await openTryIt(harness)

    const field = deepQuery<HTMLInputElement>(harness.element.shadowRoot!, '.value input')
    expect(field).not.toBeNull()

    await userEvent.keyboard('{Tab}')
    field!.focus()

    const computed = harness.frame.contentWindow!.getComputedStyle(field!)
    expect(computed.outlineStyle).not.toBe('none')
    expect(Number.parseFloat(computed.outlineOffset)).toBeLessThan(0)
  })
})

describe('the sidebar keyboard cursor', () => {
  /*
   * The tree moves a cursor the DOM's focus never follows, so nothing about the browser's own focus
   * handling draws it. For a long time nothing else did either: arrowing through six hundred rows
   * moved an invisible position. This is that, asserted.
   */
  it('marks the row the arrow keys are on', async () => {
    const harness = await mountReference({ path: '/' })

    const tree = deepQuery<HTMLElement>(harness.element.shadowRoot!, 'lit-virtualizer')
    expect(tree).not.toBeNull()

    tree!.focus()
    await userEvent.keyboard('{ArrowDown}')
    await harness.settle()

    const sidebar = deepQuery(harness.element.shadowRoot!, 'openish-sidebar')!
    const current = sidebar.shadowRoot!.querySelectorAll('[role="treeitem"][data-current]')

    /* Exactly one, or it is not a cursor. */
    expect(current).toHaveLength(1)
    expect(hasRing(harness, current[0]!)).toBe(true)

    /*
     * And gone once the tree is not the thing being driven. Without this the assertion above would
     * also pass against a rule that marked row zero permanently, which is not a cursor either.
     */
    tree!.blur()
    await harness.settle()
    expect(hasRing(harness, current[0]!)).toBe(false)
  })

  it('moves the mark with the cursor, and keeps it distinct from the active route', async () => {
    const harness = await mountReference({ path: '/' })
    const sidebar = deepQuery(harness.element.shadowRoot!, 'openish-sidebar')!
    const tree = sidebar.shadowRoot!.querySelector<HTMLElement>('lit-virtualizer')!

    tree.focus()
    await userEvent.keyboard('{ArrowDown}')
    await harness.settle()
    const first = sidebar.shadowRoot!.querySelector('[role="treeitem"][data-current]')!.id

    await userEvent.keyboard('{ArrowDown}')
    await harness.settle()
    const second = sidebar.shadowRoot!.querySelector('[role="treeitem"][data-current]')!.id

    expect(second).not.toBe(first)
    /* The cursor is what the tree points assistive technology at, so the two cannot drift apart. */
    expect(tree.getAttribute('aria-activedescendant')).toBe(second)
  })
})

describe('the search dialog', () => {
  /*
   * A combobox has one tab stop. The result list is navigated with the arrow keys and pointed at
   * with `aria-activedescendant`, so an option that is also in the tab order is a second way to
   * reach the same thing - and the one Tab lands on is not the one the arrow keys highlighted.
   */
  it('keeps the result list out of the tab order', async () => {
    const harness = await mountReference({ path: '/' })
    const search = deepQuery<HTMLElement & { open: boolean }>(harness.element.shadowRoot!, 'openish-search')!

    search.shadowRoot!.querySelector<HTMLElement>('.trigger')!.focus()
    await userEvent.keyboard('/')
    await harness.settle()
    await userEvent.keyboard('account')
    await harness.settle()

    const options = search.shadowRoot!.querySelectorAll('[role="option"]')
    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(option.getAttribute('tabindex')).toBe('-1')
    }

    await userEvent.keyboard('{Tab}')
    const active = deepActive(harness)
    expect(active?.getAttribute('role')).not.toBe('option')
  })

  it('rings the highlighted result as well as filling it', async () => {
    const harness = await mountReference({ path: '/' })
    const search = deepQuery<HTMLElement>(harness.element.shadowRoot!, 'openish-search')!

    search.shadowRoot!.querySelector<HTMLElement>('.trigger')!.focus()
    await userEvent.keyboard('/')
    await harness.settle()
    await userEvent.keyboard('account')
    await harness.settle()

    const selected = search.shadowRoot!.querySelector('[role="option"][aria-selected="true"]')!
    expect(selected).not.toBeNull()
    expect(hasRing(harness, selected)).toBe(true)
  })

  /*
   * The field is the top of the dialog, edge to edge, so an outset ring lands on the dialog's own
   * border with half of it outside the rounded corner. It was drawn and could not be seen, which no
   * test caught because the tab-walks above never open the dialog - the ring has to be measured
   * where it is, not only where it is declared.
   */
  it('rings the field, inside the dialog rather than on its edge', async () => {
    const harness = await mountReference({ path: '/' })
    const search = deepQuery<HTMLElement>(harness.element.shadowRoot!, 'openish-search')!

    search.shadowRoot!.querySelector<HTMLElement>('.trigger')!.focus()
    await userEvent.keyboard('/')
    await harness.settle()

    const input = search.shadowRoot!.querySelector('input')!
    expect(hasRing(harness, input)).toBe(true)

    const offset = Number.parseFloat(harness.frame.contentWindow!.getComputedStyle(input).outlineOffset)
    expect(offset).toBeLessThan(0)
  })

  it('says which key opens it, rather than assuming the default', async () => {
    const harness = await mountReference({ path: '/', config: { searchHotKey: 's' } })
    const search = deepQuery<HTMLElement>(harness.element.shadowRoot!, 'openish-search')!

    expect(search.shadowRoot!.querySelector('kbd')?.textContent?.trim()).toBe('s')
  })
})

describe('the six control states', () => {
  it('leaves a disabled control quiet and not a target', async () => {
    const harness = await mountReference({
      path: '/',
      config: { documentDownloadType: 'both' },
    })

    const download = deepQuery(sectionOf(harness), 'openish-download')!
    const button = download.shadowRoot!.querySelector('button')!
    const enabled = harness.frame.contentWindow!.getComputedStyle(button)
    const enabledColour = enabled.color

    button.disabled = true
    const disabled = harness.frame.contentWindow!.getComputedStyle(button)

    expect(disabled.cursor).toBe('default')
    expect(disabled.color).not.toBe(enabledColour)
  })

  it('gives every control at least the minimum target size', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const stops = await tabThrough(harness, 40)
    const controls = stops
      .map((stop) => stop.element)
      .filter((element) => ['BUTTON', 'SELECT'].includes(element.tagName))
    expect(controls.length).toBeGreaterThan(0)

    const small = controls
      .filter((control) => {
        const box = control.getBoundingClientRect()
        /* 24px, the floor `--openish-target-min` names, less a pixel for subpixel rounding. */
        return box.height < 23 || box.width < 23
      })
      .map(describeElement)

    expect(small).toEqual([])
  })
})

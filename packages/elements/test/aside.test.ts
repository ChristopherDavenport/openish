import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  deepQuery,
  deepQueryAll,
  deepTextOf,
  disposeAll,
  mountReference,
  sectionOf,
  shadowOf,
  textOf,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

const overviewOf = (harness: Harness) => shadowOf(sectionOf(harness, ''), 'openish-overview')

const asideIn = (root: Element | ShadowRoot): Element | null => root.querySelector('[part~="aside"]')

const widen = async (harness: Harness, width: string): Promise<void> => {
  harness.frame.style.width = width
  await new Promise((resolve) => setTimeout(resolve, 50))
  await harness.settle()
}

/**
 * The examples column on a section that generates nothing for it.
 *
 * An operation fills that column from its own request and responses. The introduction and a tag
 * have neither, which is exactly why their authors have the most to say there - so there are three
 * ways to fill it: what the document declares, what the host slots in, and what openish already
 * knows and used to stack under the prose.
 */
describe('the introduction, in two columns', () => {
  it('puts what a reader acts on beside the prose rather than under it', async () => {
    const harness = await mountReference({ path: '/' })
    await widen(harness, '1600px')
    const overview = overviewOf(harness)
    const docs = overview.querySelector('[part~="overview-docs"]')!
    const facts = overview.querySelector('[part~="overview-aside"]')!

    expect(facts.getBoundingClientRect().left).toBeGreaterThan(docs.getBoundingClientRect().left)
    expect(Math.round(facts.getBoundingClientRect().top)).toBe(Math.round(docs.getBoundingClientRect().top))

    /* Servers and authentication are what moved: they are facts about calling, not about the API. */
    expect(deepTextOf(facts)).toContain('Servers')
    expect(deepTextOf(facts)).toContain('Authentication')
    expect(deepTextOf(docs)).toContain('Getting started')
  })

  it('stacks the whole of the right column under the left when there is no room', async () => {
    const harness = await mountReference({ path: '/' })
    await widen(harness, '820px')
    const overview = overviewOf(harness)
    const docs = overview.querySelector('[part~="overview-docs"]')!
    const facts = overview.querySelector('[part~="overview-aside"]')!

    expect(Math.round(facts.getBoundingClientRect().left)).toBe(Math.round(docs.getBoundingClientRect().left))
    expect(docs.getBoundingClientRect().bottom).toBeLessThanOrEqual(facts.getBoundingClientRect().top + 1)
  })
})

describe('what an author writes for the column', () => {
  it('renders the aside prose on the introduction, as markdown', async () => {
    const harness = await mountReference({ path: '/' })
    const aside = asideIn(overviewOf(harness))!

    expect(deepTextOf(aside)).toContain('Every call needs an institution id')

    /*
     * Markdown, and demoted: the author's `###` lands under the section's own title rather than
     * outranking it, which is the rule `info.description` follows two columns to the left.
     */
    expect(deepQuery(aside, 'h4')).not.toBeNull()
    expect(deepQuery(aside, 'h3')).toBeNull()
  })

  it('renders a curated sample from info, highlighted and copyable', async () => {
    const harness = await mountReference({ path: '/' })
    /* The highlight pipeline is lazy, so the block arrives a beat after the section does. */
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()
    const aside = asideIn(overviewOf(harness))!
    const block = deepQuery(aside, 'openish-code-block')!

    /* Asked of the block's own shadow root: `deepTextOf` descends into descendants', not its own. */
    expect(deepTextOf(block.shadowRoot!)).toContain('curl -X POST /token')
    expect(deepQuery(block.shadowRoot!, 'openish-copy-button')).not.toBeNull()
  })

  it('offers a tab per language when a tag declares several, and no tab set when it declares one', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    const aside = asideIn(shadowOf(sectionOf(harness, 'tags/accounts'), 'openish-tag-section'))!
    const tabs = deepQuery(aside, 'openish-tabs')!

    expect([...tabs.shadowRoot!.querySelectorAll('button[role="tab"]')].map((tab) => textOf(tab))).toEqual([
      'Shell',
      'JavaScript',
    ])

    /* The introduction declares one sample, so it gets the block on its own. */
    expect(deepQuery(asideIn(overviewOf(harness))!, 'openish-tabs')).toBeNull()
  })

  it('puts a tag aside above the index, which is the way down from it', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    const section = shadowOf(sectionOf(harness, 'tags/accounts'), 'openish-tag-section')
    const aside = asideIn(section)!
    const index = deepQuery(section, 'openish-section-index')!

    expect(deepTextOf(aside)).toContain('Balances are in minor units')
    expect(aside.getBoundingClientRect().bottom).toBeLessThanOrEqual(index.getBoundingClientRect().top + 1)
  })

  it('renders nothing at all for a section whose author wrote none', async () => {
    const harness = await mountReference({ path: '/tags/administration' })
    const section = shadowOf(sectionOf(harness, 'tags/administration'), 'openish-tag-section')

    expect(asideIn(section)).toBeNull()
  })

  it('travels with Copy for LLM, because it is the document talking', async () => {
    const harness = await mountReference({ path: '/' })
    /* Read off the source the button would call, the way `copy-markdown.test.ts` reads it. */
    const control = deepQuery(sectionOf(harness), 'openish-copy-markdown')!
    const button = control.shadowRoot!.querySelector('openish-copy-button') as Element & { source?: () => string }
    const markdown = button.source!()

    expect(markdown).toContain('Before you start')
    expect(markdown).toContain('curl -X POST /token')
  })
})

describe('what a host slots in', () => {
  it('lands in the introduction column, above what the document says', async () => {
    const harness = await mountReference({ path: '/' })
    const host = harness.element.ownerDocument.createElement('div')
    host.setAttribute('slot', 'overview-aside')
    host.id = 'host-aside'
    host.textContent = 'Sandbox keys are self-serve.'
    harness.element.append(host)
    await harness.settle()

    /* Assigned, not merely present: a light-DOM child that no slot took would render nowhere. */
    expect(host.assignedSlot).not.toBeNull()

    const facts = overviewOf(harness).querySelector('[part~="overview-aside"]')!
    expect(facts.getBoundingClientRect().top).toBeLessThanOrEqual(host.getBoundingClientRect().top)
    expect(host.getBoundingClientRect().height).toBeGreaterThan(0)
  })

  it('is one slot on the plane, because there is one introduction to fill', async () => {
    const harness = await mountReference({ path: '/' })

    expect(deepQueryAll(harness.element.shadowRoot!, 'slot[name="overview-aside"]')).toHaveLength(1)
  })
})

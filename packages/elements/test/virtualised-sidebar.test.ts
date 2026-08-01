import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, disposeAll, mountReference, type Harness } from './helpers.js'

afterEach(() => {
  disposeAll()
})

/** A document with more models than any sidebar should ever put in the DOM at once. */
const manyModels = (count: number) => ({
  openapi: '3.1.0',
  info: { title: 'Wide', version: '1.0.0' },
  paths: {
    '/things': {
      get: { summary: 'List things', operationId: 'listThings', tags: ['things'], responses: { '200': { description: 'OK' } } },
    },
  },
  components: {
    schemas: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `Model${String(index).padStart(4, '0')}`,
        { type: 'object', properties: { id: { type: 'string' } } },
      ]),
    ),
  },
})

const wide = async (count = 600): Promise<Harness> => {
  const harness = await mountReference({ path: '/models', spec: manyModels(count) })
  await harness.settle()
  return harness
}

const rows = (harness: Harness) => deepQueryAll(harness.element.shadowRoot!, 'openish-sidebar-item')

describe('the virtualised sidebar', () => {
  it('renders a window, not the whole list', async () => {
    const harness = await wide(600)

    /*
     * The Models group is open, because the active route is inside it. Before virtualisation that
     * meant 600 rows in the DOM; the number now depends on the viewport, and the only assertion
     * worth making is that it is bounded well below the document's size.
     */
    expect(rows(harness).length).toBeGreaterThan(0)
    expect(rows(harness).length).toBeLessThan(100)
  })

  it('reports the full size to assistive technology, not the rendered window', async () => {
    const harness = await wide(600)
    /* A model row, not a root row: the roots are two, and the 600 are its siblings. */
    const model = deepQueryAll<HTMLElement>(harness.element.shadowRoot!, '[role="treeitem"][aria-level="2"]')[0]!

    /* A reader hearing "1 of 12" for a list of 600 would be told something false. */
    expect(Number(model.getAttribute('aria-setsize'))).toBe(600)
  })

  it('marks depth with aria-level, since the nesting is no longer in the markup', async () => {
    const harness = await wide(20)
    const levels = deepQueryAll<HTMLElement>(harness.element.shadowRoot!, '[role="treeitem"]').map((el) =>
      el.getAttribute('aria-level'),
    )

    expect(levels).toContain('1')
    expect(levels).toContain('2')
  })

  it('collapses a group back to a single row', async () => {
    const harness = await wide(600)
    const before = rows(harness).length

    const toggle = deepQueryAll<HTMLButtonElement>(harness.element.shadowRoot!, 'button.toggle').find(
      (button) => button.getAttribute('aria-label') === 'Collapse Models',
    )!
    toggle.click()
    await harness.settle()

    expect(rows(harness).length).toBeLessThan(before)
  })

  it('is one tab stop with arrow keys inside, not several hundred', async () => {
    const harness = await wide(600)
    const tree = deepQuery<HTMLElement>(harness.element.shadowRoot!, '[role="tree"]')!

    expect(tree.getAttribute('tabindex')).toBe('0')
    expect(deepQueryAll<HTMLAnchorElement>(harness.element.shadowRoot!, 'a[tabindex="-1"]').length).toBeGreaterThan(0)
  })

  it('moves the active row with ArrowDown', async () => {
    const harness = await wide(20)
    const tree = deepQuery<HTMLElement>(harness.element.shadowRoot!, '[role="tree"]')!

    expect(tree.getAttribute('aria-activedescendant')).toBe('row-0')

    tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }))
    await harness.settle()

    expect(tree.getAttribute('aria-activedescendant')).toBe('row-1')
  })

  it('opens a closed branch with ArrowRight', async () => {
    const harness = await wide(20)
    const tree = deepQuery<HTMLElement>(harness.element.shadowRoot!, '[role="tree"]')!
    const before = rows(harness).length

    /*
     * Row 0 is the `things` tag. The route is inside Models, so `things` is closed - which makes it
     * the row worth pressing ArrowRight on.
     */
    tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }))
    await harness.settle()

    expect(rows(harness).length).toBeGreaterThan(before)
  })

  it('closes an open branch with ArrowLeft', async () => {
    const harness = await wide(20)
    const tree = deepQuery<HTMLElement>(harness.element.shadowRoot!, '[role="tree"]')!

    const press = async (key: string) => {
      tree.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }))
      await harness.settle()
    }

    /* Step down past the tag and its operation to Models, which is open because the route is in it. */
    while (tree.getAttribute('aria-activedescendant') !== 'row-1') {
      await press('ArrowDown')
    }
    const before = rows(harness).length
    await press('ArrowLeft')

    expect(rows(harness).length).toBeLessThan(before)
  })
})

describe('row width', () => {
  /**
   * The virtualiser positions rows absolutely, and an absolutely positioned block with no width is
   * shrink-to-fit - so without a width of their own, rows are as wide as their own text. Nothing
   * functional breaks, which is why this went unnoticed: the highlight on the active row just ends
   * wherever its title does, and a long title overflows the sidebar instead of ellipsising.
   */
  const linkOf = (item: Element) => item.shadowRoot!.querySelector('a.link') as HTMLAnchorElement

  it('gives every row the full width of the list, so highlights line up', async () => {
    const harness = await wide(20)
    const list = deepQuery(harness.element.shadowRoot!, 'lit-virtualizer')!
    const right = Math.round(list.getBoundingClientRect().right)

    const edges = rows(harness).map((item) => Math.round(linkOf(item).getBoundingClientRect().right))

    expect(edges.length).toBeGreaterThan(1)
    /* One right edge for the whole list: the highlight box ends in the same place on every row. */
    expect(new Set(edges).size).toBe(1)
    expect(edges[0]).toBeLessThanOrEqual(right)
  })

  it('keeps a title longer than the sidebar inside it', async () => {
    const harness = await mountReference({
      path: '/models',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Long', version: '1.0.0' },
        components: {
          schemas: {
            AVeryLongSchemaNameThatCannotPossiblyFitInsideTheSidebarColumnAtAnyReasonableWidth: {
              type: 'object',
            },
          },
        },
      },
    })
    await harness.settle()

    const list = deepQuery(harness.element.shadowRoot!, 'lit-virtualizer')!
    const item = rows(harness).find((row) => row.shadowRoot!.querySelector('.label')?.textContent?.includes('AVeryLong'))

    expect(item).toBeDefined()
    expect(Math.round(linkOf(item!).getBoundingClientRect().right)).toBeLessThanOrEqual(
      Math.round(list.getBoundingClientRect().right),
    )
  })
})

import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, disposeAll, mountReference, textOf, type Harness } from './helpers.js'

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
    /* A model row, not a root row: the roots are three, and the 600 are its siblings. */
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
     * Row 0 is the Introduction, which this document gives nothing to put under. Row 1 is the
     * `things` tag: the route is inside Models, so `things` is closed - which makes it the row worth
     * pressing ArrowRight on.
     */
    tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }))
    await harness.settle()
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

    /* Step down past the Introduction and the tag to Models, which is open because the route is in it. */
    while (tree.getAttribute('aria-activedescendant') !== 'row-2') {
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

/**
 * The document's front page, as a row.
 *
 * The overview is not a node - it is `info`, which the traversal has nothing to mint an entry from -
 * so this row is synthesised in the sidebar. Its headings used to be roots of the tree with nothing
 * saying what they were headings of, which read worst on a document whose introduction documents
 * authentication and which also has a tag called Authentication.
 */
describe('the Introduction row', () => {
  const introSpec = {
    openapi: '3.1.0',
    info: {
      title: 'Chronicle',
      version: '1.0.0',
      description: '## Resources\n\nProse.',
    },
    servers: [{ url: 'https://api.example.com' }],
    tags: [{ name: 'Authentication' }],
    paths: {
      '/tokens': {
        get: {
          summary: 'List tokens',
          operationId: 'listTokens',
          tags: ['Authentication'],
          responses: { '200': { description: 'OK' } },
        },
      },
    },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
  }

  const labelsAt = (harness: Harness, level: string): string[] =>
    deepQueryAll<HTMLElement>(harness.element.shadowRoot!, `[role="treeitem"][aria-level="${level}"]`).map((row) =>
      textOf(row.querySelector('openish-sidebar-item')?.shadowRoot?.querySelector('.label') ?? null),
    )

  it('is the first row, named after the document, with the overview headings under it', async () => {
    const harness = await mountReference({ path: '/', spec: introSpec })
    await harness.settle()

    /* The tag is shut, so the second level is the introduction's - the same name, a different row. */
    expect(labelsAt(harness, '1')).toEqual(['Chronicle', 'Authentication'])
    expect(labelsAt(harness, '2')).toEqual(['Resources', 'Servers', 'Authentication'])
  })

  it('links to the front of the document, not to a page of its own', async () => {
    const harness = await mountReference({ path: '/', spec: introSpec })
    await harness.settle()

    const first = deepQueryAll<HTMLAnchorElement>(harness.element.shadowRoot!, 'openish-sidebar-item')[0]!
    expect(first.shadowRoot!.querySelector('a')?.getAttribute('href')).toBe('#/')
  })

  it('stays open when the reader navigates away, since its headings were roots before it existed', async () => {
    const harness = await mountReference({ path: '/tags/authentication/listTokens', spec: introSpec })
    await harness.settle()

    expect(labelsAt(harness, '2')).toContain('Servers')
  })
})

/**
 * The row for the page the reader is on, kept in view.
 *
 * This never had to happen before: a navigation was a click on a row that was on screen by
 * definition, or a page load, where the tree started at the top. On a plane the reader scrolls the
 * document and the active row moves down a virtualised list on its own.
 */
describe('following the reader', () => {
  const labels = (harness: Harness): string[] =>
    rows(harness).map((item) => textOf(item.shadowRoot!.querySelector('.label')))

  it('brings the current row into the rendered window when the page moves to it', async () => {
    const harness = await wide(600)

    /* Far enough down six hundred models that it cannot be in the first window of rows. */
    expect(labels(harness)).not.toContain('Model0400')

    await harness.goto('/models/Model0400')

    expect(labels(harness)).toContain('Model0400')
  })

  it('leaves the keyboard cursor where the reader put it', async () => {
    const harness = await wide(600)
    const tree = deepQuery<HTMLElement>(harness.element.shadowRoot!, '[role="tree"]')!

    const before = tree.getAttribute('aria-activedescendant')
    await harness.goto('/models/Model0400')

    /*
     * Where the arrows are and which page is open are two different facts, drawn differently since
     * M16. Moving one because the other moved would take a reader's place in the list away from them.
     */
    expect(tree.getAttribute('aria-activedescendant')).toBe(before)
  })
})

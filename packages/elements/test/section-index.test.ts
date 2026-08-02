import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  deepQuery,
  deepQueryAll,
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

/** The tab buttons of a section's index. */
const tabsOf = (harness: Harness, id: string): HTMLButtonElement[] => {
  const index = shadowOf(sectionOf(harness, id), 'openish-section-index')
  const tabs = deepQuery(index, 'openish-tabs')
  return tabs?.shadowRoot ? [...tabs.shadowRoot.querySelectorAll<HTMLButtonElement>('button[role="tab"]')] : []
}

/** The rows showing under whichever tab is selected. */
const rowsOf = (harness: Harness, id: string): HTMLAnchorElement[] => {
  const index = shadowOf(sectionOf(harness, id), 'openish-section-index')
  const list = deepQuery(index, 'openish-section-list')
  return list?.shadowRoot ? [...list.shadowRoot.querySelectorAll<HTMLAnchorElement>('a.item')] : []
}

const pickTab = async (harness: Harness, id: string, label: string): Promise<void> => {
  const tab = tabsOf(harness, id).find((one) => textOf(one).startsWith(label))
  if (!tab) {
    throw new Error(`No "${label}" tab on ${id}. Found: ${tabsOf(harness, id).map((one) => textOf(one)).join(', ')}`)
  }
  tab.click()
  await harness.settle()
}

/**
 * The index a section carries: what is inside it, as links, beside the prose.
 *
 * Three sources and one list. A tag's operations are its children; its events and its models are
 * elsewhere in the document and point back at it, which is the whole reason the tabs exist.
 */
describe('the section index', () => {
  it('lists the operations of a tag, with the method and the route', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    const rows = rowsOf(harness, 'tags/accounts')

    expect(rows.map((row) => textOf(row))).toEqual([
      'get List accounts /accounts',
      'post Create an account /accounts',
      'get Get an account /accounts/{accountId}',
      'put Replace an account /accounts/{accountId}',
    ])

    /* The chip is the coloured one the sidebar and the operation header use, not a word in the row. */
    expect(rows[0]?.querySelector('.method')?.getAttribute('data-method')).toBe('get')
  })

  it('links each row at the section that thing has of its own', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })

    expect(rowsOf(harness, 'tags/accounts')[0]?.getAttribute('href')).toBe(
      harness.hrefFor('/tags/accounts/listAccounts'),
    )
  })

  it('takes the reader there when a row is clicked', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })

    rowsOf(harness, 'tags/accounts')[2]!.click()
    await harness.settle()

    expect(harness.currentId()).toBe('tags/accounts/getAccount')
  })

  it('marks the row the reader is on, the way the sidebar marks its own', async () => {
    /*
     * Mounted at the operation rather than clicked to it: the plane renders a range, and by the time
     * a click has scrolled the reader down to an operation the tag's header may be behind them and
     * out of the range. The state being asserted is the same either way - which row is current.
     */
    const harness = await mountReference({ path: '/tags/accounts/listAccounts' })
    const active = rowsOf(harness, 'tags/accounts').filter((row) => row.classList.contains('active'))

    expect(active.map((row) => textOf(row))).toEqual(['get List accounts /accounts'])
    expect(active[0]?.getAttribute('aria-current')).toBe('page')
  })

  it('offers the events and models that name the tag, and nothing it has none of', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })

    expect(tabsOf(harness, 'tags/accounts').map((tab) => textOf(tab))).toEqual([
      'Operations 4',
      'Events 1',
      'Models 1',
    ])
  })

  it('lists a webhook that declares the tag, linking to its own section under Webhooks', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    await pickTab(harness, 'tags/accounts', 'Events')
    const rows = rowsOf(harness, 'tags/accounts')

    /* The webhook's own summary, and its key in `webhooks` as the route - that is what arrives. */
    expect(rows.map((row) => textOf(row))).toEqual(['post An account was created accountCreated'])
    expect(rows[0]?.getAttribute('href')).toBe(harness.hrefFor('/webhooks/post-accountcreated'))
  })

  it('lists a model that carries x-tags, linking to its own section under Models', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    await pickTab(harness, 'tags/accounts', 'Models')
    const rows = rowsOf(harness, 'tags/accounts')

    expect(rows.map((row) => textOf(row))).toEqual(['Account'])
    expect(rows[0]?.getAttribute('href')).toBe(harness.hrefFor('/models/Account'))
  })

  it('shows one tab for a tag nothing else names', async () => {
    const harness = await mountReference({ path: '/tags/administration' })

    expect(tabsOf(harness, 'tags/administration').map((tab) => textOf(tab))).toEqual(['Operations 1'])
  })

  it('strikes through an operation the document deprecated', async () => {
    const harness = await mountReference({ path: '/tags/administration' })
    const row = rowsOf(harness, 'tags/administration')[0]

    expect(row?.querySelector('.primary')?.classList.contains('deprecated')).toBe(true)
  })

  it('indexes the containers too, each with the kind of thing it holds', async () => {
    const harness = await mountReference({ path: '/webhooks' })

    expect(tabsOf(harness, 'webhooks').map((tab) => textOf(tab))).toEqual(['Events 1'])
    expect(tabsOf(harness, 'models').map((tab) => textOf(tab))).toEqual(['Models 2'])
  })

  /*
   * The reason there is a cap at all: the Models dictionary of a real document is six hundred rows,
   * and a section that tall is the wall between the reader and the first model that M17 removed.
   */
  it('bounds the list and scrolls it inside itself rather than growing the section', async () => {
    const harness = await mountReference({ path: '/models' })
    const list = deepQuery(shadowOf(sectionOf(harness, 'models'), 'openish-section-index'), 'openish-section-list')!
    const style = harness.frame.contentWindow!.getComputedStyle(list)

    expect(style.overflowY).toBe('auto')
    expect(list.getBoundingClientRect().height).toBeLessThanOrEqual(harness.element.getBoundingClientRect().height)
  })

  it('indexes an x-tagGroups heading with the tags under it, and how much is in each', async () => {
    /*
     * The one section whose contents are other sections. Without this the heading a document made
     * out of nothing but other headings would be the only one with no way down from it.
     */
    const harness = await mountReference({
      path: '/tags/money',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Grouped', version: '1.0.0' },
        'x-tagGroups': [{ name: 'Money', tags: ['payments'] }],
        tags: [{ name: 'payments' }],
        paths: {
          '/payments': {
            get: { summary: 'List payments', tags: ['payments'], responses: { '200': { description: 'OK' } } },
          },
        },
      },
    })

    expect(tabsOf(harness, 'tags/money').map((tab) => textOf(tab))).toEqual(['Tags 1'])
    expect(rowsOf(harness, 'tags/money').map((row) => textOf(row))).toEqual(['payments 1'])
  })

  it('is one list per section, not one per document', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })

    /* Every header section renders its own, and none of them renders another section's. */
    expect(deepQueryAll(sectionOf(harness, 'tags/accounts'), 'openish-section-index')).toHaveLength(1)
  })
})

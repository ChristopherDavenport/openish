import { userEvent } from 'vitest/browser'
import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import type { OpenishSearch } from '../src/elements/openish-search.js'
import { deepQuery, disposeAll, mountReference, textOf, type Harness } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const searchIn = (harness: Harness): OpenishSearch => {
  const element = deepQuery<OpenishSearch>(harness.element.shadowRoot!, 'openish-search')
  if (!element?.shadowRoot) {
    throw new Error('No search element on the page.')
  }
  return element
}

const dialogOf = (search: OpenishSearch): HTMLDialogElement =>
  search.shadowRoot!.querySelector('dialog') as HTMLDialogElement

const optionsOf = (search: OpenishSearch): HTMLAnchorElement[] => [
  ...search.shadowRoot!.querySelectorAll<HTMLAnchorElement>('a[role="option"]'),
]

/** Opens the dialog and types, the way a reader does - real key events, not a property assignment. */
const searchFor = async (harness: Harness, query: string): Promise<OpenishSearch> => {
  const search = searchIn(harness)
  search.shadowRoot!.querySelector<HTMLElement>('.trigger')!.focus()
  await userEvent.keyboard('/')
  await harness.settle()
  await userEvent.keyboard(query)
  await harness.settle()
  return search
}

describe('search', () => {
  it('finds an operation by its operationId', async () => {
    const harness = await mountReference({ path: '/' })
    const search = await searchFor(harness, 'listAccounts')

    const [first] = optionsOf(search)
    expect(textOf(first!)).toContain('List accounts')
    expect(first!.getAttribute('href')).toBe('/tags/accounts/listAccounts')
  })

  it('finds an operation by its path, its title, and its tag', async () => {
    const harness = await mountReference({ path: '/' })

    const byPath = await searchFor(harness, '/admin/purge')
    expect(textOf(optionsOf(byPath)[0]!)).toContain('Purge everything')

    byPath.open = false
    const byTitle = await searchFor(harness, 'replace account')
    expect(textOf(optionsOf(byTitle)[0]!)).toContain('Replace an account')
  })

  it('narrows on every term rather than widening', async () => {
    const harness = await mountReference({ path: '/' })

    const one = await searchFor(harness, 'account')
    const many = optionsOf(one).length
    one.open = false

    const two = await searchFor(harness, 'account replace')
    expect(optionsOf(two).length).toBeLessThan(many)
    expect(textOf(optionsOf(two)[0]!)).toContain('Replace an account')
  })

  it('says so when nothing matches', async () => {
    const harness = await mountReference({ path: '/' })
    const search = await searchFor(harness, 'zzzz')

    expect(optionsOf(search)).toHaveLength(0)
    expect(textOf(search.shadowRoot!.querySelector('.empty'))).toContain('zzzz')
  })

  it('moves through results with the arrow keys, keeping focus in the field', async () => {
    const harness = await mountReference({ path: '/' })
    const search = await searchFor(harness, 'account')
    const input = search.shadowRoot!.querySelector('input')!

    expect(optionsOf(search)[0]!.getAttribute('aria-selected')).toBe('true')

    await userEvent.keyboard('{ArrowDown}')
    await harness.settle()

    expect(optionsOf(search)[1]!.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe('result-1')
    /* A combobox keeps focus on the field; the active option is announced, not focused. */
    expect(search.shadowRoot!.activeElement).toBe(input)

    await userEvent.keyboard('{ArrowUp}')
    await harness.settle()
    expect(optionsOf(search)[0]!.getAttribute('aria-selected')).toBe('true')
  })

  it('navigates to the active result on Enter, and closes', async () => {
    const harness = await mountReference({ path: '/' })
    const search = await searchFor(harness, 'listAccounts')

    await userEvent.keyboard('{Enter}')
    await harness.settle()

    expect(harness.window.location.pathname).toBe('/tags/accounts/listAccounts')
    expect(dialogOf(search).open).toBe(false)
    expect(deepQuery(harness.element.shadowRoot!, 'openish-operation')).not.toBeNull()
  })

  it('closes on Escape and hands focus back to whatever opened it', async () => {
    const harness = await mountReference({ path: '/' })
    const search = searchIn(harness)
    const trigger = search.shadowRoot!.querySelector<HTMLElement>('.trigger')!

    trigger.focus()
    await userEvent.keyboard('/')
    await harness.settle()
    expect(dialogOf(search).open).toBe(true)
    expect(search.shadowRoot!.activeElement).toBe(search.shadowRoot!.querySelector('input'))

    await userEvent.keyboard('{Escape}')
    await harness.settle()

    expect(dialogOf(search).open).toBe(false)
    expect(search.shadowRoot!.activeElement).toBe(trigger)
  })

  it('opens on Cmd/Ctrl-K as well', async () => {
    const harness = await mountReference({ path: '/' })
    const search = searchIn(harness)
    search.shadowRoot!.querySelector<HTMLElement>('.trigger')!.focus()

    await userEvent.keyboard('{Control>}k{/Control}')
    await harness.settle()

    expect(dialogOf(search).open).toBe(true)
  })

  it('leaves a slash alone when the reader is typing into something', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    const select = deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select')!
    select.focus()
    await userEvent.keyboard('/')
    await harness.settle()

    expect(dialogOf(searchIn(harness)).open).toBe(false)
  })

  it('reopens after a close, even though the close event arrives late', async () => {
    const harness = await mountReference({ path: '/' })
    const search = await searchFor(harness, 'account')

    /* `close` is fired from a queued task; reopening before it lands must not be undone by it. */
    search.open = false
    const reopened = await searchFor(harness, 'purge')

    expect(dialogOf(reopened).open).toBe(true)
    expect(textOf(optionsOf(reopened)[0]!)).toContain('Purge everything')
  })

  it('is absent when the host turns it off', async () => {
    const harness = await mountReference({ path: '/', config: { hideSearch: true } })

    expect(deepQuery(harness.element.shadowRoot!, 'openish-search')).toBeNull()
  })
})

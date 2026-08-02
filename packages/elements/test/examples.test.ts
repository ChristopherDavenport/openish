import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { EXAMPLES_SPEC } from './fixtures.js'
import { deepQuery, deepTextOf, disposeAll, mountReference, shadowOf, textOf, type Harness, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

/**
 * The response preview in the examples pane.
 *
 * Not simply the first one on the page: the documentation pane renders the same media types with
 * `no-example`, so the picker lives in the examples column beside it and that is the one under test.
 */
const previewOf = async (id: string): Promise<{ harness: Harness; preview: Element }> => {
  const harness = await mountReference({ path: `/tags/accounts/${id}`, spec: EXAMPLES_SPEC })
  const operation = shadowOf(sectionOf(harness), 'openish-operation')
  const pane = operation.querySelector('[part~="operation-examples"]')
  const preview = pane ? deepQuery(pane, 'openish-schema-preview') : null
  if (!preview) {
    throw new Error(`No schema preview in the examples pane of the ${id} page.`)
  }
  return { harness, preview }
}

const picker = (preview: Element): HTMLSelectElement | null =>
  preview.shadowRoot!.querySelector<HTMLSelectElement>('select')

describe('named examples', () => {
  it('offers every one the author wrote, labelled by its summary', async () => {
    const { preview } = await previewOf('listAccounts')
    const select = picker(preview)

    expect(select).not.toBeNull()
    expect([...select!.options].map((option) => textOf(option))).toEqual([
      'A settled account',
      'An overdrawn account',
      'A year of them',
    ])
  })

  it('shows the first one, and its description, until the reader picks another', async () => {
    const { preview } = await previewOf('listAccounts')

    expect(deepTextOf(preview.shadowRoot!)).toContain('acc_1')
    expect(deepTextOf(preview.shadowRoot!)).toContain('The balance has cleared.')
    expect(deepTextOf(preview.shadowRoot!)).not.toContain('acc_2')
  })

  it('switches the code block when the reader picks another', async () => {
    const { harness, preview } = await previewOf('listAccounts')
    const select = picker(preview)!

    select.value = '1'
    select.dispatchEvent(new Event('change'))
    await harness.settle()

    expect(deepTextOf(preview.shadowRoot!)).toContain('acc_2')
    expect(deepTextOf(preview.shadowRoot!)).not.toContain('acc_1')
  })

  /*
   * A documentation page that fetches a URL the reader did not ask for has decided something about
   * their network on their behalf. The link is the whole feature.
   */
  it('links an external example rather than fetching it', async () => {
    const { harness, preview } = await previewOf('listAccounts')
    const select = picker(preview)!

    select.value = '2'
    select.dispatchEvent(new Event('change'))
    await harness.settle()

    const link = preview.shadowRoot!.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com/accounts.json')
    expect(preview.shadowRoot!.querySelector('openish-code-block')).toBeNull()
  })

  it('renders no picker for a single unnamed example, because there is nothing to pick', async () => {
    const { preview } = await previewOf('ping')

    expect(picker(preview)).toBeNull()
    expect(deepTextOf(preview.shadowRoot!)).toContain('pong')
  })
})

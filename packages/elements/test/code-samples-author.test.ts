import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, deepTextOf, disposeAll, mountReference, type Harness, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const page = async (path: string): Promise<Harness> => {
  const { CODE_SAMPLES_SPEC } = await import('./fixtures.js')
  const harness = await mountReference({ path, spec: CODE_SAMPLES_SPEC, config: { hideTryIt: true } })
  await new Promise((resolve) => setTimeout(resolve, 200))
  await harness.settle()
  return harness
}

const picker = (harness: Harness) => deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select#client')!

describe('author-supplied code samples', () => {
  it('offers them above the generated clients', async () => {
    const groups = deepQueryAll<HTMLOptGroupElement>(
      (await page('/tags/accounts/listAccounts')).element.shadowRoot!,
      'optgroup',
    )

    expect(groups[0]!.label).toBe("From the API's authors")
    expect([...groups[0]!.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Node.js SDK', 'Python'])
  })

  it('labels an entry by its declared language when the author gave no label', async () => {
    const options = deepQueryAll<HTMLOptionElement>(
      sectionOf(await page('/tags/accounts/listAccounts')),
      'optgroup:first-of-type option',
    )

    expect(options.map((o) => o.value.startsWith('author/'))).toEqual([true, true])
  })

  it('renders the source verbatim when one is picked', async () => {
    const harness = await page('/tags/accounts/listAccounts')
    const select = picker(harness)

    select.value = [...select.options].find((o) => o.textContent === 'Node.js SDK')!.value
    select.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('await client.accounts.list()')
  })

  it('reads one extension, not all of them, so a generator cannot duplicate the author', async () => {
    const text = deepTextOf((await page('/tags/accounts/listAccounts')).element.shadowRoot!)

    expect(text).not.toContain('GENERATED_AND_SHOULD_NOT_WIN')
  })

  it('leaves the configured default client selected, rather than hijacking it', async () => {
    const select = picker(await page('/tags/accounts/listAccounts'))

    expect(select.value).toBe('shell/curl')
  })

  it('offers no author group for an operation with no samples', async () => {
    const groups = deepQueryAll<HTMLOptGroupElement>(sectionOf(await page('/tags/accounts/plain')), 'optgroup')

    expect(groups.map((g) => g.label)).not.toContain("From the API's authors")
  })
})

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

/*
 * A tab that says `application/xml` over a block of JSON is telling the reader something false about
 * the API. The media type decides the syntax, and the schema's `xml` object decides the markup.
 */
describe('an example is written in the syntax its media type names', () => {
  /**
   * The two columns of one operation.
   *
   * The controls are all in `docs` now and the consequences are all in `examples`: which media type
   * a response is being read in is asked once, beside the schema it describes, and the example
   * follows. The examples column keeps the status tabs and nothing else.
   */
  const columnsOf = async (
    id: string,
  ): Promise<{ harness: Harness; docs: Element; examples: Element }> => {
    const harness = await mountReference({ path: `/tags/accounts/${id}`, spec: EXAMPLES_SPEC })
    const operation = shadowOf(sectionOf(harness), 'openish-operation')
    const docs = operation.querySelector('[part~="response-section"]')
    const examples = operation.querySelector('[part~="examples-section"]')
    if (!docs || !examples) {
      throw new Error(`The ${id} page is missing a column.`)
    }
    return { harness, docs, examples }
  }

  const mediaTabs = (root: Element): HTMLButtonElement[] => {
    const tabs = deepQuery(root, 'openish-tabs[label="Response media types"]')
    return tabs?.shadowRoot ? [...tabs.shadowRoot.querySelectorAll<HTMLButtonElement>('button[role="tab"]')] : []
  }

  const previewIn = (root: Element): Element => {
    const preview = deepQuery(root, 'openish-schema-preview')
    if (!preview) {
      throw new Error('No schema preview under that column.')
    }
    return preview
  }

  it('picks the media type on the left and shows it on the right', async () => {
    const { harness, docs, examples } = await columnsOf('getAccount')

    expect(mediaTabs(docs).map((tab) => textOf(tab))).toEqual(['application/json', 'application/xml'])
    /* No second copy of the control beside the example it decides. */
    expect(mediaTabs(examples)).toEqual([])

    expect(deepTextOf(previewIn(examples).shadowRoot!)).toContain('"id": "acc_1"')

    mediaTabs(docs)[1]!.click()
    await harness.settle()

    const shown = deepTextOf(previewIn(examples).shadowRoot!)
    expect(shown).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    /* `xml.name` renamed the element and `xml.attribute` moved the id onto it. */
    expect(shown).toContain('<account id="acc_1">')
    expect(shown).toContain('<balance>500</balance>')
    expect(shown).not.toContain('"id": "acc_1"')
  })

  it('colours it as XML, not as JSON', async () => {
    const { harness, docs, examples } = await columnsOf('getAccount')

    mediaTabs(docs)[1]!.click()
    await harness.settle()

    const block = deepQuery(previewIn(examples).shadowRoot!, 'openish-code-block')!
    expect(block.getAttribute('language')).toBe('xml')
  })

  it('names the media type over the example, since the picker is no longer there', async () => {
    const { examples } = await columnsOf('getAccount')

    expect(textOf(previewIn(examples).shadowRoot!.querySelector('.media-type'))).toBe('application/json')
  })
})

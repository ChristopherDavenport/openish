import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { DOCUMENT_INFO_SPEC } from './fixtures.js'
import {
  deepQuery,
  deepQueryAll,
  deepTextOf,
  disposeAll,
  mountReference,
  shadowOf,
  textOf,
  sectionOf,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

/** `page` is the element's shadow root, which is what `shadowOf` hands back. */
const pageAt = async (path: string, tag: string): Promise<{ harness: Harness; page: ShadowRoot }> => {
  const harness = await mountReference({ path, spec: DOCUMENT_INFO_SPEC })
  return { harness, page: shadowOf(sectionOf(harness), tag) }
}

/** Every external-documentation link on a page, as `[text, href]`. */
const externalLinks = (root: Element | ShadowRoot): Array<[string, string]> =>
  [...root.querySelectorAll('.external-docs a')].map((link) => [
    textOf(link),
    link.getAttribute('href') ?? '',
  ])

describe('the info object', () => {
  it('renders the summary above the description', async () => {
    const { page } = await pageAt('/', 'openish-overview')

    expect(textOf(page.querySelector('.summary'))).toBe('A ledger you can read.')
    expect(deepTextOf(page)).toContain('The long version.')
  })

  it('renders contact, licence and terms', async () => {
    const { page } = await pageAt('/', 'openish-overview')
    const about = [...page.querySelectorAll('section')].find((section) =>
      textOf(section.querySelector('h2')) === 'About',
    )

    expect(about).toBeDefined()
    const terms = [...about!.querySelectorAll('dt')].map((term) => textOf(term))
    expect(terms).toEqual(['Contact', 'Licence', 'Terms of service'])

    const hrefs = [...about!.querySelectorAll('a')].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual([
      'https://example.com/support',
      'mailto:api@example.com',
      'https://example.com/licence',
      'https://example.com/terms',
    ])
  })

  it('renders no About section for a document that declares none of it', async () => {
    const harness = await mountReference({ path: '/' })
    const overview = shadowOf(sectionOf(harness), 'openish-overview')

    expect(
      [...overview.querySelectorAll('h2')].map((heading) => textOf(heading)),
    ).not.toContain('About')
  })
})

describe('OAuth flows on the overview', () => {
  it('names every flow with its endpoints', async () => {
    const { page } = await pageAt('/', 'openish-overview')
    const names = [...page.querySelectorAll('.flow-name')].map((name) => textOf(name))

    expect(names).toEqual(['Authorization code', 'Client credentials'])
    const endpoints = [...page.querySelectorAll('.endpoint')].map((one) => textOf(one))
    expect(endpoints).toEqual([
      'https://issuer.example.com/authorize',
      'https://issuer.example.com/token',
      'https://issuer.example.com/refresh',
      'https://issuer.example.com/machine-token',
    ])
  })

  /* The scope list is the part a reader needs, and it used to exist only inside the auth form. */
  it('lists each flow’s scopes with what they mean', async () => {
    const { page } = await pageAt('/', 'openish-overview')
    const scopes = [...page.querySelectorAll('dl.scopes')].map((list) =>
      [...list.querySelectorAll('dt')].map((term) => textOf(term)),
    )

    expect(scopes).toEqual([['entries:read', 'entries:write'], ['entries:audit']])
    expect(deepTextOf(page)).toContain('Audit the ledger')
  })
})

describe('response links', () => {
  /*
   * A Link Object says the `id` in this body is the `entryId` of that operation. It is the only
   * thing in OpenAPI that describes how two operations join up, and neither Redoc nor Scalar renders
   * it - which is most of why so few documents bother writing one.
   */
  it('names the target operation and how its parameters are filled', async () => {
    const { harness, page } = await pageAt('/tags/entries/listEntries', 'openish-operation')
    const disclosure = deepQueryAll(page, 'openish-disclosure').find(
      (one) => one.getAttribute('summary') === 'Links',
    )

    expect(disclosure).toBeDefined()
    disclosure!.shadowRoot!.querySelector('button')!.click()
    await harness.settle()

    const table = deepQuery(disclosure!, 'openish-table')!
    const cells = [...table.shadowRoot!.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) => deepTextOf(cell)),
    )

    expect(cells[0]?.[0]).toBe('entry')
    expect(cells[0]?.[1]).toBe('getEntry')
    expect(cells[0]?.[2]).toContain('The entry this row names.')
    expect(cells[0]?.[2]).toContain('entryId')
    expect(cells[0]?.[2]).toContain('$response.body#/id')
  })

  it('renders no Links disclosure for a response that declares none', async () => {
    const { page } = await pageAt('/tags/entries/getEntry', 'openish-operation')

    expect(
      deepQueryAll(page, 'openish-disclosure').some((one) => one.getAttribute('summary') === 'Links'),
    ).toBe(false)
  })
})

describe('externalDocs', () => {
  it('links from the overview, labelled by the description the author wrote', async () => {
    const { page } = await pageAt('/', 'openish-overview')

    expect(externalLinks(page)).toEqual([
      ['Guides and tutorials', 'https://example.com/guides'],
    ])
  })

  it('links from a tag page', async () => {
    const { page } = await pageAt('/tags/entries', 'openish-tag-section')

    expect(externalLinks(page)).toEqual([['The entries guide', 'https://example.com/guides/entries']])
  })

  /* No description, so the link has to be labelled by whatever is rendering it. */
  it('names the operation when the author gave the link no description', async () => {
    const { page } = await pageAt('/tags/entries/listEntries', 'openish-operation')

    expect(externalLinks(page)).toEqual([
      ['More about List entries', 'https://example.com/guides/list'],
    ])
  })

  it('links from a schema', async () => {
    const { harness } = await pageAt('/models/Entry', 'openish-model')
    const schema = deepQuery(shadowOf(sectionOf(harness), 'openish-model'), 'openish-schema')

    expect(externalLinks(schema!.shadowRoot!)).toEqual([
      ['How an entry is built', 'https://example.com/guides/entry-model'],
    ])
  })
})

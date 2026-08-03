import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { DOCUMENT_INFO_SPEC, SHELL_SPEC } from './fixtures.js'
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

  it('puts the version, licence, contact and terms in a strip under the title', async () => {
    const { page } = await pageAt('/', 'openish-overview')
    const meta = page.querySelector('.meta')

    expect(meta).not.toBeNull()
    expect(textOf(meta!.querySelector('.version'))).toBe('2.1.0')

    /* Licence before contact before terms - identity first, then who to ask, then the small print. */
    const hrefs = [...meta!.querySelectorAll('a')].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual([
      'https://example.com/licence',
      'https://example.com/support',
      'mailto:api@example.com',
      'https://example.com/terms',
    ])

    /* The URL was readable in a definition list. On a line of small print it is a label. */
    expect(deepTextOf(meta!)).toContain('Terms of service')
    expect(textOf(meta!.querySelector('a[href="https://example.com/terms"]'))).toBe('Terms of service')
  })

  it('names every value in the strip for a reader who cannot see where it sits', async () => {
    const { page } = await pageAt('/', 'openish-overview')
    const labels = [...page.querySelectorAll('.meta .visually-hidden')].map((label) => textOf(label))

    expect(labels).toEqual(['Version', 'Licence', 'Contact', 'Contact'])
  })

  it('keeps the SPDX identifier beside a licence name that is not it', async () => {
    const { page } = await pageAt('/', 'openish-overview')

    /* `Apache 2.0` is the name, `Apache-2.0` the identifier: both, because they are not the same. */
    expect(deepTextOf(page.querySelector('.meta')!)).toContain('Apache 2.0')
    expect(deepTextOf(page.querySelector('.meta')!)).toContain('Apache-2.0')
  })

  it('renders no About section anywhere, since there is no longer one to render', async () => {
    const { page } = await pageAt('/', 'openish-overview')

    expect([...page.querySelectorAll('h2')].map((heading) => textOf(heading))).not.toContain('About')
  })

  it('collapses the strip for a document that declares nothing but a version', async () => {
    const harness = await mountReference({ path: '/' })
    const overview = shadowOf(sectionOf(harness), 'openish-overview')
    const meta = overview.querySelector('.meta')

    /* The shell fixture has a version and none of the rest, so the strip is the pill alone. */
    expect(meta).not.toBeNull()
    expect(meta!.querySelectorAll('a').length).toBe(0)
  })
})

describe('taking the document away', () => {
  it('puts copying it and downloading it in the same row as the title', async () => {
    const { page } = await pageAt('/', 'openish-overview')
    const actions = page.querySelector('.title-row .actions')

    expect(actions).not.toBeNull()
    expect(deepTextOf(actions!)).toContain('Copy for LLM')
    expect(deepTextOf(actions!)).toContain('JSON')
    expect(deepTextOf(actions!)).toContain('YAML')
  })

  it('says in full what a download button downloads, since the heading beside it is not read out', async () => {
    const { page } = await pageAt('/', 'openish-overview')
    const labels = [...shadowOf(page, 'openish-download').querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label'),
    )

    expect(labels).toEqual([
      'Download the OpenAPI document as JSON',
      'Download the OpenAPI document as YAML',
    ])
  })
})

describe('the headings the overview writes for itself', () => {
  it('gives Servers and Authentication the ids their navigation entries carry', async () => {
    const { page } = await pageAt('/', 'openish-overview')
    const ids = [...page.querySelectorAll('h2')].map((heading) => [textOf(heading), heading.id])

    expect(ids).toContainEqual(['Authentication', 'overview/authentication'])
  })

  it('does not spend a prose heading id on a heading the prose never had', async () => {
    /*
     * The regression this guards: `<openish-markdown>` takes the heading ids positionally, so a node
     * for `Servers` left in that list would hand `overview/servers` to the first heading of the
     * description and push every id after it along by one.
     */
    const harness = await mountReference({ path: '/', spec: SHELL_SPEC })
    const overview = shadowOf(sectionOf(harness), 'openish-overview')

    expect(deepQuery(overview, '[id="overview/getting-started"]')).not.toBeNull()
    expect(deepQuery(overview, '[id="overview/getting-started/authentication"]')).not.toBeNull()
    expect(deepQuery(overview, '[id="overview/servers"]')?.textContent).toBe('Servers')
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

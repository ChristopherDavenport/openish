import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, deepTextOf, disposeAll, mountReference, type Harness } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const operation = async (id: string): Promise<Harness> => {
  const { BADGES_SPEC } = await import('./fixtures.js')
  const harness = await mountReference({ path: `/tags/things/${id}`, spec: BADGES_SPEC, config: { hideTryIt: true } })
  await harness.settle()
  return harness
}

const badges = (harness: Harness) =>
  deepQueryAll<HTMLElement>(harness.element.shadowRoot!, '.badge').map((el) => ({
    label: el.textContent?.trim(),
    tone: el.dataset['tone'],
  }))

describe('operation badges', () => {
  it('renders x-scalar-stability with a tone of its own', async () => {
    expect(badges(await operation('betaThing'))).toContainEqual({ label: 'Experimental', tone: 'info' })
  })

  it('renders x-badges, both object and bare-string forms', async () => {
    const rendered = badges(await operation('betaThing'))

    expect(rendered).toContainEqual({ label: 'Beta', tone: 'info' })
    expect(rendered).toContainEqual({ label: 'Rate limited', tone: 'neutral' })
  })

  it('does not say Deprecated twice when the document says it two ways', async () => {
    const rendered = badges(await operation('oldThing'))

    expect(rendered.filter((badge) => badge.label === 'Deprecated')).toHaveLength(1)
  })
})

describe('downloading the document', () => {
  const overview = async (config?: Record<string, unknown>) => {
    const harness = await mountReference(config ? { path: '/', config } : { path: '/' })
    await harness.settle()
    return harness
  }

  /*
   * The buttons live in `<openish-download>`'s own shadow root, and a descendant selector does not
   * cross a shadow boundary - `openish-download button` matches nothing however deep the search.
   */
  const buttons = (harness: Harness) =>
    [...(deepQuery(harness.element.shadowRoot!, 'openish-download')?.shadowRoot?.querySelectorAll('button') ?? [])].map(
      (b) => b.textContent?.trim(),
    )

  it('offers both formats by default', async () => {
    expect(buttons(await overview())).toEqual(['JSON', 'YAML'])
  })

  it('offers one when the host names one', async () => {
    expect(buttons(await overview({ documentDownloadType: 'yaml' }))).toEqual(['YAML'])
  })

  it('renders nothing at all for none', async () => {
    const harness = await overview({ documentDownloadType: 'none' })

    expect(buttons(harness)).toEqual([])
    expect(deepTextOf(harness.element.shadowRoot!)).not.toContain('OpenAPI document')
  })

  it('links the published file for direct, rather than serialising', async () => {
    /*
     * Both `spec` and `url` are set. The loader reads `spec ?? url`, so the document still comes
     * from the fixture - `url` is here only as the thing `direct` is supposed to link, which is
     * exactly the situation a host is in when it hands over an inline document it also publishes.
     */
    const harness = await mountReference({ path: '/', config: { documentDownloadType: 'direct' } })
    harness.element.url = '/openapi.yaml'
    await harness.settle()

    const download = deepQuery(harness.element.shadowRoot!, 'openish-download')!
    const links = [...(download.shadowRoot?.querySelectorAll('a') ?? [])]

    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/openapi.yaml'])
    expect(links[0]!.hasAttribute('download')).toBe(true)
    expect(buttons(harness)).toEqual([])
  })

  it('offers nothing for direct when the document was handed over inline', async () => {
    const harness = await overview({ documentDownloadType: 'direct' })

    expect(deepQuery(harness.element.shadowRoot!, 'openish-download')?.shadowRoot?.childElementCount ?? 0).toBe(0)
  })
})

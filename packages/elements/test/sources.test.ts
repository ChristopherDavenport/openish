import { describe, expect, it } from 'vitest'

import {
  applySlugPrefix,
  hrefFor,
  hrefForOverview,
  idFromHash,
  idFromPathname,
  stripFirstSegment,
} from '../src/router/urls.js'
import type { NavNode } from '@openish/core'
import { scopedCredentialStore } from '../src/auth/scoped-credential-store.js'
import { deepQuery, deepQueryAll, deepTextOf, disposeAll, mountReference, textOf } from './helpers.js'
import { SEARCHABLE_SPEC, SHELL_SPEC } from './fixtures.js'
import { afterEach } from 'vitest'

afterEach(disposeAll)

const operation = (id: string): NavNode => ({
  type: 'operation',
  id,
  title: 'List accounts',
  method: 'get',
  path: '/accounts',
  pointer: '#/paths/~1accounts/get',
})

/**
 * Two documents from the existing fixtures.
 *
 * `SEARCHABLE_SPEC` second on purpose: it is the one with prose worth searching, so a query typed
 * while the *first* document is on screen is the case cross-document search exists for.
 */
const TWO = [
  { slug: 'shell', title: 'Shell API', content: SHELL_SPEC },
  { slug: 'ledger', title: 'Ledger API', content: SEARCHABLE_SPEC },
]

describe('the URL projection', () => {
  it('round-trips an id through the form a single-document URL has', () => {
    const id = 'api-1/tags/accounts/listAccounts'

    expect(stripFirstSegment(id)).toBe('tags/accounts/listAccounts')
    expect(applySlugPrefix(stripFirstSegment(id), 'api-1')).toBe(id)
  })

  it('collapses a document overview to nothing, and puts it back', () => {
    expect(stripFirstSegment('api-1')).toBe('')
    expect(applySlugPrefix('', 'api-1')).toBe('api-1')
  })

  it('leaves ids alone when the URL carries the document slug', () => {
    expect(applySlugPrefix('consumer/tags/accounts', '')).toBe('consumer/tags/accounts')
    expect(idFromHash('#/consumer/tags/accounts')).toBe('consumer/tags/accounts')
  })

  it('writes exactly the hrefs it always wrote for one document', () => {
    const routing = { routing: 'hash' as const, basePath: '', slugPrefix: 'api-1' }

    expect(hrefFor(operation('api-1/tags/accounts/listAccounts'), routing)).toBe('#/tags/accounts/listAccounts')
    expect(hrefForOverview(routing, 'api-1')).toBe('#/')
  })

  it('names the document in the href when the host configured several', () => {
    const routing = { routing: 'hash' as const, basePath: '', slugPrefix: '' }

    expect(hrefFor(operation('admin/tags/accounts/listAccounts'), routing)).toBe(
      '#/admin/tags/accounts/listAccounts',
    )
    expect(hrefForOverview(routing, 'admin')).toBe('#/admin')
  })

  it('reads a history-mode path back into a full id', () => {
    expect(idFromPathname('/docs/tags/accounts', '/docs', 'api-1')).toBe('api-1/tags/accounts')
    expect(idFromPathname('/docs/admin/tags/accounts', '/docs', '')).toBe('admin/tags/accounts')
  })
})

describe('multiple documents', () => {
  it('offers no picker for a single document, and one for several', async () => {
    const single = await mountReference({ path: '/' })
    expect(deepQuery(single.element.shadowRoot!, 'openish-source-select')).toBeNull()

    const several = await mountReference({ path: '/', sources: TWO })
    const picker = deepQuery<HTMLSelectElement>(several.element.shadowRoot!, 'select#source')

    expect(picker).not.toBeNull()
    expect([...picker!.options].map((option) => option.textContent?.trim())).toEqual([
      'Shell API',
      'Ledger API',
    ])
  })

  it('shows the default document, and names it in the URL', async () => {
    const harness = await mountReference({ path: '/', sources: TWO })

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('Shell API')
    expect(deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select#source')!.value).toBe('shell')
  })

  it('honours default: true rather than taking the first', async () => {
    const harness = await mountReference({
      path: '/',
      sources: [TWO[0]!, { ...TWO[1]!, default: true }],
    })

    expect(deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select#source')!.value).toBe('ledger')
  })

  it('names an untitled document from the document itself, once it has one', async () => {
    const harness = await mountReference({
      path: '/',
      sources: [
        { slug: 'shell', content: SHELL_SPEC },
        { slug: 'ledger', content: SEARCHABLE_SPEC },
      ],
    })
    await harness.settleSources()
    await harness.settle()

    const options = [...deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select#source')!.options]

    /* The slug stays put - it is in every URL - and only the label follows the document. */
    expect(options.map((option) => option.value)).toEqual(['shell', 'ledger'])
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Shell API', 'Searchable'])
  })

  it('leaves a title the host chose alone, whatever the document calls itself', async () => {
    const harness = await mountReference({
      path: '/',
      sources: [
        { slug: 'shell', title: 'What we call it', content: SHELL_SPEC },
        { slug: 'ledger', content: SEARCHABLE_SPEC },
      ],
    })
    await harness.settleSources()
    await harness.settle()

    const options = [...deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select#source')!.options]
    expect(options.map((option) => option.textContent?.trim())).toEqual(['What we call it', 'Searchable'])
  })

  it('namespaces every sidebar href by the document it belongs to', async () => {
    const harness = await mountReference({ path: '/', sources: TWO })
    const hrefs = deepQueryAll<HTMLAnchorElement>(harness.element.shadowRoot!, 'a[href]').map((a) =>
      a.getAttribute('href'),
    )

    expect(hrefs.some((href) => href?.startsWith('#/shell/tags/'))).toBe(true)
    expect(hrefs.every((href) => !href?.startsWith('#/tags/'))).toBe(true)
  })

  it('resolves a deep link straight into the document the URL names', async () => {
    const harness = await mountReference({ path: '/ledger/tags/transfers/createTransfer', sources: TWO })

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('Move money')
    expect(deepTextOf(harness.element.shadowRoot!)).not.toContain('Not found')
  })

  it('switches documents when the picker changes, and moves the URL with it', async () => {
    const harness = await mountReference({ path: '/', sources: TWO })
    const picker = deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select#source')!

    picker.value = 'ledger'
    picker.dispatchEvent(new (harness.window as Window & typeof globalThis).Event('change', { bubbles: true, composed: true }))
    await harness.settle()

    expect(harness.window.location.hash).toBe('#/ledger')
    expect(deepTextOf(harness.element.shadowRoot!)).toContain('Ledger API')
  })

  it('says nothing matches for a first segment that names no document', async () => {
    const harness = await mountReference({ path: '/nope/tags/accounts', sources: TWO })

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('Not found')
  })

  it('adopts ?api= and takes it back out of the URL', async () => {
    const harness = await mountReference({ path: '/', sources: TWO, search: '?api=ledger' })

    expect(harness.window.location.search).toBe('')
    expect(harness.window.location.hash).toBe('#/ledger')
    expect(deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select#source')!.value).toBe('ledger')
  })

  it('still adopts ?api= when the host assigns sources after mounting', async () => {
    /*
     * The shape a host that fetches its own list of documents has: the element is in the DOM and
     * rendering before `sources` exists, so the first update has nothing to check the param against.
     */
    const harness = await mountReference({ path: '/', search: '?api=ledger' })
    expect(harness.window.location.search).toBe('?api=ledger')

    harness.element.sources = TWO.map((source) => ({
      ...source,
      content: JSON.stringify(source.content),
    }))
    await harness.settle()

    expect(harness.window.location.search).toBe('')
    expect(harness.window.location.hash).toBe('#/ledger')
  })

  it('leaves an ?api= that names no document alone rather than guessing', async () => {
    const harness = await mountReference({ path: '/', sources: TWO, search: '?api=nope' })

    expect(harness.window.location.search).toBe('?api=nope')
    expect(deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select#source')!.value).toBe('shell')
  })
})

describe('search across documents', () => {
  it('finds an operation in a document the reader has not opened, under its own heading', async () => {
    const harness = await mountReference({ path: '/', sources: TWO })

    /* The idle prefetch is what puts the second document in the index; wait for it to land. */
    await harness.settleSources()

    const dialog = deepQuery<HTMLElement>(harness.element.shadowRoot!, 'openish-search')!
    const search = dialog.shadowRoot!
    const input = search.querySelector('input')!

    input.value = 'idempotent'
    input.dispatchEvent(new (harness.window as Window & typeof globalThis).Event('input', { bubbles: true }))
    await harness.settle()

    const options = [...search.querySelectorAll('[role="option"]')]
    expect(options.length).toBeGreaterThan(0)
    expect(textOf(options[0] as Element)).toContain('Move money')

    const headings = [...search.querySelectorAll('.group')].map((node) => textOf(node))
    expect(headings).toContain('Ledger API')
  })

  it('keeps the options one flat, gapless list so the combobox still works', async () => {
    const harness = await mountReference({ path: '/', sources: TWO })
    await harness.settleSources()

    const search = deepQuery<HTMLElement>(harness.element.shadowRoot!, 'openish-search')!.shadowRoot!
    const input = search.querySelector('input')!

    input.value = 'a'
    input.dispatchEvent(new (harness.window as Window & typeof globalThis).Event('input', { bubbles: true }))
    await harness.settle()

    const ids = [...search.querySelectorAll('[role="option"]')].map((node) => node.id)
    expect(ids).toEqual(ids.map((_, index) => `result-${index}`))
    /* The headings must not be options, or arrow keys would land on one. */
    expect(search.querySelectorAll('.group[role="option"]').length).toBe(0)
  })
})

describe('per-document credentials', () => {
  /** A host store, as `credentialStore` expects one: a single record for the whole reference. */
  const hostStore = () => {
    let held: Record<string, unknown> = {}
    return {
      read: () => held as never,
      write: (grants: Record<string, unknown>) => {
        held = grants
      },
      clear: () => {
        held = {}
      },
      get raw() {
        return held
      },
    }
  }

  const grant = (value: string) => ({ kind: 'pasted', scheme: 'oauth2', value }) as never

  it('keeps two documents’ entries apart inside one host store', () => {
    const host = hostStore()
    const shell = scopedCredentialStore(host, 'shell')
    const ledger = scopedCredentialStore(host, 'ledger')

    shell.write({ oauth2: grant('shell-token') })
    ledger.write({ oauth2: grant('ledger-token') })

    expect(Object.keys(host.raw).sort()).toEqual(['ledger/oauth2', 'shell/oauth2'])
    expect(shell.read()).toEqual({ oauth2: grant('shell-token') })
    expect(ledger.read()).toEqual({ oauth2: grant('ledger-token') })
  })

  it('does not sign the reader out of the other documents when one is cleared', () => {
    const host = hostStore()
    scopedCredentialStore(host, 'shell').write({ oauth2: grant('shell-token') })
    const ledger = scopedCredentialStore(host, 'ledger')
    ledger.write({ oauth2: grant('ledger-token') })

    ledger.clear()

    expect(ledger.read()).toEqual({})
    expect(scopedCredentialStore(host, 'shell').read()).toEqual({ oauth2: grant('shell-token') })
  })

  it('empties the host store when the last document lets go of it', () => {
    const host = hostStore()
    const shell = scopedCredentialStore(host, 'shell')
    shell.write({ oauth2: grant('shell-token') })

    shell.clear()

    expect(host.raw).toEqual({})
  })

  it('gives each document its own session, so a token cannot cross', async () => {
    const host = hostStore()
    const harness = await mountReference({ path: '/', sources: TWO, credentialStore: host })
    await harness.settleSources()

    /* Written the way the root writes it: through the session the active document owns. */
    scopedCredentialStore(host, 'shell').write({ oauth2: grant('shell-token') })

    expect(scopedCredentialStore(host, 'ledger').read()).toEqual({})
    expect(harness.element.sources?.length).toBe(2)
  })
})

import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  deepQuery,
  deepQueryAll,
  deepTextOf,
  disposeAll,
  mountReference,
  sectionOf,
  shadowOf,
  statusRows,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

/**
 * The presentation flags, each asserted against the thing it actually changes.
 *
 * PLAN.md carried these as "taken on trust" for four milestones. They are the options a host is most
 * likely to set and the least likely to notice breaking, because nothing in the default path
 * exercises them.
 */
const at = async (path: string, config?: Record<string, unknown>): Promise<Harness> => {
  const harness = await mountReference(config ? { path, config } : { path })
  await harness.settle()
  return harness
}

const labels = (harness: Harness) => deepQueryAll(harness.element.shadowRoot!, '.label').map((n) => n.textContent)

describe('hideModels', () => {
  it('removes the Models section from the navigation', async () => {
    expect(labels(await at('/', { hideModels: true }))).not.toContain('Models')
    expect(labels(await at('/'))).toContain('Models')
  })

  it('makes a model URL a not-found rather than a page', async () => {
    expect(deepTextOf((await at('/models/Account', { hideModels: true })).element.shadowRoot!)).toContain('Not found')
  })
})

describe('modelsSectionLabel', () => {
  it('renames the section', async () => {
    expect(labels(await at('/', { hideModels: false, modelsSectionLabel: 'Schemas' }))).toContain('Schemas')
  })
})

describe('showSidebar', () => {
  it('removes the sidebar entirely', async () => {
    expect(deepQuery((await at('/', { showSidebar: false })).element.shadowRoot!, 'openish-sidebar')).toBeNull()
    expect(deepQuery((await at('/')).element.shadowRoot!, 'openish-sidebar')).not.toBeNull()
  })
})

describe('hideSearch', () => {
  it('removes the search control, leaving the tree', async () => {
    const harness = await at('/', { hideSearch: true })

    expect(deepQuery(harness.element.shadowRoot!, 'openish-search')).toBeNull()
    expect(deepQuery(harness.element.shadowRoot!, '[role="tree"]')).not.toBeNull()
  })
})

describe('showOperationId', () => {
  /*
   * In the navigation, which is the only place this option governs: an operation page has always
   * named itself and still does. Both of these used to be measured against the whole reference from
   * a tag's index page - which had no operation on it at all - so the one that asserted an absence
   * was asserting it about a page that could not have shown one either way.
   */
  const navigationIds = (harness: Harness): string[] =>
    deepQueryAll(shadowOf(harness.element.shadowRoot!, 'openish-sidebar'), '.operation-id').map(
      (one) => one.textContent ?? '',
    )

  it('puts the operationId beside the summary in the navigation', async () => {
    expect(navigationIds(await at('/tags/accounts', { showOperationId: true }))).toContain('listAccounts')
  })

  it('leaves it out by default', async () => {
    expect(navigationIds(await at('/tags/accounts'))).toHaveLength(0)
  })
})

describe('hideTryIt', () => {
  it('removes the panel and leaves the sample', async () => {
    const harness = await at('/tags/accounts/listAccounts', { hideTryIt: true })

    expect(deepQuery(sectionOf(harness), 'openish-try-it')).toBeNull()
    expect(deepQuery(sectionOf(harness), 'openish-code-sample')).not.toBeNull()
  })
})

describe('expandAllResponses', () => {
  /*
   * The documentation column is a list of statuses either way - the flag decides how many of them
   * arrive open, not whether they are tabs. What it used to switch off was a tab set that column no
   * longer has.
   */
  it('opens every status instead of only the first success', async () => {
    /* An operation whose responses have bodies - a status with nothing under it has nothing to open. */
    const closed = await at('/tags/accounts/getAccount', { hideTryIt: true })
    const opened = await at('/tags/accounts/getAccount', { hideTryIt: true, expandAllResponses: true })

    const openCount = (harness: Harness) =>
      statusRows(shadowOf(sectionOf(harness), 'openish-response-list')).filter((row) => row.open).length
    const total = (harness: Harness) =>
      statusRows(shadowOf(sectionOf(harness), 'openish-response-list')).length

    expect(openCount(closed)).toBe(1)
    expect(openCount(opened)).toBeGreaterThan(openCount(closed))
    expect(openCount(opened)).toBe(total(opened) - 1)
  })
})

describe('untaggedLabel', () => {
  /* Every operation in the shell fixture carries a tag, so the bucket needs a document without one. */
  const untagged = {
    openapi: '3.1.0',
    info: { title: 'Loose', version: '1.0.0' },
    paths: { '/loose': { get: { summary: 'Loose', operationId: 'loose', responses: { '200': { description: 'OK' } } } } },
  }

  it('names the bucket for operations that declare no tags', async () => {
    const harness = await mountReference({ path: '/', spec: untagged, config: { untaggedLabel: 'Everything else' } })
    await harness.settle()

    expect(labels(harness)).toContain('Everything else')
  })

  it('calls it Default when the host says nothing', async () => {
    const harness = await mountReference({ path: '/', spec: untagged })
    await harness.settle()

    expect(labels(harness)).toContain('Default')
  })
})

describe('operationSort and tagSort', () => {
  /*
   * `.label` is inside `<openish-sidebar-item>`'s shadow root and `[aria-level]` is on the wrapper
   * outside it, so no single selector spans them - the row has to be found first, then reached into.
   */
  /* Dropping the first root row, which is the Introduction and not a tag. */
  const tagNames = (harness: Harness) =>
    deepQueryAll<HTMLElement>(harness.element.shadowRoot!, '[role="treeitem"][aria-level="1"]')
      .slice(1)
      .map((row) => row.querySelector('openish-sidebar-item')?.shadowRoot?.querySelector('.label')?.textContent)

  /* The shell fixture's tags are already in alphabetical order, so sorting them proves nothing. */
  const unsorted = {
    openapi: '3.1.0',
    info: { title: 'Unsorted', version: '1.0.0' },
    tags: [{ name: 'zebra' }, { name: 'alpha' }, { name: 'middle' }],
    paths: {
      '/z': { get: { summary: 'Z', operationId: 'z', tags: ['zebra'], responses: { '200': { description: 'OK' } } } },
      '/a': { get: { summary: 'A', operationId: 'a', tags: ['alpha'], responses: { '200': { description: 'OK' } } } },
      '/m': { get: { summary: 'M', operationId: 'm', tags: ['middle'], responses: { '200': { description: 'OK' } } } },
    },
  }

  const tagsWith = async (config?: Record<string, unknown>) => {
    const harness = await mountReference(config ? { path: '/', spec: unsorted, config } : { path: '/', spec: unsorted })
    await harness.settle()
    return tagNames(harness)
  }

  it('keeps the declared tag order by default', async () => {
    expect(await tagsWith()).toEqual(['zebra', 'alpha', 'middle'])
  })

  it('sorts tags alphabetically when asked', async () => {
    expect(await tagsWith({ tagSort: 'alpha' })).toEqual(['alpha', 'middle', 'zebra'])
  })

  it('sorts operations within a tag by method when asked', async () => {
    const harness = await mountReference({
      path: '/tags/accounts',
      config: { operationSort: 'method', hideTryIt: true },
    })
    await harness.settle()

    const methods = deepQueryAll<HTMLElement>(harness.element.shadowRoot!, '[role="treeitem"][aria-level="2"]')
      .map((row) => row.querySelector('openish-sidebar-item')?.shadowRoot?.querySelector('.method')?.textContent)
      .filter(Boolean)

    /* GET before PUT before POST is the canonical OpenAPI verb order, not alphabetical. */
    expect(methods.indexOf('get')).toBeLessThan(methods.indexOf('post'))
  })
})

describe('defaultHttpClient and hiddenClients', () => {
  it('selects the named client', async () => {
    const select = deepQuery<HTMLSelectElement>(
      (await at('/tags/accounts/listAccounts', { hideTryIt: true, defaultHttpClient: 'python/requests' })).element
        .shadowRoot!,
      'select#client',
    )!

    expect(select.value).toBe('python/requests')
  })

  it('removes a hidden client from the picker', async () => {
    const select = deepQuery<HTMLSelectElement>(
      (await at('/tags/accounts/listAccounts', { hideTryIt: true, hiddenClients: ['shell/curl'] })).element.shadowRoot!,
      'select#client',
    )!

    expect([...select.options].map((o) => o.value)).not.toContain('shell/curl')
  })
})

describe('redirect', () => {
  it('rescues an id the document no longer has', async () => {
    const harness = await at('/tags/accounts/oldName', {
      redirect: (id: string) => (id === 'tags/accounts/oldName' ? 'tags/accounts/listAccounts' : null),
    })

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('List accounts')
    expect(deepTextOf(harness.element.shadowRoot!)).not.toContain('Not found')
  })

  it('is not consulted for an id that resolves, so it cannot shadow a real page', async () => {
    let called = false
    const harness = await at('/tags/accounts/listAccounts', {
      hideTryIt: true,
      redirect: (id: string) => {
        called = true
        return `redirected-${id}`
      },
    })

    expect(called).toBe(false)
    expect(deepTextOf(harness.element.shadowRoot!)).toContain('List accounts')
  })

  it('leaves the not-found standing when it declines', async () => {
    const harness = await at('/tags/accounts/nope', { redirect: () => null })

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('Not found')
  })
})

describe('page-level options', () => {
  it('titles operations by path when asked', async () => {
    const harness = await at('/tags/accounts', { operationTitleSource: 'path' })
    const shown = deepQueryAll(harness.element.shadowRoot!, '.label').map((n) => n.textContent)

    expect(shown).toContain('GET /accounts')
    expect(shown).not.toContain('List accounts')
  })

  it('opens the first tag at the overview when asked, and not otherwise', async () => {
    const closed = deepQueryAll((await at('/')).element.shadowRoot!, '[role="treeitem"]').length
    const opened = deepQueryAll((await at('/', { defaultOpenFirstTag: true })).element.shadowRoot!, '[role="treeitem"]')
      .length

    expect(opened).toBeGreaterThan(closed)
  })

  it('opens every tag when asked', async () => {
    const first = deepQueryAll((await at('/', { defaultOpenFirstTag: true })).element.shadowRoot!, '[role="treeitem"]')
      .length
    const all = deepQueryAll((await at('/', { defaultOpenAllTags: true })).element.shadowRoot!, '[role="treeitem"]').length

    expect(all).toBeGreaterThan(first)
  })

  it('replaces the document’s servers with the host’s', async () => {
    const harness = await at('/', { servers: [{ url: 'https://staging.example.com' }] })

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('staging.example.com')
  })

  /*
   * The listener goes on before the element exists, not after.
   *
   * `openish-loaded` fires from the load task, which resolves during the first update - so a
   * listener attached after `mountReference` returns has already missed it. The event bubbles and is
   * composed, so the frame's own document hears it, and `beforeMount` runs early enough to be there.
   */
  const loadEvents = async (attributes: Record<string, unknown>) => {
    const seen: Array<{ ok: boolean; message?: string }> = []
    const harness = await mountReference({
      ...attributes,
      beforeMount: (frameWindow: Window) => {
        frameWindow.document.addEventListener('openish-loaded', (event) => {
          seen.push((event as CustomEvent).detail as { ok: boolean; message?: string })
        })
      },
    } as Parameters<typeof mountReference>[0])
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()
    return seen
  }

  it('announces the document once it has parsed', async () => {
    const seen = await loadEvents({ path: '/' })

    expect(seen).toHaveLength(1)
    expect(seen[0]?.ok).toBe(true)
  })

  it('announces a failure rather than staying silent', async () => {
    const seen = await loadEvents({ path: '/', url: '/definitely-not-there.yaml' })

    expect(seen.at(-1)?.ok).toBe(false)
    expect(seen.at(-1)?.message).toContain('definitely-not-there')
  })
})

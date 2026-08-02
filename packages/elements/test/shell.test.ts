import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepQueryAll, deepTextOf, disposeAll, mountReference, shadowOf, textOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

describe('openish-api-reference', () => {
  it('loads a document and renders the overview at the root URL', async () => {
    const { element } = await mountReference({ path: '/' })

    expect(textOf(shadowOf(element.shadowRoot!, 'openish-overview').querySelector('h1'))).toBe('Shell API')
    expect(textOf(shadowOf(element.shadowRoot!, 'openish-overview').querySelector('.version'))).toBe('2.3.0')
  })

  it('renders the servers and security schemes', async () => {
    const { element } = await mountReference({ path: '/' })
    const overview = deepQuery(element.shadowRoot!, 'openish-overview')!

    expect(textOf(overview.shadowRoot!.querySelector('.server'))).toBe('https://api.example.com/v1')
    expect(deepTextOf(overview.shadowRoot!)).toContain('HTTP bearer')
  })

  it('demotes description headings so the page keeps one h1', async () => {
    const { element } = await mountReference({ path: '/' })
    const headings = deepQueryAll(element.shadowRoot!, 'h1')

    /* The document's own `# Getting started` must not become a second h1. */
    expect(headings.map((h) => textOf(h))).toEqual(['Shell API'])
    expect(deepQueryAll(shadowOf(element.shadowRoot!, 'openish-markdown'), 'h2').map((h) => textOf(h))).toContain(
      'Getting started',
    )
  })

  it('stamps navigation ids onto description headings, so sidebar anchors have targets', async () => {
    const { element } = await mountReference({ path: '/' })
    const heading = deepQuery(element.shadowRoot!, '#overview\\/getting-started')

    expect(heading).not.toBeNull()
    expect(textOf(heading)).toBe('Getting started')
  })

  it('builds the sidebar from the navigation tree', async () => {
    const { element } = await mountReference({ path: '/' })
    const labels = deepQueryAll(element.shadowRoot!, '.label').map((n) => textOf(n))

    expect(labels).toContain('accounts')
    expect(labels).toContain('Administration')
    expect(labels).toContain('Webhooks')
    expect(labels).toContain('Models')
  })

  it('renders sidebar entries as real anchors, not click handlers', async () => {
    const harness = await mountReference({ path: '/' })
    const link = deepQuery<HTMLAnchorElement>(harness.element.shadowRoot!, `a[href="${harness.hrefFor('/tags/accounts')}"]`)

    expect(link).not.toBeNull()
    expect(link!.tagName).toBe('A')
  })
})

describe('routing', () => {
  it('renders a tag page for a tag URL', async () => {
    const { element } = await mountReference({ path: '/tags/accounts' })

    expect(textOf(shadowOf(element.shadowRoot!, 'openish-tag-section').querySelector('h1'))).toBe('accounts')
    expect(deepTextOf(shadowOf(element.shadowRoot!, 'openish-tag-section'))).toContain('Everything about accounts')
  })

  it('renders an operation page for an operation URL', async () => {
    const { element } = await mountReference({ path: '/tags/accounts/listAccounts' })
    const operation = deepQuery(element.shadowRoot!, 'openish-operation')!

    expect(textOf(operation.shadowRoot!.querySelector('h1'))).toBe('List accounts')
    /* The call itself is the title of the request card now, a column to the right of the prose. */
    expect(textOf(deepQuery(operation.shadowRoot!, '.method'))).toBe('get')
    expect(textOf(deepQuery(operation.shadowRoot!, '.path'))).toBe('/accounts')
    expect(deepTextOf(operation.shadowRoot!)).toContain('Returns every account')
  })

  it('marks a deprecated operation', async () => {
    const { element } = await mountReference({ path: '/tags/administration/purge' })
    const operation = deepQuery(element.shadowRoot!, 'openish-operation')!

    expect(textOf(operation.shadowRoot!.querySelector('.badge'))).toBe('Deprecated')
  })

  it('renders a model page', async () => {
    const { element } = await mountReference({ path: '/models/Account' })
    const model = deepQuery(element.shadowRoot!, 'openish-model')!

    expect(textOf(model.shadowRoot!.querySelector('h1'))).toBe('Account')
    expect(textOf(deepQuery(model.shadowRoot!, 'pre'))).toContain('"balance"')
  })

  it('navigates when a sidebar link is clicked, and updates the URL', async () => {
    const harness = await mountReference({ path: '/' })

    /* A collapsed tag does not render its operations, so open it the way a reader would. */
    await harness.clickLink('/tags/accounts')
    await harness.clickLink('/tags/accounts/listAccounts')

    expect(harness.currentId()).toBe('tags/accounts/listAccounts')
    expect(textOf(shadowOf(harness.element.shadowRoot!, 'openish-operation').querySelector('h1'))).toBe('List accounts')
  })

  it('restores the previous page on back, and returns on forward', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })

    await harness.clickLink('/tags/accounts/listAccounts')
    expect(textOf(shadowOf(harness.element.shadowRoot!, 'openish-operation').querySelector('h1'))).toBe('List accounts')

    harness.window.history.back()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(harness.currentId()).toBe('tags/accounts')
    expect(deepQuery(harness.element.shadowRoot!, 'openish-tag-section')).not.toBeNull()

    harness.window.history.forward()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(textOf(shadowOf(harness.element.shadowRoot!, 'openish-operation').querySelector('h1'))).toBe('List accounts')
  })

  it('marks the active sidebar entry and opens its ancestors', async () => {
    const { element } = await mountReference({ path: '/tags/accounts/listAccounts' })
    const active = deepQuery(element.shadowRoot!, 'a.link.active')

    expect(textOf(active)).toContain('List accounts')
    expect(active!.getAttribute('aria-current')).toBe('page')
  })

  it('shows a not-found message for a URL that matches no node', async () => {
    const { element } = await mountReference({ path: '/tags/accounts/nope' })

    /* The message comes from the section's own shadow root, so the search has to cross it. */
    expect(deepTextOf(element.shadowRoot!)).toContain('Not found')
    expect(deepTextOf(element.shadowRoot!)).toContain('tags/accounts/nope')
  })

  it('resolves a deep URL straight to its node, with nothing routing in between', async () => {
    const { element } = await mountReference({ path: '/tags/accounts/listAccounts' })

    /*
     * There is no route table and no section element: the id in the URL is a key into `bySlug`, so
     * an operation three segments deep costs the same lookup as the overview. This test is what is
     * left of the one that used to assert a nested `Routes` controller had matched a tail.
     */
    expect(deepQuery(element.shadowRoot!, 'openish-operation')).not.toBeNull()
    expect(textOf(shadowOf(element.shadowRoot!, 'openish-operation').querySelector('h1'))).toBe('List accounts')
  })

  it('renders a section index at the bare section URL, which has no tail to match', async () => {
    const { element } = await mountReference({ path: '/models' })

    expect(textOf(shadowOf(element.shadowRoot!, 'openish-tag-section').querySelector('h1'))).toBe('Models')
  })

  it('navigates from a section index to a page inside it', async () => {
    const harness = await mountReference({ path: '/models' })
    await harness.clickLink('/models/Account')

    expect(textOf(shadowOf(harness.element.shadowRoot!, 'openish-model').querySelector('h1'))).toBe('Account')
    expect(harness.currentId()).toBe('models/Account')
  })

  it('renders the webhooks section', async () => {
    const { element } = await mountReference({ path: '/webhooks' })

    expect(textOf(shadowOf(element.shadowRoot!, 'openish-tag-section').querySelector('h1'))).toBe('Webhooks')
  })

  it('honours a basePath in history mode', async () => {
    const { element } = await mountReference({ path: '/docs/tags/accounts', basePath: '/docs', routing: 'history' })

    expect(textOf(shadowOf(element.shadowRoot!, 'openish-tag-section').querySelector('h1'))).toBe('accounts')
    expect(deepQuery(element.shadowRoot!, 'a[href="/docs/tags/accounts/listAccounts"]')).not.toBeNull()
  })

  it('renders the overview at the bare basePath, with no trailing slash', async () => {
    const { element } = await mountReference({ path: '/docs', basePath: '/docs', routing: 'history' })

    expect(deepQuery(element.shadowRoot!, 'openish-overview')).not.toBeNull()
  })
})

describe('routing="hash"', () => {
  it('is the default, and needs no server cooperation to deep-link', async () => {
    const harness = await mountReference({ path: '/tags/accounts/listAccounts' })

    /*
     * The whole point of the default: the server was only ever asked for `/`. A static host with no
     * rewrite rule serves that, and the page the reader bookmarked is in the part of the URL the
     * server never sees.
     */
    expect(harness.window.location.pathname).toBe('/')
    expect(harness.window.location.hash).toBe('#/tags/accounts/listAccounts')
    expect(textOf(shadowOf(harness.element.shadowRoot!, 'openish-operation').querySelector('h1'))).toBe('List accounts')
  })

  it('renders fragment hrefs, which the browser navigates without interception', async () => {
    const { element } = await mountReference({ path: '/' })

    expect(deepQuery(element.shadowRoot!, 'a[href="#/tags/accounts"]')).not.toBeNull()
  })

  it('follows the fragment when the reader edits it directly', async () => {
    const harness = await mountReference({ path: '/' })
    expect(deepQuery(harness.element.shadowRoot!, 'openish-overview')).not.toBeNull()

    harness.window.location.hash = '#/models/Account'
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(textOf(shadowOf(harness.element.shadowRoot!, 'openish-model').querySelector('h1'))).toBe('Account')
  })

  it('ignores basePath, which is a history-mode concern', async () => {
    const harness = await mountReference({ path: '/tags/accounts', basePath: '/docs' })

    expect(deepQuery(harness.element.shadowRoot!, 'a[href="#/tags/accounts/listAccounts"]')).not.toBeNull()
  })
})

describe('routing="none"', () => {
  it('renders from the selected property and ignores the URL', async () => {
    const harness = await mountReference({
      path: '/tags/accounts/listAccounts',
      routing: 'none',
      selected: 'models/Account',
    })

    expect(textOf(shadowOf(harness.element.shadowRoot!, 'openish-model').querySelector('h1'))).toBe('Account')
  })

  it('follows a change to the selected property', async () => {
    const harness = await mountReference({ path: '/', routing: 'none', selected: '' })
    expect(deepQuery(harness.element.shadowRoot!, 'openish-overview')).not.toBeNull()

    harness.element.selected = 'tags/accounts'
    await harness.settle()

    expect(textOf(shadowOf(harness.element.shadowRoot!, 'openish-tag-section').querySelector('h1'))).toBe('accounts')
  })
})

describe('events', () => {
  it('re-dispatches a colour-scheme change so the host can swap the theme stylesheet', async () => {
    const harness = await mountReference({ path: '/' })
    const seen: string[] = []
    harness.element.addEventListener('openish-color-scheme-change', (event) => seen.push(event.detail))

    /* A descendant asking for dark mode is the real path; dispatch from inside the tree. */
    const sidebar = deepQuery(harness.element.shadowRoot!, 'openish-sidebar')!
    sidebar.dispatchEvent(
      new CustomEvent('openish-color-scheme-change', { detail: 'dark', bubbles: true, composed: true }),
    )
    await harness.settle()

    expect(harness.element.colorScheme).toBe('dark')
    expect(seen).toContain('dark')
  })

  it('announces navigation', async () => {
    const harness = await mountReference({ path: '/' })
    const seen: string[] = []
    harness.element.addEventListener('openish-navigate', (event) => seen.push(event.detail))

    await harness.clickLink('/tags/accounts')

    expect(seen).toContain('tags/accounts')
  })
})

describe('failure states', () => {
  it('reports a fetch failure instead of rendering an empty shell', async () => {
    const harness = await mountReference({ path: '/', url: '/definitely-not-a-real-document.yaml' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    await harness.settle()

    const text = deepTextOf(harness.element.shadowRoot!)
    expect(text).toMatch(/Could not fetch|not a real|Unexpected|Failed/i)
    expect(deepQuery(harness.element.shadowRoot!, '[role="alert"]')).not.toBeNull()
  })

  it('says so plainly when no document is configured at all', async () => {
    /* `url: ''` means "configured to load from nowhere", which is the state a bare tag starts in. */
    const harness = await mountReference({ path: '/', url: '' })
    await harness.settle()

    expect(deepTextOf(harness.element.shadowRoot!)).toContain('No document loaded')
  })
})

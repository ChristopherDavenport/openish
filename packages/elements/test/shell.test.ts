import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  deepQuery,
  deepQueryAll,
  deepTextOf,
  disposeAll,
  mountReference,
  shadowOf,
  textOf,
  sectionOf,
  titleOf,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

describe('openish-api-reference', () => {
  it('loads a document and renders the overview at the root URL', async () => {
    const { element } = await mountReference({ path: '/' })

    expect(titleOf(shadowOf(sectionOf(element), 'openish-overview'))).toBe('Shell API')
    expect(textOf(shadowOf(sectionOf(element), 'openish-overview').querySelector('.version'))).toBe('2.3.0')
  })

  it('renders the servers and security schemes', async () => {
    const { element } = await mountReference({ path: '/' })
    const overview = deepQuery(sectionOf(element), 'openish-overview')!

    expect(textOf(overview.shadowRoot!.querySelector('.server'))).toBe('https://api.example.com/v1')
    expect(deepTextOf(overview.shadowRoot!)).toContain('HTTP bearer')
  })

  it('demotes description headings so the page keeps one h1', async () => {
    const { element } = await mountReference({ path: '/' })
    const headings = deepQueryAll(element.shadowRoot!, 'h1')

    /* The document's own `# Getting started` must not become a second h1. */
    expect(headings.map((h) => textOf(h))).toEqual(['Shell API'])
    expect(deepQueryAll(shadowOf(sectionOf(element), 'openish-markdown'), 'h2').map((h) => textOf(h))).toContain(
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

    expect(titleOf(shadowOf(sectionOf(element), 'openish-tag-section'))).toBe('accounts')
    expect(deepTextOf(shadowOf(sectionOf(element), 'openish-tag-section'))).toContain('Everything about accounts')
  })

  it('renders an operation page for an operation URL', async () => {
    const { element } = await mountReference({ path: '/tags/accounts/listAccounts' })
    const operation = deepQuery(sectionOf(element), 'openish-operation')!

    expect(titleOf(operation.shadowRoot!)).toBe('List accounts')
    /* The call itself is the title of the request card now, a column to the right of the prose. */
    expect(textOf(deepQuery(operation.shadowRoot!, '.method'))).toBe('get')
    expect(textOf(deepQuery(operation.shadowRoot!, '.path'))).toBe('/accounts')
    expect(deepTextOf(operation.shadowRoot!)).toContain('Returns every account')
  })

  it('marks a deprecated operation', async () => {
    const { element } = await mountReference({ path: '/tags/administration/purge' })
    const operation = deepQuery(sectionOf(element), 'openish-operation')!

    expect(textOf(operation.shadowRoot!.querySelector('.badge'))).toBe('Deprecated')
  })

  it('renders a model page', async () => {
    const { element } = await mountReference({ path: '/models/Account' })
    const model = deepQuery(sectionOf(element), 'openish-model')!

    expect(titleOf(model.shadowRoot!)).toBe('Account')
    expect(textOf(deepQuery(model.shadowRoot!, 'pre'))).toContain('"balance"')
  })

  it('navigates when a sidebar link is clicked, and updates the URL', async () => {
    const harness = await mountReference({ path: '/' })

    /* A collapsed tag does not render its operations, so open it the way a reader would. */
    await harness.clickLink('/tags/accounts')
    await harness.clickLink('/tags/accounts/listAccounts')

    expect(harness.currentId()).toBe('tags/accounts/listAccounts')
    expect(titleOf(shadowOf(sectionOf(harness), 'openish-operation'))).toBe('List accounts')
  })

  it('restores the previous page on back, and returns on forward', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })

    await harness.clickLink('/tags/accounts/listAccounts')
    expect(titleOf(shadowOf(sectionOf(harness), 'openish-operation'))).toBe('List accounts')

    harness.window.history.back()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(harness.currentId()).toBe('tags/accounts')
    expect(deepQuery(sectionOf(harness), 'openish-tag-section')).not.toBeNull()

    harness.window.history.forward()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(titleOf(shadowOf(sectionOf(harness), 'openish-operation'))).toBe('List accounts')
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
    expect(deepQuery(sectionOf(element), 'openish-operation')).not.toBeNull()
    expect(titleOf(shadowOf(sectionOf(element), 'openish-operation'))).toBe('List accounts')
  })

  it('renders a section header at the bare section URL, which has no tail to match', async () => {
    const { element } = await mountReference({ path: '/models' })

    expect(titleOf(shadowOf(sectionOf(element), 'openish-tag-section'))).toBe('Models')
  })

  /*
   * A header, and not an index of what is under it.
   *
   * On its own page a section listed its children, because that was the only way to reach them.
   * On the plane they follow it down the page, so the list would be the same links twice - and for
   * Models it would be six hundred of them between the reader and the first model. The way in is the
   * navigation, which is what this now uses.
   */
  it('leaves the way into a section to the navigation, rather than listing it twice', async () => {
    const harness = await mountReference({ path: '/models' })

    expect(shadowOf(sectionOf(harness), 'openish-tag-section').querySelector('ul')).toBeNull()

    await harness.clickLink('/models/Account')

    expect(titleOf(shadowOf(sectionOf(harness), 'openish-model'))).toBe('Account')
    expect(harness.currentId()).toBe('models/Account')
  })

  it('renders the webhooks section', async () => {
    const { element } = await mountReference({ path: '/webhooks' })

    expect(titleOf(shadowOf(sectionOf(element), 'openish-tag-section'))).toBe('Webhooks')
  })

  it('honours a basePath in history mode', async () => {
    const { element } = await mountReference({ path: '/docs/tags/accounts', basePath: '/docs', routing: 'history' })

    expect(titleOf(shadowOf(sectionOf(element), 'openish-tag-section'))).toBe('accounts')
    expect(deepQuery(element.shadowRoot!, 'a[href="/docs/tags/accounts/listAccounts"]')).not.toBeNull()
  })

  it('renders the overview at the bare basePath, with no trailing slash', async () => {
    const { element } = await mountReference({ path: '/docs', basePath: '/docs', routing: 'history' })

    expect(deepQuery(sectionOf(element), 'openish-overview')).not.toBeNull()
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
    expect(titleOf(shadowOf(sectionOf(harness), 'openish-operation'))).toBe('List accounts')
  })

  it('renders fragment hrefs, which the browser navigates without interception', async () => {
    const { element } = await mountReference({ path: '/' })

    expect(deepQuery(element.shadowRoot!, 'a[href="#/tags/accounts"]')).not.toBeNull()
  })

  it('follows the fragment when the reader edits it directly', async () => {
    const harness = await mountReference({ path: '/' })
    expect(deepQuery(sectionOf(harness), 'openish-overview')).not.toBeNull()

    harness.window.location.hash = '#/models/Account'
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    expect(titleOf(shadowOf(sectionOf(harness), 'openish-model'))).toBe('Account')
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

    expect(titleOf(shadowOf(sectionOf(harness), 'openish-model'))).toBe('Account')
  })

  it('follows a change to the selected property', async () => {
    const harness = await mountReference({ path: '/', routing: 'none', selected: '' })
    expect(deepQuery(sectionOf(harness), 'openish-overview')).not.toBeNull()

    harness.element.selected = 'tags/accounts'
    await harness.settle()

    expect(titleOf(shadowOf(sectionOf(harness), 'openish-tag-section'))).toBe('accounts')
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

/**
 * The `color-scheme` attribute, honoured wherever the reference is mounted.
 *
 * It used to be a rule in `@openish/theme`, matching `openish-api-reference[color-scheme='dark']` at
 * the document level - which cannot reach an element inside somebody else's shadow root. A host who
 * had wrapped the reference in a component of their own set the attribute, saw the reference keep
 * following the reader's system preference, and got no error to explain it. The rule now lives on
 * the element's own `:host`, which matches in either place.
 *
 * Measured through the used value of `color-scheme` rather than through a colour, because that is
 * the mechanism: one palette, declared once as `light-dark()` pairs, and this property is what picks
 * a half of every one of them.
 */
describe('the colour-scheme attribute', () => {
  const schemeOf = (harness: Harness, element: Element): string =>
    harness.frame.contentWindow!.getComputedStyle(element).colorScheme

  it('is honoured in the light DOM', async () => {
    const harness = await mountReference({ path: '/' })
    harness.element.colorScheme = 'dark'
    await harness.settle()

    expect(schemeOf(harness, harness.element)).toBe('dark')
  })

  /*
   * The case that was broken. Wrapping a component in a component is an ordinary thing for a host to
   * do - this site does it on every page - and nothing about it should change what an attribute means.
   */
  it('is honoured inside another component’s shadow root', async () => {
    const harness = await mountReference({ path: '/' })
    const frameDocument = harness.frame.contentDocument!

    const wrapper = frameDocument.createElement('div')
    const shadow = wrapper.attachShadow({ mode: 'open' })
    frameDocument.body.append(wrapper)

    const inner = frameDocument.createElement('openish-api-reference')
    inner.setAttribute('color-scheme', 'dark')
    shadow.append(inner)
    await (inner as Element & { updateComplete: Promise<unknown> }).updateComplete

    expect(schemeOf(harness, inner)).toBe('dark')

    inner.setAttribute('color-scheme', 'light')
    await (inner as Element & { updateComplete: Promise<unknown> }).updateComplete
    expect(schemeOf(harness, inner)).toBe('light')

    wrapper.remove()
  })

  /* With no attribute the reader decides, which is the default the README argues for. */
  it('leaves the scheme to the reader when nothing is set', async () => {
    const harness = await mountReference({ path: '/' })

    expect(schemeOf(harness, harness.element)).toBe('light dark')
  })
})

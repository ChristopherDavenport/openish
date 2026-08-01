import type { OpenishConfig } from '@openish/core'

import type { OpenishApiReference } from '../src/elements/openish-api-reference.js'
import { loadCode, loadMarkdown } from '../src/render/highlight.js'
import { idFromHash, idFromPathname, type RoutingMode } from '../src/router/urls.js'

/**
 * The reference reads `window.location` and listens for the browser's navigation events, so tests
 * that navigate have to be isolated or they corrupt each other and the test runner's own URL. An
 * iframe gives each test its own `window`, `history`, and document.
 */
export type Harness = {
  frame: HTMLIFrameElement
  window: Window
  element: OpenishApiReference
  /** Navigates by clicking a link, exercising the router's own click interception. */
  clickLink: (href: string) => Promise<void>
  /** Navigates the way a host application would. */
  goto: (path: string) => Promise<void>
  /**
   * The node id the URL currently names, read from whichever half of it this mode uses.
   *
   * Tests assert on this rather than on `location.pathname` so that "did navigating work" stays one
   * question - the URL *shape* is the thing the modes disagree about, and it is asserted on its own
   * in the tests that are about a mode.
   */
  currentId: () => string
  /** The href the reference will have rendered for a page, in this harness's mode. */
  hrefFor: (path: string) => string
  settle: () => Promise<void>
  /**
   * Settles, and waits for every configured document to have loaded.
   *
   * The idle prefetch is what puts the documents the reader has not opened into the search index,
   * and it is scheduled through `requestIdleCallback` - so a test about cross-document search has
   * to wait for something no render signals. This polls the element's own view of what is loaded,
   * which is the same thing search reads.
   */
  settleSources: () => Promise<void>
  dispose: () => void
}

/**
 * How many documents the reference has built stores for.
 *
 * Reaches into the state the root provides as `sourcesContext` rather than asserting on something
 * rendered, because "the prefetch has finished" has no visible consequence of its own - it is what
 * makes the *next* thing (a cross-document search) able to succeed. Reading the same value search
 * reads is the closest a test can get to the actual precondition.
 */
const loadedCount = (element: OpenishApiReference): number =>
  (element as unknown as { sourcesState?: { loaded: ReadonlyMap<string, unknown> } }).sourcesState?.loaded.size ?? 0

const frames: HTMLIFrameElement[] = []

export const disposeAll = (): void => {
  for (const frame of frames.splice(0)) {
    frame.remove()
  }
}

/**
 * Waits for a whole shadow tree to stop updating.
 *
 * One pass is not enough, and the reason is structural: the document arrives from a `Task`, which
 * sets a context value, which schedules an update in every consumer, which renders elements that
 * consume context themselves. Each of those is a separate turn, and a `updateComplete` captured
 * before the value arrived resolves against the render that did not have it. So this settles the
 * tree repeatedly until a full pass changes nothing.
 */
const collectUpdatables = (root: Element | ShadowRoot, found: Element[] = []): Element[] => {
  for (const child of root.querySelectorAll('*')) {
    if ('updateComplete' in child) {
      found.push(child)
    }
    if (child.shadowRoot) {
      collectUpdatables(child.shadowRoot, found)
    }
  }
  return found
}

/**
 * A signature of the whole tree, shadow roots included.
 *
 * The root's own `innerHTML` is not enough: when a nested element renders, the root's markup is
 * unchanged, so a shallow comparison reports "settled" while the page is still filling in.
 */
const deepSignature = (root: Element | ShadowRoot): string => {
  let signature = 'innerHTML' in root ? root.innerHTML : ''
  for (const child of root.querySelectorAll('*')) {
    if (child.shadowRoot) {
      signature += deepSignature(child.shadowRoot)
    }
  }
  return signature
}

const settleTree = async (element: Element, rounds = 8): Promise<void> => {
  /*
   * The markdown and highlight pipelines are loaded on demand, so an element that renders prose
   * renders nothing on its first pass and fills in when the import resolves. A settle loop that only
   * watched the DOM could return in between, which is a race that fails one test in twenty rather
   * than reliably - so the load is awaited up front and the rest of the loop stays about rendering.
   */
  await Promise.all([loadMarkdown(), loadCode()])

  for (let round = 0; round < rounds; round += 1) {
    const before = element.shadowRoot ? deepSignature(element.shadowRoot) : ''

    const updatable = element as Element & { updateComplete?: Promise<unknown> }
    await updatable.updateComplete
    await Promise.all(
      collectUpdatables(element.shadowRoot ?? element).map(
        (child) => (child as Element & { updateComplete?: Promise<unknown> }).updateComplete,
      ),
    )
    /*
     * Two frames, not a zero timeout.
     *
     * The sidebar is virtualised, and a virtualiser cannot render until it has been *measured*: it
     * waits for a `ResizeObserver` callback, which the browser delivers on a frame boundary and
     * never inside a microtask. A settle loop that only drained promises saw an empty list twice
     * running and concluded the tree had settled - which it had, at zero rows.
     */
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const after = element.shadowRoot ? deepSignature(element.shadowRoot) : ''
    if (before === after && round > 0) {
      return
    }
  }
}

/**
 * The URL a mode has to be at for the reference to resolve `path`.
 *
 * `history` is the literal path. The fragment modes carry the node id instead, so the base prefix
 * comes off and what is left goes after the `#` - which is also the difference the modes exist over,
 * stated once here rather than in eighty call sites.
 */
const locationFor = (routing: RoutingMode, path: string, basePath: string): string => {
  if (routing === 'history') {
    return path
  }

  const id = idIn(path, basePath)
  return id === '' ? '/' : `/#/${id}`
}

/** The node id a test's path names, whichever half of the URL it wrote it in. */
const idIn = (path: string, basePath: string): string => {
  const [pathname = '', fragment] = path.split('#')
  return idFromPathname(pathname, basePath) || (fragment ?? '')
}

/** The href the reference will have rendered for a page, in the mode under test. */
const hrefInMode = (routing: RoutingMode, path: string, basePath: string): string =>
  routing === 'history' ? path : `#/${idIn(path, basePath)}`

export const mountReference = async (
  attributes: Partial<{
    /**
     * Where the reference should think it is, written as a path.
     *
     * Translated to whatever the routing mode actually reads, so a test says which *page* it is on
     * rather than which URL shape that mode spells it with - `/tags/accounts` is the same intent in
     * every mode, and only `routing: 'history'` tests should care that it is a real path there.
     */
    path: string
    basePath: string
    routing: RoutingMode
    layout: 'modern' | 'classic'
    selected: string
    config: OpenishConfig
    /** A document other than the shell fixture. */
    spec: unknown
    /**
     * Several documents, with a picker. Takes precedence over `spec` and `url`.
     *
     * Each entry's `content` is serialised on the way in for the same realm reason `spec` is - see
     * the note below - so a test writes plain fixture objects here.
     */
    sources: Array<import('@openish/core').SourceConfig>
    /**
     * Runs in the frame after it loads and before the reference is appended.
     *
     * The only point at which a `fetch` stub can be installed and be certain of catching the first
     * request an element makes - discovery happens on the auth form's first render, and a stub
     * installed after that arrives too late to matter.
     */
    beforeMount: (frameWindow: Window) => void
    /** Load from a URL instead of the inline fixture, to exercise the failure path. */
    url: string
    /** Credentials a host already holds, applied before the first render. */
    credentials: Record<string, string>
    /** Where the host keeps credentials between page loads, if anywhere. */
    credentialStore: import('@openish/client').CredentialStore
    /** A query string for the frame's URL, e.g. `?api=ledger`. */
    search: string
  }> = {},
): Promise<Harness> => {
  const frame = document.createElement('iframe')
  frame.style.width = '1024px'
  frame.style.height = '768px'
  /*
   * A real served document, not `about:blank` or `srcdoc`: `history.pushState` refuses to set an
   * http URL on a document whose own URL is not one, and both of those fail that test.
   */
  frame.src = new URL('./frame.html', import.meta.url).href
  document.body.append(frame)
  frames.push(frame)

  await new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
  })

  const frameWindow = frame.contentWindow!
  const frameDocument = frame.contentDocument!

  const location = locationFor(attributes.routing ?? 'hash', attributes.path ?? '/', attributes.basePath ?? '')
  /* The query goes before the fragment, which is where a real URL carries it. */
  const [beforeHash = '', fragment] = location.split('#')
  frameWindow.history.replaceState(
    {},
    '',
    attributes.search ? `${beforeHash}${attributes.search}${fragment ? `#${fragment}` : ''}` : location,
  )

  /* frame.html imports the elements into its own realm; wait for that module to have run. */
  await frameWindow.customElements.whenDefined('openish-api-reference')

  attributes.beforeMount?.(frameWindow)

  const element = frameDocument.createElement('openish-api-reference') as OpenishApiReference
  if (attributes.sources !== undefined) {
    element.sources = attributes.sources.map((source) =>
      source.content !== undefined && typeof source.content !== 'string'
        ? { ...source, content: JSON.stringify(source.content) }
        : source,
    )
  } else if (attributes.url === undefined) {
    const { SHELL_SPEC } = await import('./fixtures.js')
    const spec = attributes.spec ?? SHELL_SPEC
    /*
     * Handed over as JSON, not as the object.
     *
     * The fixture is built in the test's realm and the reference runs in the iframe's, and
     * `@scalar/helpers`' `isObject` - which the magic proxy gates on - tests
     * `Object.getPrototypeOf(value) === Object.prototype`. That is false for every object built in
     * another realm, so an object passed across this boundary is never proxied and no `$ref`
     * resolves. Serialising makes the iframe parse its own objects, which is also what a fetched
     * document does.
     */
    element.spec = JSON.stringify(spec)
  } else {
    element.url = attributes.url
  }
  if (attributes.basePath !== undefined) {
    element.basePath = attributes.basePath
  }
  if (attributes.routing !== undefined) {
    element.routing = attributes.routing
  }
  if (attributes.layout !== undefined) {
    element.layout = attributes.layout
  }
  if (attributes.selected !== undefined) {
    element.selected = attributes.selected
  }
  if (attributes.config !== undefined) {
    element.config = attributes.config
  }
  if (attributes.credentials !== undefined) {
    element.credentials = attributes.credentials
  }
  if (attributes.credentialStore !== undefined) {
    element.credentialStore = attributes.credentialStore
  }
  frameDocument.body.append(element)

  const settle = () => settleTree(element)

  const settleSources = async () => {
    const total = (attributes.sources ?? []).length || 1
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await settle()
      if (loadedCount(element) >= total) {
        return
      }
      await new Promise((resolve) => frameWindow.setTimeout(resolve, 16))
    }
    await settle()
  }

  await settle()

  return {
    settleSources,
    frame,
    window: frameWindow,
    element,
    settle,
    clickLink: async (href: string) => {
      /* Tests name the page; the mode decides how that page is spelled as an href. */
      const wanted = hrefInMode(attributes.routing ?? 'hash', href, attributes.basePath ?? '')
      const link = deepQuery<HTMLAnchorElement>(element.shadowRoot!, `a[href="${wanted}"]`)
      if (!link) {
        throw new Error(`No link with href "${wanted}". Found: ${listHrefs(element).join(', ')}`)
      }
      link.click()
      await settle()
    },
    goto: async (path: string) => {
      const target = locationFor(attributes.routing ?? 'hash', path, attributes.basePath ?? '')
      frameWindow.history.pushState({}, '', target)
      /*
       * `pushState` announces nothing, and in the fragment modes it does not fire `hashchange`
       * either - so the signal the mode actually listens for has to be made by hand. Both are the
       * browser's own events, which is what `LocationController` subscribes to.
       */
      frameWindow.dispatchEvent(new PopStateEvent('popstate'))
      frameWindow.dispatchEvent(new HashChangeEvent('hashchange'))
      await settle()
    },
    currentId: () =>
      (attributes.routing ?? 'hash') === 'history'
        ? idFromPathname(frameWindow.location.pathname, attributes.basePath ?? '')
        : idFromHash(frameWindow.location.hash),
    hrefFor: (path: string) => hrefInMode(attributes.routing ?? 'hash', path, attributes.basePath ?? ''),
    dispose: () => frame.remove(),
  }
}

/** Every href the reference currently renders, for readable failure messages. */
export const listHrefs = (element: Element): string[] =>
  deepQueryAll<HTMLAnchorElement>(element.shadowRoot!, 'a[href]').map((a) => a.getAttribute('href')!)

/** Deep query across shadow roots, since the tree is several elements down. */
export const deepQuery = <T extends Element>(root: Element | ShadowRoot, selector: string): T | null => {
  const direct = root.querySelector<T>(selector)
  if (direct) {
    return direct
  }
  for (const child of root.querySelectorAll('*')) {
    if (child.shadowRoot) {
      const found = deepQuery<T>(child.shadowRoot, selector)
      if (found) {
        return found
      }
    }
  }
  return null
}

export const deepQueryAll = <T extends Element>(root: Element | ShadowRoot, selector: string): T[] => {
  const results: T[] = [...root.querySelectorAll<T>(selector)]
  for (const child of root.querySelectorAll('*')) {
    if (child.shadowRoot) {
      results.push(...deepQueryAll<T>(child.shadowRoot, selector))
    }
  }
  return results
}

/**
 * The shadow root of the first matching element.
 *
 * Needed because a descendant selector cannot cross a shadow boundary: `openish-overview h1` matches
 * nothing, however deep the search, since the `h1` has no `openish-overview` ancestor inside the
 * shadow tree it lives in.
 */
export const shadowOf = (root: Element | ShadowRoot, selector: string): ShadowRoot => {
  const host = deepQuery(root, selector)
  if (!host?.shadowRoot) {
    throw new Error(`No element matching "${selector}" with a shadow root.`)
  }
  return host.shadowRoot
}

/**
 * The property rows one `<openish-schema>` renders itself.
 *
 * Rows of a nested schema live in that element's own shadow root, so this returns exactly one
 * level - which is what a test about a recursive renderer wants to assert on.
 */
export const schemaRows = (
  schema: Element | null,
): Array<{ name: string; type: string; required: string }> => {
  if (!schema?.shadowRoot) {
    throw new Error('Not an <openish-schema> with a shadow root.')
  }

  return [...schema.shadowRoot.querySelectorAll('ul > li > .head')].map((head) => ({
    name: textOf(head.querySelector('.name')),
    type: textOf(head.querySelector('.type')),
    required: textOf(head.querySelector('.required, .optional')),
  }))
}

/** The nested `<openish-schema>` a named property row renders, or null for a leaf. */
export const schemaFor = (schema: Element | null, name: string): Element | null => {
  if (!schema?.shadowRoot) {
    throw new Error('Not an <openish-schema> with a shadow root.')
  }

  for (const row of schema.shadowRoot.querySelectorAll('ul > li')) {
    if (textOf(row.querySelector('.name')) === name) {
      return row.querySelector('openish-schema')
    }
  }
  return null
}

export const textOf = (element: Element | ShadowRoot | null): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim()

/**
 * Visible text including nested shadow roots.
 *
 * `textContent` stops at a shadow boundary, so an operation's description - which lives inside an
 * `<openish-markdown>` shadow root - is invisible to it.
 */
export const deepTextOf = (root: Element | ShadowRoot | null): string => {
  if (!root) {
    return ''
  }
  let text = 'textContent' in root ? (root.textContent ?? '') : ''
  for (const child of root.querySelectorAll('*')) {
    if (child.shadowRoot) {
      text += ' ' + deepTextOf(child.shadowRoot)
    }
  }
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Opens the try-it client the way a reader does, and returns the panel.
 *
 * Everything a reader fills in lives behind one button now, so a test that wants a field has to
 * press it first - and pressing the real button rather than setting `open` means every test that
 * needs the panel also proves the button opens it.
 */
export const openTryIt = async (harness: Harness): Promise<Element> => {
  const panel = deepQuery(harness.element.shadowRoot!, 'openish-try-it')
  if (!panel?.shadowRoot) {
    throw new Error('No try-it panel on the page.')
  }

  panel.shadowRoot.querySelector<HTMLButtonElement>('button.test')!.click()
  await harness.settle()
  return panel
}

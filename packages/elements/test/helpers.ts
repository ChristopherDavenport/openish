import type { OpenishConfig } from '@openish/core'

import { virtualizerRef, type VirtualizerHostElement } from '@lit-labs/virtualizer/virtualize.js'

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

/**
 * How many consecutive unchanged passes count as settled.
 *
 * One is not enough, and the reason is load rather than logic. A pass ends on a frame boundary, and
 * when several test files run at once their pages compete for frames - so an update can be queued,
 * measured and not yet painted across a whole pass, leaving the signature identical for a beat in
 * the middle of the work. One stable pass then reads as "finished" and the assertions run against a
 * half-built tree, which is why a full run failed a different dozen tests every time while every
 * file passed on its own.
 *
 * Three was measured, not guessed. At one, a full run failed twelve to twenty-four assertions and a
 * different set each time; at two it was down to roughly one in four runs; at three, five
 * consecutive full runs were clean. The cost is two extra frame pairs on the settled path, which is
 * about three seconds across the suite - cheap next to a suite nobody can trust.
 */
const STABLE_PASSES = 3

/** The virtualiser's own "I have stopped moving", if there is a plane on the page yet. */
const planeLayoutComplete = async (element: Element): Promise<void> => {
  const plane = element.shadowRoot?.querySelector('.content') as VirtualizerHostElement | null
  await plane?.[virtualizerRef]?.layoutComplete.catch(() => undefined)
}

/**
 * Waits for the plane to stop scrolling itself.
 *
 * A deep link is not one scroll. The reference jumps to an estimated position and then corrects,
 * frame by frame, as the sections above the target are measured for the first time - so `settle`,
 * which watches the *markup*, can return in the middle of that with the right section found and the
 * wrong one under it. Watching the scroller instead is the only thing that describes the whole of it.
 */
const planeQuiet = async (element: Element, frames = 60): Promise<void> => {
  const main = element.shadowRoot?.querySelector('main')
  if (!main) {
    return
  }

  /*
   * Six still frames, not one or two.
   *
   * "Has not started yet" and "has finished" look identical from here: a reference that has just
   * been handed a new fragment is still at the top with a scroll queued behind a resolved promise
   * and a frame, and one still reading of `scrollTop` calls that settled. Six is longer than the gap
   * between the scroll being asked for and the first correction landing, and short enough that a
   * page which really is not moving costs a tenth of a second.
   */
  let last = -1
  let still = 0
  for (let frame = 0; frame < frames && still < 6; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    still = main.scrollTop === last ? still + 1 : 0
    last = main.scrollTop
  }
}

const settleTree = async (element: Element, rounds = 12): Promise<void> => {
  /*
   * The markdown and highlight pipelines are loaded on demand, so an element that renders prose
   * renders nothing on its first pass and fills in when the import resolves. A settle loop that only
   * watched the DOM could return in between, which is a race that fails one test in twenty rather
   * than reliably - so the load is awaited up front and the rest of the loop stays about rendering.
   */
  await Promise.all([loadMarkdown(), loadCode()])

  let stable = 0

  for (let round = 0; round < rounds; round += 1) {
    const before = element.shadowRoot ? deepSignature(element.shadowRoot) : ''

    const updatable = element as Element & { updateComplete?: Promise<unknown> }
    await updatable.updateComplete
    /*
     * The plane measures its children and reflows, which is a frame away and never a microtask - so
     * a loop that only drained promises could return with the rendered window still moving. This is
     * the signal the virtualiser publishes for exactly that, and folding it in here rather than into
     * a second helper means every existing test gets it without saying so.
     */
    await planeLayoutComplete(element)
    await planeQuiet(element)
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
    stable = before === after ? stable + 1 : 0
    if (stable >= STABLE_PASSES && round > 0) {
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
   * Pinned to the viewport, because a frame that is off it does not get animation frames.
   *
   * Browsers throttle `requestAnimationFrame` for content that is not being rendered, and a suite
   * appends a frame per test into one long page - so the second one down is offscreen and its rAF
   * callbacks stop, while its timers keep running. Everything openish does on frames stops with it:
   * the convergence loop that corrects a jump sat frozen fourteen hundred pixels short of the
   * section it was asked for, in one full-suite run out of three, and never in a run of the file on
   * its own. Nothing was wrong with the plane - it was not being given a chance to move.
   */
  frame.style.position = 'fixed'
  frame.style.top = '0'
  frame.style.left = '0'
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

/**
 * Waits for a section to arrive where it was asked to be, or for the plane to stop moving.
 *
 * A jump into a document the virtualiser has not measured is *corrected* over several frames - the
 * sections above the target mount, turn out to be a different height than the estimate, and the
 * target slides. `SectionsController` is built around exactly that; what it does not do is finish
 * inside the single render `settle` waits for.
 *
 * Three things are deliberate, and each of them is a run that failed. It watches **the section**
 * rather than the scroller, because a correction that has not happened yet and one that has just
 * happened leave `scrollTop` identical between samples. It waits on `setTimeout` rather than
 * `requestAnimationFrame`, because frames are what the loop it is waiting for needs: on a machine
 * running all three projects at once they arrive in bursts, and a waiter built on the same starved
 * clock declares a plane settled that has not started moving. And when a caller says how close is
 * close enough, arriving ends the wait - so a slow correction costs the time it takes rather than a
 * failure, while a plane that lands somewhere else still fails, at the cap.
 */
export const settleScroll = async (harness: Harness, id?: string, within?: number): Promise<void> => {
  /*
   * Five seconds, which is a long time and still comfortably inside the runner's own timeout - a
   * wait that outlives the test reports as a timeout rather than as the thing it was waiting for.
   */
  const capMs = 5000
  const tick = () => new Promise((resolve) => setTimeout(resolve, 50))
  const position = (): number => {
    const scroller = harness.element.shadowRoot!.querySelector('main')
    const section = id
      ? harness.element.shadowRoot!.querySelector(`.section[data-id$="${id}"]`)
      : harness.element.shadowRoot!.querySelector('.section')
    if (!scroller || !section) {
      return Number.NaN
    }
    return Math.round(section.getBoundingClientRect().top - scroller.getBoundingClientRect().top)
  }

  let last = Number.NaN
  let stable = 0
  for (let waited = 0; waited < capMs; waited += 50) {
    await tick()
    const now = position()

    /* Arrived is arrived: no reason to keep watching a plane that is already where it was asked. */
    if (within !== undefined && Math.abs(now) <= within) {
      break
    }

    stable = now === last ? stable + 1 : 0
    last = now
    if (within === undefined && stable >= 10) {
      break
    }
  }

  await harness.settle()
}

/**
 * The subtree one section of the document lives in.
 *
 * Every assertion about *page content* goes through this rather than reaching into the root's shadow
 * root, and the reason is that the root is about to hold more than one page at a time. A bare
 * `deepQuery(element.shadowRoot!, 'openish-operation')` then returns whichever operation happens to
 * be first in the rendered window - which is not an error, it is worse: the test goes on passing
 * while asserting about the wrong operation.
 *
 * Root-level things - the sidebar, the search dialog, the document picker, `main` - are not sections
 * and keep reaching for the root directly.
 *
 * Takes the harness or the element, because tests hold whichever of the two they needed.
 */
export const sectionOf = (target: Harness | OpenishApiReference, id?: string): Element | ShadowRoot => {
  const root = ('element' in target ? target.element : target).shadowRoot!
  const wanted = id ?? activeSectionId(target)

  /*
   * Ids carry the document's slug and a test names a page the way the URL does, so an exact match is
   * tried first and a suffix match second - which is the same two spellings `stripFirstSegment` and
   * `applySlugPrefix` exist to move between.
   */
  const section = wanted
    ? (root.querySelector(`.section[data-id="${wanted}"]`) ??
       root.querySelector(`.section[data-id$="/${wanted}"]`))
    : /* The root URL names no section, and the front of the document is always the first one. */
      root.querySelector('.section')

  if (!section) {
    const rendered = [...root.querySelectorAll('.section')].map((one) => one.getAttribute('data-id'))
    throw new Error(`No section "${wanted}" on the plane. Rendered: ${rendered.join(', ') || '(none)'}`)
  }
  return section
}

/** The id of the section the reference currently says the reader is at, as the URL spells it. */
export const activeSectionId = (target: Harness | OpenishApiReference): string => {
  const element = 'element' in target ? target.element : target
  const ui = (element as unknown as { ui?: { activeId?: string; slugPrefix?: string } }).ui
  const id = ui?.activeId ?? ''
  return ui?.slugPrefix ? id.slice(ui.slugPrefix.length + 1) : id
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
    /*
     * What was searched, not just what was wanted.
     *
     * `sectionOf` resolves "wherever the reader is", so a plane that has not finished arriving hands
     * this the wrong section - and "no openish-model" then describes a correct element missing from
     * a page that was never asked for. Naming the subtree and its contents is the difference between
     * that failure taking three runs to place and taking one.
     */
    const where =
      'tagName' in root ? `<${root.tagName.toLowerCase()} data-id="${root.getAttribute('data-id')}">` : 'shadow root'
    const inside = [...root.querySelectorAll('*')].slice(0, 8).map((one) => one.tagName.toLowerCase())
    const found = host ? ' (found the element, but it has no shadow root)' : ''
    throw new Error(
      `No element matching "${selector}" with a shadow root${found}. ` +
        `Searched ${where}, which holds: ${inside.join(', ') || '(nothing)'}`,
    )
  }
  return host.shadowRoot
}

/** One row of a field list: what it is called, where it travels, its shape, and whether it is required. */
export type FieldRowText = { name: string; where: string; type: string; required: string }

/**
 * The requirement slot, whichever of the two words is in it.
 *
 * One reader for both, because they are one slot: a parameter row prints `required` or `optional`
 * and a body property prints `required` or nothing, and a test that asked only about `.required`
 * would read a row saying `optional` as a row saying nothing.
 */
const requirementOf = (head: Element): string => textOf(head.querySelector('.required, .optional'))

/**
 * The field rows in one root.
 *
 * One root, not the whole page: `<openish-parameters>` and the promoted request body beside it are
 * two elements, and a nested schema is a third - so a caller asking about a level asks the element
 * that draws it. `deepFieldRows` is the one that reads across the seam.
 *
 * `required` is whichever word is in the requirement slot. A parameter row says `required` or
 * `optional`, because a short checklist should not answer one of its questions with a blank; a body
 * property says `required` or nothing, because a twenty-field object would otherwise carry eighteen
 * lines of muted noise.
 */
export const fieldRows = (root: Element | ShadowRoot | null): FieldRowText[] => {
  if (!root) {
    throw new Error('No root to read field rows from.')
  }

  return [...root.querySelectorAll('ul.fields > li.field > .head')].map((head) => ({
    name: textOf(head.querySelector('.name')),
    where: textOf(head.querySelector('.badge[data-where]')),
    type: textOf(head.querySelector('.type')),
    required: requirementOf(head),
  }))
}

/**
 * Every field row under `root`, across shadow boundaries, in document order.
 *
 * This is what proves the promotion: over an operation's parameters section it returns the path,
 * query and header rows followed by the body's, as one sequence - which is the claim the design is
 * actually making, and which no single-root reader can see.
 */
export const deepFieldRows = (root: Element | ShadowRoot): FieldRowText[] =>
  deepQueryAll(root, 'ul.fields > li.field > .head').map((head) => ({
    name: textOf(head.querySelector('.name')),
    where: textOf(head.querySelector('.badge[data-where]')),
    type: textOf(head.querySelector('.type')),
    required: requirementOf(head),
  }))

/**
 * The property rows one `<openish-schema>` renders itself.
 *
 * Rows of a nested schema live in that element's own shadow root, so this returns exactly one
 * level - which is what a test about a recursive renderer wants to assert on. The chip is dropped
 * because only a top-level list wears one; `fieldRows` is the reader that keeps it.
 */
export const schemaRows = (
  schema: Element | null,
): Array<{ name: string; type: string; required: string }> => {
  if (!schema?.shadowRoot) {
    throw new Error('Not an <openish-schema> with a shadow root.')
  }

  return fieldRows(schema.shadowRoot).map(({ name, type, required }) => ({ name, type, required }))
}

/**
 * The content-type select on a `Body` or `Returns` heading, and picking one from it.
 *
 * `<openish-operation>` owns both, because the answer decides what several blocks below it show -
 * the schema, the example, and the `Accept` in the sample. `kind` is `request` or `response`.
 */
export const contentTypePicker = (harness: Harness, kind: 'request' | 'response'): HTMLSelectElement => {
  const operation = shadowOf(sectionOf(harness), 'openish-operation')
  const select = operation.querySelector<HTMLSelectElement>(`select#${kind}-content-type`)
  if (!select) {
    throw new Error(`No ${kind} content-type picker on this operation.`)
  }
  return select
}

export const pickContentType = async (
  harness: Harness,
  kind: 'request' | 'response',
  mediaType: string,
): Promise<void> => {
  const select = contentTypePicker(harness, kind)
  select.value = mediaType
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await harness.settle()
}

/**
 * The status rows of a documentation-column `<openish-response-list>`.
 *
 * `open` is what the accordion is showing, which is a different question from "which status is
 * selected" - the documentation column has no selection, and that is the point of the arrangement.
 * A row with nothing under it has no disclosure at all and reports `open: false`.
 */
export const statusRows = (
  responses: Element | ShadowRoot,
): Array<{ status: string; description: string; open: boolean }> =>
  [...responses.querySelectorAll('ul.statuses > li')].map((row) => {
    const disclosure = row.querySelector('openish-disclosure')
    return disclosure
      ? {
          status: disclosure.getAttribute('summary') ?? '',
          description: disclosure.getAttribute('hint') ?? '',
          open: disclosure.hasAttribute('open'),
        }
      : {
          status: textOf(row.querySelector('.status')),
          description: textOf(row.querySelector('.terse-description')),
          open: false,
        }
  })

/** Presses the row that opens one status, the way a reader does. */
export const openStatus = async (
  harness: Harness,
  responses: Element | ShadowRoot,
  status: string,
): Promise<void> => {
  const disclosure = [...responses.querySelectorAll('ul.statuses > li openish-disclosure')].find(
    (one) => one.getAttribute('summary') === status,
  )
  if (!disclosure) {
    throw new Error(`No status row for "${status}" with anything to open.`)
  }
  disclosure.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click()
  await harness.settle()
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

/**
 * The title a section rendered, whatever level the document put it at.
 *
 * A page used to be the page, so its title was an `h1` and a test could say so. On the plane the
 * level says where the section sits - a tag is a level two, the operations under it are level
 * threes - and a test asserting *which page rendered* has no business also asserting how deep in
 * the document it is. The tests that are about heading structure say `h1` and mean it.
 */
export const titleOf = (root: Element | ShadowRoot | null): string =>
  textOf(root?.querySelector('h1, h2, h3, h4, h5, h6') ?? null)

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
export const openTryIt = async (harness: Harness, id?: string): Promise<Element> => {
  /* The section the reader is on, not the first panel on the plane - there are many now. */
  const panel = deepQuery(sectionOf(harness, id), 'openish-try-it')
  if (!panel?.shadowRoot) {
    throw new Error('No try-it panel on the page.')
  }

  panel.shadowRoot.querySelector<HTMLButtonElement>('button.run')!.click()
  await harness.settle()
  return panel
}

import type { OpenishConfig } from '@openish/core'

import type { OpenishApiReference } from '../src/elements/openish-api-reference.js'

/**
 * `Router` installs listeners on `window` and reads `location.pathname`, so tests that navigate have
 * to be isolated or they corrupt each other and the test runner's own URL. An iframe gives each test
 * its own `window`, `history`, and document.
 */
export type Harness = {
  frame: HTMLIFrameElement
  window: Window
  element: OpenishApiReference
  /** Navigates by clicking a link, exercising the router's own click interception. */
  clickLink: (href: string) => Promise<void>
  /** Navigates the way a host application would. */
  goto: (path: string) => Promise<void>
  settle: () => Promise<void>
  dispose: () => void
}

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
  for (let round = 0; round < rounds; round += 1) {
    const before = element.shadowRoot ? deepSignature(element.shadowRoot) : ''

    const updatable = element as Element & { updateComplete?: Promise<unknown> }
    await updatable.updateComplete
    await Promise.all(
      collectUpdatables(element.shadowRoot ?? element).map(
        (child) => (child as Element & { updateComplete?: Promise<unknown> }).updateComplete,
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    const after = element.shadowRoot ? deepSignature(element.shadowRoot) : ''
    if (before === after && round > 0) {
      return
    }
  }
}

export const mountReference = async (
  attributes: Partial<{
    path: string
    basePath: string
    routing: 'history' | 'none'
    layout: 'modern' | 'classic'
    selected: string
    config: OpenishConfig
    /** A document other than the shell fixture. */
    spec: unknown
    /** Load from a URL instead of the inline fixture, to exercise the failure path. */
    url: string
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

  frameWindow.history.replaceState({}, '', attributes.path ?? '/')

  /* frame.html imports the elements into its own realm; wait for that module to have run. */
  await frameWindow.customElements.whenDefined('openish-api-reference')

  const element = frameDocument.createElement('openish-api-reference') as OpenishApiReference
  if (attributes.url === undefined) {
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
  frameDocument.body.append(element)

  const settle = () => settleTree(element)

  await settle()

  return {
    frame,
    window: frameWindow,
    element,
    settle,
    clickLink: async (href: string) => {
      const link = deepQuery<HTMLAnchorElement>(element.shadowRoot!, `a[href="${href}"]`)
      if (!link) {
        throw new Error(`No link with href "${href}". Found: ${listHrefs(element).join(', ')}`)
      }
      link.click()
      await settle()
    },
    goto: async (path: string) => {
      frameWindow.history.pushState({}, '', path)
      frameWindow.dispatchEvent(new PopStateEvent('popstate'))
      await settle()
    },
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

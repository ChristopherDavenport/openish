import { Router } from '@lit-labs/router'
import { LitElement, html, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import '../src/components/site-demo-scope.js'

/**
 * An anchor one shadow root deeper than the wrapper, the way a reference's sidebar link is.
 *
 * The whole question is whether `stopPropagation` on the wrapper reaches a click that began inside
 * a nested shadow tree, so a test with the anchor in light DOM would prove nothing worth knowing.
 */
@customElement('fence-link')
class FenceLink extends LitElement {
  override render(): TemplateResult {
    return html`
      <a id="fragment" href="#/tags/planets">A section of the document</a>
      <a id="page" href="/openish/start">A page of the site</a>
    `
  }
}

/** A host with a real root `Router`, so the thing being defended against is the actual thing. */
@customElement('fence-host')
class FenceHost extends LitElement {
  readonly router = new Router(this, [{ path: '/*', render: () => html`<span>routed</span>` }])

  override render(): TemplateResult {
    return html`
      <site-demo-scope>
        <fence-link></fence-link>
      </site-demo-scope>
      ${this.router.outlet()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fence-link': FenceLink
    'fence-host': FenceHost
  }
}

const anchorIn = (host: FenceHost, id: string): HTMLAnchorElement => {
  const link = host.shadowRoot?.querySelector('fence-link')
  const anchor = link?.shadowRoot?.querySelector<HTMLAnchorElement>(`#${id}`)
  if (!anchor) {
    throw new Error(`no #${id} anchor`)
  }
  return anchor
}

describe('the fragment-click fence', () => {
  let host: FenceHost
  let reachedWindow: MouseEvent[]
  let hashChanges: number
  let startingHash: string

  const onWindowClick = (event: Event): void => {
    reachedWindow.push(event as MouseEvent)
  }
  const onHashChange = (): void => {
    hashChanges += 1
  }

  beforeEach(async () => {
    startingHash = window.location.hash
    reachedWindow = []
    hashChanges = 0
    host = document.createElement('fence-host')
    document.body.append(host)
    await host.updateComplete
    await host.shadowRoot?.querySelector('fence-link')?.updateComplete
    window.addEventListener('click', onWindowClick)
    window.addEventListener('hashchange', onHashChange)
  })

  afterEach(() => {
    window.removeEventListener('click', onWindowClick)
    window.removeEventListener('hashchange', onHashChange)
    host.remove()
    /* The Router installed listeners on `window`; removing the host is what takes them off again. */
    history.replaceState({}, '', `${window.location.pathname}${window.location.search}${startingHash}`)
  })

  /*
   * The failure this exists for. Without the fence the router calls `preventDefault`, writes the
   * fragment with `pushState`, and fires no `hashchange` - so the address bar is right, the
   * reference has not moved, and nothing is logged anywhere.
   */
  it('lets a fragment click reach the browser instead of the router', async () => {
    const anchor = anchorIn(host, 'fragment')
    anchor.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(reachedWindow, 'the click reached the window listener').toHaveLength(0)
    expect(window.location.hash).toBe('#/tags/planets')
    expect(hashChanges, 'no hashchange fired, so the reference never hears about it').toBe(1)
  })

  it('does not preventDefault a fragment click', () => {
    const anchor = anchorIn(host, 'fragment')
    const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true })
    anchor.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  /*
   * The other direction, and the reason the fence tests the href rather than comparing against
   * `location`: a link out of the demo is the site's to route, and swallowing it would break the
   * navigation on every page that embeds a reference.
   */
  it('lets a site link through to the router', () => {
    const anchor = anchorIn(host, 'page')
    const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true })
    anchor.dispatchEvent(event)

    expect(reachedWindow, 'the router never saw the site link').toHaveLength(1)
    expect(event.defaultPrevented, 'the router did not claim the site link').toBe(true)
  })

  /* A modified click is the reader asking for a new tab, and is nobody's to intercept. */
  it('leaves a modified fragment click alone', () => {
    const anchor = anchorIn(host, 'fragment')
    const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, metaKey: true })
    anchor.dispatchEvent(event)

    expect(reachedWindow).toHaveLength(1)
  })
})

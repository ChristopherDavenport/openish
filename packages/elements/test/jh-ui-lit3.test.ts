import { describe, expect, it } from 'vitest'

import '@jack-henry/jh-ui/components/button/button.js'
import '@jack-henry/jh-ui/components/tag/tag.js'
import '@jack-henry/jh-ui/components/list-group/list-group.js'
import '@jack-henry/jh-ui/components/list-item/list-item.js'

/**
 * `@jack-henry/jh-ui@1.15.5` declares `lit: 2.1.1` as a hard dependency. The root
 * `overrides: { lit: ^3.3.3 }` forces it onto Lit 3 so the app ships one copy of Lit instead of two.
 *
 * jh-ui is published as compiled JS importing `lit`, so a Lit 3 incompatibility would not surface at
 * install or typecheck - it would surface as an element that upgrades but renders nothing. This test
 * is the tripwire for that: if it fails, drop the override and accept two Lit copies (custom
 * elements are independent; the cost is bundle size and a dev-mode warning).
 */
const TAGS = ['jh-button', 'jh-tag', 'jh-list-group', 'jh-list-item'] as const

const mount = async (html: string) => {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)

  await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)))
  await Promise.all(
    [...host.querySelectorAll('*')].map((element) =>
      'updateComplete' in element ? (element as unknown as { updateComplete: Promise<unknown> }).updateComplete : null,
    ),
  )

  return host
}

describe('jh-ui under the Lit 3 override', () => {
  it('resolves a single copy of Lit', async () => {
    const lit = await import('lit')
    const jhButtonModule = await import('@jack-henry/jh-ui/components/button/button.js')
    const JhButton = customElements.get('jh-button')

    expect(jhButtonModule).toBeDefined()
    expect(JhButton).toBeDefined()
    /* If two Lit copies were loaded, jh-button's base class would come from a different LitElement. */
    expect(Object.create(JhButton!.prototype)).toBeInstanceOf(lit.LitElement)
  })

  it('upgrades every element and renders shadow content', async () => {
    const host = await mount(`
      <jh-button appearance="primary" label="Primary"></jh-button>
      <jh-tag label="GET"></jh-tag>
      <jh-list-group>
        <jh-list-item label="Item"></jh-list-item>
      </jh-list-group>
    `)

    for (const tag of TAGS) {
      const element = host.querySelector(tag)
      expect(element, `${tag} is missing from the DOM`).not.toBeNull()
      expect(element!.shadowRoot, `${tag} never upgraded - no shadow root`).not.toBeNull()
      expect(element!.shadowRoot!.childElementCount, `${tag} rendered an empty shadow root`).toBeGreaterThan(0)
    }
  })

  it('reflects a property change back into the shadow DOM', async () => {
    const host = await mount('<jh-button appearance="primary" label="Before"></jh-button>')
    const button = host.querySelector('jh-button') as HTMLElement & {
      label: string
      updateComplete: Promise<unknown>
    }

    expect(button.shadowRoot!.textContent).toContain('Before')

    button.label = 'After'
    await button.updateComplete

    expect(button.shadowRoot!.textContent).toContain('After')
  })
})

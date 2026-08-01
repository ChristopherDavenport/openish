import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, disposeAll, mountReference, type Harness } from './helpers.js'

afterEach(() => {
  disposeAll()
})

/**
 * The public extension surface: CSS parts, and slots a host can put its own markup into.
 *
 * Both are asserted the way a consumer would use them - a stylesheet on the *host page* reaching a
 * part through `::part()`, and a light-DOM child of `<openish-api-reference>` appearing inside a
 * section two shadow roots down. Testing them any other way would test the markup rather than the
 * contract.
 */
const at = async (path: string, config?: Record<string, unknown>): Promise<Harness> => {
  const harness = await mountReference(config ? { path, config } : { path })
  await harness.settle()
  return harness
}

/** Whether a rule written on the host page actually reaches a part. */
const styleReaches = (harness: Harness, selector: string, probe: string): boolean => {
  const frameDocument = harness.frame.contentDocument!
  const style = frameDocument.createElement('style')
  style.textContent = `${selector} { outline-color: rgb(1, 2, 3) }`
  frameDocument.head.append(style)

  const target = deepQuery<HTMLElement>(harness.element.shadowRoot!, probe)
  if (!target) {
    return false
  }
  return harness.frame.contentWindow!.getComputedStyle(target).outlineColor === 'rgb(1, 2, 3)'
}

describe('CSS parts', () => {
  it('exposes the layout containers', async () => {
    const harness = await at('/')

    expect(styleReaches(harness, 'openish-api-reference::part(main)', 'main')).toBe(true)
    expect(styleReaches(harness, 'openish-api-reference::part(content)', '.content')).toBe(true)
  })

  it('exposes the sidebar and its tree through the root', async () => {
    const harness = await at('/')

    expect(styleReaches(harness, 'openish-api-reference::part(sidebar)', 'openish-sidebar')).toBe(true)
    expect(styleReaches(harness, 'openish-api-reference::part(tree)', '[role="tree"]')).toBe(true)
  })

  it('exposes the operation header', async () => {
    const harness = await at('/tags/accounts/listAccounts', { hideTryIt: true })

    expect(styleReaches(harness, 'openish-api-reference::part(operation-header)', '.header')).toBe(true)
  })

  it('exposes a code block through the whole nesting chain', async () => {
    const harness = await at('/tags/accounts/listAccounts', { hideTryIt: true })

    /* root -> operation -> code-sample -> code-block, four shadow roots deep. */
    expect(styleReaches(harness, 'openish-api-reference::part(code)', '.frame')).toBe(true)
  })
})

describe('content slots', () => {
  const withSlotted = async (path: string, slot: string, config?: Record<string, unknown>) => {
    const harness = await at(path, config)
    const marker = harness.frame.contentDocument!.createElement('div')
    marker.slot = slot
    marker.id = 'host-marker'
    marker.textContent = 'from the host'
    harness.element.append(marker)
    await harness.settle()
    return { harness, marker }
  }

  /** Which shadow-root slot a host element actually landed in, or `undefined` if it landed nowhere. */
  const assignedSlotName = (marker: HTMLElement): string | undefined => {
    let current: HTMLElement | null = marker
    let name: string | undefined
    /* Forwarded slots chain: the host's child is assigned to a slot that is itself slotted. */
    while (current?.assignedSlot) {
      name = current.assignedSlot.name
      current = current.assignedSlot as unknown as HTMLElement
    }
    return name
  }

  it('places host markup at the start of the content column', async () => {
    const { marker } = await withSlotted('/', 'content-start')

    expect(assignedSlotName(marker)).toBe('content-start')
  })

  it('forwards a slot into the request section, two shadow roots down', async () => {
    const { marker } = await withSlotted('/tags/accounts/listAccounts', 'request-start', { hideTryIt: true })

    expect(assignedSlotName(marker)).toBe('request-start')
  })

  it('forwards a slot into the response section', async () => {
    const { marker } = await withSlotted('/tags/accounts/listAccounts', 'response-start', { hideTryIt: true })

    expect(assignedSlotName(marker)).toBe('response-start')
  })

  it('leaves nothing behind when the host slots nothing', async () => {
    const harness = await at('/tags/accounts/listAccounts', { hideTryIt: true })
    const operation = deepQuery(harness.element.shadowRoot!, 'openish-operation')!

    for (const slot of operation.shadowRoot!.querySelectorAll('slot')) {
      expect(slot.assignedNodes({ flatten: true })).toHaveLength(0)
    }
  })
})

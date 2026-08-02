import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, deepTextOf, disposeAll, mountReference, shadowOf, textOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

/** A code sample takes a turn of the event loop to generate: snippetz is loaded on demand. */
const settledSample = async (path: string, config?: Record<string, unknown>) => {
  const harness = await mountReference(config ? { path, config } : { path })
  await new Promise((resolve) => setTimeout(resolve, 150))
  await harness.settle()
  return harness
}

const codeOf = (root: Element | ShadowRoot): string => textOf(deepQuery(root, 'openish-code-block')?.shadowRoot ?? null)

describe('code samples', () => {
  it('generates a request carrying the resolved server URL', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount')
    const sample = shadowOf(element.shadowRoot!, 'openish-code-sample')

    expect(codeOf(sample)).toContain('https://api.example.com/v1/accounts/')
    expect(codeOf(sample)).toContain('curl')
  })

  it('sends the parameters the table documents, and the auth placeholder', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount')
    const code = codeOf(shadowOf(element.shadowRoot!, 'openish-code-sample'))

    /* `expand` is optional but carries an enum, so it belongs in a sample worth copying. */
    expect(code).toContain('Authorization: Bearer YOUR_TOKEN')
    expect(code).toContain('/accounts/00000000-0000-0000-0000-000000000000')
  })

  it('highlights the snippet inside its own shadow root, where a page stylesheet cannot reach', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount')
    const block = deepQuery(element.shadowRoot!, 'openish-code-block')!

    expect(block.shadowRoot!.querySelector('.hljs-string')).not.toBeNull()
  })

  it('offers every client but the hidden ones, grouped by language', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount', {
      hiddenClients: ['shell/curl', 'shell/wget'],
    })
    const select = deepQuery<HTMLSelectElement>(element.shadowRoot!, 'select')!

    const values = [...select.querySelectorAll('option')].map((option) => option.value)
    expect(values).not.toContain('shell/curl')
    expect(values).toContain('python/requests')
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label)).toContain('Python')

    /* The default client is hidden, so the sample falls back rather than rendering nothing. */
    expect(codeOf(shadowOf(element.shadowRoot!, 'openish-code-sample'))).not.toBe('')
  })

  it('changes every sample on the page at once when the reader picks a client', async () => {
    const harness = await settledSample('/tags/accounts/getAccount')
    const select = deepQuery<HTMLSelectElement>(harness.element.shadowRoot!, 'select')!

    expect(codeOf(harness.element.shadowRoot!)).toContain('curl')

    select.value = 'python/requests'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    /* The root handled the event and re-provided context; the picker never changed itself. */
    expect(codeOf(harness.element.shadowRoot!)).toContain('requests')
    expect(codeOf(harness.element.shadowRoot!)).not.toContain('curl')

    /* And it survives navigation, because the choice lives at the root, not in the element. */
    await harness.clickLink('/tags/accounts/replaceAccount')
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    expect(codeOf(harness.element.shadowRoot!)).toContain('requests')
  })

  it('labels the block with the client, and offers to copy it', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount')
    const block = deepQuery(element.shadowRoot!, 'openish-code-block')!

    expect(textOf(block.shadowRoot!.querySelector('.label'))).toBe('Shell · curl')
    expect(deepQuery(block.shadowRoot!, 'button[part="copy"]')).not.toBeNull()
  })

  it('renders no sample for a webhook, which the reader does not call', async () => {
    const { element } = await settledSample('/webhooks/accountCreated')

    expect(deepQuery(element.shadowRoot!, 'openish-code-sample')).toBeNull()
    expect(deepTextOf(element.shadowRoot!)).toContain('An account was created')
  })

  it('reads its syntax colours from a token the host declares outside the shadow root', async () => {
    const harness = await settledSample('/tags/accounts/getAccount')

    /*
     * The proof that the split works: the *rule* is component CSS, so it applies inside the shadow
     * root, and the *value* is a custom property on the host document, which inherits into it. A
     * `.hljs-string` selector in a page stylesheet would colour nothing here.
     */
    harness.frame.contentDocument!.documentElement.style.setProperty('--openish-hl-string', 'rgb(1, 2, 3)')
    await harness.settle()

    const string = deepQuery(harness.element.shadowRoot!, 'openish-code-block')!.shadowRoot!.querySelector(
      '.hljs-string',
    )!
    expect(harness.frame.contentWindow!.getComputedStyle(string).color).toBe('rgb(1, 2, 3)')
  })
})

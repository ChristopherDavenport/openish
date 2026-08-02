import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  deepQuery,
  deepTextOf,
  disposeAll,
  mountReference,
  pickContentType,
  shadowOf,
  textOf,
  sectionOf,
} from './helpers.js'

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
    const sample = shadowOf(sectionOf(element), 'openish-code-sample')

    expect(codeOf(sample)).toContain('https://api.example.com/v1/accounts/')
    expect(codeOf(sample)).toContain('curl')
  })

  it('sends the parameters the table documents, and the auth placeholder', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount')
    const code = codeOf(shadowOf(sectionOf(element), 'openish-code-sample'))

    /* `expand` is optional but carries an enum, so it belongs in a sample worth copying. */
    expect(code).toContain('Authorization: Bearer YOUR_TOKEN')
    expect(code).toContain('/accounts/00000000-0000-0000-0000-000000000000')
  })

  it('highlights the snippet inside its own shadow root, where a page stylesheet cannot reach', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount')
    const block = deepQuery(sectionOf(element), 'openish-code-block')!

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
    expect(codeOf(shadowOf(sectionOf(element), 'openish-code-sample'))).not.toBe('')
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

  /*
   * One bar, reading left to right as the questions a reader asks: what language do I want this in,
   * give it to me, run it. The client's name is on the picker rather than on a label of its own,
   * which is what the second bar above this one used to be for. What call this is a sample *of* is
   * said under the operation's title, in the column with the prose about it.
   */
  it('titles the block with its client, not with the call, and orders the bar picker, copy, action', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount')
    const sample = deepQuery(sectionOf(element), 'openish-code-sample')!
    const block = deepQuery(sectionOf(element), 'openish-code-block')!

    expect(sample.shadowRoot!.querySelector('[slot="title"]')).toBeNull()
    expect(textOf(block.shadowRoot!.querySelector('.label'))).toContain('curl')

    const picker = sample.shadowRoot!.querySelector<HTMLSelectElement>('select')!
    expect(textOf(picker.selectedOptions[0]!)).toBe('curl')

    /* All three in the block's one toolbar, in the order a reader works through them. */
    const toolbar = block.shadowRoot!.querySelector('.tools')!
    const configure = toolbar.querySelector('slot[name="toolbar"]')!
    const copy = deepQuery(block.shadowRoot!, 'openish-copy-button')!
    const actions = toolbar.querySelector('slot[name="actions"]')!

    expect(deepQuery(block.shadowRoot!, 'button[part="copy"]')).not.toBeNull()
    expect(configure.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(copy.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says which call it is under the operation title, beside the prose describing it', async () => {
    const { element } = await settledSample('/tags/accounts/getAccount')
    const operation = deepQuery(sectionOf(element), 'openish-operation')!
    const target = operation.shadowRoot!.querySelector('.target')!

    expect(textOf(target.querySelector('.method'))).toBe('get')
    expect(textOf(target.querySelector('.path'))).toBe('/accounts/{accountId}')

    /* In the documentation column, which is what "beside the prose" means in markup. */
    expect(operation.shadowRoot!.querySelector('.docs')!.contains(target)).toBe(true)
  })

  it('names a webhook by its event, which is what it has instead of a route', async () => {
    const { element } = await settledSample('/webhooks/post-accountcreated')
    const operation = deepQuery(sectionOf(element), 'openish-operation')!
    const target = operation.shadowRoot!.querySelector('.target')!

    expect(textOf(target.querySelector('.method'))).toBe('post')
    expect(textOf(target.querySelector('.path'))).toBe('accountCreated')
  })

  /*
   * The picker and the sample are two halves of one answer. Choosing a media type on the left used
   * to change the schema there and nothing else, so the reader read `application/xml` and copied a
   * curl that sent JSON under an `application/xml` header.
   */
  it('follows the content type the Body heading is set to', async () => {
    const harness = await settledSample('/tags/accounts/replaceAccount')

    await pickContentType(harness, 'request', 'application/xml')
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const code = codeOf(sectionOf(harness.element))
    expect(code).toContain('application/xml')
    expect(code).toContain('<Account>')
    expect(code).not.toContain('"id"')
  })

  it('renders no sample for a webhook, which the reader does not call', async () => {
    const { element } = await settledSample('/webhooks/post-accountcreated')

    expect(deepQuery(sectionOf(element), 'openish-code-sample')).toBeNull()
    expect(deepTextOf(sectionOf(element))).toContain('An account was created')
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

    const string = deepQuery(sectionOf(harness), 'openish-code-block')!.shadowRoot!.querySelector(
      '.hljs-string',
    )!
    expect(harness.frame.contentWindow!.getComputedStyle(string).color).toBe('rgb(1, 2, 3)')
  })
})

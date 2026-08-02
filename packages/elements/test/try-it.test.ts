import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  contentTypePicker,
  deepQuery,
  deepQueryAll,
  deepTextOf,
  disposeAll,
  mountReference,
  openTryIt,
  textOf,
  type Harness,
  sectionOf,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

type Sent = { url: string; method: string; headers: Record<string, string>; body: string | undefined }

/**
 * Replaces the frame's `fetch` and records what the page tried to send.
 *
 * Nothing leaves the browser: the point of these tests is what openish puts on the wire, and the
 * only way to know that for certain is to be the wire.
 */
const interceptFetch = (harness: Harness, response: Response = new Response('{"id":"acct_1"}', {
  status: 200,
  headers: { 'content-type': 'application/json' },
})) => {
  const sent: Sent[] = []
  const frameWindow = harness.frame.contentWindow as Window & { fetch: typeof fetch }

  frameWindow.fetch = (async (input: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      headers[name] = value
    }
    sent.push({
      url: String(input),
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
    })
    return response.clone()
  }) as typeof fetch

  return sent
}

/** Mounts an operation page. The client stays shut: opening it is a thing tests do deliberately. */
const tryIt = async (path: string, config?: Record<string, unknown>): Promise<Harness> => {
  const harness = await mountReference(config ? { path, config } : { path })
  await new Promise((resolve) => setTimeout(resolve, 200))
  await harness.settle()
  return harness
}

/** Mounts and opens the client, which is what a test about sending needs. */
const client = async (path: string, config?: Record<string, unknown>): Promise<Harness> => {
  const harness = await tryIt(path, config)
  await openTryIt(harness)
  return harness
}

const panelOf = (harness: Harness) => {
  const panel = deepQuery(sectionOf(harness), 'openish-try-it')
  if (!panel?.shadowRoot) {
    throw new Error('No try-it panel on the page.')
  }
  return panel
}

const fieldFor = (harness: Harness, name: string): HTMLInputElement => {
  const form = deepQuery(sectionOf(harness), 'openish-request-form')!
  const labels = [...form.shadowRoot!.querySelectorAll('label')]
  const label = labels.find((candidate) => textOf(candidate).replace('*', '') === name)
  const input = label ? form.shadowRoot!.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`) : null
  if (!input) {
    throw new Error(`No field for "${name}". Found: ${labels.map((l) => textOf(l)).join(', ')}`)
  }
  return input
}

const type = async (harness: Harness, input: HTMLInputElement, value: string): Promise<void> => {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await harness.settle()
}

const snippetOf = (harness: Harness): string =>
  textOf(deepQuery(sectionOf(harness), 'openish-code-block')?.shadowRoot ?? null)

const send = async (harness: Harness): Promise<void> => {
  const button = [...panelOf(harness).shadowRoot!.querySelectorAll('button')].find(
    (candidate) => textOf(candidate) === 'Send',
  )!
  button.click()
  await new Promise((resolve) => setTimeout(resolve, 150))
  await harness.settle()
}

describe('the sample and the send are one request', () => {
  it('sends exactly what the snippet shows, with the credential real on the wire', async () => {
    const harness = await client('/tags/accounts/getAccount')
    const sent = interceptFetch(harness)

    /* A credential the reader pasted, through the same event a real form dispatches. */
    const auth = deepQuery(sectionOf(harness), 'openish-auth-form')!
    const field = auth.shadowRoot!.querySelector<HTMLInputElement>('input[type="password"]')!
    field.value = 'sk_live_secret'
    field.dispatchEvent(new Event('change', { bubbles: true }))
    await harness.settle()

    await type(harness, fieldFor(harness, 'accountId'), 'acct_42')
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    const snippet = snippetOf(harness)
    await send(harness)

    expect(sent).toHaveLength(1)
    const request = sent[0]!

    /* The URL, the method, and the value the reader typed are the same in both. */
    expect(request.url).toBe('https://api.example.com/v1/accounts/acct_42')
    expect(request.method).toBe('GET')
    expect(snippet).toContain('https://api.example.com/v1/accounts/acct_42')

    /* The credential is real where it matters and absent where it would leak. */
    expect(request.headers['Authorization']).toBe('Bearer sk_live_secret')
    expect(snippet).toContain('Bearer YOUR_TOKEN')
    expect(snippet).not.toContain('sk_live_secret')
  })

  it('puts the real credential in the sample when a host asks for it', async () => {
    const harness = await client('/tags/accounts/getAccount', { revealCredentialsInSamples: true })

    const auth = deepQuery(sectionOf(harness), 'openish-auth-form')!
    const field = auth.shadowRoot!.querySelector<HTMLInputElement>('input[type="password"]')!
    field.value = 'sk_live_secret'
    field.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    expect(snippetOf(harness)).toContain('sk_live_secret')
  })

  it('follows the server the reader picked', async () => {
    const harness = await client('/tags/accounts/getAccount')
    const sent = interceptFetch(harness)

    const select = deepQuery(sectionOf(harness), 'openish-server-select')!.shadowRoot!.querySelector(
      'select',
    )!
    select.value = 'https://sandbox.example.com/v1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    await send(harness)

    expect(sent[0]?.url).toContain('https://sandbox.example.com/v1/accounts/')
    expect(snippetOf(harness)).toContain('https://sandbox.example.com/v1/accounts/')
  })

  it('refills the body in the syntax the media type names, and sends that', async () => {
    const harness = await client('/tags/accounts/replaceAccount')
    const sent = interceptFetch(harness)
    const form = deepQuery(sectionOf(harness), 'openish-request-form')!
    const editor = deepQuery<HTMLTextAreaElement>(form.shadowRoot!, 'textarea')!

    expect(editor.value).toContain('"id"')

    const picker = [...form.shadowRoot!.querySelectorAll<HTMLSelectElement>('select')].find(
      (candidate) => candidate.getAttribute('aria-label') === 'Request media type',
    )!
    picker.value = 'application/xml'
    picker.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    const refilled = deepQuery<HTMLTextAreaElement>(form.shadowRoot!, 'textarea')!.value
    expect(refilled).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(refilled).toContain('<Account>')

    await send(harness)

    expect(sent[0]?.headers['Content-Type']).toBe('application/xml')
    expect(sent[0]?.body).toContain('<Account>')
  })

  /* The other direction of the same agreement: one choice, two controls showing it. */
  /* Two controls, one answer: the panel's picker and the one on the `Body` heading above it. */
  it('moves the content type on the Body heading when the panel picks one', async () => {
    const harness = await client('/tags/accounts/replaceAccount')
    const form = deepQuery(sectionOf(harness), 'openish-request-form')!

    expect(contentTypePicker(harness, 'request').value).toBe('application/json')

    const picker = [...form.shadowRoot!.querySelectorAll<HTMLSelectElement>('select')].find(
      (candidate) => candidate.getAttribute('aria-label') === 'Request media type',
    )!
    picker.value = 'application/xml'
    picker.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    expect(contentTypePicker(harness, 'request').value).toBe('application/xml')
  })

  it('keeps a body the reader typed when they change the media type', async () => {
    const harness = await client('/tags/accounts/replaceAccount')
    const form = deepQuery(sectionOf(harness), 'openish-request-form')!
    const editor = deepQuery<HTMLTextAreaElement>(form.shadowRoot!, 'textarea')!

    editor.value = '{"id":"mine"}'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    const picker = [...form.shadowRoot!.querySelectorAll<HTMLSelectElement>('select')].find(
      (candidate) => candidate.getAttribute('aria-label') === 'Request media type',
    )!
    picker.value = 'application/xml'
    picker.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    expect(deepQuery<HTMLTextAreaElement>(form.shadowRoot!, 'textarea')!.value).toBe('{"id":"mine"}')
  })

  it('sends an edited body, and shows the edit', async () => {
    const harness = await client('/tags/accounts/replaceAccount')
    const sent = interceptFetch(harness)

    const editor = deepQuery<HTMLTextAreaElement>(
      deepQuery(sectionOf(harness), 'openish-request-form')!.shadowRoot!,
      'textarea',
    )!
    editor.value = '{"id":"edited"}'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    await send(harness)

    expect(sent[0]?.method).toBe('PUT')
    expect(sent[0]?.body).toBe('{"id":"edited"}')
    expect(snippetOf(harness)).toContain('edited')
  })
})

describe('the response', () => {
  it('reports the status, timing, and body it got back', async () => {
    const harness = await client('/tags/accounts/getAccount')
    interceptFetch(harness)

    await send(harness)
    const view = deepQuery(sectionOf(harness), 'openish-response-view')!

    expect(deepTextOf(view.shadowRoot!)).toContain('200')
    expect(deepTextOf(view.shadowRoot!)).toContain('acct_1')
    expect(deepTextOf(view.shadowRoot!)).toMatch(/\d+ ms/)
  })

  it('indents a JSON body, which an API sends on one line', async () => {
    const harness = await client('/tags/accounts/getAccount')
    interceptFetch(
      harness,
      new Response('{"id":"acct_1","balance":{"amount":10,"currency":"USD"}}', {
        headers: { 'content-type': 'application/json' },
      }),
    )

    await send(harness)
    const view = deepQuery(sectionOf(harness), 'openish-response-view')!
    /* Not `textOf`: it collapses whitespace, and whitespace is the thing under test. */
    const body = deepQuery(view.shadowRoot!, 'pre')!.textContent ?? ''

    /* Sixty readable characters and a scrollbar holding the rest is not a response view. */
    expect(body.split('\n').length).toBeGreaterThan(4)
    expect(body).toContain('"currency": "USD"')
  })

  it('leaves a body that is not JSON exactly as it arrived', async () => {
    const harness = await client('/tags/accounts/getAccount')
    interceptFetch(harness, new Response('id,balance\nacct_1,10', { headers: { 'content-type': 'text/csv' } }))

    await send(harness)
    const view = deepQuery(sectionOf(harness), 'openish-response-view')!

    expect(deepQuery(view.shadowRoot!, 'pre')!.textContent).toBe('id,balance\nacct_1,10')
  })

  it('keeps a long response inside its column instead of widening the dialog', async () => {
    const harness = await client('/tags/accounts/getAccount')
    interceptFetch(
      harness,
      new Response(JSON.stringify({ note: 'x'.repeat(4000) }), { headers: { 'content-type': 'application/json' } }),
    )

    await send(harness)
    const panel = panelOf(harness)
    const column = panel.shadowRoot!.querySelector('.column.response')!
    const view = deepQuery(panel.shadowRoot!, 'openish-response-view')!

    /*
     * A grid track sized to its content made this 7514px wide inside a 460px column, and the
     * response spilled out of the dialog rather than scrolling in its own block.
     */
    expect(view.getBoundingClientRect().width).toBeLessThanOrEqual(column.getBoundingClientRect().width)
  })

  it('treats an HTTP error as an answer, not a failure', async () => {
    const harness = await client('/tags/accounts/getAccount')
    interceptFetch(harness, new Response('{"message":"nope"}', { status: 403, statusText: 'Forbidden' }))

    await send(harness)
    const view = deepQuery(sectionOf(harness), 'openish-response-view')!

    expect(deepTextOf(view.shadowRoot!)).toContain('403')
    expect(view.shadowRoot!.querySelector('[role="alert"]')).toBeNull()
  })

  it('explains a blocked request instead of repeating the browser’s shrug', async () => {
    const harness = await client('/tags/accounts/getAccount')
    const frameWindow = harness.frame.contentWindow as Window & { fetch: typeof fetch }
    frameWindow.fetch = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch

    await send(harness)
    const view = deepQuery(sectionOf(harness), 'openish-response-view')!

    expect(textOf(view.shadowRoot!.querySelector('[role="alert"]'))).toContain('CORS')
    expect(deepTextOf(view.shadowRoot!)).not.toContain('Failed to fetch')
  })

  it('goes through the proxy when the host configured one', async () => {
    const harness = await client('/tags/accounts/getAccount', { proxyUrl: 'https://proxy.example.com/forward' })
    const sent = interceptFetch(harness)

    await send(harness)

    expect(sent[0]?.url).toContain('https://proxy.example.com/forward?target=')
    expect(sent[0]?.url).toContain(encodeURIComponent('https://api.example.com/v1/accounts/'))
  })
})

describe('what the panel forgets', () => {
  const responseTextOf = (harness: Harness): string =>
    deepTextOf(deepQuery(sectionOf(harness), 'openish-response-view')?.shadowRoot ?? null)

  const close = async (harness: Harness): Promise<void> => {
    const button = [...panelOf(harness).shadowRoot!.querySelectorAll('button')].find(
      (candidate) => textOf(candidate) === 'Close',
    )!
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()
  }

  it('drops the last answer when the panel is opened again', async () => {
    const harness = await client('/tags/accounts/getAccount')
    interceptFetch(harness)

    await send(harness)
    expect(responseTextOf(harness)).toContain('acct_1')

    await close(harness)
    await openTryIt(harness)

    /* It answered the request as it was then, and nothing says that is the request now. */
    expect(responseTextOf(harness)).toBe('')
  })

  it('keeps what the reader typed, which reopening should not throw away', async () => {
    const harness = await client('/tags/accounts/getAccount')
    await type(harness, fieldFor(harness, 'accountId'), 'acct_42')

    await close(harness)
    await openTryIt(harness)

    expect(fieldFor(harness, 'accountId').value).toBe('acct_42')
  })

  it('gives another operation its own panel, not the last one with a new node', async () => {
    const harness = await client('/tags/accounts/getAccount')
    interceptFetch(harness)

    await type(harness, fieldFor(harness, 'accountId'), 'acct_42')
    await send(harness)
    expect(responseTextOf(harness)).toContain('acct_1')

    await harness.goto('/tags/accounts/replaceAccount')
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()
    await openTryIt(harness)

    /* A response to one operation shown under another is not untidy, it is wrong. */
    expect(responseTextOf(harness)).toBe('')
    expect(fieldFor(harness, 'accountId').value).toBe('')
  })
})

describe('the panel itself', () => {
  it('is absent when the host turns it off, and the sample is not', async () => {
    const harness = await tryIt('/tags/accounts/getAccount', { hideTryIt: true })

    expect(deepQuery(sectionOf(harness), 'openish-try-it')).toBeNull()
    expect(deepQuery(sectionOf(harness), 'openish-code-sample')).not.toBeNull()
  })

  it('offers a field for every parameter the table documents', async () => {
    const harness = await client('/tags/accounts/getAccount')
    const form = deepQuery(sectionOf(harness), 'openish-request-form')!

    const labels = deepQueryAll(form.shadowRoot!, 'label').map((label) => textOf(label).replace('*', ''))
    expect(labels).toEqual(expect.arrayContaining(['accountId', 'expand', 'X-Trace-Id']))
  })

  it('does not call the API just because the page rendered', async () => {
    const harness = await client('/tags/accounts/getAccount')
    const sent = interceptFetch(harness)

    await harness.settle()

    /* A documentation page that fires requests on scroll would be a very bad documentation page. */
    expect(sent).toHaveLength(0)
  })

  it('renders no panel for a webhook, which the reader does not call', async () => {
    const harness = await tryIt('/webhooks/post-accountcreated')

    expect(deepQuery(sectionOf(harness), 'openish-try-it')).toBeNull()
  })
})

describe('choosing between security alternatives', () => {
  const spec = async () => (await import('./fixtures.js')).EITHER_AUTH_SPEC

  const sendFrom = async (credentials: Record<string, string>, config?: Record<string, unknown>) => {
    const harness = await mountReference({
      path: '/tags/accounts/listAccounts',
      spec: await spec(),
      credentials,
      ...(config ? { config } : {}),
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()
    await openTryIt(harness)

    const sent = interceptFetch(harness)
    const send = deepQueryAll<HTMLButtonElement>(harness.element.shadowRoot!, 'button').find(
      (button) => button.textContent?.trim() === 'Send',
    )!
    send.click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    return { harness, sent }
  }

  it('sends the credential the reader actually holds, not the first one declared', async () => {
    const { sent } = await sendFrom({ apiKeyAuth: 'key-value' })

    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers['X-Api-Key']).toBe('key-value')
    expect(sent[0]!.headers['Authorization']).toBeUndefined()
  })

  it('still sends the first alternative when that is the one held', async () => {
    const { sent } = await sendFrom({ bearerAuth: 'token-value' })

    expect(sent[0]!.headers['Authorization']).toBe('Bearer token-value')
    expect(sent[0]!.headers['X-Api-Key']).toBeUndefined()
  })

  it('lets the host name the alternative before the reader holds anything', async () => {
    const { harness } = await sendFrom({}, { preferredSecurityScheme: 'apiKeyAuth' })

    /* No credential yet, so the sample shows the placeholder for the scheme that was named. */
    expect(deepTextOf(harness.element.shadowRoot!)).toContain('YOUR_API_KEY')
  })

  it('shows the sample for the alternative it will send', async () => {
    const { harness } = await sendFrom({ apiKeyAuth: 'key-value' })
    const shown = deepTextOf(harness.element.shadowRoot!)

    /* The snippet beside the button has to describe the request the button sent. */
    expect(shown).toContain('X-Api-Key')
    expect(shown).not.toContain('Bearer')
  })
})

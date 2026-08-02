import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { CALLBACKS_SPEC } from './fixtures.js'
import { deepQuery, deepTextOf, disposeAll, mountReference, shadowOf, textOf, type Harness, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const callbacksOn = async (): Promise<{ harness: Harness; callbacks: Element }> => {
  const harness = await mountReference({ path: '/tags/hooks/subscribe', spec: CALLBACKS_SPEC })
  const operation = shadowOf(sectionOf(harness), 'openish-operation')
  const callbacks = deepQuery(operation, 'openish-callbacks')
  if (!callbacks) {
    throw new Error('No callbacks element on the operation page.')
  }
  return { harness, callbacks }
}

const toggle = async (harness: Harness, callbacks: Element): Promise<void> => {
  const disclosure = callbacks.shadowRoot!.querySelector('openish-disclosure')!
  disclosure.shadowRoot!.querySelector('button')!.click()
  await harness.settle()
}

describe('callbacks', () => {
  it('counts every request the API will make, across expressions and methods', async () => {
    const { callbacks } = await callbacksOn()
    const disclosure = callbacks.shadowRoot!.querySelector('openish-disclosure')

    /* onData has two methods at one expression, onError one - three requests, not two callbacks. */
    expect(disclosure?.getAttribute('hint')).toBe('3')
  })

  /*
   * A callback is the API calling the reader, which most readers of most pages do not need. Closed
   * by default costs nothing, because a closed disclosure renders nothing inside it.
   */
  it('builds nothing until the reader opens it', async () => {
    const { callbacks } = await callbacksOn()

    expect(callbacks.shadowRoot!.querySelector('h3')).toBeNull()
    expect(deepQuery(callbacks, 'openish-response-list')).toBeNull()
  })

  it('names each callback and the runtime expression it is sent to', async () => {
    const { harness, callbacks } = await callbacksOn()
    await toggle(harness, callbacks)

    expect([...callbacks.shadowRoot!.querySelectorAll('h3')].map((one) => textOf(one))).toEqual([
      'onData',
      'onData',
      'onError',
    ])
    expect([...callbacks.shadowRoot!.querySelectorAll('.expression')].map((one) => textOf(one))).toEqual([
      '{$request.body#/callbackUrl}',
      '{$request.body#/callbackUrl}',
      '{$request.body#/errorUrl}',
    ])
  })

  it('renders each one as the operation it is — method, body, responses', async () => {
    const { harness, callbacks } = await callbacksOn()
    await toggle(harness, callbacks)

    const methods = [...callbacks.shadowRoot!.querySelectorAll('.method')].map((one) => textOf(one))
    expect(methods).toEqual(['post', 'delete', 'post'])

    const text = deepTextOf(callbacks.shadowRoot!)
    expect(text).toContain('Sent whenever the ledger changes.')
    expect(text).toContain('Acknowledged')
    /* The parameter table is the same element the operation itself uses. */
    expect(text).toContain('X-Attempt')
  })

  it('renders no section for an operation with no callbacks', async () => {
    const harness = await mountReference({ path: '/tags/accounts/listAccounts' })
    const operation = shadowOf(sectionOf(harness), 'openish-operation')

    expect(deepQuery(operation, 'openish-callbacks')).toBeNull()
  })
})

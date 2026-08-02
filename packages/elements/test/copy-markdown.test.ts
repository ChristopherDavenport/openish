import { afterEach, describe, expect, it } from 'vitest'

import { COMPOSITION_SPEC, JSON_SCHEMA_SPEC } from './fixtures.js'
import { deepQuery, deepQueryAll, disposeAll, mountReference, textOf, type Harness, sectionOf } from './helpers.js'

afterEach(disposeAll)

/**
 * What the button would put on the clipboard.
 *
 * Read off the property rather than by pressing the button, because the clipboard needs a permission
 * a headless browser will not grant and the point under test is what gets built, not that Chromium
 * can write it. Pressing it is covered separately, against a stubbed clipboard.
 */
const copyTextIn = (harness: Harness): string => {
  const control = deepQuery(sectionOf(harness), 'openish-copy-markdown')
  const button = control?.shadowRoot?.querySelector('openish-copy-button') as
    | (Element & { source?: () => string })
    | null
  if (!button?.source) {
    throw new Error('No copy control with a source on the page.')
  }
  return button.source()
}

describe('copy for LLM', () => {
  it('hands over the operation the reader is on, not the part that is rendered', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    const markdown = copyTextIn(harness)

    expect(markdown).toContain('# Get an account')
    expect(markdown).toContain('`GET /accounts/{accountId}`')
    expect(markdown).toContain('### Path')
    expect(markdown).toContain('| `accountId` | string (uuid) | Yes |')
    expect(markdown).toContain('## Returns')
    expect(markdown).toContain('`404` — No account with that id.')
  })

  /*
   * The page abstracts a body: a name and a closed disclosure, because a reader arrives asking what
   * to send rather than what shape it is. That is only honest while the complete answer is one
   * action away, and this is the action - so what it hands over is a superset of what is on screen,
   * not a transcript of it.
   */
  it('writes out the whole shape of a body the page has collapsed', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    const markdown = copyTextIn(harness)

    /* Nothing on the page is showing these: the response tree arrived closed. */
    expect(markdown).toContain('- `id` — `string` · required')
    expect(markdown).toContain('Opaque account id.')
  })

  it('prints every branch of a oneOf, where the page shows the tab the reader is on', async () => {
    const harness = await mountReference({ path: '/models/Payment', spec: COMPOSITION_SPEC })
    const markdown = copyTextIn(harness)

    expect(markdown).toContain('One of:')
    expect(markdown).toContain('**Card**')
    expect(markdown).toContain('**Transfer**')
    /* Both shapes in full, not just the one a tab set would have had selected. */
    expect(markdown).toContain('`card`')
    expect(markdown).toContain('`iban`')
  })

  it('carries the value an author wrote for a field', async () => {
    const harness = await mountReference({ path: '/models/Sample', spec: JSON_SCHEMA_SPEC })
    const markdown = copyTextIn(harness)

    expect(markdown).toContain('Example: `acc_1`')
    /* The array spelling, one line each, and a value that is not text as JSON. */
    expect(markdown).toContain('Example: `1`')
    expect(markdown).toContain('Example: `2`')
    expect(markdown).toContain('Example: `["live","archived"]`')
  })

  it('prints every enum member, where the page caps the line and hides the rest', async () => {
    const harness = await mountReference({ path: '/models/Currency', spec: JSON_SCHEMA_SPEC })
    const markdown = copyTextIn(harness)

    /* Nine members: the constraint line stops at six and counts the remainder. */
    for (const code of ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NZD', 'USD', 'ZAR']) {
      expect(markdown, code).toContain(`\`${code}\``)
    }
  })

  /*
   * The clipboard cannot depend on what the reader happened to open.
   *
   * It is built from the document rather than from the DOM - `nodeToMarkdown` never sees an element -
   * and this is the assertion that keeps it that way, because the cheapest wrong fix for a collapsed
   * page would be to serialise what is rendered.
   */
  it('says the same thing whether the page is open or closed', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    const before = copyTextIn(harness)

    for (const disclosure of deepQueryAll(sectionOf(harness), 'openish-disclosure')) {
      disclosure.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click()
    }
    await harness.settle()

    expect(copyTextIn(harness)).toBe(before)
  })

  it('takes every operation under a tag, including ones nothing has rendered', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    const markdown = copyTextIn(harness)

    expect(markdown.startsWith('# accounts')).toBe(true)
    for (const title of ['List accounts', 'Create an account', 'Get an account', 'Replace an account']) {
      expect(markdown).toContain(`## ${title}`)
    }
  })

  it('copies the front of the document from the overview', async () => {
    const harness = await mountReference({ path: '/' })
    const markdown = copyTextIn(harness)

    expect(markdown.startsWith('# Shell API')).toBe(true)
    expect(markdown).toContain('Version 2.3.0')
    expect(markdown).toContain('`https://api.example.com/v1`')
  })

  it('is offered on every kind of section', async () => {
    for (const path of ['/', '/tags/accounts', '/tags/accounts/listAccounts', '/models/Account']) {
      const harness = await mountReference({ path })
      const control = deepQuery(sectionOf(harness), 'openish-copy-markdown')
      expect(control, path).not.toBeNull()

      const button = control!.shadowRoot!.querySelector('openish-copy-button')!
      expect(textOf(button.shadowRoot!.querySelector('button')), path).toContain('Copy for LLM')
    }
  })

  it('names what it copies after the words on the button, so the visible label still starts it', async () => {
    const harness = await mountReference({ path: '/tags/accounts/listAccounts' })
    const button = deepQuery(sectionOf(harness), 'openish-copy-button')!

    expect(textOf(button.shadowRoot!.querySelector('button'))).toBe('Copy for LLM List accounts as Markdown')
  })
})

describe('the copy button', () => {
  it('confirms, and announces the confirmation', async () => {
    const harness = await mountReference({
      path: '/tags/accounts/listAccounts',
      beforeMount: (frameWindow) => {
        /* The clipboard needs a permission a headless browser withholds; the button only needs it to resolve. */
        Object.defineProperty(frameWindow.navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.resolve() },
        })
      },
    })

    const control = deepQuery(sectionOf(harness), 'openish-copy-markdown')!
    const button = control.shadowRoot!.querySelector('openish-copy-button')!
    const pressed = button.shadowRoot!.querySelector('button')!

    pressed.click()
    await harness.settle()

    expect(textOf(pressed)).toContain('Copied')
    expect(textOf(button.shadowRoot!.querySelector('[role="status"]'))).toBe('Copied to clipboard')
  })

  it('is absent where there is no clipboard, rather than present and failing silently', async () => {
    const harness = await mountReference({
      path: '/tags/accounts/listAccounts',
      beforeMount: (frameWindow) => {
        Object.defineProperty(frameWindow.navigator, 'clipboard', { configurable: true, value: undefined })
      },
    })

    /* Every one of them: the code block's copy and the section's are the same element now. */
    for (const button of deepQueryAll(sectionOf(harness), 'openish-copy-button')) {
      expect(button.shadowRoot!.querySelector('button')).toBeNull()
    }
  })
})

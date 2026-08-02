import { afterEach, describe, expect, it } from 'vitest'

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
    expect(markdown).toContain('| `accountId` | path |')
    expect(markdown).toContain('## Responses')
    expect(markdown).toContain('`404` — No account with that id.')
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

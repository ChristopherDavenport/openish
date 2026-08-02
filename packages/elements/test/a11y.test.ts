import axeSource from 'axe-core/axe.min.js?raw'
import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, disposeAll, mountReference, openTryIt, shadowOf, type Harness } from './helpers.js'

afterEach(() => {
  disposeAll()
})

type AxeViolation = {
  id: string
  impact: string
  help: string
  nodes: Array<{ target: unknown[]; failureSummary?: string }>
}

/**
 * Runs axe inside the frame, not from here.
 *
 * axe reads the document it is loaded into, so running the test realm's copy against another
 * realm's tree measures the wrong page. Injecting the source into the frame also means it sees the
 * theme stylesheet that `frame.html` loads, which is what colour-contrast rules need to be true
 * about the palette rather than about the browser's defaults.
 */
const audit = async (harness: Harness): Promise<AxeViolation[]> => {
  const frameWindow = harness.frame.contentWindow as Window & { axe?: { run: (...args: unknown[]) => Promise<{ violations: AxeViolation[] }> } }

  if (!frameWindow.axe) {
    const script = harness.frame.contentDocument!.createElement('script')
    script.textContent = axeSource
    harness.frame.contentDocument!.head.append(script)
  }

  const results = await frameWindow.axe!.run(harness.frame.contentDocument!.body, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
  })

  return results.violations
}

/** Violations as something readable, so a failure names the rule and the element. */
const describeViolations = (violations: AxeViolation[]): string =>
  violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes.map((node) => `    ${JSON.stringify(node.target)}`).join('\n'),
    )
    .join('\n')

const expectClean = (violations: AxeViolation[]): void => {
  expect(describeViolations(violations)).toBe('')
}

describe('accessibility', () => {
  it('has no violations on the overview', async () => {
    const harness = await mountReference({ path: '/' })

    expectClean(await audit(harness))
  })

  it('has no violations on an operation, tables and tabs included', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    expectClean(await audit(harness))
  })

  /*
   * The two-pane arrangement, which the other operation tests never reach.
   *
   * The harness frame is 1024px, and with a sidebar beside it the content pane never crosses the
   * container query's threshold - so every axe run over an operation until now saw the *stacked*
   * panes. Splitting a page into two columns is exactly the change that can produce two competing
   * heading sequences a screen reader reads as one, so it needs auditing in the arrangement that
   * actually has two columns.
   */
  it('has no violations on an operation split into two columns', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    harness.frame.style.width = '1600px'
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    expectClean(await audit(harness))
  })

  it('keeps one heading sequence when the operation is split into two columns', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    harness.frame.style.width = '1600px'
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const operation = shadowOf(harness.element.shadowRoot!, 'openish-operation')
    const levels = [...operation.querySelectorAll('h1, h2, h3')].map((heading) =>
      Number(heading.tagName.slice(1)),
    )

    /* One h1, and nothing that skips a level - two columns must not read as two documents. */
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(levels[0]).toBe(1)
    levels.forEach((level, index) => {
      if (index > 0) {
        expect(level - levels[index - 1]!).toBeLessThanOrEqual(1)
      }
    })
  })

  it('has no violations on a model, with the schema tree expanded', async () => {
    const harness = await mountReference({ path: '/models/Account', config: { expandAllSchemaProperties: true } })

    expectClean(await audit(harness))
  })

  it('has no violations with the search dialog open', async () => {
    const harness = await mountReference({ path: '/' })
    const search = deepQuery<HTMLElement & { open: boolean }>(harness.element.shadowRoot!, 'openish-search')!
    search.open = true
    await harness.settle()

    expectClean(await audit(harness))
  })

  it('has no violations with the try-it panel and a response on screen', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    const frameWindow = harness.frame.contentWindow as Window & { fetch: typeof fetch }
    frameWindow.fetch = (async () =>
      new Response('{"id":"acct_1"}', { headers: { 'content-type': 'application/json' } })) as typeof fetch

    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    const panel = await openTryIt(harness)
    const send = [...panel.shadowRoot!.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Send')!
    send.click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    expectClean(await audit(harness))
  })

  it('has no violations with the navigation stacked into its disclosure', async () => {
    const harness = await mountReference({ path: '/tags/accounts' })
    /* The stacked navigation is what a narrow viewport gets; there is no second layout to ask for. */
    harness.frame.style.width = '380px'
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    harness.element.shadowRoot!.querySelector<HTMLButtonElement>('.menu')!.click()
    await harness.settle()

    expectClean(await audit(harness))
  })

  it('has no violations in dark mode, which is a different palette entirely', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    harness.frame.contentDocument!.documentElement.classList.add('jh-theme-dark')
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    /* Including the client, whose dense rows are the hardest thing on the page to keep legible. */
    await openTryIt(harness)

    expectClean(await audit(harness))
  })
})

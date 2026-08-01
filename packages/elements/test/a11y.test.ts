import axeSource from 'axe-core/axe.min.js?raw'
import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepQuery, disposeAll, mountReference, type Harness } from './helpers.js'

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

  it('has no violations with the navigation stacked into its disclosure', async () => {
    const harness = await mountReference({ path: '/tags/accounts', layout: 'classic' })
    harness.element.shadowRoot!.querySelector<HTMLButtonElement>('.menu')!.click()
    await harness.settle()

    expectClean(await audit(harness))
  })

  it('has no violations in dark mode, which is a different palette entirely', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    harness.frame.contentDocument!.documentElement.classList.add('jh-theme-dark')
    await new Promise((resolve) => setTimeout(resolve, 200))
    await harness.settle()

    expectClean(await audit(harness))
  })
})

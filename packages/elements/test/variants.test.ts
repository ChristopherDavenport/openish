import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { VARIANTS_SPEC } from './fixtures.js'
import {
  contentTypePicker,
  deepQuery,
  deepQueryAll,
  deepTextOf,
  disposeAll,
  mountReference,
  openTryIt,
  pickContentType,
  shadowOf,
  textOf,
  sectionOf,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

/**
 * One operation, as two columns.
 *
 * Every control is on the left and every consequence is on the right. These tests are about the wire
 * between them: a `oneOf` branch picked in a property tree has to reach a curl in the other column,
 * and the status a reader is on has to be one answer rather than two.
 */
const columnsOf = async (): Promise<{
  harness: Harness
  docs: Element
  examples: Element
}> => {
  const harness = await mountReference({ path: '/tags/pets/createPet', spec: VARIANTS_SPEC })
  await new Promise((resolve) => setTimeout(resolve, 200))
  await harness.settle()

  const operation = shadowOf(sectionOf(harness), 'openish-operation')
  const docs = operation.querySelector('[part~="operation-docs"]')
  const examples = operation.querySelector('[part~="operation-examples"]')
  if (!docs || !examples) {
    throw new Error('The operation is missing a column.')
  }
  return { harness, docs, examples }
}

/** The tabs of one labelled tab set below `root`, wherever it is in the shadow trees. */
const tabsLabelled = (root: Element, label: string): HTMLButtonElement[] => {
  const tabs = deepQuery(root, `openish-tabs[label="${label}"]`)
  return tabs?.shadowRoot ? [...tabs.shadowRoot.querySelectorAll<HTMLButtonElement>('button[role="tab"]')] : []
}

const pick = async (harness: Harness, tab: HTMLButtonElement | undefined): Promise<void> => {
  if (!tab) {
    throw new Error('No such tab.')
  }
  tab.click()
  await new Promise((resolve) => setTimeout(resolve, 200))
  await harness.settle()
}

const sampleText = (examples: Element): string =>
  deepTextOf(deepQuery(examples, 'openish-code-block')?.shadowRoot ?? null)

describe('a variant picked on the left is the example on the right', () => {
  it('puts the chosen branch in the request sample', async () => {
    const { harness, docs, examples } = await columnsOf()
    const body = docs.querySelector('[part~="body-section"]')!

    /* The document's order decides until the reader does, which is the first branch. */
    expect(sampleText(examples)).toContain('"kind": "cat"')
    expect(sampleText(examples)).not.toContain('"kind": "dog"')

    const variants = tabsLabelled(body, 'oneOf variants')
    expect(variants.map((tab) => textOf(tab))).toEqual(['Cat', 'Dog'])

    await pick(harness, variants[1])

    expect(sampleText(examples)).toContain('"kind": "dog"')
    expect(sampleText(examples)).not.toContain('"kind": "cat"')
  })

  /*
   * The depth pin. The tree flattens `allOf` and unwraps arrays while the example generator walks
   * both, so the two agree only because `variant-path.ts` addresses the shape the reader sees. A
   * nested choice is where that stops being a coincidence.
   */
  it('reaches a choice nested inside another choice', async () => {
    const { harness, docs, examples } = await columnsOf()
    const body = docs.querySelector('[part~="body-section"]')!

    await pick(harness, tabsLabelled(body, 'oneOf variants')[1])
    expect(sampleText(examples)).toContain('"material": "nylon"')

    /*
     * The collar's own tab set, which only exists inside the Dog branch - so it is the second
     * `oneOf` tab set on the page, and it was not there a moment ago.
     */
    const sets = deepQueryAll(body, 'openish-tabs[label="oneOf variants"]')
    expect(sets).toHaveLength(2)
    const collar = [...sets[1]!.shadowRoot!.querySelectorAll<HTMLButtonElement>('button[role="tab"]')]
    expect(collar.map((tab) => textOf(tab))).toEqual(['Nylon', 'Leather'])

    await pick(harness, collar[1])

    expect(sampleText(examples)).toContain('"material": "leather"')
    expect(sampleText(examples)).toContain('"kind": "dog"')
  })

  it('sends the branch the reader is reading about', async () => {
    const { harness, docs } = await columnsOf()
    const body = docs.querySelector('[part~="body-section"]')!

    await pick(harness, tabsLabelled(body, 'oneOf variants')[1])
    await openTryIt(harness)

    const form = deepQuery(sectionOf(harness), 'openish-request-form')!
    const editor = deepQuery<HTMLTextAreaElement>(form.shadowRoot!, 'textarea')!
    expect(editor.value).toContain('"kind": "dog"')
  })

  it('keeps the response example on the branch chosen for the response', async () => {
    const { harness, docs, examples } = await columnsOf()
    const responses = docs.querySelector('[part~="response-section"]')!

    expect(deepTextOf(examples)).toContain('"kind": "cat"')

    await pick(harness, tabsLabelled(responses, 'oneOf variants')[1])

    const shown = deepTextOf(examples)
    expect(shown).toContain('"kind": "dog"')
    /* The request sample is a different shape with its own choice, and it did not move. */
    expect(sampleText(examples)).toContain('"kind": "cat"')
  })
})

describe('the status is one answer, shown in both columns', () => {
  const statusTabs = (root: Element): HTMLButtonElement[] => tabsLabelled(root, 'Response status codes')

  const selected = (root: Element): string =>
    textOf(statusTabs(root).find((tab) => tab.getAttribute('aria-selected') === 'true') ?? null)

  it('moves the examples column when the reader moves the documentation one', async () => {
    const { harness, docs, examples } = await columnsOf()
    const responses = docs.querySelector('[part~="response-section"]')!

    expect(selected(responses)).toBe('201')
    expect(selected(examples)).toBe('201')

    await pick(harness, statusTabs(responses)[1])

    expect(selected(responses)).toBe('404')
    expect(selected(examples)).toBe('404')
    expect(deepTextOf(examples)).toContain('Not found')
  })

  it('moves the documentation column when the reader moves the examples one', async () => {
    const { harness, docs, examples } = await columnsOf()
    const responses = docs.querySelector('[part~="response-section"]')!

    await pick(harness, statusTabs(examples)[1])

    expect(selected(responses)).toBe('404')
    expect(selected(examples)).toBe('404')
  })

  /*
   * A reader on the XML response is being shown an answer the sample beside it would not receive:
   * with no `Accept`, a server offering both is free to send whichever it likes.
   */
  it('asks for the response media type the reader is reading', async () => {
    const { harness, examples } = await columnsOf()

    /* Before anyone touches anything: the first status, in the first type it declares. */
    expect(sampleText(examples)).toContain('Accept: application/json')

    await pickContentType(harness, 'response', 'application/xml')

    expect(sampleText(examples)).toContain('Accept: application/xml')
    expect(sampleText(examples)).not.toContain('Accept: application/json')
  })

  it('follows the status too, since a 404 answers in its own type', async () => {
    const { harness, docs, examples } = await columnsOf()
    const responses = docs.querySelector('[part~="response-section"]')!

    await pickContentType(harness, 'response', 'application/xml')
    expect(sampleText(examples)).toContain('Accept: application/xml')

    /* The 404 is JSON only, so asking for XML would be asking for something it never sends. */
    await pick(harness, tabsLabelled(responses, 'Response status codes')[1])

    expect(sampleText(examples)).toContain('Accept: application/json')
  })

  /* One control for the whole section, on the heading - not a tab set in either column. */
  it('leaves the media type to the one picker on the heading', async () => {
    const { harness, docs, examples } = await columnsOf()
    const responses = docs.querySelector('[part~="response-section"]')!

    expect([...contentTypePicker(harness, 'response').options].map((option) => option.value)).toEqual([
      'application/json',
      'application/xml',
    ])
    expect(tabsLabelled(responses, 'Response media types')).toEqual([])
    expect(tabsLabelled(examples, 'Response media types')).toEqual([])

    await pickContentType(harness, 'response', 'application/xml')

    expect(deepTextOf(examples)).toContain('<?xml version="1.0" encoding="UTF-8"?>')
  })
})

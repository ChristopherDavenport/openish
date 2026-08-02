import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  deepQuery,
  deepQueryAll,
  deepTextOf,
  disposeAll,
  mountReference,
  openTryIt,
  schemaRows,
  shadowOf,
  textOf,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

const operationOf = async (id: string, config?: Record<string, unknown>): Promise<Harness> =>
  mountReference(config ? { path: `/tags/accounts/${id}`, config } : { path: `/tags/accounts/${id}` })

/** The rendered cells of one `openish-table`, chosen by its caption. */
const rowsOf = (root: Element | ShadowRoot, caption: string): string[][] => {
  const table = deepQueryAll(root, 'openish-table').find((element) => element.getAttribute('caption') === caption)
  if (!table?.shadowRoot) {
    const found = deepQueryAll(root, 'openish-table').map((element) => element.getAttribute('caption'))
    throw new Error(`No table captioned "${caption}". Found: ${found.join(', ')}`)
  }

  return [...table.shadowRoot.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => deepTextOf(cell)),
  )
}

/** The buttons of the nearest tab set below `root` - not any tab set nested inside its panel. */
const tabsIn = (root: Element | ShadowRoot): HTMLButtonElement[] => {
  const tabs = deepQuery(root, 'openish-tabs')
  return tabs?.shadowRoot ? [...tabs.shadowRoot.querySelectorAll<HTMLButtonElement>('button[role="tab"]')] : []
}

/** The panel of the nearest tab set below `root`. */
const panelIn = (root: Element | ShadowRoot): Element => {
  const tabs = deepQuery(root, 'openish-tabs')
  const panel = tabs?.shadowRoot?.querySelector('[role="tabpanel"]')
  if (!panel) {
    throw new Error('No tab panel below the given root.')
  }
  return panel
}

describe('parameters', () => {
  it('renders the operation’s parameter, not the path item’s, when both declare one', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(element.shadowRoot!, 'openish-operation')

    const [row] = rowsOf(operation, 'Query parameters')

    expect(row?.[0]).toBe('expand')
    expect(row?.[3]).toContain('Declared on the operation.')
    expect(row?.[3]).not.toContain('Declared on the path item.')
    /* The override brings its own schema with it, constraints and all. */
    expect(row?.[3]).toContain('one of balance, owner')
  })

  it('inherits a parameter the path item declares and the operation does not', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(element.shadowRoot!, 'openish-operation')

    const [row] = rowsOf(operation, 'Path parameters')

    expect(row?.[0]).toBe('accountId')
    expect(row?.[1]).toBe('string (uuid)')
    expect(row?.[2]).toBe('required')
  })

  it('lists an optional parameter with no example, which the sample request omits', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(element.shadowRoot!, 'openish-operation')

    const [row] = rowsOf(operation, 'Header parameters')

    expect(row?.[0]).toBe('X-Trace-Id')
    expect(row?.[2]).toBe('optional')
  })

  it('renders no parameter section for an operation that takes none', async () => {
    const { element } = await operationOf('listAccounts')
    const operation = shadowOf(element.shadowRoot!, 'openish-operation')

    expect(deepQuery(operation, 'openish-parameters')).toBeNull()
    /*
     * The order is documentation pane then examples pane, which is source order - the two only sit
     * side by side once the page is wide enough for the container query.
     *
     * Authorization is not among them. The document declares `security` and this operation inherits
     * it, so it is still said - but it is one line beside the call rather than a section of the
     * documentation column, which is a disclosure and not a heading.
     */
    expect([...operation.querySelectorAll('h2')].map((heading) => textOf(heading))).toEqual([
      'Responses',
      'Request',
      'Response examples',
    ])
  })
})

describe('responses', () => {
  it('tabs by status code, with default last however the document ordered it', async () => {
    const { element } = await operationOf('getAccount')
    const responses = shadowOf(element.shadowRoot!, 'openish-response-list')

    expect(tabsIn(responses).map((tab) => textOf(tab))).toEqual(['200', '404', 'default'])
  })

  it('moves between tabs with the arrow keys, and wraps at the ends', async () => {
    const { element, settle } = await operationOf('getAccount')
    const responses = shadowOf(element.shadowRoot!, 'openish-response-list')
    const press = async (key: string) => {
      tabsIn(responses)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await settle()
    }

    expect(tabsIn(responses).map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])

    await press('ArrowRight')
    expect(tabsIn(responses).map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(deepTextOf(responses)).toContain('No account with that id.')

    await press('End')
    expect(tabsIn(responses)[2]!.getAttribute('aria-selected')).toBe('true')

    /* Past the last tab is the first one, not a dead end. */
    await press('ArrowRight')
    expect(tabsIn(responses)[0]!.getAttribute('aria-selected')).toBe('true')

    await press('ArrowLeft')
    expect(tabsIn(responses)[2]!.getAttribute('aria-selected')).toBe('true')
  })

  it('keeps the tab list a single tab stop by roving tabindex', async () => {
    const { element } = await operationOf('getAccount')
    const responses = shadowOf(element.shadowRoot!, 'openish-response-list')

    expect(tabsIn(responses).map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('renders a response with no content as its description alone', async () => {
    const { element, settle } = await operationOf('getAccount')
    const responses = shadowOf(element.shadowRoot!, 'openish-response-list')

    tabsIn(responses)[1]!.click()
    await settle()

    const panel = panelIn(responses)
    expect(deepTextOf(panel)).toContain('No account with that id.')
    expect(deepQuery(panel, 'openish-schema-preview')).toBeNull()
    expect(deepQuery(panel, 'pre')).toBeNull()
  })

  it('renders response headers and the body schema for a response that has both', async () => {
    const { element } = await operationOf('getAccount')
    const responses = shadowOf(element.shadowRoot!, 'openish-response-list')

    const [header] = rowsOf(responses, 'Response headers')
    expect(header?.[0]).toBe('X-Request-Id')
    expect(header?.[2]).toContain('Correlation id.')

    /* Two media types on one response is a tab set of its own, nested in the status tab. */
    const mediaTypes = tabsIn(panelIn(responses))
    expect(mediaTypes.map((tab) => textOf(tab))).toEqual(['application/json', 'text/csv'])
    expect(deepTextOf(responses)).toContain('Opaque account id.')
  })

  it('stacks every response when expandAllResponses is set', async () => {
    const { element } = await operationOf('getAccount', { expandAllResponses: true })
    const responses = shadowOf(element.shadowRoot!, 'openish-response-list')

    /* The media-type tab set inside a response stays; it is the status tabs that go away. */
    expect(responses.querySelector('openish-tabs[label="Response status codes"]')).toBeNull()
    expect(deepQueryAll(responses, 'h3').map((heading) => textOf(heading))).toEqual(['200', '404', 'default'])
    /* Every description is on the page at once, not one at a time. */
    expect(deepTextOf(responses)).toContain('The account.')
    expect(deepTextOf(responses)).toContain('No account with that id.')
    expect(deepTextOf(responses)).toContain('Unexpected error.')
  })
})

describe('request body', () => {
  it('tabs by media type and says whether the body is required', async () => {
    const { element } = await operationOf('replaceAccount')
    const body = shadowOf(element.shadowRoot!, 'openish-request-body')

    expect(textOf(body.querySelector('.required'))).toBe('Required')
    expect(deepTextOf(body)).toContain('The replacement account.')
    expect(tabsIn(body).map((tab) => textOf(tab))).toEqual(['application/json', 'application/xml'])
  })

  it('shows the referenced model by name, with its property tree', async () => {
    const { element } = await operationOf('replaceAccount')
    const body = shadowOf(element.shadowRoot!, 'openish-request-body')

    expect(deepTextOf(body)).toContain('Account')
    expect(schemaRows(deepQuery(body, 'openish-schema'))).toEqual([
      { name: 'id', type: 'string', required: 'required' },
      { name: 'balance', type: 'integer', required: 'optional' },
    ])
  })

  /*
   * The generated body is shown once, in whichever place the reader can act on.
   *
   * With the panel on it belongs in the editor, where it can be changed and sent; printing it again
   * below only makes the reader scroll past the same thousand lines twice to reach the responses.
   */
  it('leaves the example to the editor the try-it panel provides', async () => {
    const harness = await operationOf('replaceAccount')
    await openTryIt(harness)
    const body = shadowOf(harness.element.shadowRoot!, 'openish-request-body')
    const editor = deepQuery<HTMLTextAreaElement>(harness.element.shadowRoot!, 'textarea')!

    expect(deepQuery(body, 'openish-code-block')).toBeNull()
    expect(editor.value).toContain('"balance"')
  })

  it('highlights the generated example when there is no editor to hold it', async () => {
    const { element } = await operationOf('replaceAccount', { hideTryIt: true })
    const body = shadowOf(element.shadowRoot!, 'openish-request-body')
    const example = deepQuery(body, 'openish-code-block')!

    expect(example.getAttribute('language')).toBe('json')
    expect(example.shadowRoot!.querySelector('.hljs-attr')).not.toBeNull()
    expect(textOf(example.shadowRoot!.querySelector('pre'))).toContain('"balance"')
  })

  it('renders no request body section for an operation that takes none', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(element.shadowRoot!, 'openish-operation')

    expect(deepQuery(operation, 'openish-request-body')).toBeNull()
  })
})

describe('disclosure', () => {
  it('opens and closes its region, and says so', async () => {
    const { element, settle } = await operationOf('getAccount')
    const disclosure = shadowOf(element.shadowRoot!, 'openish-disclosure')
    const button = disclosure.querySelector('button')!

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(disclosure.querySelector('#region')!.hasAttribute('hidden')).toBe(true)

    button.click()
    await settle()

    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(disclosure.querySelector('#region')!.hasAttribute('hidden')).toBe(false)
  })
})

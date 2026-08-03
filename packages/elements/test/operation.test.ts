import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  contentTypePicker,
  deepQuery,
  deepQueryAll,
  deepTextOf,
  disposeAll,
  mountReference,
  openBodies,
  openTryIt,
  schemaRows,
  shadowOf,
  textOf,
  sectionOf,
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
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    const [row] = rowsOf(operation, 'Query parameters')

    expect(row?.[0]).toBe('expand')
    expect(row?.[3]).toContain('Declared on the operation.')
    expect(row?.[3]).not.toContain('Declared on the path item.')
    /* The override brings its own schema with it, constraints and all. */
    expect(row?.[3]).toContain('one of balance, owner')
  })

  it('inherits a parameter the path item declares and the operation does not', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    const [row] = rowsOf(operation, 'Path parameters')

    expect(row?.[0]).toBe('accountId')
    expect(row?.[1]).toBe('string (uuid)')
    expect(row?.[2]).toBe('required')
  })

  it('lists an optional parameter with no example, which the sample request omits', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    const [row] = rowsOf(operation, 'Header parameters')

    expect(row?.[0]).toBe('X-Trace-Id')
    expect(row?.[2]).toBe('optional')
  })

  it('renders no parameter section for an operation that takes none', async () => {
    const { element } = await operationOf('listAccounts')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    expect(deepQuery(operation, 'openish-parameters')).toBeNull()
    /*
     * Every heading an operation writes is in the documentation column, and this one writes one.
     *
     * Authorization is not among them. The document declares `security` and this operation inherits
     * it, so it is still said - but it is one line beside the call rather than a section of the
     * documentation column, which is a disclosure and not a heading.
     *
     * `h4`, because on the plane an operation sits under its tag: the tag's heading is the level two
     * and these are one below the operation's own level three.
     *
     * The examples column is named rather than titled - see the case below - so "Request" is not
     * here. Nor is anything for the responses: this operation answers `200 OK` with no body, so the
     * examples column has nothing to show and writes no region at all.
     */
    expect([...operation.querySelectorAll('h4')].map((heading) => textOf(heading))).toEqual([
      'Returns',
    ])
  })

  /*
   * The right-hand column carries its names in the accessibility tree rather than on the page.
   *
   * Both halves are the contract. No heading, because the column and the blocks in it already say
   * what they are - a sample headed by the client it is written in, a row of status tabs. And a
   * name, because that leaves a screen reader's heading list with nothing where the column was.
   *
   * The names are qualified by the operation, which is not decoration: a named `<section>` is a
   * landmark, and a plane is many operations at once. Forty regions called "Request" is what
   * `landmark-unique` exists to prevent, and the a11y suite runs that rule.
   */
  it('names the examples column instead of heading it', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    for (const part of ['request-section', 'examples-section']) {
      const section = operation.querySelector(`[part~="${part}"]`)
      expect(section, part).not.toBeNull()
      expect(section!.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(0)
      expect(section!.getAttribute('aria-label')).toContain('Get an account')
    }
  })

  /*
   * One section for everything the reader sends.
   *
   * `Parameters` and `Request body` were the same question - what do I send? - kept apart because
   * OpenAPI stores a body somewhere else from the parameters travelling beside it. The body is a
   * group within the answer now, named for where it goes, exactly as `Path` and `Query` are.
   */
  it('puts the body under Parameters, as another group of inputs', async () => {
    const { element } = await operationOf('replaceAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    expect([...operation.querySelectorAll('h4')].map((one) => textOf(one))).toEqual([
      'Parameters',
      'Returns',
    ])

    const section = operation.querySelector('[part~="parameters-section"]')!
    expect(section.querySelector('[part~="body-section"]')).not.toBeNull()

    /*
     * A level below the section holding it, not above. These were `h3`s under an `h4` - nested on
     * the page and outranking it in the outline, which is the half of "moved under Parameters" that
     * a reader following headings would not have got.
     */
    const group = section.querySelector('.group')!
    expect(textOf(group)).toBe('Body')
    expect(group.tagName).toBe('H5')
  })

  /*
   * The heading is short because the section above it already said the word; the table's name is not,
   * because it is announced when a screen-reader user enters the table, where the heading is out of
   * earshot and `Path` alone names nothing.
   */
  it('shortens the group heading without shortening the table it names', async () => {
    const { element } = await operationOf('getAccount')
    const parameters = shadowOf(sectionOf(element), 'openish-parameters')

    expect([...parameters.querySelectorAll('h5')].map((one) => textOf(one))).toEqual([
      'Path',
      'Query',
      'Header',
    ])
    expect(parameters.querySelector('openish-table')?.getAttribute('caption')).toBe('Path parameters')
  })
})

describe('responses', () => {
  it('tabs by status code, with default last however the document ordered it', async () => {
    const { element } = await operationOf('getAccount')
    const responses = shadowOf(sectionOf(element), 'openish-response-list')

    expect(tabsIn(responses).map((tab) => textOf(tab))).toEqual(['200', '404', 'default'])
  })

  it('moves between tabs with the arrow keys, and wraps at the ends', async () => {
    const { element, settle } = await operationOf('getAccount')
    const responses = shadowOf(sectionOf(element), 'openish-response-list')
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
    const responses = shadowOf(sectionOf(element), 'openish-response-list')

    expect(tabsIn(responses).map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('renders a response with no content as its description alone', async () => {
    const { element, settle } = await operationOf('getAccount')
    const responses = shadowOf(sectionOf(element), 'openish-response-list')

    tabsIn(responses)[1]!.click()
    await settle()

    const panel = panelIn(responses)
    expect(deepTextOf(panel)).toContain('No account with that id.')
    expect(deepQuery(panel, 'openish-schema-preview')).toBeNull()
    expect(deepQuery(panel, 'pre')).toBeNull()
  })

  it('renders response headers and the body schema for a response that has both', async () => {
    const harness = await operationOf('getAccount')
    const responses = shadowOf(sectionOf(harness.element), 'openish-response-list')

    const [header] = rowsOf(responses, 'Response headers')
    expect(header?.[0]).toBe('X-Request-Id')
    expect(header?.[2]).toContain('Correlation id.')

    /* The two media types this response offers are the picker's options, on the Returns heading. */
    expect(tabsIn(panelIn(responses))).toEqual([])
    expect([...contentTypePicker(harness, 'response').options].map((option) => option.value)).toEqual([
      'application/json',
      'text/csv',
    ])

    /* The body arrives named and closed, so the shape is there once the reader asks for it. */
    expect(deepTextOf(responses)).not.toContain('Opaque account id.')
    await openBodies(harness, responses)
    expect(deepTextOf(responses)).toContain('Opaque account id.')
  })

  /*
   * A tab set nobody is controlling keeps what the reader picked. Response statuses are that case -
   * no parent has an opinion about which one is showing - and they must not be disturbed by the
   * re-renders that a request body's controlled tabs now cause elsewhere in the section.
   */
  it('keeps the response status the reader picked across a re-render', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await harness.settle()
    const responses = shadowOf(sectionOf(harness), 'openish-response-list')

    tabsIn(responses)[1]!.click()
    await harness.settle()
    expect(tabsIn(responses)[1]!.getAttribute('aria-selected')).toBe('true')

    /* Something else on the section changes; the reader's tab is not something else's business. */
    const sample = deepQuery<HTMLSelectElement>(sectionOf(harness), 'openish-code-sample')!
    const client = sample.shadowRoot!.querySelector<HTMLSelectElement>('select')!
    client.value = 'python/requests'
    client.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    expect(tabsIn(responses)[1]!.getAttribute('aria-selected')).toBe('true')
  })

  it('stacks every response when expandAllResponses is set', async () => {
    const { element } = await operationOf('getAccount', { expandAllResponses: true })
    const responses = shadowOf(sectionOf(element), 'openish-response-list')

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
  /*
   * The media type is a select on the `Body` heading, not a tab set over the body.
   *
   * A band of chrome the width of the column, level with the first thing worth reading, for a choice
   * most readers never make - and it appeared again under every response. It is one control on a row
   * that already existed now, at the end a reader going down the left edge never reaches.
   */
  it('says whether the body is required, and picks its media type from the heading', async () => {
    const harness = await operationOf('replaceAccount')
    const body = shadowOf(sectionOf(harness), 'openish-request-body')

    expect(textOf(body.querySelector('.required'))).toBe('Required')
    expect(deepTextOf(body)).toContain('The replacement account.')

    expect(tabsIn(body)).toEqual([])
    const picker = contentTypePicker(harness, 'request')
    expect([...picker.options].map((option) => option.value)).toEqual([
      'application/json',
      'application/xml',
    ])
  })

  /*
   * A body arrives as the name of the thing it is, linked to the section that documents it, with the
   * shape one click away. The whole shape is still here - it is not a summary - which is what makes
   * the abstraction honest rather than a truncation.
   */
  it('names the referenced model, links it, and keeps the tree a click away', async () => {
    const harness = await operationOf('replaceAccount')
    const body = shadowOf(sectionOf(harness.element), 'openish-request-body')
    const tree = deepQuery(body, 'openish-schema')!

    const link = tree.shadowRoot!.querySelector('.type a')
    expect(textOf(link)).toBe('Account')
    expect(link?.getAttribute('href')).toContain('models/Account')

    expect(schemaRows(tree)).toEqual([])
    await openBodies(harness, body)
    expect(schemaRows(tree)).toEqual([
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
    const body = shadowOf(sectionOf(harness), 'openish-request-body')
    const editor = deepQuery<HTMLTextAreaElement>(sectionOf(harness), 'textarea')!

    expect(deepQuery(body, 'openish-code-block')).toBeNull()
    expect(editor.value).toContain('"balance"')
  })

  it('highlights the generated example when there is no editor to hold it', async () => {
    const { element } = await operationOf('replaceAccount', { hideTryIt: true })
    const body = shadowOf(sectionOf(element), 'openish-request-body')
    const example = deepQuery(body, 'openish-code-block')!

    expect(example.getAttribute('language')).toBe('json')
    expect(example.shadowRoot!.querySelector('.hljs-attr')).not.toBeNull()
    expect(textOf(example.shadowRoot!.querySelector('pre'))).toContain('"balance"')
  })

  it('renders no request body section for an operation that takes none', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    expect(deepQuery(operation, 'openish-request-body')).toBeNull()
  })
})

/*
 * An operation on a host of its own. The document declared one server, the reader's picker offers
 * that one, and the specification says the operation's own wins - so the page has to say so, or it
 * documents a call to one host while the sample beside it calls another.
 */
/*
 * The Header Object carries more than a type and a description, and this table read three of those
 * fields and then dropped them: whether the server always sends it, whether it is deprecated, and
 * what one looks like.
 */
/*
 * The Encoding Object, which was read nowhere: a multipart body rendered as a plain object, so the
 * one fact a reader needs in order to build the request - that `scan` is a PNG, not a string - was
 * the one fact missing.
 */
describe('the parts of a multipart body', () => {
  it('names the content type each part is sent with, and the headers it carries', async () => {
    const harness = await operationOf('attachDocument')
    const rows = rowsOf(sectionOf(harness), 'Body parts')

    expect(rows).toEqual([
      ['scan', 'image/png', 'X-Checksum'],
      ['metadata', 'application/json', ''],
    ])
  })

  it('is absent from a body with no encoding to describe', async () => {
    const harness = await operationOf('replaceAccount')

    expect(
      deepQueryAll(sectionOf(harness), 'openish-table').some(
        (table) => table.getAttribute('caption') === 'Body parts',
      ),
    ).toBe(false)
  })
})

describe('response headers', () => {
  const headerRows = async () => {
    const harness = await operationOf('getAccount')
    return rowsOf(sectionOf(harness), 'Response headers')
  }

  it('says which headers are always sent, and shows an example of one', async () => {
    const rows = await headerRows()
    const requestId = rows.find((row) => row[0]?.includes('X-Request-Id'))!

    expect(requestId[2]).toContain('Always sent')
    expect(requestId[2]).toContain('req_8f2b')
  })

  it('marks a deprecated header rather than listing it like the rest', async () => {
    const rows = await headerRows()
    const legacy = rows.find((row) => row[0]?.includes('X-Legacy-Cursor'))!

    expect(legacy[2]).toContain('Deprecated')
  })
})

describe('an operation with a server of its own', () => {
  const ELSEWHERE_SPEC = {
    openapi: '3.1.0',
    info: { title: 'Elsewhere', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com/v1' }],
    paths: {
      '/uploads': {
        post: {
          tags: ['files'],
          summary: 'Upload a file',
          operationId: 'uploadFile',
          servers: [{ url: 'https://uploads.example.com' }],
          responses: { '201': { description: 'Created' } },
        },
      },
      '/files': {
        get: {
          tags: ['files'],
          summary: 'List files',
          operationId: 'listFiles',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  }

  it('names the host in the header, beside the path it belongs to', async () => {
    const harness = await mountReference({ path: '/tags/files/uploadFile', spec: ELSEWHERE_SPEC })
    const target = shadowOf(sectionOf(harness), 'openish-operation').querySelector('[part~="operation-target"]')!

    expect(textOf(target)).toContain('https://uploads.example.com/uploads')
  })

  it('says nothing for an operation the document already covers', async () => {
    const harness = await mountReference({ path: '/tags/files/listFiles', spec: ELSEWHERE_SPEC })
    const target = shadowOf(sectionOf(harness), 'openish-operation').querySelector('[part~="operation-target"]')!

    expect(textOf(target)).toBe('get /files')
  })
})

describe('the path in the header', () => {
  const LONG = '/institutions/{institutionId}/users/{userId}/accounts/{accountId}/transactions'
  const LONG_SPEC = {
    openapi: '3.1.0',
    info: { title: 'Long', version: '1.0.0' },
    paths: {
      [LONG]: {
        get: {
          tags: ['things'],
          summary: 'Read the transactions',
          operationId: 'longOne',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  }

  /*
   * It used to ellipsise on one line with no title to recover the rest from, so the end of a long
   * path - the part that distinguishes it - was unreadable in the one place it is the point.
   */
  it('shows the whole of it rather than cutting the end off', async () => {
    const harness = await mountReference({ path: '/tags/things/longOne', spec: LONG_SPEC })
    harness.frame.style.width = '900px'
    await new Promise((resolve) => setTimeout(resolve, 50))
    await harness.settle()

    const path = shadowOf(sectionOf(harness), 'openish-operation').querySelector('.path')!

    expect(textOf(path)).toBe(LONG)
    /* Nothing clipped: it wraps to a second line instead of scrolling out of its own box. */
    expect(path.scrollWidth).toBeLessThanOrEqual(path.clientWidth + 1)
  })
})

describe('disclosure', () => {
  it('opens and closes its region, and says so', async () => {
    const { element, settle } = await operationOf('getAccount')
    const disclosure = shadowOf(sectionOf(element), 'openish-disclosure')
    const button = disclosure.querySelector('button')!

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(disclosure.querySelector('#region')!.hasAttribute('hidden')).toBe(true)

    button.click()
    await settle()

    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(disclosure.querySelector('#region')!.hasAttribute('hidden')).toBe(false)
  })
})

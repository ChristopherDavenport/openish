import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import {
  contentTypePicker,
  deepQuery,
  deepQueryAll,
  deepFieldRows,
  deepTextOf,
  disposeAll,
  fieldRows,
  mountReference,
  openStatus,
  openTryIt,
  schemaRows,
  shadowOf,
  statusRows,
  textOf,
  sectionOf,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

const operationOf = async (id: string, config?: Record<string, unknown>): Promise<Harness> =>
  mountReference(config ? { path: `/tags/accounts/${id}`, config } : { path: `/tags/accounts/${id}` })

/**
 * The rendered cells of one `openish-table`, chosen by its caption.
 *
 * Two callers left. The parameter tables and the response-header table are field rows now - see
 * `fieldRows` - and what stays tabular is what is genuinely a table: the parts of a multipart body,
 * and the links a response offers.
 */
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

/**
 * One field row, chosen by the name in it.
 *
 * Rows are no longer grouped into tables a test can pick by caption, and that is the point of the
 * change - so a test names the row it means, which is what a reader does too.
 */
const rowNamed = (root: Element | ShadowRoot, name: string): Element => {
  const rows = deepQueryAll(root, 'ul.fields > li.field')
  const row = rows.find((one) => textOf(one.querySelector('.name')) === name)
  if (!row) {
    throw new Error(`No row named "${name}". Found: ${rows.map((one) => textOf(one.querySelector('.name'))).join(', ')}`)
  }
  return row
}

/** The buttons of the nearest tab set below `root` - not any tab set nested inside its panel. */
const tabsIn = (root: Element | ShadowRoot): HTMLButtonElement[] => {
  const tabs = deepQuery(root, 'openish-tabs')
  return tabs?.shadowRoot ? [...tabs.shadowRoot.querySelectorAll<HTMLButtonElement>('button[role="tab"]')] : []
}

describe('parameters', () => {
  it('renders the operation’s parameter, not the path item’s, when both declare one', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    const row = rowNamed(operation, 'expand')

    expect(textOf(row.querySelector('.badge[data-where]'))).toBe('query')
    expect(deepTextOf(row)).toContain('Declared on the operation.')
    expect(deepTextOf(row)).not.toContain('Declared on the path item.')
    /* The override brings its own schema with it, constraints and all. */
    expect(deepTextOf(row)).toContain('one of balance, owner')
  })

  it('inherits a parameter the path item declares and the operation does not', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    const [row] = fieldRows(shadowOf(operation, 'openish-parameters'))

    expect(row).toEqual({ name: 'accountId', where: 'path', type: 'string (uuid)', required: 'required' })
  })

  it('leaves the required column blank for an optional parameter, rather than saying so', async () => {
    const { element } = await operationOf('getAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    /*
     * `optional` used to be printed on every row that was not required, which on a twenty-field
     * object is eighteen lines saying the default. With one fixed slot per row, blank is unambiguous.
     */
    const row = rowNamed(operation, 'X-Trace-Id')

    expect(textOf(row.querySelector('.badge[data-where]'))).toBe('header')
    expect(row.querySelector('.required')).toBeNull()
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
  it('promotes the body’s own members into the one list of inputs', async () => {
    const { element } = await operationOf('replaceAccount')
    const operation = shadowOf(sectionOf(element), 'openish-operation')

    expect([...operation.querySelectorAll('h4')].map((one) => textOf(one))).toEqual([
      'Parameters',
      'Returns',
    ])

    const section = operation.querySelector('[part~="parameters-section"]')!
    expect(section.querySelector('[part~="body-section"]')).not.toBeNull()

    /*
     * No group heading anywhere in the section - not `Body`, and not the `Path`/`Query` ones that
     * stood beside it. Where each input travels is a chip on its row, so a reader answering "what do
     * I send?" reads one list instead of crossing five headings and two grammars.
     */
    expect(section.querySelector('.group')).toBeNull()

    /* One sequence, across the shadow boundary between the parameters and the promoted body. */
    expect(deepFieldRows(section).map((row) => `${row.where} ${row.name}`)).toEqual([
      'path accountId',
      'query expand',
      'body id',
      'body balance',
    ])
  })

  /*
   * The chip is doing what four headings and four tables used to do, and it can only do it because
   * the rows stay in group order - `groupParameters` walks `PARAMETER_LOCATIONS`, so every `query`
   * row is contiguous and the chips read as a run rather than an interleaving.
   */
  it('badges each input with where it travels, in place of the group headings', async () => {
    const { element } = await operationOf('getAccount')
    const parameters = shadowOf(sectionOf(element), 'openish-parameters')

    expect(parameters.querySelectorAll('h5')).toHaveLength(0)
    expect(parameters.querySelector('openish-table')).toBeNull()

    expect(fieldRows(parameters).map((row) => row.where)).toEqual(['path', 'query', 'header'])
  })
})

describe('responses', () => {
  /*
   * The two columns are two representations of one set of statuses, and they are deliberately not
   * synchronised. The documentation column lists every status at once, because "what can this
   * return" is a question about all of them; the examples column tabs, because an example answers
   * one call and the code sample beside it asks for one `Accept`.
   */
  it('lists every status with its description, rather than tabbing between them', async () => {
    const { element } = await operationOf('getAccount')
    const responses = shadowOf(sectionOf(element), 'openish-response-list')

    expect(responses.querySelector('openish-tabs[label="Response status codes"]')).toBeNull()
    expect(statusRows(responses).map((row) => row.status)).toEqual(['200', '404', 'default'])

    /* Five descriptions a reader used to have to click a tab to find are on the page at once. */
    expect(deepTextOf(responses)).toContain('The account.')
    expect(deepTextOf(responses)).toContain('No account with that id.')
    expect(deepTextOf(responses)).toContain('Unexpected error.')
  })

  it('opens the first success and leaves the errors closed', async () => {
    const { element } = await operationOf('getAccount')
    const responses = shadowOf(sectionOf(element), 'openish-response-list')

    /*
     * What the operation normally does is what a reader arrived to see, so it costs no click. The
     * errors are one press away and cost nothing until pressed - a closed region renders no
     * elements, which is what lets every status be on the page at once.
     */
    expect(statusRows(responses).filter((row) => row.open).map((row) => row.status)).toEqual(['200'])
  })

  it('renders a response with no content as a plain row, not an expander over nothing', async () => {
    const { element } = await operationOf('getAccount')
    const responses = shadowOf(sectionOf(element), 'openish-response-list')

    /* A `404` here has a description and nothing else - a control that reveals nothing is worse
       than no control. */
    const row = [...responses.querySelectorAll('ul.statuses > li')].find((one) =>
      textOf(one.querySelector('.status')) === '404',
    )!
    expect(row.querySelector('openish-disclosure')).toBeNull()
    expect(deepTextOf(row)).toContain('No account with that id.')
  })

  it('renders response headers as rows beside the body’s, badged for which is which', async () => {
    const harness = await operationOf('getAccount')
    const responses = shadowOf(sectionOf(harness.element), 'openish-response-list')

    expect(responses.querySelector('openish-table')).toBeNull()

    const header = rowNamed(responses, 'X-Request-Id')
    expect(textOf(header.querySelector('.badge[data-where]'))).toBe('header')
    expect(deepTextOf(header)).toContain('Correlation id.')

    /* The body's first level is on the page too, which is what a reader arrived asking about. */
    expect(deepTextOf(responses)).toContain('Opaque account id.')

    /*
     * Every media type any response declares is the picker's options now. The column shows all the
     * statuses at once, so there is no "the response showing" for it to ask about.
     */
    expect([...contentTypePicker(harness, 'response').options].map((option) => option.value)).toEqual([
      'application/json',
      'text/csv',
    ])
  })

  it('keeps a status the reader opened across a re-render', async () => {
    const harness = await mountReference({ path: '/tags/accounts/getAccount' })
    await harness.settle()
    const responses = shadowOf(sectionOf(harness), 'openish-response-list')

    await openStatus(harness, responses, 'default')
    expect(statusRows(responses).filter((row) => row.open).map((row) => row.status)).toEqual(['200', 'default'])

    /* Something else on the section changes; what the reader opened is not something else's business. */
    const sample = deepQuery<HTMLSelectElement>(sectionOf(harness), 'openish-code-sample')!
    const client = sample.shadowRoot!.querySelector<HTMLSelectElement>('select')!
    client.value = 'python/requests'
    client.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 150))
    await harness.settle()

    expect(statusRows(responses).filter((row) => row.open).map((row) => row.status)).toEqual(['200', 'default'])
  })

  it('opens every status when expandAllResponses is set', async () => {
    const { element } = await operationOf('getAccount', { expandAllResponses: true })
    const responses = shadowOf(sectionOf(element), 'openish-response-list')

    /* `default` has content, `404` has only a description - so two rows open and one has no
       expander to open. */
    expect(statusRows(responses).filter((row) => row.open).map((row) => row.status)).toEqual(['200', 'default'])
    expect(deepTextOf(responses)).toContain('Opaque account id.')
  })

  /*
   * The examples column keeps its tab set, and it is the only place a status is chosen. A tab set
   * nobody is controlling keeps what the reader picked, which is this one's case now that the
   * documentation column no longer reports a status back.
   */
  it('tabs by status in the examples column, with default last', async () => {
    const { element } = await operationOf('getAccount')
    const examples = deepQueryAll(sectionOf(element), 'openish-response-list').at(-1)!.shadowRoot!

    expect(tabsIn(examples).map((tab) => textOf(tab))).toEqual(['200', 'default'])
    expect(tabsIn(examples).map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1'])
  })

  it('moves between the examples column’s tabs with the arrow keys, and wraps at the ends', async () => {
    const { element, settle } = await operationOf('getAccount')
    const examples = deepQueryAll(sectionOf(element), 'openish-response-list').at(-1)!.shadowRoot!
    const press = async (key: string) => {
      tabsIn(examples)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await settle()
    }

    expect(tabsIn(examples).map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false'])

    await press('ArrowRight')
    expect(tabsIn(examples).map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])

    await press('End')
    expect(tabsIn(examples).at(-1)!.getAttribute('aria-selected')).toBe('true')

    /* Past the last tab is the first one, not a dead end. */
    await press('ArrowRight')
    expect(tabsIn(examples)[0]!.getAttribute('aria-selected')).toBe('true')

    await press('ArrowLeft')
    expect(tabsIn(examples).at(-1)!.getAttribute('aria-selected')).toBe('true')
  })

  /*
   * The two columns are allowed to disagree, and this is the test that says so on purpose rather
   * than by omission: moving the examples column leaves the documentation column exactly as the
   * reader left it.
   */
  it('does not move the documentation column when the examples column changes status', async () => {
    const harness = await operationOf('getAccount')
    const docs = shadowOf(sectionOf(harness.element), 'openish-response-list')
    const examples = deepQueryAll(sectionOf(harness.element), 'openish-response-list').at(-1)!.shadowRoot!

    tabsIn(examples).at(-1)!.click()
    await harness.settle()

    expect(tabsIn(examples).at(-1)!.getAttribute('aria-selected')).toBe('true')
    expect(statusRows(docs).filter((row) => row.open).map((row) => row.status)).toEqual(['200'])
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
  it('says whether the body is required on the section heading, where it has something to attach to', async () => {
    const harness = await operationOf('replaceAccount')
    const operation = shadowOf(sectionOf(harness), 'openish-operation')
    const body = shadowOf(sectionOf(harness), 'openish-request-body')

    /*
     * The body has no heading of its own any more, so a lone `Required` above its rows would read as
     * a fact about the first row. On the section's heading row it sits beside the chip that says
     * which rows it is about.
     */
    const identity = operation.querySelector('.body-identity')!
    expect(textOf(identity.querySelector('.badge[data-where]'))).toBe('body')
    expect(textOf(identity.querySelector('.required'))).toBe('required')
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
  it('names the referenced model on the heading row, and shows its first level below', async () => {
    const harness = await operationOf('replaceAccount')
    const operation = shadowOf(sectionOf(harness.element), 'openish-operation')
    const body = shadowOf(sectionOf(harness.element), 'openish-request-body')

    /*
     * The link is the only route from a body to the section documenting it, and with the root object
     * no longer drawn as a row there is nowhere else to hang it. Deleting it with the type line is
     * the mistake this test exists to catch.
     */
    const link = operation.querySelector('.body-identity .type a')
    expect(textOf(link)).toBe('Account')
    expect(link?.getAttribute('href')).toContain('models/Account')

    /* One flat level, unasked for. Everything below it is still a disclosure. */
    expect(schemaRows(deepQuery(body, 'openish-schema'))).toEqual([
      { name: 'id', type: 'string', required: 'required' },
      { name: 'balance', type: 'integer', required: '' },
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
  /*
   * "Always sent" and not "required", which matters more now than when these were a table of their
   * own: a response header's `required` is a promise the server makes, not something a caller
   * supplies, and the rows a few inches above use "required" for the other meaning. One grammar
   * puts the two side by side; it must not make them the same word.
   */
  it('says which headers are always sent, without calling them required', async () => {
    const harness = await operationOf('getAccount')
    const row = rowNamed(sectionOf(harness), 'X-Request-Id')

    expect(deepTextOf(row)).toContain('Always sent')
    expect(deepTextOf(row)).toContain('req_8f2b')
    expect(row.querySelector('.required')).toBeNull()
  })

  it('marks a deprecated header rather than listing it like the rest', async () => {
    const harness = await operationOf('getAccount')
    const row = rowNamed(sectionOf(harness), 'X-Legacy-Cursor')

    expect(deepTextOf(row)).toContain('deprecated')
    expect(row.querySelector('.name.deprecated')).not.toBeNull()
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

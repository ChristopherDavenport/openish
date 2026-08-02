import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { PARAMETER_DETAIL_SPEC } from './fixtures.js'
import { deepQueryAll, deepTextOf, disposeAll, mountReference, shadowOf, textOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

type Row = { name: string; type: string; constraints: string; examples: string[] }

const queryRows = async (): Promise<Row[]> => {
  const harness = await mountReference({ path: '/tags/things/listThings', spec: PARAMETER_DETAIL_SPEC })
  const operation = shadowOf(harness.element.shadowRoot!, 'openish-operation')
  const table = deepQueryAll(operation, 'openish-table').find(
    (element) => element.getAttribute('caption') === 'Query parameters',
  )
  if (!table?.shadowRoot) {
    throw new Error('No query parameter table.')
  }

  return [...table.shadowRoot.querySelectorAll('tbody tr')].map((row) => {
    const cells = [...row.querySelectorAll('th, td')]
    return {
      name: deepTextOf(cells[0]!),
      type: deepTextOf(cells[1]!),
      constraints: [...cells[3]!.querySelectorAll('.constraints')].map((one) => textOf(one)).join(' | '),
      examples: [...cells[3]!.querySelectorAll('ul.examples li')].map((one) => textOf(one)),
    }
  })
}

const rowNamed = (rows: Row[], name: string): Row => {
  const row = rows.find((one) => one.name === name)
  if (!row) {
    throw new Error(`No row for ${name}. Found: ${rows.map((one) => one.name).join(', ')}`)
  }
  return row
}

describe('parameter serialization', () => {
  /* `deepObject` + explode is `?filter[status]=open`. Rendered as a bare `object` it is a guess. */
  it('says how a deepObject parameter is spelled on the wire', async () => {
    expect(rowNamed(await queryRows(), 'filter').constraints).toContain('style deepObject · exploded')
  })

  it('reports an explicit explode: false, which is not the same as saying nothing', async () => {
    const row = rowNamed(await queryRows(), 'tags')

    expect(row.constraints).toContain('not exploded')
    expect(row.constraints).toContain('reserved characters allowed')
  })

  it('reports allowEmptyValue only where it is true', async () => {
    const rows = await queryRows()

    expect(rowNamed(rows, 'debug').constraints).toContain('may be empty')
    expect(rowNamed(rows, 'plain').constraints).not.toContain('may be empty')
  })

  /*
   * Every parameter has a style and an explode whether the document mentions them or not. Restating
   * the defaults would put the same phrase under every query parameter and bury the one that matters.
   */
  it('says nothing about a parameter that declared none of it', async () => {
    expect(rowNamed(await queryRows(), 'plain').constraints).toBe('')
  })
})

describe('a parameter described by content', () => {
  it('names the type and the media type carrying it', async () => {
    const row = rowNamed(await queryRows(), 'region')

    expect(row.type).toContain('object')
    expect(row.type).toContain('application/json')
  })
})

describe('parameter examples', () => {
  it('lists every named example with what the author called it', async () => {
    expect(rowNamed(await queryRows(), 'tags').examples).toEqual([
      '["ledger"] — A single tag',
      '["ledger","audit"] — many',
    ])
  })

  it('renders a singular example with no name beside it', async () => {
    expect(rowNamed(await queryRows(), 'plain').examples).toEqual(['hello'])
  })
})

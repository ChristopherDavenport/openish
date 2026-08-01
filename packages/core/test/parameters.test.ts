import { describe, expect, it } from 'vitest'

import { collectParameters, groupParameters } from '../src/operation/parameters.js'
import { collectOperations } from '../src/navigation/operations.js'
import type { DocumentStore } from '../src/types.js'
import { storeFromFixture } from './helpers.js'

const entryFor = (store: DocumentStore, operationId: string) => {
  const entry = collectOperations(store.document.paths as Record<string, unknown>, 'paths').find(
    (candidate) => candidate.operation.operationId === operationId,
  )
  if (!entry) {
    throw new Error(`No operation with id "${operationId}"`)
  }
  return entry
}

describe('collectParameters', () => {
  it('lets the operation override a path-level parameter with the same name and location', async () => {
    const store = await storeFromFixture('request.yaml')
    const { pathItem, operation } = entryFor(store, 'createNote')

    const trace = collectParameters(pathItem, operation).find((parameter) => parameter.name === 'trace')

    expect(trace?.example).toBe('operation-level')
  })

  it('keeps the path item’s position for a parameter the operation overrides', async () => {
    const store = await storeFromFixture('request.yaml')
    const { pathItem, operation } = entryFor(store, 'createNote')

    expect(collectParameters(pathItem, operation).map((parameter) => parameter.name)).toEqual([
      'userId',
      'trace',
      'limit',
      'verbose',
      'fields',
      'session',
    ])
  })

  it('treats name and location together as the identity, so one name in two places survives', () => {
    const parameters = collectParameters(undefined, {
      parameters: [
        { name: 'id', in: 'query' },
        { name: 'id', in: 'header' },
      ],
    })

    expect(parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual(['query:id', 'header:id'])
  })

  it('drops an entry that cannot be rendered, sent, or overridden', () => {
    const parameters = collectParameters(undefined, {
      parameters: [{ name: 'ok', in: 'query' }, { in: 'query' }, { name: 'nowhere' }, 'nonsense'],
    })

    expect(parameters.map((parameter) => parameter.name)).toEqual(['ok'])
  })

  it('is unbothered by an operation or path item that declares none', () => {
    expect(collectParameters(undefined, undefined)).toEqual([])
    expect(collectParameters({ parameters: 'not a list' }, {})).toEqual([])
  })
})

describe('groupParameters', () => {
  it('groups by location in reading order, and omits the locations with nothing in them', async () => {
    const store = await storeFromFixture('request.yaml')
    const { pathItem, operation } = entryFor(store, 'createNote')

    const groups = groupParameters(collectParameters(pathItem, operation))

    expect(groups.map(([location, entries]) => [location, entries.map((entry) => entry.name)])).toEqual([
      ['path', ['userId']],
      ['query', ['limit', 'verbose', 'fields']],
      ['header', ['trace']],
      ['cookie', ['session']],
    ])
  })

  it('keeps an optional parameter the sample request would leave out', async () => {
    const store = await storeFromFixture('request.yaml')
    const { pathItem, operation } = entryFor(store, 'createNote')

    const query = groupParameters(collectParameters(pathItem, operation)).find(([location]) => location === 'query')

    /* `verbose` has no example and no default: documented, but not worth putting in a snippet. */
    expect(query?.[1].map((entry) => entry.name)).toContain('verbose')
  })
})

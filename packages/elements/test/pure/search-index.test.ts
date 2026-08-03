import { describe, expect, it } from 'vitest'

import { createDocumentStore } from '../../../core/src/store/create-document-store.js'
import { searchNodes } from '../../src/search/search.js'
import { SEARCHABLE_SPEC } from '../fixtures.js'

const store = await createDocumentStore(JSON.stringify(SEARCHABLE_SPEC))

/*
 * Relative to the document, because every id begins with its source's slug and this suite is about
 * what the index *finds*, not about which document it is in. `sources.test.ts` covers the prefix.
 */
const ids = (query: string) =>
  searchNodes(store, query).results.map((result) => result.node.id.slice(store.source.slug.length + 1))

describe('the search index', () => {
  it('still finds an operation by its title', () => {
    expect(ids('move money')[0]).toContain('createTransfer')
  })

  it('finds an operation by a word only its description uses', () => {
    expect(ids('idempotent')).toEqual(['tags/transfers/createTransfer'])
  })

  it('finds an operation by a parameter name', () => {
    expect(ids('correlation')).toEqual(['tags/transfers/createTransfer'])
  })

  it('finds an operation by a request-body field name', () => {
    expect(ids('destinationaccount')).toEqual(['tags/transfers/createTransfer'])
  })

  it('finds an operation by a response description', () => {
    expect(ids('accepted')).toEqual(['tags/transfers/createTransfer'])
  })

  it('finds a model by its description and by a field name', () => {
    expect(ids('double-entry')).toEqual(['models/Ledger'])
    expect(ids('postingdate')).toEqual(['models/Ledger'])
  })

  it('ranks a title match above a description match', () => {
    /* `transfers` is a tag title and appears in no description, so ordering is the thing under test. */
    const { results } = searchNodes(store, 'transfer')

    expect(results[0]!.node.type).not.toBe('model')
    expect(results[0]!.score).toBeGreaterThan(results[results.length - 1]!.score)
  })

  /*
   * The count is what the dialog announces, and it used to be the length of the capped list - so a
   * query matching the whole document was announced as however many rows happened to fit.
   */
  it('reports how many matched, not how many fitted', () => {
    const { results, total } = searchNodes(store, 'transfer', 2)

    expect(results).toHaveLength(2)
    expect(total).toBeGreaterThan(2)
    expect(total).toBe(searchNodes(store, 'transfer', Infinity).results.length)
  })

  it('still requires every term to match, so two words narrow', () => {
    expect(ids('idempotent unrelated')).toEqual([])
  })

  it('returns nothing for a word the document never uses', () => {
    expect(ids('kangaroo')).toEqual([])
  })
})

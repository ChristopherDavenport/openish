import { describe, expect, it } from 'vitest'

import type { NavGroupNode, NavNode, NavTagNode } from '../src/types.js'
import { findNode, flatten, storeFromFixture } from './helpers.js'

const load = () => storeFromFixture('extensions.yaml')

const titlesOf = (nodes: readonly NavNode[]) => nodes.map((node) => node.title)

describe('x-internal and x-scalar-ignore', () => {
  it('drops an operation the document marks internal', async () => {
    const ids = flatten((await load()).navigation).map((node) => node.id)

    expect(ids.some((id) => id.includes('listPayments'))).toBe(true)
    expect(ids.some((id) => id.includes('createPayment'))).toBe(false)
  })

  it('honours the Scalar spelling as well as the widespread one', async () => {
    const ids = flatten((await load()).navigation).map((node) => node.id)

    expect(ids.some((id) => id.includes('ignoredThing'))).toBe(false)
  })

  it('takes a tag out with every operation that only reached it through that tag', async () => {
    const ids = flatten((await load()).navigation).map((node) => node.id)

    expect(ids.some((id) => id.includes('legacy'))).toBe(false)
    expect(ids.some((id) => id.includes('legacyThing'))).toBe(false)
  })

  it('drops an internal webhook and keeps the rest of the section', async () => {
    const webhooks = (await load()).navigation.find((node) => node.title === 'Webhooks') as NavGroupNode

    expect(titlesOf(webhooks.children)).toContain('paymentSettled')
    expect(titlesOf(webhooks.children)).not.toContain('internalPing')
  })

  it('drops an internal schema from the Models section', async () => {
    const models = (await load()).navigation.find((node) => node.title === 'Models') as NavGroupNode

    expect(titlesOf(models.children)).toEqual(['Payment'])
  })

  it('leaves an internal schema readable where an operation refers to it', async () => {
    /*
     * The filter is about the type dictionary, not about the document. A reader who needs the shape
     * to call an operation still gets it; hiding it there would make the page wrong rather than
     * shorter.
     */
    const store = await load()

    expect(store.document.components?.schemas?.['InternalLedgerEntry']).toBeDefined()
  })
})

describe('x-tagGroups', () => {
  it('folds the named tags under a group node', async () => {
    const nodes = (await load()).navigation
    const money = nodes.find((node) => node.title === 'Money') as NavGroupNode

    expect(money.type).toBe('group')
    expect(titlesOf(money.children)).toEqual(['payments', 'refunds'])
  })

  it("leaves the tags' own ids alone, so existing links still resolve", async () => {
    const store = await load()

    expect(findNode(store, 'tags/payments').type).toBe('tag')
    expect(findNode(store, 'tags/payments/listPayments').type).toBe('operation')
  })

  it('keeps a tag no group names, rather than dropping it the way Redoc does', async () => {
    const nodes = (await load()).navigation

    expect(titlesOf(nodes)).toContain('loose')
  })

  it('drops a group the document marks internal, and the tags inside it', async () => {
    const nodes = (await load()).navigation
    const flat = flatten(nodes)

    expect(titlesOf(nodes)).not.toContain('Internal tooling')
    expect(flat.map((node) => node.title)).not.toContain('admin')
  })

  it('leaves navigation ungrouped when the document declares no groups', async () => {
    const store = await storeFromFixture('navigation.yaml')

    expect(store.navigation.filter((node): node is NavTagNode => node.type === 'tag').length).toBeGreaterThan(0)
  })
})

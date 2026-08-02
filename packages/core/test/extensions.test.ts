import { describe, expect, it } from 'vitest'

import { authorAside, authorSamples, declarationFor } from '../src/index.js'
import { nodeToMarkdown } from '../src/markdown/node-to-markdown.js'
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

    expect(titlesOf(models.children)).toEqual(['Payment', 'Refund'])
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

/**
 * What a webhook and a model say about which tag they belong to.
 *
 * Two different mechanisms, deliberately named apart: a webhook's operation carries the standard
 * `tags`, because a webhook entry is a path item like any other, and a schema carries Redoc's
 * `x-tags`, because JSON Schema has no `tags` keyword to carry. Both are read the same way, and
 * neither *moves* the node - the section it lives in and the id that section gave it are untouched.
 */
describe('tags on webhooks and models', () => {
  const webhookNamed = async (title: string) => {
    const webhooks = (await load()).navigation.find((node) => node.title === 'Webhooks') as NavGroupNode
    return webhooks.children.find((child) => child.title === title)
  }

  const modelNamed = async (title: string) => {
    const models = (await load()).navigation.find((node) => node.title === 'Models') as NavGroupNode
    return models.children.find((child) => child.title === title)
  }

  it("carries a webhook's own tags onto its node", async () => {
    expect((await webhookNamed('paymentSettled'))?.tags).toEqual(['payments'])
  })

  it('reads x-tags on a schema, which is the only way a model can name one', async () => {
    expect((await modelNamed('Payment'))?.tags).toEqual(['payments'])
  })

  it('keeps a tagged webhook under Webhooks, with the id it already had', async () => {
    const store = await load()

    expect(findNode(store, 'webhooks/paymentSettled').type).toBe('webhook')
  })

  it('drops entries that are not usable names rather than filing under an empty tag', async () => {
    expect((await modelNamed('Refund'))?.tags).toEqual(['refunds'])
  })

  it('says nothing at all when the document says nothing', async () => {
    /* Absent rather than empty: "declared none" and "declared badly" are the same answer. */
    const store = await storeFromFixture('navigation.yaml')
    const models = store.navigation.find((node) => node.title === 'Models') as NavGroupNode | undefined

    expect(models?.children.every((child) => !('tags' in child) || child.tags === undefined)).toBe(true)
  })
})

/**
 * Content an author wrote for the examples column of a section that generates none.
 *
 * Two extensions, and only one of them is openish's own. `x-codeSamples` is the spelling an
 * operation already uses, read from `info` and from a Tag Object because a curated sample is the
 * only kind those can show. `x-openish-aside` is namespaced, because no other reference has a
 * column to put prose in and there is no convention to honour.
 */
describe('x-openish-aside and section samples', () => {
  it('reads the aside an author wrote on info', async () => {
    const store = await load()

    expect(authorAside(store.document.info)).toContain('Before you start')
  })

  it('reads a curated sample from info, with the same reader an operation uses', async () => {
    const store = await load()
    const samples = authorSamples(store.document.info)

    expect(samples.map((sample) => [sample.label, sample.language])).toEqual([['Get a token', 'bash']])
  })

  it('finds the Tag Object a section was built from, and both of its extensions', async () => {
    const store = await load()
    const payments = store.navigation
      .flatMap((node) => ('children' in node && node.children ? [node, ...node.children] : [node]))
      .find((node) => node.type === 'tag' && node.name === 'payments') as NavTagNode

    const declaration = declarationFor(store.document, payments)

    expect(authorAside(declaration)).toBe('Amounts are in minor units, always.')
    expect(authorSamples(declaration).map((sample) => sample.label)).toEqual(['A payment, end to end'])
  })

  it('has nothing to find for a container the document never declared', async () => {
    const store = await load()
    const webhooks = store.navigation.find((node) => node.title === 'Webhooks') as NavGroupNode

    expect(declarationFor(store.document, webhooks)).toBeUndefined()
  })

  it('carries both into the copy a reader takes away', async () => {
    const store = await load()
    const markdown = nodeToMarkdown(store, undefined)

    /* Demoted under the title above it, the way every other block of the author's prose is. */
    expect(markdown).toContain('### Before you start')
    expect(markdown).toContain('**Get a token**')
    expect(markdown).toContain('curl -X POST https://api.example.com/token')
  })
})

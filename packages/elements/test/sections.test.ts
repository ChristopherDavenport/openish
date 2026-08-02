import { createDocumentStore, type DocumentStore, type NavNode } from '@openish/core'
import { describe, expect, it } from 'vitest'

import { documentSections, overviewAnchors, sectionIndex } from '../src/render/sections.js'
import { SHELL_SPEC } from './fixtures.js'

const storeFor = (spec: unknown, config?: Parameters<typeof createDocumentStore>[1]): Promise<DocumentStore> =>
  createDocumentStore(JSON.stringify(spec), config)

/**
 * The tree walked independently of the thing under test.
 *
 * The point of the first assertion is that the section list and the navigation tree agree about
 * order without either one being derived from the other, so this deliberately re-implements the walk
 * rather than importing one.
 */
const preorder = (nodes: readonly NavNode[], found: NavNode[] = []): NavNode[] => {
  for (const node of nodes) {
    found.push(node)
    if ('children' in node && node.children) {
      preorder(node.children, found)
    }
  }
  return found
}

/**
 * A document with `x-tagGroups`, which is the only shape that makes the tree three deep.
 *
 * Inline rather than added to `fixtures.ts`: heading depth is the only thing it exists to
 * demonstrate, and one test reads it.
 */
const GROUPED_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Grouped', version: '1.0.0' },
  'x-tagGroups': [{ name: 'Money', tags: ['payments'] }],
  tags: [{ name: 'payments' }],
  paths: {
    '/payments': {
      get: { summary: 'List payments', operationId: 'listPayments', tags: ['payments'], responses: { '200': { description: 'OK' } } },
    },
  },
}

describe('the section list', () => {
  it('lists every section of the document, in reading order', async () => {
    const store = await storeFor(SHELL_SPEC)

    expect(documentSections(store).map((section) => section.id)).toEqual([
      'api-1',
      'api-1/tags/accounts',
      'api-1/tags/accounts/listAccounts',
      'api-1/tags/accounts/createAccount',
      'api-1/tags/accounts/getAccount',
      'api-1/tags/accounts/replaceAccount',
      'api-1/tags/administration',
      'api-1/tags/administration/purge',
      'api-1/webhooks',
      'api-1/webhooks/post-accountcreated',
      'api-1/models',
      'api-1/models/Account',
      'api-1/models/Error',
    ])
  })

  it('agrees with the navigation tree about order, without being derived from it', async () => {
    const store = await storeFor(SHELL_SPEC)

    const fromTree = preorder(store.navigation)
      .filter((node) => node.type !== 'text')
      .map((node) => node.id)

    /* The overview leads and is the one section that is not a node, so it is not in the tree walk. */
    expect(documentSections(store).map((section) => section.id).slice(1)).toEqual(fromTree)
  })

  it('opens with the overview, which is the one section that is not a node', async () => {
    const store = await storeFor(SHELL_SPEC)
    const [first] = documentSections(store)

    expect(first).toMatchObject({ id: 'api-1', kind: 'overview', level: 1, hasExample: false })
    expect(first!.node).toBeUndefined()
    expect(first!.id).toBe(store.source.slug)
  })

  it('makes a description heading an anchor rather than a section of its own', async () => {
    const store = await storeFor(SHELL_SPEC)

    /* Both levels: the nested one is only reachable by walking into the heading above it. */
    expect([...overviewAnchors(store)]).toEqual([
      'api-1/overview/getting-started',
      'api-1/overview/getting-started/authentication',
    ])
    expect(documentSections(store).some((section) => section.id.startsWith('api-1/overview'))).toBe(false)
  })

  it('gives a tag a heading and the things inside it the next one down', async () => {
    const store = await storeFor(SHELL_SPEC)
    const levels = new Map(documentSections(store).map((section) => [section.id, section.level]))

    expect(levels.get('api-1/tags/accounts')).toBe(2)
    expect(levels.get('api-1/tags/accounts/listAccounts')).toBe(3)
    expect(levels.get('api-1/models')).toBe(2)
    expect(levels.get('api-1/models/Account')).toBe(3)
  })

  it('counts a tag group as the extra level it is', async () => {
    const store = await storeFor(GROUPED_SPEC)

    expect(documentSections(store).map((section) => [section.id, section.level])).toEqual([
      ['api-1', 1],
      ['api-1/tags/money', 2],
      ['api-1/tags/payments', 3],
      ['api-1/tags/payments/listPayments', 4],
    ])
  })

  it('says which sections put something in the right-hand column', async () => {
    const store = await storeFor(SHELL_SPEC)
    const examples = new Map(documentSections(store).map((section) => [section.id, section.hasExample]))

    expect(examples.get('api-1/tags/accounts/listAccounts')).toBe(true)
    /* A webhook has no request sample, because nobody calls it - but it does have a payload. */
    expect(examples.get('api-1/webhooks/post-accountcreated')).toBe(true)
    /* A model shows one instance of the type it describes, in the same column as the rest. */
    expect(examples.get('api-1/models/Account')).toBe(true)
    expect(examples.get('api-1/tags/accounts')).toBe(false)
    expect(examples.get('api-1')).toBe(false)
  })

  it('has no model sections when the document hides models', async () => {
    const store = await storeFor(SHELL_SPEC, { config: { hideModels: true } })

    expect(documentSections(store).some((section) => section.id.startsWith('api-1/models'))).toBe(false)
  })

  it('is one section, and no anchors, for a document with nothing in it', async () => {
    const store = await storeFor({ openapi: '3.1.0', info: { title: 'Empty', version: '1.0.0' }, paths: {} })

    expect(documentSections(store).map((section) => section.kind)).toEqual(['overview'])
    expect(overviewAnchors(store).size).toBe(0)
  })

  it('walks the document once, however often it is asked', async () => {
    const store = await storeFor(SHELL_SPEC)

    expect(documentSections(store)).toBe(documentSections(store))
    expect(overviewAnchors(store)).toBe(overviewAnchors(store))
  })

  it('has nothing to say about a document that has not loaded', () => {
    expect(documentSections(undefined)).toEqual([])
    expect(overviewAnchors(undefined).size).toBe(0)
  })
})

describe('the section index', () => {
  it('finds a section by id without a scan', async () => {
    const store = await storeFor(SHELL_SPEC)
    const sections = documentSections(store)
    const index = sectionIndex(sections)

    expect(index.size).toBe(sections.length)
    for (const [position, section] of sections.entries()) {
      expect(index.get(section.id)).toBe(position)
    }
  })

  it('is built once per list', async () => {
    const store = await storeFor(SHELL_SPEC)

    expect(sectionIndex(documentSections(store))).toBe(sectionIndex(documentSections(store)))
  })
})

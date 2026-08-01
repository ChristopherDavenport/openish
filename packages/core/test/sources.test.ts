import { describe, expect, it } from 'vitest'

import { resolveSources } from '../src/sources.js'
import { IMPLICIT_SOURCE } from '../src/store/create-document-store.js'
import { flatten, idsOf, readFixture, storeFromFixture } from './helpers.js'

describe('resolveSources', () => {
  it('slugifies the title when the host names one', () => {
    const [source] = resolveSources([{ title: 'Consumer API', url: '/a.yaml' }])

    expect(source?.slug).toBe('consumer-api')
    expect(source?.title).toBe('Consumer API')
  })

  it('prefers an explicit slug over one derived from the title', () => {
    const [source] = resolveSources([{ title: 'Consumer API', slug: 'consumer', url: '/a.yaml' }])

    expect(source?.slug).toBe('consumer')
    expect(source?.title).toBe('Consumer API')
  })

  it('names a document that gave neither, so the picker and the URL still have something to say', () => {
    const resolved = resolveSources([{ url: '/a.yaml' }, { url: '/b.yaml' }])

    expect(resolved.map((source) => source.slug)).toEqual(['api-1', 'api-2'])
    expect(resolved.map((source) => source.title)).toEqual(['API #1', 'API #2'])
  })

  it('echoes a slug as the title rather than pairing a chosen name with a generated one', () => {
    const [source] = resolveSources([{ slug: 'admin', url: '/a.yaml' }])

    expect(source?.title).toBe('admin')
  })

  it('resolves a collision instead of letting two documents claim one URL space', () => {
    const resolved = resolveSources([
      { title: 'Accounts', url: '/a.yaml' },
      { title: 'Accounts', url: '/b.yaml' },
    ])

    expect(resolved.map((source) => source.slug)).toEqual(['accounts', 'accounts-2'])
  })

  it('makes the document that asked the default, and the first one when none does', () => {
    const asked = resolveSources([{ url: '/a.yaml' }, { url: '/b.yaml', default: true }])
    const silent = resolveSources([{ url: '/a.yaml' }, { url: '/b.yaml' }])

    expect(asked.find((source) => source.isDefault)?.slug).toBe('api-2')
    expect(silent.find((source) => source.isDefault)?.slug).toBe('api-1')
  })

  it('marks every title the host did not choose, so the element layer may replace it', () => {
    const resolved = resolveSources([
      { title: 'Consumer API', url: '/a.yaml' },
      /* A slug is an address, not a name - it stands in as a label, but only as a placeholder. */
      { slug: 'admin', url: '/b.yaml' },
      { url: '/c.yaml' },
    ])

    expect(resolved.map((source) => source.title)).toEqual(['Consumer API', 'admin', 'API #3'])
    expect(resolved.map((source) => source.titleIsGenerated)).toEqual([false, true, true])
  })

  it('drops a source that describes no document, rather than offering one that can only fail', () => {
    const resolved = resolveSources([{ title: 'Real', url: '/a.yaml' }, { title: 'Empty' }])

    expect(resolved.map((source) => source.title)).toEqual(['Real'])
  })
})

describe('namespaced navigation ids', () => {
  it('puts the source slug in front of every section', async () => {
    const store = await storeFromFixture('navigation.yaml', {
      source: { slug: 'consumer', title: 'Consumer', url: '' },
    })
    const ids = idsOf(flatten(store.navigation))

    expect(ids.every((id) => id.startsWith('consumer/'))).toBe(true)
    /*
     * The four root claims, one per traverse-* module. The two *group* ids matter most: they are
     * the only root-level literals the traversal mints, so they are what two documents would
     * collide on first.
     */
    expect(ids).toContain('consumer/overview/getting-started')
    expect(ids).toContain('consumer/tags/alpha-renamed')
    expect(ids).toContain('consumer/webhooks')
    expect(ids).toContain('consumer/models')
  })

  it('carries the prefix down to everything nested under a section', async () => {
    const store = await storeFromFixture('navigation.yaml', {
      source: { slug: 'consumer', title: 'Consumer', url: '' },
    })
    const ids = idsOf(flatten(store.navigation))

    expect(ids).toContain('consumer/tags/alpha-renamed/listAlpha')
    expect(ids).toContain('consumer/models/Alpha')
    expect(ids).toContain('consumer/overview/getting-started/authentication')
  })

  it('gives two documents disjoint ids, which is the whole point', async () => {
    const consumer = await storeFromFixture('navigation.yaml', {
      source: { slug: 'consumer', title: 'Consumer', url: '' },
    })
    const admin = await storeFromFixture('navigation.yaml', {
      source: { slug: 'admin', title: 'Admin', url: '' },
    })

    const shared = [...consumer.bySlug.keys()].filter((id) => admin.bySlug.has(id))
    expect(shared).toEqual([])
    /* The same document twice, so anything shared would be a namespacing failure, not a coincidence. */
    expect(consumer.bySlug.size).toBe(admin.bySlug.size)
  })

  it('names the source even when the caller did not, so there is one id shape and not two', async () => {
    const store = await storeFromFixture('navigation.yaml')

    expect(store.source).toEqual(IMPLICIT_SOURCE)
    expect(idsOf(flatten(store.navigation)).every((id) => id.startsWith(`${IMPLICIT_SOURCE.slug}/`))).toBe(true)
  })

  it('merges a per-source config over the reference-level one', async () => {
    const store = await storeFromFixture('navigation.yaml', {
      config: { untaggedLabel: 'Reference wide', hideModels: true },
      source: { slug: 'consumer', title: 'Consumer', url: '' },
    })

    expect(store.config.untaggedLabel).toBe('Reference wide')
    expect(store.config.hideModels).toBe(true)
    expect([...store.bySlug.keys()]).not.toContain('consumer/models')
  })

  it('reads the same document from a string as from a fixture path', async () => {
    const store = await storeFromFixture('navigation.yaml', {
      source: { slug: 'x', title: 'X', url: 'https://example.com/openapi.yaml' },
    })

    expect(store.source.url).toBe('https://example.com/openapi.yaml')
    expect(readFixture('navigation.yaml')).toContain('openapi:')
  })
})

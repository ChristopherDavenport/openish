import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { createDocumentStore } from '../src/store/create-document-store.js'
import { flatten } from './helpers.js'

/**
 * `@scalar/galaxy` is Scalar's own example document: a complete, realistic 3.1 definition with tags,
 * webhooks, models, security schemes, and composition. It is the broad-shape check - the hand-written
 * fixtures cover single behaviours, this one covers "does a whole real document come through intact".
 *
 * Assertions are deliberately structural rather than exact counts, so a galaxy version bump does not
 * fail the suite for reasons that have nothing to do with openish.
 */
const galaxy = readFileSync(createRequire(import.meta.url).resolve('@scalar/galaxy/latest.yaml'), 'utf8')

describe('@scalar/galaxy', () => {
  it('builds a store', async () => {
    const store = await createDocumentStore(galaxy)

    expect(store.document.info?.title).toBe('Scalar Galaxy')
    expect(store.document.openapi).toMatch(/^3\.1/)
  })

  it('produces tags with operations under them', async () => {
    const store = await createDocumentStore(galaxy)
    const tags = store.navigation.filter((node) => node.type === 'tag')

    expect(tags.length).toBeGreaterThan(1)
    expect(tags.every((tag) => tag.type === 'tag' && tag.children.length > 0)).toBe(true)
  })

  it('mints unique ids across the whole tree', async () => {
    const store = await createDocumentStore(galaxy)
    const ids = flatten(store.navigation).map((node) => node.id)

    expect(ids.length).toBeGreaterThan(10)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('indexes every node, and every id is URL-safe', async () => {
    const store = await createDocumentStore(galaxy)

    expect(store.bySlug.size).toBe(flatten(store.navigation).length)
    for (const id of store.bySlug.keys()) {
      expect(id, `${id} is not URL-safe`).toMatch(/^[A-Za-z0-9_.~/-]+$/)
      expect(encodeURI(id)).toBe(id)
    }
  })

  it('finds the models and webhooks sections', async () => {
    const store = await createDocumentStore(galaxy)
    const ids = store.navigation.map((node) => node.id)

    expect(ids).toContain('models')
    expect(ids).toContain('webhooks')
  })

  it('honours hideModels on a real document', async () => {
    const store = await createDocumentStore(galaxy, { config: { hideModels: true } })

    expect(store.navigation.map((node) => node.id)).not.toContain('models')
  })

  it('generates an example for every schema without hanging', async () => {
    const store = await createDocumentStore(galaxy)
    const { schemaExample } = await import('../src/schema/schema-example.js')

    for (const [name, schema] of Object.entries(store.document.components?.schemas ?? {})) {
      expect(() => schemaExample(schema), `schema ${name} threw`).not.toThrow()
    }
  })

  it('builds a HAR request for every operation', async () => {
    const store = await createDocumentStore(galaxy)
    const { collectOperations } = await import('../src/navigation/operations.js')
    const { operationToHar } = await import('../src/har/operation-to-har.js')

    const entries = collectOperations(store.document.paths as Record<string, unknown>, 'paths')
    expect(entries.length).toBeGreaterThan(0)

    for (const entry of entries) {
      const har = operationToHar({
        document: store.document,
        operation: entry.operation,
        pathItem: entry.pathItem,
        path: entry.path,
        method: entry.method,
      })

      expect(har.method, `${entry.method} ${entry.path}`).toBe(entry.method.toUpperCase())
      /* No unsubstituted path template should survive into the sample URL. */
      expect(har.url, `${entry.method} ${entry.path}`).not.toMatch(/[{}]/)
    }
  })
})

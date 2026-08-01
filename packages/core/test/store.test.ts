import { describe, expect, it, vi } from 'vitest'

import { createDocumentStore } from '../src/store/create-document-store.js'
import { getResolvedRef, isRefObject } from '../src/ref.js'
import { readFixture, storeFromFixture } from './helpers.js'

describe('createDocumentStore', () => {
  it('accepts YAML, JSON, and an already-parsed object', async () => {
    const yaml = readFixture('composition.yaml')
    const object = { openapi: '3.1.0', info: { title: 'Object', version: '1.0.0' }, paths: {} }

    await expect(createDocumentStore(yaml)).resolves.toBeDefined()
    await expect(createDocumentStore(JSON.stringify({ ...object, info: { ...object.info } }))).resolves.toBeDefined()
    await expect(createDocumentStore(object)).resolves.toBeDefined()
  })

  it('upgrades a Swagger 2.0 document to 3.1 so there is one shape downstream', async () => {
    const store = await storeFromFixture('swagger-2.0.yaml')

    expect(store.document.openapi).toMatch(/^3\.1/)
    /* `definitions` becomes `components.schemas`, and `host`/`basePath` become a server. */
    expect(store.document.components?.schemas?.['Widget']).toBeDefined()
    expect(store.document.servers?.[0]?.url).toBe('https://api.example.com/v1')
    expect(store.navigation.some((node) => node.type === 'tag' && node.name === 'widgets')).toBe(true)
  })

  it('leaves $refs unexpanded but resolvable on access', async () => {
    const store = await storeFromFixture('cyclic.yaml')
    const node = store.document.components?.schemas?.['Node'] as Record<string, Record<string, unknown>>
    const parent = node['properties']?.['parent']

    /* Still a reference in the document... */
    expect(isRefObject(parent)).toBe(true)
    /* ...and the same schema when read through the proxy. */
    expect((getResolvedRef(parent) as Record<string, unknown>)['type']).toBe('object')
  })

  it('resolves a reference reached through a response body', async () => {
    const store = await storeFromFixture('cyclic.yaml')
    const paths = store.document.paths as Record<string, Record<string, Record<string, never>>>
    const schema =
      paths['/tree']?.['get']?.['responses']?.['200']?.['content']?.['application/json']?.['schema']

    expect((getResolvedRef(schema) as Record<string, unknown>)['type']).toBe('object')
  })

  it('exposes the raw document without proxy wrappers', async () => {
    const store = await storeFromFixture('cyclic.yaml')

    expect(JSON.stringify(store.raw)).toContain('"$ref":"#/components/schemas/Node"')
  })

  it('freezes the store, because it is replaced rather than mutated', async () => {
    const store = await storeFromFixture('composition.yaml')

    expect(Object.isFrozen(store)).toBe(true)
  })

  it('carries the resolved config', async () => {
    const store = await storeFromFixture('composition.yaml', { config: { layout: 'classic' } })

    expect(store.config.layout).toBe('classic')
    expect(store.config.modelsSectionLabel).toBe('Models')
  })

  it('reports an unresolvable external reference instead of failing the whole document', async () => {
    const onReferenceError = vi.fn()
    const document = {
      openapi: '3.1.0',
      info: { title: 'Dangling', version: '1.0.0' },
      paths: {
        '/thing': {
          get: {
            summary: 'Get a thing',
            responses: {
              '200': {
                description: 'OK',
                content: { 'application/json': { schema: { $ref: './missing.yaml#/Thing' } } },
              },
            },
          },
        },
      },
    }

    const store = await createDocumentStore(document, {
      /* No loader can handle a relative file path in this environment, which is the point. */
      plugins: [],
      onReferenceError,
    })

    expect(onReferenceError).toHaveBeenCalled()
    expect(store.navigation.length).toBeGreaterThan(0)
  })

  it('rejects a multi-file filesystem with a clear message', async () => {
    await expect(
      createDocumentStore([{ isEntrypoint: true, references: [], filename: 'a.yaml', dir: '.', specification: {} }] as never),
    ).rejects.toThrow(/single OpenAPI document/)
  })
})

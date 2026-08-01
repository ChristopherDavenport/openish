import { describe, expect, it } from 'vitest'

import { operationToHar } from '../src/har/operation-to-har.js'
import { preferredSecurityIndex, securityRequirements, securitySchemesFor } from '../src/operation/security.js'
import { resolveOperationNode } from '../src/navigation/resolve.js'
import { createDocumentStore } from '../src/store/create-document-store.js'
import type { DocumentStore, NavOperationNode } from '../src/index.js'
import { findNode, storeFromFixture } from './helpers.js'

const harFor = (store: DocumentStore, id: string, options = {}) => {
  const node = findNode(store, id) as NavOperationNode
  const resolved = resolveOperationNode(store.document, node)!

  return operationToHar(
    {
      document: store.document,
      operation: resolved.operation!,
      pathItem: resolved.pathItem,
      path: resolved.path,
      method: resolved.method,
    },
    options,
  )
}

const headerValue = (har: { headers: { name: string; value: string }[] }, name: string) =>
  har.headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value

const queryValue = (har: { queryString: { name: string; value: string }[] }, name: string) =>
  har.queryString.find((entry) => entry.name === name)?.value

describe('securityRequirements', () => {
  it('reads the alternatives a document declares', async () => {
    const store = await storeFromFixture('request.yaml')
    const requirements = securityRequirements(store.document, {})

    expect(requirements).toHaveLength(1)
    expect(requirements[0]?.entries.map((entry) => entry.name)).toEqual(['bearerAuth'])
    expect(requirements[0]?.entries[0]?.scheme?.type).toBe('http')
  })

  it('lets an operation replace the document’s requirement, including with none', async () => {
    const store = await createDocumentStore({
      openapi: '3.1.0',
      info: { title: 'Auth', version: '1' },
      security: [{ apiKey: [] }],
      paths: {
        '/open': { get: { security: [], responses: { '200': { description: 'ok' } } } },
        '/other': { get: { security: [{ oauth: ['read'] }], responses: { '200': { description: 'ok' } } } },
      },
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-Key', in: 'header' },
          oauth: { type: 'oauth2', flows: {} },
        },
      },
    })

    const paths = store.document.paths as Record<string, { get: object }>
    expect(securityRequirements(store.document, paths['/open']!.get)).toEqual([])
    expect(securityRequirements(store.document, paths['/other']!.get)[0]?.entries[0]?.scopes).toEqual(['read'])
  })

  it('reports a scheme the document requires but never declares', async () => {
    const store = await createDocumentStore({
      openapi: '3.1.0',
      info: { title: 'Undeclared', version: '1' },
      paths: {
        '/x': { get: { security: [{ missing: [] }], responses: { '200': { description: 'ok' } } } },
      },
    })

    const paths = store.document.paths as Record<string, { get: object }>
    const [requirement] = securityRequirements(store.document, paths['/x']!.get)

    /* The document in this repo does exactly this. Rendering "required, not declared" beats throwing. */
    expect(requirement?.entries[0]).toEqual({ name: 'missing', scheme: undefined, scopes: [] })
  })

  it('reads `{}` as the anonymous alternative rather than as nothing', async () => {
    const store = await createDocumentStore({
      openapi: '3.1.0',
      info: { title: 'Optional', version: '1' },
      paths: {
        '/x': { get: { security: [{}, { key: [] }], responses: { '200': { description: 'ok' } } } },
      },
      components: { securitySchemes: { key: { type: 'apiKey', name: 'X-Key', in: 'header' } } },
    })

    const paths = store.document.paths as Record<string, { get: object }>
    const requirements = securityRequirements(store.document, paths['/x']!.get)

    expect(requirements.map((requirement) => requirement.anonymous)).toEqual([true, false])
  })

  it('unions the scopes when one scheme appears in several alternatives', async () => {
    const store = await createDocumentStore({
      openapi: '3.1.0',
      info: { title: 'Scopes', version: '1' },
      paths: {
        '/x': {
          get: {
            security: [{ oauth: ['read'] }, { oauth: ['read', 'write'] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: { securitySchemes: { oauth: { type: 'oauth2', flows: {} } } },
    })

    const paths = store.document.paths as Record<string, { get: object }>
    expect(securitySchemesFor(store.document, paths['/x']!.get)[0]?.scopes).toEqual(['read', 'write'])
  })
})

describe('operationToHar with reader-supplied values', () => {
  it('uses a supplied parameter value over the one derived from the document', async () => {
    const store = await storeFromFixture('request.yaml')
    const har = harFor(store, 'tags/notes/createNote', {
      parameterValues: { 'path:userId': 'u_999', 'query:limit': '5' },
    })

    expect(har.url).toContain('/users/u_999/notes')
    expect(queryValue(har, 'limit')).toBe('5')
  })

  it('sends a parameter the reader filled in that the sample would have left out', async () => {
    const store = await storeFromFixture('request.yaml')

    /* `verbose` is optional with no example, so `shouldInclude` drops it - unless someone typed one. */
    expect(queryValue(harFor(store, 'tags/notes/createNote'), 'verbose')).toBeUndefined()
    expect(
      queryValue(harFor(store, 'tags/notes/createNote', { parameterValues: { 'query:verbose': 'true' } }), 'verbose'),
    ).toBe('true')
  })

  it('keeps the placeholder until a credential exists, then uses it', async () => {
    const store = await storeFromFixture('request.yaml')

    expect(headerValue(harFor(store, 'tags/notes/createNote'), 'Authorization')).toBe('Bearer YOUR_TOKEN')
    expect(
      headerValue(harFor(store, 'tags/notes/createNote', { credentials: { bearerAuth: 'abc123' } }), 'Authorization'),
    ).toBe('Bearer abc123')
  })

  it('does not prefix a credential that already carries its scheme', async () => {
    const store = await storeFromFixture('request.yaml')
    const har = harFor(store, 'tags/notes/createNote', { credentials: { bearerAuth: 'Bearer abc123' } })

    expect(headerValue(har, 'Authorization')).toBe('Bearer abc123')
  })

  it('replaces the generated body with an edited one', async () => {
    const store = await storeFromFixture('request.yaml')
    const har = harFor(store, 'tags/notes/createNote', {
      body: { mediaType: 'application/json', text: '{"title":"edited"}' },
    })

    expect(har.postData).toEqual({ mimeType: 'application/json', text: '{"title":"edited"}' })
    expect(headerValue(har, 'Content-Type')).toBe('application/json')
  })

  it('applies the alternative the reader picked, not always the first', async () => {
    const store = await createDocumentStore({
      openapi: '3.1.0',
      info: { title: 'Either', version: '1' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/x': {
          get: {
            operationId: 'either',
            tags: ['x'],
            security: [{ bearer: [] }, { key: [] }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer' },
          key: { type: 'apiKey', name: 'X-Key', in: 'query' },
        },
      },
    })

    const first = harFor(store, 'tags/x/either', { credentials: { bearer: 't', key: 'k' } })
    const second = harFor(store, 'tags/x/either', { credentials: { bearer: 't', key: 'k' }, securityIndex: 1 })

    expect(headerValue(first, 'Authorization')).toBe('Bearer t')
    expect(queryValue(first, 'X-Key')).toBeUndefined()
    expect(headerValue(second, 'Authorization')).toBeUndefined()
    expect(queryValue(second, 'X-Key')).toBe('k')
  })
})

describe('preferredSecurityIndex', () => {
  const requirements = (...alternatives: Record<string, string[]>[]) =>
    securityRequirements(
      { components: { securitySchemes: { a: { type: 'http' }, b: { type: 'http' }, c: { type: 'http' } } } } as never,
      { security: alternatives } as never,
    )

  it('picks the first alternative when the reader holds nothing', () => {
    expect(preferredSecurityIndex(requirements({ a: [] }, { b: [] }))).toBe(0)
  })

  it('picks the alternative the reader can actually satisfy', () => {
    expect(preferredSecurityIndex(requirements({ a: [] }, { b: [] }), { credentials: { b: 'token' } })).toBe(1)
  })

  it('requires every scheme of an AND alternative before preferring it', () => {
    const reqs = requirements({ a: [], b: [] }, { c: [] })

    expect(preferredSecurityIndex(reqs, { credentials: { a: 'one', c: 'three' } })).toBe(1)
    expect(preferredSecurityIndex(reqs, { credentials: { a: 'one', b: 'two' } })).toBe(0)
  })

  it('falls back to a partly satisfied alternative over one with nothing at all', () => {
    expect(preferredSecurityIndex(requirements({ a: [] }, { b: [], c: [] }), { credentials: { c: 'three' } })).toBe(1)
  })

  it('honours a host preference while the reader holds nothing', () => {
    expect(preferredSecurityIndex(requirements({ a: [] }, { b: [] }), { preferred: 'b' })).toBe(1)
  })

  it('names every scheme of an AND alternative to select it', () => {
    expect(preferredSecurityIndex(requirements({ a: [] }, { b: [], c: [] }), { preferred: ['b', 'c'] })).toBe(1)
  })

  it('ignores a preference the document does not offer', () => {
    expect(preferredSecurityIndex(requirements({ a: [] }, { b: [] }), { preferred: 'nope' })).toBe(0)
  })

  it('never picks the anonymous alternative over one the reader can satisfy', () => {
    expect(preferredSecurityIndex(requirements({}, { a: [] }), { credentials: { a: 'token' } })).toBe(1)
  })

  it('answers 0 for an operation that requires nothing', () => {
    expect(preferredSecurityIndex([])).toBe(0)
  })
})

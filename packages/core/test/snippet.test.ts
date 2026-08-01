import { describe, expect, it } from 'vitest'

import { operationToHar } from '../src/har/operation-to-har.js'
import { findSnippetClient, generateSnippet, snippetClients, SNIPPET_CLIENTS } from '../src/har/snippet.js'
import { resolveOperationNode } from '../src/navigation/resolve.js'
import type { DocumentStore, NavOperationNode } from '../src/index.js'
import { findNode, storeFromFixture } from './helpers.js'

const harFor = (store: DocumentStore, id: string) => {
  const node = findNode(store, id) as NavOperationNode
  const resolved = resolveOperationNode(store.document, node)
  if (!resolved?.operation) {
    throw new Error(`No operation behind "${id}"`)
  }

  return operationToHar({
    document: store.document,
    operation: resolved.operation,
    pathItem: resolved.pathItem,
    path: resolved.path,
    method: resolved.method,
  })
}

describe('resolveOperationNode', () => {
  it('walks a node back to its operation and the path item above it', async () => {
    const store = await storeFromFixture('request.yaml')
    const resolved = resolveOperationNode(store.document, findNode(store, 'tags/notes/createNote') as NavOperationNode)

    expect(resolved?.path).toBe('/users/{userId}/notes')
    expect(resolved?.method).toBe('post')
    expect(resolved?.operation?.operationId).toBe('createNote')
    /* The path item is the half that carries the parameters the operation inherits. */
    expect(resolved?.pathItem?.parameters).toHaveLength(2)
  })

  it('returns undefined rather than throwing when there is no document yet', () => {
    expect(resolveOperationNode(undefined, undefined)).toBeUndefined()
  })
})

describe('the client list', () => {
  it('is built from what snippetz supports, not from a list kept here', () => {
    expect(SNIPPET_CLIENTS.length).toBeGreaterThan(30)
    expect(findSnippetClient('shell/curl')).toEqual({
      id: 'shell/curl',
      target: 'shell',
      client: 'curl',
      targetLabel: 'Shell',
      clientLabel: 'curl',
      language: 'bash',
    })
  })

  it('spells package names the way their authors do', () => {
    expect(findSnippetClient('clojure/clj_http')?.clientLabel).toBe('clj-http')
    expect(findSnippetClient('python/httpx_sync')?.clientLabel).toBe('httpx-sync')
  })

  it('drops hidden clients and keeps the rest in target order', () => {
    const clients = snippetClients(['shell/curl', 'shell/wget'])

    expect(clients.map((client) => client.id)).not.toContain('shell/curl')
    expect(clients.map((client) => client.id)).toContain('shell/httpie')
    expect(clients).toHaveLength(SNIPPET_CLIENTS.length - 2)
  })
})

describe('generateSnippet', () => {
  it('generates a sample carrying the resolved server URL and the auth placeholder', async () => {
    const store = await storeFromFixture('request.yaml')
    const snippet = await generateSnippet(harFor(store, 'tags/notes/createNote'), 'shell/curl')

    expect(snippet).toContain('https://us.example.com/v1/users/u_123/notes')
    expect(snippet).toContain('--request POST')
    expect(snippet).toContain('Bearer YOUR_TOKEN')
  })

  it('generates the same request for a different client', async () => {
    const store = await storeFromFixture('request.yaml')
    const snippet = await generateSnippet(harFor(store, 'tags/notes/createNote'), 'python/requests')

    expect(snippet).toContain('https://us.example.com/v1/users/u_123/notes')
    expect(snippet).toContain('requests')
  })

  it('answers undefined for a client id that names no plugin', async () => {
    const store = await storeFromFixture('request.yaml')

    expect(await generateSnippet(harFor(store, 'tags/notes/createNote'), 'cobol/cics')).toBeUndefined()
    expect(await generateSnippet(harFor(store, 'tags/notes/createNote'), 'nonsense')).toBeUndefined()
  })
})

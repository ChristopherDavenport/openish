import { snippetz } from '@scalar/snippetz'
import { describe, expect, it } from 'vitest'

import { operationToHar, resolveServerUrl } from '../src/har/operation-to-har.js'
import { collectOperations } from '../src/navigation/operations.js'
import type { DocumentStore } from '../src/types.js'
import { storeFromFixture } from './helpers.js'

const harFor = (store: DocumentStore, operationId: string) => {
  const entry = collectOperations(store.document.paths as Record<string, unknown>, 'paths').find(
    (candidate) => candidate.operation.operationId === operationId,
  )
  if (!entry) {
    throw new Error(`No operation with id "${operationId}"`)
  }

  return operationToHar({
    document: store.document,
    operation: entry.operation,
    pathItem: entry.pathItem,
    path: entry.path,
    method: entry.method,
  })
}

const valueOf = (list: { name: string; value: string }[], name: string) =>
  list.find((entry) => entry.name === name)?.value

describe('resolveServerUrl', () => {
  it('substitutes variables from their declared defaults', () => {
    expect(
      resolveServerUrl({ url: 'https://{region}.example.com/{version}', variables: { region: { default: 'eu' } } }),
    ).toBe('https://eu.example.com/{version}')
  })

  it('prefers caller overrides', () => {
    expect(
      resolveServerUrl({ url: 'https://{region}.example.com', variables: { region: { default: 'us' } } }, { region: 'ap' }),
    ).toBe('https://ap.example.com')
  })

  it('returns an empty string when there is no server', () => {
    expect(resolveServerUrl(undefined)).toBe('')
  })
})

describe('operationToHar', () => {
  it('expands the server and path templates', async () => {
    const store = await storeFromFixture('request.yaml')

    expect(harFor(store, 'createNote').url).toBe('https://us.example.com/v1/users/u_123/notes')
  })

  it('lets an operation parameter override the path-level one of the same name', async () => {
    const store = await storeFromFixture('request.yaml')

    expect(valueOf(harFor(store, 'createNote').headers, 'trace')).toBe('operation-level')
  })

  it('includes required query parameters and those with a default, but not bare optional ones', async () => {
    const store = await storeFromFixture('request.yaml')
    const { queryString } = harFor(store, 'createNote')

    expect(valueOf(queryString, 'limit')).toBe('25')
    expect(valueOf(queryString, 'fields')).toBe('id,title')
    expect(queryString.map((entry) => entry.name)).not.toContain('verbose')
  })

  it('carries cookie parameters', async () => {
    const store = await storeFromFixture('request.yaml')

    expect(valueOf(harFor(store, 'createNote').cookies, 'session')).toBe('abc')
  })

  it('adds a labelled auth placeholder rather than a fabricated credential', async () => {
    const store = await storeFromFixture('request.yaml')

    expect(valueOf(harFor(store, 'createNote').headers, 'Authorization')).toBe('Bearer YOUR_TOKEN')
  })

  it('builds a request body from the schema and sets Content-Type', async () => {
    const store = await storeFromFixture('request.yaml')
    const har = harFor(store, 'createNote')

    expect(valueOf(har.headers, 'Content-Type')).toBe('application/json')
    expect(JSON.parse(har.postData?.text ?? '{}')).toEqual({ title: 'Groceries' })
  })

  it('omits writeOnly fields from the generated body', async () => {
    const store = await storeFromFixture('request.yaml')

    expect(harFor(store, 'createNote').postData?.text).not.toContain('secret')
  })

  it('produces a request snippetz can turn into a code sample', async () => {
    const store = await storeFromFixture('request.yaml')
    const snippet = snippetz().print('shell', 'curl', harFor(store, 'createNote'))

    expect(snippet).toContain('https://us.example.com/v1/users/u_123/notes')
    expect(snippet).toContain('--request POST')
    expect(snippet).toContain('Bearer YOUR_TOKEN')
  })
})

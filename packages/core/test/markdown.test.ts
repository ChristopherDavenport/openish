import { describe, expect, it } from 'vitest'

import { nodeToMarkdown } from '../src/markdown/node-to-markdown.js'
import { findNode, storeFromFixture } from './helpers.js'

describe('a section as markdown', () => {
  it('says what an operation is, takes, and answers with', async () => {
    const store = await storeFromFixture('request.yaml')
    const markdown = nodeToMarkdown(store, findNode(store, 'tags/notes/createNote'))

    expect(markdown).toContain('# Create a note')
    expect(markdown).toContain('`POST /users/{userId}/notes`')
    expect(markdown).toContain('Operation ID: `createNote`')

    /*
     * Everything the reader sends is under one heading, grouped by where it travels - the same
     * question answered in the same shape the page answers it in. The location is the heading now,
     * so it has stopped being a column.
     */
    expect(markdown).toContain('## Parameters')
    expect(markdown).toContain('### Path')
    expect(markdown).toContain('| Name | Type | Required | Description |')
    expect(markdown).toContain('| `userId` | string | Yes |')
    /* Including the operation-level override of a path-level parameter. */
    expect(markdown).toContain('### Query')
    expect(markdown).toContain('| `limit` | integer | Yes |')
    expect(markdown).toContain('### Cookie')
    expect(markdown).toContain('| `session` | string | Yes |')

    expect(markdown).toContain('### Body')
    expect(markdown).toContain('`application/json`')
    /* Documented here, but shown once - the copy the reader can act on is the request below. */
    expect(markdown.indexOf('"title": "Groceries"')).toBe(markdown.lastIndexOf('"title": "Groceries"'))
    expect(markdown.indexOf('"title": "Groceries"')).toBeGreaterThan(markdown.indexOf('```http'))

    expect(markdown).toContain('## Returns')
    expect(markdown).toContain('`201` — Created')
  })

  it('builds the request from the same reads the code sample is built from', async () => {
    const store = await storeFromFixture('request.yaml')
    const markdown = nodeToMarkdown(store, findNode(store, 'tags/notes/createNote'))

    /* The server template is expanded, the path parameter substituted, the query string carried. */
    expect(markdown).toContain('POST https://us.example.com/v1/users/u_123/notes?limit=25&fields=id,title')
    /* The operation-level `trace` won, and the credential is a labelled placeholder. */
    expect(markdown).toContain('trace: operation-level')
    expect(markdown).toContain('Authorization: Bearer YOUR_TOKEN')
  })

  it('says what the reader has to hold to make the call', async () => {
    const store = await storeFromFixture('request.yaml')
    const markdown = nodeToMarkdown(store, findNode(store, 'tags/notes/createNote'))

    expect(markdown).toContain('## Authorization')
    expect(markdown).toContain('- `bearerAuth` (HTTP bearer)')
  })

  it('takes the whole tag, and says which heading contains which', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const markdown = nodeToMarkdown(store, findNode(store, 'tags/zebra'))

    expect(markdown.startsWith('# zebra')).toBe(true)
    expect(markdown).toContain('The zebra tag.')

    /* Every operation in the tag, each one level down from the tag itself. */
    expect(markdown).toContain('## List zebra')
    expect(markdown).toContain('## In two tags')
    /* And their sections another level down again, so nothing is ambiguous about what contains what. */
    expect(markdown).toContain('### Returns')
  })

  it('starts wherever it is told to, so a section inside a copy is a chapter of one', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const node = findNode(store, 'tags/alpha-renamed/listAlpha')

    expect(nodeToMarkdown(store, node).startsWith('# List alpha')).toBe(true)
    expect(nodeToMarkdown(store, node, { depth: 3 }).startsWith('### List alpha')).toBe(true)
  })

  it('marks a deprecated operation as one', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const markdown = nodeToMarkdown(store, findNode(store, 'tags/default/delete-loose'))

    expect(markdown).toContain('**Deprecated.**')
  })

  it('gives a webhook no request, because nobody sends it one', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const markdown = nodeToMarkdown(store, findNode(store, 'webhooks/post-newthing'))

    expect(markdown).toContain('# A thing was created')
    expect(markdown).toContain('## Returns')
    expect(markdown).not.toContain('## Request')
  })

  it('documents a model as its shape and an example', async () => {
    const store = await storeFromFixture('composition.yaml')
    const [model] = [...store.bySlug.values()].filter((node) => node.type === 'model')
    const markdown = nodeToMarkdown(store, model)

    expect(markdown).toContain('- `id` — `string (uuid)` · required')
    expect(markdown).toContain('## Example')
    expect(markdown).toContain('```json')
  })
})

describe('the overview as markdown', () => {
  it('says what the document says about itself', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const markdown = nodeToMarkdown(store, undefined)

    expect(markdown.startsWith('# Navigation')).toBe(true)
    expect(markdown).toContain('Version 1.0.0')
    expect(markdown).toContain('## Servers')
    /* The template is expanded with the document's own defaults, as the page expands it. */
    expect(markdown).toContain('`https://us.example.com/v1`')
  })

  it('pushes the author’s own headings down to where they belong under ours', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const markdown = nodeToMarkdown(store, undefined)

    /* `# Getting started` in `info.description` becomes `##`, under the `#` title above it. */
    expect(markdown).toContain('\n## Getting started')
    expect(markdown).toContain('\n### Authentication')
    expect(markdown).not.toContain('\n# Getting started')

    /* And a `#` inside a fence is a shell comment, which is not a heading and is left alone. */
    expect(markdown).toContain('# This is a shell comment, not a heading.')
  })

  it('is what a description heading copies, because it is part of the overview', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const heading = [...store.bySlug.values()].find((node) => node.type === 'text')!

    expect(nodeToMarkdown(store, heading)).toBe(nodeToMarkdown(store, undefined))
  })
})

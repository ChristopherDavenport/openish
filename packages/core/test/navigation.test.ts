import { describe, expect, it } from 'vitest'

import { extractHeadings } from '../src/navigation/traverse-description.js'
import type { NavGroupNode, NavTagNode } from '../src/types.js'
import { findNode, flatten, idsOf, relativeId, relativeIdsOf, storeFromFixture } from './helpers.js'

const tagsOf = (store: Awaited<ReturnType<typeof storeFromFixture>>): NavTagNode[] =>
  store.navigation.filter((node): node is NavTagNode => node.type === 'tag')

describe('navigation', () => {
  it('keeps the declared tag order, then appends tags that only appear on operations', async () => {
    const store = await storeFromFixture('navigation.yaml')

    expect(tagsOf(store).map((tag) => tag.name)).toEqual(['zebra', 'alpha', 'omega', ''])
  })

  it('drops declared tags that no operation uses', async () => {
    const store = await storeFromFixture('navigation.yaml')

    expect(tagsOf(store).map((tag) => tag.name)).not.toContain('unused')
  })

  it('honours x-displayName for the title while keeping the tag name for matching', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const alpha = tagsOf(store).find((tag) => tag.name === 'alpha')

    expect(alpha?.title).toBe('Alpha (renamed)')
    expect(relativeId(store, alpha?.id)).toBe('tags/alpha-renamed')
  })

  it('puts the untagged bucket last and labels it from config', async () => {
    const store = await storeFromFixture('navigation.yaml', { config: { untaggedLabel: 'Other' } })
    const tags = tagsOf(store)
    const last = tags[tags.length - 1]

    expect(last?.isUntagged).toBe(true)
    expect(last?.title).toBe('Other')
    expect(last?.children).toHaveLength(2)
  })

  it('lists an operation under every tag it declares', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const titles = (name: string) => tagsOf(store).find((tag) => tag.name === name)?.children.map((n) => n.title)

    expect(titles('alpha')).toContain('In two tags')
    expect(titles('zebra')).toContain('In two tags')
  })

  it('gives colliding summaries distinct ids', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const zebra = tagsOf(store).find((tag) => tag.name === 'zebra')
    const collisions = zebra?.children.filter((node) => node.title === 'List zebra') ?? []

    expect(collisions).toHaveLength(2)
    expect(relativeIdsOf(store, collisions)).toEqual(['tags/zebra/get-zebra', 'tags/zebra/post-zebra'])
  })

  it('mints globally unique ids', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const ids = flatten(store.navigation).map((node) => node.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('produces the same ids on a second run of the same document', async () => {
    const [first, second] = await Promise.all([
      storeFromFixture('navigation.yaml'),
      storeFromFixture('navigation.yaml'),
    ])

    expect(flatten(first.navigation).map((n) => n.id)).toEqual(flatten(second.navigation).map((n) => n.id))
  })

  it('indexes every node by slug', async () => {
    const store = await storeFromFixture('navigation.yaml')

    expect(store.bySlug.size).toBe(flatten(store.navigation).length)
    expect(findNode(store, 'tags/alpha-renamed/listAlpha').type).toBe('operation')
  })

  it('prefers operationId for the slug and summary for the title', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const node = findNode(store, 'tags/alpha-renamed/listAlpha')

    expect(node.title).toBe('List alpha')
    expect(node.type === 'operation' && node.operationId).toBe('listAlpha')
  })

  it('slugifies prose but leaves identifiers as the author wrote them', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const ids = relativeIdsOf(store, flatten(store.navigation))

    /* `listAlpha` is an operationId; `List zebra` is a summary. */
    expect(ids).toContain('tags/alpha-renamed/listAlpha')
    expect(ids).toContain('tags/zebra/get-zebra')
  })

  it('records deprecation and the JSON pointer', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const deprecated = flatten(store.navigation).find((node) => node.title === 'Deprecated and untagged')

    expect(deprecated?.type === 'operation' && deprecated.deprecated).toBe(true)
    expect(deprecated?.type === 'operation' && deprecated.pointer).toBe('#/paths/~1loose/delete')
  })

  it('builds a webhooks group', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const webhooks = findNode(store, 'webhooks') as NavGroupNode

    expect(webhooks?.children.map((node) => node.title)).toEqual(['A thing was created'])
    expect(webhooks?.children[0]?.type).toBe('webhook')
  })

  it('builds a models group, and omits it when hideModels is set', async () => {
    const shown = await storeFromFixture('navigation.yaml')
    const hidden = await storeFromFixture('navigation.yaml', { config: { hideModels: true } })

    const models = findNode(shown, 'models') as NavGroupNode
    expect(models?.children.map((node) => node.title)).toEqual(['Alpha', 'Beta'])
    /* Schema names are identifiers, so their case survives into the URL. */
    expect(relativeIdsOf(shown, models?.children ?? [])).toEqual(['models/Alpha', 'models/Beta'])
    expect(hidden.bySlug.get(`${hidden.source.slug}/models`)).toBeUndefined()
  })

  it('sorts tags and operations alphabetically on request', async () => {
    const store = await storeFromFixture('navigation.yaml', {
      config: { tagSort: 'alpha', operationSort: 'alpha' },
    })
    const names = tagsOf(store)
      .filter((tag) => !tag.isUntagged)
      .map((tag) => tag.name)

    expect(names).toEqual(['alpha', 'omega', 'zebra'])
  })
})

describe('description headings', () => {
  it('extracts ATX headings and ignores those inside fenced code', () => {
    const headings = extractHeadings(
      ['# One', '', '```sh', '# not a heading', '```', '', '## Two', '### Three'].join('\n'),
    )

    expect(headings).toEqual([
      { level: 1, text: 'One' },
      { level: 2, text: 'Two' },
      { level: 3, text: 'Three' },
    ])
  })

  it('nests headings by level under the overview route', async () => {
    const store = await storeFromFixture('navigation.yaml')
    const [gettingStarted, concepts] = store.navigation

    expect(relativeId(store, gettingStarted?.id)).toBe('overview/getting-started')
    expect(
      gettingStarted?.type === 'text' && relativeIdsOf(store, gettingStarted.children ?? []),
    ).toEqual(['overview/getting-started/authentication', 'overview/getting-started/rate-limits'])
    expect(relativeId(store, concepts?.id)).toBe('overview/concepts')
  })
})

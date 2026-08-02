import { createDocumentStore, type DocumentStore } from '@openish/core'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  atOverviewAnchor,
  overviewHash,
  resolvedId,
  scrollTarget,
  urlResolves,
  type PlanePosition,
} from '../../src/render/scroll-target.js'
import { SHELL_SPEC } from '../fixtures.js'

/** The single-document case: every id carries `api-1`, and no URL ever shows it. */
const SLUG = 'api-1'
const OPERATION = `${SLUG}/tags/accounts/listAccounts`
const HEADING = `${SLUG}/overview/getting-started`
const NESTED_HEADING = `${SLUG}/overview/getting-started/authentication`

const at = (activeId: string, over: Partial<PlanePosition> = {}): PlanePosition => ({
  activeId,
  slugPrefix: SLUG,
  hash: '',
  ...over,
})

let store: DocumentStore

beforeAll(async () => {
  store = await createDocumentStore(JSON.stringify(SHELL_SPEC))
})

describe('resolvedId', () => {
  it('is the document slug at the front of the document', () => {
    expect(resolvedId(store, at(''))).toBe(SLUG)
    expect(resolvedId(store, at(SLUG))).toBe(SLUG)
  })

  it('is the id itself when the document has it', () => {
    expect(resolvedId(store, at(OPERATION))).toBe(OPERATION)
  })

  /* A bookmark that outlived its operation. The banner is what says so; this stays honest. */
  it('is the unchanged id when nothing matches and no redirect answers', () => {
    expect(resolvedId(store, at(`${SLUG}/tags/accounts/gone`))).toBe(`${SLUG}/tags/accounts/gone`)
  })

  it('is empty with no store, because there is nothing to resolve against', () => {
    expect(resolvedId(undefined, at(OPERATION))).toBe('')
  })

  it('follows a host redirect, in URL space rather than id space', async () => {
    const redirecting = await createDocumentStore(JSON.stringify(SHELL_SPEC), {
      config: { redirect: (id) => (id === 'old/listAccounts' ? 'tags/accounts/listAccounts' : undefined) },
    })
    expect(resolvedId(redirecting, at(`${SLUG}/old/listAccounts`))).toBe(OPERATION)
  })
})

describe('atOverviewAnchor', () => {
  it('recognises a heading lifted out of info.description', () => {
    expect(atOverviewAnchor(store, at(HEADING))).toBe(true)
    expect(atOverviewAnchor(store, at(NESTED_HEADING))).toBe(true)
  })

  it('does not recognise a section, which has a page of its own', () => {
    expect(atOverviewAnchor(store, at(OPERATION))).toBe(false)
  })
})

describe('overviewHash', () => {
  /* The overview stamps ids in the form the URL has them, so the slug comes back off. */
  it('is the heading id with the implied slug stripped', () => {
    expect(overviewHash(store, at(HEADING))).toBe('overview/getting-started')
  })

  it('keeps the slug when the URL carries it', () => {
    expect(overviewHash(store, { activeId: 'consumer/x', slugPrefix: '', hash: '' })).toBe('')
  })

  /* Anywhere else, the fragment is the browser's own - which only history mode has to spare. */
  it('is the plain fragment when the id is not a heading', () => {
    expect(overviewHash(store, at(OPERATION, { hash: 'responses' }))).toBe('responses')
  })
})

describe('scrollTarget', () => {
  it('sends a section to itself, with nothing inside it named', () => {
    expect(scrollTarget(store, at(OPERATION))).toEqual({ section: OPERATION, anchor: '' })
  })

  /*
   * The failure this pair exists for: a description heading has no section of its own, so keying on
   * the resolved id alone named a section the plane had never heard of and nothing moved at all.
   */
  it('sends a description heading to the overview, and names the heading', () => {
    expect(scrollTarget(store, at(HEADING))).toEqual({ section: SLUG, anchor: 'overview/getting-started' })
  })

  it('tells two headings of the same section apart', () => {
    expect(scrollTarget(store, at(HEADING)).anchor).not.toBe(scrollTarget(store, at(NESTED_HEADING)).anchor)
  })

  it('carries a history-mode fragment into the overview', () => {
    expect(scrollTarget(store, at(SLUG, { hash: 'authentication' }))).toEqual({
      section: SLUG,
      anchor: 'authentication',
    })
  })

  it('does not offer a fragment to a section that is not the overview', () => {
    expect(scrollTarget(store, at(OPERATION, { hash: 'authentication' })).anchor).toBe('')
  })
})

describe('urlResolves', () => {
  it('is true for the overview and for any section the document has', () => {
    expect(urlResolves(store, at(''))).toBe(true)
    expect(urlResolves(store, at(SLUG))).toBe(true)
    expect(urlResolves(store, at(OPERATION))).toBe(true)
  })

  it('is false for an id the document has nothing for', () => {
    expect(urlResolves(store, at(`${SLUG}/tags/accounts/gone`))).toBe(false)
  })

  it('is false before a document has arrived, so nothing is announced as missing yet', () => {
    expect(urlResolves(undefined, at(OPERATION))).toBe(false)
  })
})

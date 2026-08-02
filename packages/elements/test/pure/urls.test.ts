import { describe, expect, it } from 'vitest'

import { activeIdFrom, idFromLink, urlId, urlWithId, type UrlState } from '../../src/router/urls.js'

const url = (over: Partial<UrlState>): UrlState => ({
  routing: 'hash',
  pathname: '/',
  hash: '',
  selected: '',
  basePath: '',
  ...over,
})

describe('urlId', () => {
  it('reads the fragment in hash mode and ignores the path', () => {
    expect(urlId(url({ routing: 'hash', hash: '#/tags/accounts', pathname: '/docs/somewhere' }))).toBe('tags/accounts')
  })

  it('reads the path in history mode and ignores the fragment', () => {
    const state = url({ routing: 'history', pathname: '/docs/tags/accounts', hash: '#authentication', basePath: '/docs' })
    expect(urlId(state)).toBe('tags/accounts')
  })

  it('reads neither in none mode - the host is the authority', () => {
    const state = url({ routing: 'none', selected: 'tags/accounts', hash: '#/models/Account', pathname: '/models/Other' })
    expect(urlId(state)).toBe('tags/accounts')
  })

  it('tolerates a fragment written without the slash', () => {
    expect(urlId(url({ hash: '#tags/accounts' }))).toBe('tags/accounts')
  })

  it('is empty at the front of the document, in every mode', () => {
    expect(urlId(url({ routing: 'hash', hash: '#/' }))).toBe('')
    expect(urlId(url({ routing: 'history', pathname: '/docs/', basePath: '/docs' }))).toBe('')
    expect(urlId(url({ routing: 'none', selected: '' }))).toBe('')
  })
})

describe('activeIdFrom', () => {
  it('puts back the document slug the single-document URL leaves out', () => {
    expect(activeIdFrom(url({ hash: '#/tags/accounts' }), 'api-1')).toBe('api-1/tags/accounts')
  })

  it('leaves a multi-document URL alone, because it carries its own slug', () => {
    expect(activeIdFrom(url({ hash: '#/consumer/tags/accounts' }), '')).toBe('consumer/tags/accounts')
  })

  /*
   * The overview of a single document. `applySlugPrefix` has to produce the slug alone rather than
   * `api-1/`, or nothing matches the section the plane calls by that name.
   */
  it('resolves the front of the document to the slug itself', () => {
    expect(activeIdFrom(url({ hash: '#/' }), 'api-1')).toBe('api-1')
  })
})

describe('idFromLink', () => {
  it('prefers the fragment, which is where every mode but history puts the id', () => {
    expect(idFromLink({ hash: '#/tags/accounts', pathname: '/docs/elsewhere' }, '/docs', '')).toBe('tags/accounts')
  })

  it('falls back to the path for a history-mode link, which has no fragment', () => {
    expect(idFromLink({ hash: '', pathname: '/docs/tags/accounts' }, '/docs', '')).toBe('tags/accounts')
  })

  it('applies the slug prefix, so a click compares against the same spelling as the URL', () => {
    expect(idFromLink({ hash: '#/models/Account', pathname: '/' }, '', 'api-1')).toBe('api-1/models/Account')
  })
})

describe('urlWithId', () => {
  it('replaces the fragment and keeps the rest of the address', () => {
    const next = urlWithId(new URL('https://host.test/docs?keep=1#/tags/old'), 'api-1/tags/new', {
      routing: 'hash',
      basePath: '',
      slugPrefix: 'api-1',
    })
    expect(next.hash).toBe('#/tags/new')
    expect(next.search).toBe('?keep=1')
    expect(next.pathname).toBe('/docs')
  })

  it('replaces the path in history mode, under the base path', () => {
    const next = urlWithId(new URL('https://host.test/docs/tags/old'), 'api-1/tags/new', {
      routing: 'history',
      basePath: '/docs',
      slugPrefix: 'api-1',
    })
    expect(next.pathname).toBe('/docs/tags/new')
  })

  /* With several documents the slug is what decides which one the rest of the id is about. */
  it('keeps the slug in the URL when there is no prefix to leave out', () => {
    const next = urlWithId(new URL('https://host.test/'), 'consumer/tags/accounts', {
      routing: 'hash',
      basePath: '',
      slugPrefix: '',
    })
    expect(next.hash).toBe('#/consumer/tags/accounts')
  })

  it('does not touch the URL it was given', () => {
    const current = new URL('https://host.test/#/tags/old')
    urlWithId(current, 'tags/new', { routing: 'hash', basePath: '', slugPrefix: '' })
    expect(current.hash).toBe('#/tags/old')
  })
})

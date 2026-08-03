import { describe, expect, it } from 'vitest'

import { isActive, joinBase, routePath } from '../src/app/paths.js'

/*
 * The base-path arithmetic, tested against both bases the site can be served from.
 *
 * This is the one bug class here that a browser cannot catch locally: a path that is wrong under
 * /openish/ resolves perfectly against a dev server rooted at `/`, and only fails after a deploy.
 * `joinBase` takes its base as an argument for exactly that reason - production's answer is
 * checkable without production.
 */
describe('joinBase', () => {
  const bases = ['/openish/', '/']

  it('joins a slug to the project-page base', () => {
    expect(joinBase('/openish/', '')).toBe('/openish/')
    expect(joinBase('/openish/', 'start')).toBe('/openish/start')
    expect(joinBase('/openish/', 'guide/routing')).toBe('/openish/guide/routing')
  })

  it('joins a slug to the root base', () => {
    expect(joinBase('/', '')).toBe('/')
    expect(joinBase('/', 'start')).toBe('/start')
  })

  it('never produces a doubled slash', () => {
    for (const base of bases) {
      for (const slug of ['', 'start', '/start', 'guide/routing', '//start']) {
        expect(joinBase(base, slug)).not.toMatch(/\/{2}/)
      }
    }
  })

  it('tolerates a base that forgot its trailing slash', () => {
    expect(joinBase('/openish', 'start')).toBe('/openish/start')
  })
})

describe('routePath', () => {
  it('starts every path with the base', () => {
    for (const slug of ['', 'start']) {
      expect(routePath(slug).startsWith(routePath(''))).toBe(true)
    }
  })
})

describe('isActive', () => {
  it('marks the front page only at the front page', () => {
    expect(isActive(routePath(''), '')).toBe(true)
    expect(isActive(routePath('start'), '')).toBe(false)
  })

  it('marks a page at its own path', () => {
    expect(isActive(routePath('start'), 'start')).toBe(true)
    expect(isActive(routePath(''), 'start')).toBe(false)
  })

  it('marks a section from inside it', () => {
    expect(isActive(routePath('guide/routing'), 'guide')).toBe(true)
  })

  /* `URLPattern` treats these as different paths. A reader does not. */
  it('ignores a trailing slash', () => {
    expect(isActive(`${routePath('start')}/`, 'start')).toBe(true)
  })

  /* The failure that would mark `/startle` as being inside `/start`. */
  it('does not mark a page whose path merely starts the same way', () => {
    expect(isActive(routePath('startle'), 'start')).toBe(false)
  })
})

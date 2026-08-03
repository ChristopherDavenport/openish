import { describe, expect, it } from 'vitest'

import { routePath } from '../src/app/paths.js'
import { NAV_ROUTES, ROUTES, groups, routeAt, routesIn } from '../src/app/routes.js'

/*
 * The route table is the single source for both the router and the navigation, so what is worth
 * asserting is that it stays *total*: every page reachable, every link pointing somewhere, nothing
 * listed twice. A hand-maintained navigation alternates between the two failures this rules out.
 *
 * These are assertions about data and would rather run in Node. They cannot: `routes.ts` imports the
 * page modules so that a template naming `<site-page-home>` is a template whose element is defined -
 * which is what `lit-analyzer`'s `no-missing-import` asks for and what keeps the route table one
 * thing rather than a list of tag names beside a registry. That import graph reaches
 * `customElements.define`, so this belongs in the browser project, by the same rule that puts
 * `packages/elements/test/pure/` in Node and everything else in Chromium.
 */
describe('ROUTES', () => {
  it('has a front page', () => {
    expect(ROUTES.some((route) => route.slug === '')).toBe(true)
  })

  it('has no duplicate slugs', () => {
    const slugs = ROUTES.map((route) => route.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('gives every page a title, a group and a blurb', () => {
    for (const route of ROUTES) {
      expect(route.title, `${route.slug} title`).not.toBe('')
      expect(route.group, `${route.slug} group`).not.toBe('')
      expect(route.blurb, `${route.slug} blurb`).not.toBe('')
    }
  })

  /* A leading slash would be joined onto the base and silently produce the right answer here, and
   * the wrong one anywhere a slug is compared rather than joined. */
  it('writes slugs relative to the base', () => {
    for (const route of ROUTES) {
      expect(route.slug.startsWith('/'), `${route.slug} is absolute`).toBe(false)
    }
  })
})

describe('the navigation and the route table are total in both directions', () => {
  it('lists every visible route under exactly one group', () => {
    const listed = groups().flatMap((group) => [...routesIn(group)])
    expect(listed).toHaveLength(NAV_ROUTES.length)
    expect(new Set(listed.map((route) => route.slug))).toEqual(
      new Set(NAV_ROUTES.map((route) => route.slug)),
    )
  })

  /*
   * A hidden route is reachable but not listed. The failure this rules out is the opposite one: a
   * page marked hidden by accident, which would be unreachable from anywhere on the site.
   */
  it('hides only the routes that are reached from another page', () => {
    const hidden = ROUTES.filter((route) => route.hidden === true).map((route) => route.slug)
    expect(hidden).toEqual(['elements/:tag'])
  })

  it('has no empty group', () => {
    for (const group of groups()) {
      expect(routesIn(group).length, group).toBeGreaterThan(0)
    }
  })
})

describe('routeAt', () => {
  it('resolves every route from the path it is rendered at', () => {
    for (const route of ROUTES) {
      expect(routeAt(routePath(route.slug))?.slug).toBe(route.slug)
    }
  })

  /*
   * A reader types `/openish/start/` as readily as `/openish/start`, and `URLPattern` treats those
   * as different paths. The front page is excluded because its path already ends in a slash, and
   * doubling it produces `//`, which is not a pathname any browser hands over.
   */
  it('tolerates a trailing slash', () => {
    for (const route of ROUTES.filter((candidate) => candidate.slug !== '')) {
      expect(routeAt(`${routePath(route.slug)}/`)?.slug).toBe(route.slug)
    }
  })

  it('resolves the front page with and without its trailing slash', () => {
    expect(routeAt(routePath(''))?.slug).toBe('')
    expect(routeAt(routePath('').replace(/\/$/, ''))?.slug).toBe('')
  })

  it('resolves nothing for a path that names nothing', () => {
    expect(routeAt(routePath('no-such-page'))).toBeUndefined()
  })
})

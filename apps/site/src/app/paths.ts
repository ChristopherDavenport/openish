/**
 * Where the site lives, and the one place that knows it.
 *
 * `@lit-labs/router` matches `location.pathname` against a `URLPattern`. There is no base option and
 * no hash mode, so on a project page served at /openish/ the base has to appear in every route
 * pattern and every href the site renders. One function does that, and every path goes through it -
 * a hard-coded `/start` would resolve in a dev server rooted at `/` and 404 in production, which is
 * the failure this exists to make impossible.
 *
 * `vite.config.ts` sets `base` for the dev server as well as the build, so `BASE_URL` is the same
 * string in both and there is only ever one answer.
 */
export const BASE = import.meta.env.BASE_URL

/**
 * A base and a slug, joined exactly once.
 *
 * Separate from {@link routePath} so it can be tested against both the project-page base and the
 * root base without a build: the arithmetic is the part that breaks, and it breaks in production.
 * Vite guarantees `base` ends in a slash, but not that a caller remembered, so both are tolerated
 * and neither produces a double.
 */
export const joinBase = (base: string, slug: string): string =>
  `${base.endsWith('/') ? base : `${base}/`}${slug.replace(/^\/+/, '')}`

/** The absolute path for a route slug. `''` is the front page. */
export const routePath = (slug: string): string => joinBase(BASE, slug)

/**
 * Whether a pathname is at, or inside, a route.
 *
 * A trailing slash is not significant here even though it is to `URLPattern`, because this answers a
 * question about what to mark in the navigation rather than about what to render - and a reader who
 * typed `/openish/start/` is on the start page whatever the router decides to do about it.
 */
export const isActive = (pathname: string, slug: string): boolean => {
  const target = routePath(slug).replace(/\/$/, '')
  const here = pathname.replace(/\/$/, '')
  return slug === '' ? here === target : here === target || here.startsWith(`${target}/`)
}

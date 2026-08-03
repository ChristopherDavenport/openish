import { html, type TemplateResult } from 'lit'

import '../pages/site-page-color-scheme.js'
import '../pages/site-page-element.js'
import '../pages/site-page-elements.js'
import '../pages/site-page-headless.js'
import '../pages/site-page-config.js'
import '../pages/site-page-home.js'
import '../pages/site-page-scale.js'
import '../pages/site-page-tokens.js'
import '../pages/site-page-reference.js'
import '../pages/site-page-routing.js'
import '../pages/site-page-sources.js'
import '../pages/site-page-start.js'
import '../pages/site-page-theming.js'
import '../pages/site-page-try-it.js'
import '../pages/site-page-why.js'

import { routePath } from './paths.js'

/** One page of the site. */
export type SiteRoute = {
  /** The path after the base, with no leading slash. `''` is the front page. */
  readonly slug: string
  /** The navigation label, and the `<title>` this page sets. */
  readonly title: string
  /** The navigation heading this page sits under. */
  readonly group: string
  /** One sentence, for the navigation's title attribute and for any index that lists pages. */
  readonly blurb: string
  /**
   * How the shell frames this page. `prose` is a padded column; `full` hands over the whole area,
   * with the height chain intact, for a page that *is* a reference rather than one about it.
   */
  readonly layout?: 'prose' | 'full'
  /**
   * Kept out of the navigation.
   *
   * For a page that exists only as the destination of a link from another one - an element's own
   * page is reached from the catalogue, and thirty-one rows in the sidebar would drown everything
   * else in it. It is still a route, still deep-linkable, and still in the route table, so nothing
   * about it is hidden from anything except the nav.
   */
  readonly hidden?: boolean
  /**
   * The page.
   *
   * Every one of these returns a single custom element and nothing else - no inline state, no
   * conditionals. A `goto()` that re-matches the route it is already on then re-renders the same
   * template, which Lit reconciles to the same DOM, which is what keeps an embedded reference from
   * being torn down and rebuilt underneath a reader who clicked the link they were already on.
   */
  readonly render: (params: Readonly<Record<string, string | undefined>>) => TemplateResult
}

/**
 * Every page, in navigation order.
 *
 * One array, two consumers: the `Router`'s route table and `<site-nav>`. A page added here appears
 * in both, and a page that exists in only one of them cannot be expressed - which is the same
 * discipline the try-it panel uses for the request it sends and the sample it prints.
 */
export const ROUTES: readonly SiteRoute[] = [
  {
    slug: '',
    title: 'openish',
    group: 'Start here',
    blurb: 'Lit web components for viewing OpenAPI documents.',
    render: () => html`<site-page-home></site-page-home>`,
  },
  {
    slug: 'start',
    title: 'Getting started',
    group: 'Start here',
    blurb: 'Install it, or drop in one script tag.',
    render: () => html`<site-page-start></site-page-start>`,
  },
  {
    slug: 'guide/routing',
    title: 'Routing',
    group: 'Guides',
    blurb: 'hash, history and none — two of them shown in frames that own their own address bar.',
    render: () => html`<site-page-routing></site-page-routing>`,
  },
  {
    slug: 'guide/sources',
    title: 'Several documents',
    group: 'Guides',
    blurb: 'One reference, more than one API, and the two things that changes.',
    render: () => html`<site-page-sources></site-page-sources>`,
  },
  {
    slug: 'guide/color-scheme',
    title: 'Colour scheme',
    group: 'Guides',
    blurb: 'Light and dark decided in CSS, with no script and no flash.',
    render: () => html`<site-page-color-scheme></site-page-color-scheme>`,
  },
  {
    slug: 'guide/theming',
    title: 'Theming',
    group: 'Guides',
    blurb: 'Custom properties that inherit through the shadow boundary, and CSS parts for the rest.',
    render: () => html`<site-page-theming></site-page-theming>`,
  },
  {
    slug: 'guide/try-it',
    title: 'Sending requests',
    group: 'Guides',
    blurb: 'The try-it panel, the placeholder credential, and OAuth without a paste field.',
    render: () => html`<site-page-try-it></site-page-try-it>`,
  },
  {
    slug: 'guide/headless',
    title: 'Without components',
    group: 'Guides',
    blurb: '@openish/core and @openish/client, neither of which needs a DOM.',
    render: () => html`<site-page-headless></site-page-headless>`,
  },
  {
    slug: 'labs/reference',
    title: 'The reference',
    group: 'Labs',
    blurb: 'A whole document, hash-routed, deep-linkable from this site’s own URL.',
    layout: 'full',
    render: () => html`<site-page-reference></site-page-reference>`,
  },
  {
    slug: 'labs/tokens',
    title: 'Token editor',
    group: 'Labs',
    blurb: 'Every hook in the theme, live, with the CSS to take away.',
    render: () => html`<site-page-tokens></site-page-tokens>`,
  },
  {
    slug: 'labs/config',
    title: 'Config matrix',
    group: 'Labs',
    blurb: 'Every option, generated from the library’s own defaults.',
    render: () => html`<site-page-config></site-page-config>`,
  },
  {
    slug: 'labs/scale',
    title: 'Scale',
    group: 'Labs',
    blurb: 'Generate a thousand operations and time it on your own machine.',
    render: () => html`<site-page-scale></site-page-scale>`,
  },
  {
    slug: 'elements',
    title: 'Every element',
    group: 'Reference',
    blurb: 'All thirty-one, read from the manifest the build emits.',
    render: () => html`<site-page-elements></site-page-elements>`,
  },
  {
    slug: 'elements/:tag',
    title: 'Element',
    group: 'Reference',
    blurb: 'One element: what it takes, and what it announces.',
    hidden: true,
    render: (params) => html`<site-page-element .tag=${params['tag'] ?? ''}></site-page-element>`,
  },
  {
    slug: 'why',
    title: 'Why believe it',
    group: 'Receipts',
    blurb: 'The bundle table, the contrast numbers, and the four guards — each linked to its source.',
    render: () => html`<site-page-why></site-page-why>`,
  },
]

/**
 * The route a pathname is on, or `undefined` for one that names nothing.
 *
 * Exact match, with a trailing slash tolerated - `URLPattern` treats `/openish/start` and
 * `/openish/start/` as different and both are the start page as far as a reader is concerned. Used
 * for the document title, so a URL the router falls back on gets the 404 page's title rather than
 * keeping the previous page's.
 */
export const routeAt = (
  pathname: string,
  routes: readonly SiteRoute[] = ROUTES,
): SiteRoute | undefined => {
  const here = pathname.replace(/\/$/, '')
  return routes.find((route) => {
    const target = routePath(route.slug).replace(/\/$/, '')
    if (!route.slug.includes(':')) {
      return target === here
    }
    /*
     * A parameterised slug - `elements/:tag` - matches any single segment where the parameter is.
     * Escaped first, so a base path or a slug containing a dot cannot become a wildcard.
     */
    const pattern = target
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:[a-z][a-z0-9]*/gi, '[^/]+')
    return new RegExp(`^${pattern}$`).test(here)
  })
}

/**
 * The routes the navigation shows.
 *
 * A hidden route is still a route - deep-linkable, titled, in the table - and simply not a row in a
 * sidebar. Filtering here rather than in `<site-nav>` keeps "what the nav lists" one answer that the
 * totality test can check, instead of a condition duplicated wherever routes are rendered.
 */
export const NAV_ROUTES: readonly SiteRoute[] = ROUTES.filter((route) => route.hidden !== true)

/** The navigation's headings, in the order the routes first mention them. */
export const groups = (routes: readonly SiteRoute[] = NAV_ROUTES): readonly string[] => [
  ...new Set(routes.map((route) => route.group)),
]

/** The routes under one heading, in order. */
export const routesIn = (group: string, routes: readonly SiteRoute[] = NAV_ROUTES): readonly SiteRoute[] =>
  routes.filter((route) => route.group === group)

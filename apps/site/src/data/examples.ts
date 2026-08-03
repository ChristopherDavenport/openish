import { GALAXY, NAVIGATION } from './documents.js'
import type { SiteExampleSpec } from './example.js'
import { STANDALONE_EXAMPLES } from './standalone.js'

/**
 * Every live example on the site, in one enumerable place.
 *
 * They live here rather than beside the page that shows them for one reason:
 * `apps/site/test/examples.test.ts` validates all of them against `custom-elements.json`, in Node,
 * and a page module cannot be imported in Node - it reaches `customElements.define`. An example
 * defined next to its prose would be an example nothing checks, and these are strings, so nothing
 * else is checking them either.
 *
 * The rule for adding one: the markup is what a reader would paste, unedited. If an example needs a
 * wrapper, a stylesheet or a script to work, that belongs in the example, not in the page around
 * it - otherwise the listing is a lie by omission and the test cannot tell.
 */

/** A reference that decides its own colour scheme, whatever the page around it is doing. */
export const DARK_IN_LIGHT: SiteExampleSpec = {
  markup: `<openish-api-reference color-scheme="dark" url="${GALAXY.url}"></openish-api-reference>`,
  height: 'min(60vh, 32rem)',
}

/**
 * Two documents, a picker, and the URLs gaining a slug segment.
 *
 * `sources` is property-only, so this is also the example that justifies printing a script block
 * beside the markup: there is no attribute form to write, and a listing showing only the tag would
 * be showing the half that does nothing.
 */
export const TWO_SOURCES: SiteExampleSpec = {
  markup: `<openish-api-reference></openish-api-reference>`,
  props: {
    sources: [
      { slug: 'galaxy', title: 'Scalar Galaxy', url: GALAXY.url, default: true },
      { slug: 'navigation', title: 'Navigation fixture', url: NAVIGATION.url },
    ],
  },
  height: 'min(60vh, 32rem)',
}

/**
 * The same reference, restyled with nothing but custom properties.
 *
 * Written on the element itself rather than on a wrapper, because that is the claim: the hooks
 * inherit through the shadow boundary, so a host restyles openish from outside it without any
 * agreement about internals and without a build step.
 */
export const RETHEMED: SiteExampleSpec = {
  markup: `<openish-api-reference
  url="${GALAXY.url}"
  style="
    --openish-color-accent: #7c3aed;
    --openish-color-link: #7c3aed;
    --openish-color-surface: #faf5ff;
    --openish-color-surface-selected: #ede9fe;
    --openish-color-border: #ddd6fe;
    --openish-radius-md: 0px;
    --openish-radius-lg: 0px;
  "
></openish-api-reference>`,
  height: 'min(60vh, 32rem)',
}

/** Navigation handed to the host: openish asks, and something else decides. */
export const HOST_ROUTED: SiteExampleSpec = {
  markup: `<openish-api-reference routing="none" url="${GALAXY.url}"></openish-api-reference>`,
  props: { selected: 'galaxy/tags/planets' },
  height: 'min(60vh, 32rem)',
}

/** Trimmed to the reading surface: no sidebar, no search, no try-it. */
export const TRIMMED: SiteExampleSpec = {
  markup: `<openish-api-reference url="${GALAXY.url}"></openish-api-reference>`,
  props: {
    config: { showSidebar: false, hideSearch: true, hideTryIt: true, hideModels: true },
  },
  height: 'min(60vh, 32rem)',
}

/** Everything above, plus the catalogue's standalone demos, for the test that checks all of them. */
export const ALL_EXAMPLES: Readonly<Record<string, SiteExampleSpec>> = {
  DARK_IN_LIGHT,
  TWO_SOURCES,
  RETHEMED,
  HOST_ROUTED,
  TRIMMED,
  ...STANDALONE_EXAMPLES,
}

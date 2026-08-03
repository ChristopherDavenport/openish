import galaxyUrl from '@scalar/galaxy/latest.yaml?url'
import navigationUrl from '@fixtures/navigation.yaml?url'

/**
 * The documents the site demonstrates against.
 *
 * None of them is committed. `guard:specs` fails the build for any API document outside
 * `packages/core/test/fixtures/`, and it is right to: real documents are large, often
 * institution-specific, and belong nowhere near a repository. Galaxy arrives through `node_modules`
 * as a `?url` asset, the fixtures are the six that are already allowed to exist, and anything a
 * reader wants to see instead they point the site at themselves.
 */
export type DemoDocument = {
  readonly slug: string
  readonly title: string
  readonly url: string
  /** One line about what this document is useful for seeing. */
  readonly blurb: string
}

/**
 * Scalar's own example document, and the site's default.
 *
 * It is the right one to open on: it has tags, models, several security schemes, request bodies with
 * examples, and enough operations to be worth navigating - without being so large that the front
 * page becomes a demonstration of patience.
 */
export const GALAXY: DemoDocument = {
  slug: 'galaxy',
  title: 'Scalar Galaxy',
  url: galaxyUrl,
  blurb: 'Scalar’s example API. Tags, models, security schemes, and enough operations to navigate.',
}

/**
 * A committed fixture, used where a guide needs a *second* document rather than a big one.
 *
 * `navigation.yaml` exists to exercise the traversal, so it is small, has a clear tag structure and
 * loads instantly - which makes it the right other half of a two-document picker. It is already in
 * the only directory `guard:specs` allows an API document to live in.
 */
export const NAVIGATION: DemoDocument = {
  slug: 'navigation',
  title: 'Navigation fixture',
  url: navigationUrl,
  blurb: 'A small committed fixture, for showing two documents side by side.',
}

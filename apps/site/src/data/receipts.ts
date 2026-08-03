/**
 * The accessibility and correctness claims, each with the thing that proves it.
 *
 * The rule for this file: nothing goes in it that no test produces. A row here without a `test` is a
 * claim, and claims belong in prose where a reader can weigh them - not in a table, which reads as
 * measurement whether or not anything measured it.
 */

/** One row of the contrast table. Ratios as written, because several are genuinely ranges. */
export type ContrastRow = {
  readonly label: string
  readonly light: string
  readonly dark: string
  /**
   * Non-text, so the WCAG floor is 3:1 rather than 4.5:1 - 1.4.11. Marked rather than footnoted
   * because a reader comparing a 3.8 against a 4.5 has to know which rule it is being held to.
   */
  readonly nonText?: boolean
}

/**
 * The default theme, in both schemes. AA or better throughout.
 *
 * Measured by `contrast.test.ts` over **both themes in both schemes** - twelve combinations - by
 * reading each colour through a probe element so that `light-dark()` resolves the way it will when
 * painting. axe cannot do this through nested shadow roots, which is why there are two suites.
 */
export const CONTRAST: readonly ContrastRow[] = [
  { label: 'Body text on the page', light: '17.9:1', dark: '15.7:1' },
  { label: 'Muted text on the page', light: '5.9:1', dark: '7.6:1' },
  { label: 'Links', light: '6.4:1', dark: '8.4:1' },
  { label: 'HTTP method chips', light: '5.5–6.9:1', dark: '9.1–14.2:1' },
  { label: 'Syntax colours on the code surface', light: '4.7–6.2:1', dark: '7.3–12.3:1' },
  { label: 'Focus ring, on every surface it lands on', light: '5.6–6.4:1', dark: '5.9–8.4:1', nonText: true },
  { label: 'Control and action borders', light: '3.8–4.1:1', dark: '5.3–6.2:1', nonText: true },
]

/** A guarantee, and the file that would fail if it stopped being true. */
export type Guarantee = {
  readonly title: string
  readonly detail: string
  /** Repository-relative path, rendered as a link. */
  readonly test: string
}

export const GUARANTEES: readonly Guarantee[] = [
  {
    title: 'axe, over five surfaces, in both schemes',
    detail:
      'The overview, an operation, a model with its schema tree expanded, the open search dialog, and the stacked navigation — inside the frame, with the real theme loaded, so contrast rules measure this palette rather than the browser’s defaults.',
    test: 'packages/elements/test/a11y.test.ts',
  },
  {
    title: 'Contrast, in twelve theme and scheme combinations',
    detail:
      'Both themes in both schemes, read through a probe element so light-dark() resolves as it will when painting. This is the half axe cannot reach through nested shadow roots.',
    test: 'packages/elements/test/contrast.test.ts',
  },
  {
    title: 'One focus ring, on everything that can hold focus',
    detail:
      'Real key presses through the overview, an operation and the request client, measuring the ring at every stop — so a control that stops showing one fails the build, including a control nobody has written yet. It also covers the two places a ring is not enough: the sidebar tree, whose aria-activedescendant cursor the browser’s focus never follows, and the search dialog’s arrow-key result list, which is kept out of the tab order.',
    test: 'packages/elements/test/focus.test.ts',
  },
  {
    title: 'Forced colors, for the three things it takes away',
    detail:
      'Chromium is driven into the mode and checked for the focus ring, the fill that made a method chip a chip, and the fill that marked the page a reader is on. Everything else carries its meaning in words already — a chip says GET, a required field says “Required” — so colour was never the only carrier and the reader’s palette simply replaces ours.',
    test: 'packages/elements/test/forced-colors.test.ts',
  },
]

/** One of the four things `npm run guard` refuses to let into the repository. */
export type Guard = {
  readonly name: string
  readonly what: string
  readonly script: string
}

export const GUARDS: readonly Guard[] = [
  {
    name: 'guard:vue',
    what: 'No Vue in the dependency graph or the build output. Several @scalar/* packages depend on Vue; this is what keeps the Vue-free half of Scalar from quietly acquiring the other half.',
    script: 'scripts/guard-no-vue.mjs',
  },
  {
    name: 'guard:specs',
    what: 'No API document anywhere but packages/core/test/fixtures/, and none over 64 kB. Real documents are large and often institution-specific; fixtures isolate one behaviour each.',
    script: 'scripts/guard-no-specs.mjs',
  },
  {
    /*
     * Do not write the forbidden declarations out literally here. `guard-focus.mjs` is a regular
     * expression over source text and cannot tell a CSS rule from a sentence describing one, so the
     * first draft of this entry failed the very guard it documents. Say what they are instead.
     */
    name: 'guard:focus',
    what: 'No rule anywhere that removes the focus ring — not by setting an outline to none or to zero, and not by drawing the ring as a box-shadow, which forced-colors mode drops entirely.',
    script: 'scripts/guard-focus.mjs',
  },
  {
    name: 'guard:templates',
    what: 'Twenty lit-analyzer rules, all fatal, over every template in packages and apps: every binding matches what the element on the other side actually takes.',
    script: 'scripts/guard-templates.mjs',
  },
]

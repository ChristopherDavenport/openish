/**
 * What openish costs to put on a page.
 *
 * Not a competitive number - openish is not trying to be a smaller API reference, it is trying to
 * be one that does not bring Vue. Most of what it ships is Scalar's own Vue-free tooling, on
 * purpose. The budget is here so that a regression is visible and nobody has to guess.
 *
 * **These are carried by hand, and that is a known liability.** The README's own copy of this table
 * drifted for ten milestones before anyone noticed, and a second copy on a website is a second
 * thing to forget. Two mitigations, both deliberate: {@link MEASURED_ON} is rendered next to the
 * table so a reader can see how old the numbers are, and {@link MEASURE_COMMAND} is rendered with
 * them so they can produce their own. The real fix is generating this file in CI - see the plan's
 * final phase - and until that lands this comment is the honest version of the situation.
 */
export type SizeRow = {
  readonly label: string
  /** Kilobytes, uncompressed. */
  readonly raw: number
  /** Kilobytes, gzipped - the number that corresponds to what a browser actually transfers. */
  readonly gzip: number
  /** The one row that answers "what does a reader wait for". */
  readonly emphasis?: boolean
}

/** The date the numbers below were last produced. Rendered, not decorative. */
export const MEASURED_ON = '3 August 2026'

/** What produces them. Rendered too, so the table is reproducible rather than merely credible. */
export const MEASURE_COMMAND = 'node scripts/measure-bundle.mjs --with-scalar'

export const BUNDLE: readonly SizeRow[] = [
  { label: 'Entry chunk — what arrives before first paint', raw: 362.1, gzip: 101.7, emphasis: true },
  { label: 'Deferred chunks, fetched when first needed', raw: 803.3, gzip: 242.3 },
  { label: '@openish/elements, everything', raw: 1173.5, gzip: 342.4 },
  { label: '@openish/core alone', raw: 276.0, gzip: 88.0 },
  { label: '@openish/client alone', raw: 10.7, gzip: 4.0 },
  { label: '@scalar/api-reference 1.64.0, for comparison', raw: 1226.9, gzip: 334.4 },
]

/**
 * The three things openish defers, and why none of them is needed for the page to exist.
 *
 * This is the substance behind the first row of the table: the total is not what a reader waits
 * for, and a bundle measured without splitting at its dynamic imports cannot show the difference.
 */
export const DEFERRED: readonly { readonly what: string; readonly cost: string; readonly why: string }[] = [
  {
    what: 'The markdown pipeline and highlight.js',
    cost: '~176 kB gzip',
    why: 'The shell, the sidebar, the parameter tables and the schema tree need none of it. Prose fills in a beat later; a code block renders as plain text first and gains colour when colour arrives — the same fallback an unknown language has always had, so there is no layout shift either way.',
  },
  {
    what: 'The snippet generator',
    cost: '27.6 kB gzip',
    why: 'Forty-one client plugins, loaded when a sample is first rendered. The client picker itself is built from @scalar/types, which is data.',
  },
  {
    what: 'The YAML writer, and ajv',
    cost: 'the rest',
    why: 'One is for the download button and one is for validation. Neither is on the path to a page.',
  },
]

/**
 * Everything openish puts in a consumer's dependency graph at runtime.
 *
 * Six entries. `guard:vue` is what keeps a seventh from quietly being Vue.
 */
export const RUNTIME_DEPENDENCIES: readonly string[] = [
  'lit',
  '@lit/context',
  '@lit/task',
  '@lit-labs/virtualizer',
  '@scalar/code-highlight',
  'openish’s own packages',
]

/**
 * What an example *is*, and how it prints.
 *
 * Deliberately free of the DOM, so `apps/site/test/examples.test.ts` can validate every example in
 * Node against `custom-elements.json` - which is the check that replaces `lit-analyzer`. An example
 * is a string rather than a template, so the analyzer cannot see it; making the shape data rather
 * than markup is what lets something else look instead.
 */
export type SiteExampleSpec = {
  /**
   * The markup, exactly as a reader would write it. The single source of truth: the code pane
   * prints this and the result pane is parsed from it.
   */
  readonly markup: string
  /**
   * Configuration with no attribute form - `config`, `sources`, `spec`, `selected`.
   *
   * Printed below the markup as a `<script type="module">` block, so what a reader copies is a
   * complete working page rather than two fragments that look related. Applied to the created
   * element before it is inserted, which is the reason the result pane parses rather than
   * interpolates.
   */
  readonly props?: Readonly<Record<string, unknown>>
  /** How tall the result should be. A CSS length. */
  readonly height?: string
  /**
   * A token that forces a fresh element when it changes.
   *
   * `<site-example>` assigns changed properties to the live element rather than rebuilding it, which
   * is what keeps a reader's scroll position and open disclosures while they work a control panel.
   * That is right for most properties and wrong for `config`: `<openish-api-reference>` resolves its
   * configuration when it builds a document store, and a reference whose config changes after a
   * document has loaded keeps rendering the old one - see the note in `site-page-config.ts`. Naming
   * the change here is how a page says "this one needs a new element", without `<site-example>`
   * having to know anything about which properties behave how.
   */
  readonly remountOn?: string
}

/** The tag of the example's root element, which is what the manifest is checked against. */
export const rootTagOf = (markup: string): string | undefined =>
  /^\s*<\s*([a-z][a-z0-9-]*)/i.exec(markup)?.[1]?.toLowerCase()

/**
 * The attributes written on the root element.
 *
 * A small parser rather than a real one, because the input is not arbitrary HTML - it is the first
 * tag of an example in this repository, and anything it cannot read is an example that should be
 * written more plainly. Values are not needed; the test only asks whether the *name* is declared.
 */
export const attributesOf = (markup: string): string[] => {
  const openingTag = /^\s*<\s*[a-z][a-z0-9-]*([^>]*)>/i.exec(markup)?.[1] ?? ''
  return [...openingTag.matchAll(/([a-z][a-z0-9-]*)\s*=\s*("[^"]*"|'[^']*')/gi)].map((match) =>
    (match[1] ?? '').toLowerCase(),
  )
}

/**
 * A value, as it would be written in a script tag.
 *
 * A function is printed as its source - `config.redirect` and `config.slugs` are functions, and
 * `JSON.stringify` turns those into `undefined`, which would be a listing that silently drops the
 * most interesting line on the page.
 */
const printValue = (value: unknown): string => {
  if (typeof value === 'function') {
    return String(value)
  }
  return JSON.stringify(value, null, 2)?.replace(/\n/g, '\n  ') ?? 'undefined'
}

/**
 * The complete listing: the markup, and the properties that have no attribute form.
 *
 * One string, because a reader copying an example should get something that works rather than two
 * blocks they have to reassemble in the right order.
 */
export const printExample = (example: SiteExampleSpec): string => {
  const entries = Object.entries(example.props ?? {})
  if (entries.length === 0) {
    return example.markup
  }

  const tag = rootTagOf(example.markup) ?? 'openish-api-reference'
  const assignments = entries
    .map(([key, value]) => `  reference.${key} = ${printValue(value)}`)
    .join('\n')

  return `${example.markup}

<script type="module">
  const reference = document.querySelector('${tag}')
${assignments}
</script>`
}

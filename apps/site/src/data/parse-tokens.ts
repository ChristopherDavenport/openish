/**
 * The theme's hooks, read out of the theme.
 *
 * Parsed rather than listed, and that is the whole design. A hand-written copy of this list would be
 * wrong the first time a token was added and nobody would find out - the README's bundle table
 * drifted for ten milestones doing exactly that. Reading `tokens.css` means the editor gains a
 * control the day the theme gains a hook, and cannot offer one that no longer exists.
 *
 * It is also why no token count is hardcoded anywhere on the site. `tokens.css` declares eighty;
 * ninety-five distinct `--openish-*` names exist once `layout.css` and `highlight.css` are counted.
 * Both numbers move, so the page renders what it parsed and names the file it came from.
 *
 * **A pure function of a string, in a module that imports nothing.** The CSS arrives by `?raw` in
 * `tokens.ts`, and Vitest stubs CSS imports to the empty string in a Node environment - so a parser
 * that reached for the import itself could only be tested in a browser, for no reason. This is the
 * same split `packages/elements/test/pure/` enforces: the arithmetic runs in Node, and what is left
 * in the DOM module is the import.
 */
export type Token = {
  readonly name: string
  /** The value exactly as declared, e.g. `light-dark(#ffffff, #0f1419)`. */
  readonly declared: string
  /** True when the declared value is a `light-dark()` pair, which is every colour in the theme. */
  readonly schemeAware: boolean
}

export type TokenGroup = {
  readonly title: string
  readonly tokens: readonly Token[]
}

/**
 * The banner comments in `tokens.css` are the theme author's own grouping, so the editor uses them
 * rather than inventing a taxonomy of its own.
 */
const BANNER = /\/\*\s*-+\s*(.+?)\s*-+\s*\*\//g
const DECLARATION = /(--openish-[a-z0-9-]+)\s*:\s*([^;]+);/g

/**
 * Comments blanked out character for character.
 *
 * Two things have to be true at once: declarations must not be found inside prose, and every offset
 * must still line up with the original so a declaration can be matched to the banner above it.
 * Replacing each comment with spaces of exactly its own length buys both. Stripping them would
 * shift every index after the first comment, and this file opens with a forty-line one.
 */
const blankComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

export const parseTokens = (css: string): readonly TokenGroup[] => {
  const banners = [...css.matchAll(BANNER)].map((match) => ({
    at: match.index,
    title: match[1] ?? 'Other',
  }))

  const groups = new Map<string, Token[]>()
  const order: string[] = []

  /*
   * Matched over the whole file rather than line by line. Two of the type tokens put their value on
   * the following line - a font stack is long - and a per-line parser silently dropped both, which
   * is exactly the quiet wrongness this module exists to avoid.
   */
  for (const match of blankComments(css).matchAll(DECLARATION)) {
    const name = match[1]
    const value = match[2]
    if (!name || !value) {
      continue
    }

    const title = banners.filter((banner) => banner.at < match.index).at(-1)?.title ?? 'Other'
    if (!groups.has(title)) {
      groups.set(title, [])
      order.push(title)
    }
    /* A value that wrapped is one value; the newline it wrapped at is not part of it. */
    const declared = value.replace(/\s+/g, ' ').trim()
    groups.get(title)!.push({ name, declared, schemeAware: declared.includes('light-dark(') })
  }

  return order.map((title) => ({ title, tokens: groups.get(title) ?? [] }))
}

/**
 * Whether a token names a colour.
 *
 * Decided by the value rather than by the name, because `--openish-border-action-color` is a colour
 * and a token merely called `-color-scheme` would not be. A colour gets a colour input and a swatch;
 * everything else gets a text field, because a length, a shadow and a font shorthand have nothing in
 * common except that they are typed.
 */
export const isColour = (token: Token): boolean =>
  token.schemeAware || /^(#|rgb|hsl|oklch|color\()/.test(token.declared)

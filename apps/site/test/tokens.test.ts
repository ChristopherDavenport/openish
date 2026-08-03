import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isColour, parseTokens } from '../src/data/parse-tokens.js'

/*
 * The token editor is built by parsing the theme, so the parser is the thing that can quietly be
 * wrong - and it already was: a per-line version dropped the two type tokens whose value wraps onto
 * the following line, and the page would have shown seventy-eight controls for eighty hooks with
 * nothing looking broken. This counts them against the file itself.
 *
 * The file is read here rather than imported: Vitest stubs a CSS import to the empty string in a
 * Node environment, which is why the parser takes a string in the first place.
 */
const SOURCE = fileURLToPath(new URL('../../../packages/theme/css/tokens.css', import.meta.url))
const css = readFileSync(SOURCE, 'utf8')

const groups = parseTokens(css)
const tokens = groups.flatMap((group) => group.tokens)

/** Every `--openish-*` name the file declares, found a completely different way from the parser. */
const declaredNames = new Set(
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--openish-[a-z0-9-]+)\s*:/g)].map(
    (match) => match[1] ?? '',
  ),
)

describe('the theme parser', () => {
  it('finds every token the file declares, and invents none', () => {
    expect(new Set(tokens.map((token) => token.name))).toEqual(declaredNames)
  })

  it('finds the tokens whose value wraps onto the next line', () => {
    const names = tokens.map((token) => token.name)
    expect(names).toContain('--openish-font-family-sans')
    expect(names).toContain('--openish-font-family-mono')
  })

  it('keeps a wrapped value on one line', () => {
    const sans = tokens.find((token) => token.name === '--openish-font-family-sans')
    expect(sans?.declared).not.toContain('\n')
    expect(sans?.declared).toContain('system-ui')
  })

  it('groups them by the theme’s own banner comments', () => {
    expect(groups.length).toBeGreaterThan(4)
    for (const group of groups) {
      expect(group.title, 'a group with no title').not.toBe('')
      expect(group.tokens.length, `${group.title} is empty`).toBeGreaterThan(0)
    }
  })

  /* A token declared before any banner would land here, which has never happened. */
  it('leaves nothing ungrouped', () => {
    expect(groups.map((group) => group.title)).not.toContain('Other')
  })

  /*
   * The theme's own invariant: the scheme is chosen in CSS, so a colour that is not a light-dark()
   * pair is a colour that cannot follow the reader.
   */
  it('declares every colour as a light-dark pair', () => {
    for (const token of tokens.filter(isColour)) {
      expect(token.schemeAware, `${token.name} is ${token.declared}`).toBe(true)
    }
  })

  /* Prose must not become data. The file opens with a long comment that mentions the hooks. */
  it('finds no token inside a comment', () => {
    expect(tokens.every((token) => token.declared !== '')).toBe(true)
    expect(tokens.map((token) => token.name)).not.toContain('--openish-api-reference')
  })
})

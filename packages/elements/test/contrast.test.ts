import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { disposeAll, mountReference } from './helpers.js'

afterEach(() => {
  disposeAll()
})

/**
 * WCAG 2.1 contrast, computed from the tokens the theme actually resolves to.
 *
 * Worth doing here rather than trusting the axe pass: axe measures what it can see on the page, and
 * it reports the method chips in the sidebar as "incomplete" because it cannot resolve a background
 * through nested shadow roots. These pairs are the palette itself, so they are checked directly and
 * a change to `tokens.css` cannot quietly drop one below the threshold.
 */
const channel = (value: number): number => {
  const ratio = value / 255
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
}

const luminance = (colour: string): number => {
  const [red, green, blue] = colour.match(/\d+(\.\d+)?/g)!.map(Number) as [number, number, number]
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

const contrast = (foreground: string, background: string): number => {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Every `--openish-*` value, as the browser resolves it in one colour scheme. */
const tokensFor = async (scheme: 'light' | 'dark'): Promise<(name: string) => string> => {
  const harness = await mountReference({ path: '/' })
  const root = harness.frame.contentDocument!.documentElement
  root.classList.toggle('jh-theme-dark', scheme === 'dark')
  await harness.settle()

  const style = harness.frame.contentWindow!.getComputedStyle(root)
  return (name: string) => {
    const value = style.getPropertyValue(name).trim()
    if (value === '') {
      throw new Error(`No value for ${name} in the ${scheme} theme.`)
    }
    return value
  }
}

/** Text pairs, which WCAG AA asks 4.5:1 of. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['--openish-color-text', '--openish-color-page'],
  ['--openish-color-text', '--openish-color-surface'],
  ['--openish-color-text', '--openish-color-surface-raised'],
  ['--openish-color-text-muted', '--openish-color-page'],
  ['--openish-color-text-muted', '--openish-color-surface'],
  ['--openish-color-link', '--openish-color-page'],
  ['--openish-color-accent', '--openish-color-surface-selected'],
  ['--openish-color-danger', '--openish-color-page'],
  ['--openish-color-danger', '--openish-color-danger-surface'],
  ['--openish-color-success', '--openish-color-page'],
  ['--openish-color-info', '--openish-color-page'],
  ['--openish-color-code-content', '--openish-color-code-surface'],
]

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']

const HIGHLIGHTS = ['keyword', 'string', 'number', 'literal', 'comment', 'attr', 'title', 'punctuation']

describe.each(['light', 'dark'] as const)('the %s palette', (scheme) => {
  it('meets AA for text on its surfaces', async () => {
    const token = await tokensFor(scheme)

    const failures = TEXT_PAIRS.map(([foreground, background]) => ({
      pair: `${foreground} on ${background}`,
      ratio: contrast(token(foreground), token(background)),
    })).filter((measured) => measured.ratio < 4.5)

    expect(failures.map((f) => `${f.pair}: ${f.ratio.toFixed(2)}:1`)).toEqual([])
  })

  it('meets AA for the method chips, which carry their own background', async () => {
    const token = await tokensFor(scheme)
    const on = token('--openish-method-on-color')

    const failures = METHODS.map((method) => ({
      method,
      ratio: contrast(on, token(`--openish-method-${method}`)),
    })).filter((measured) => measured.ratio < 4.5)

    expect(failures.map((f) => `${f.method}: ${f.ratio.toFixed(2)}:1`)).toEqual([])
  })

  it('meets AA for syntax colours on the code surface', async () => {
    const token = await tokensFor(scheme)
    const background = token('--openish-color-code-surface')

    const failures = HIGHLIGHTS.map((name) => ({
      name,
      ratio: contrast(token(`--openish-hl-${name}`), background),
    })).filter((measured) => measured.ratio < 4.5)

    expect(failures.map((f) => `${f.name}: ${f.ratio.toFixed(2)}:1`)).toEqual([])
  })
})

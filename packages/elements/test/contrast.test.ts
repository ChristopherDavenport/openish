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

/**
 * The red, green and blue of a colour, however the theme happened to write it.
 *
 * `getComputedStyle` does not normalise a custom property - its value is whatever the winning
 * declaration said, after `var()` substitution - so a theme that writes `#0b57d0` and one that
 * writes `rgb(11 87 208)` both arrive here verbatim. Both are real: the neutral palette is authored
 * as hex and the Jack Henry tokens resolve to functional notation.
 */
const channels = (colour: string): [number, number, number] => {
  const hex = colour.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (hex) {
    const digits = hex[1]!
    const pairs =
      digits.length === 3 ? [...digits].map((digit) => `${digit}${digit}`) : (digits.match(/../g) as string[])
    return pairs.map((pair) => Number.parseInt(pair, 16)) as [number, number, number]
  }

  const numbers = colour.match(/\d+(\.\d+)?/g)
  if (!numbers || numbers.length < 3) {
    throw new Error(`Cannot read a colour out of "${colour}".`)
  }
  return numbers.slice(0, 3).map(Number) as [number, number, number]
}

const luminance = (colour: string): number => {
  const [red, green, blue] = channels(colour)
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

const contrast = (foreground: string, background: string): number => {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * The two themes `@openish/theme` publishes.
 *
 * `neutral` is the default and is what `frame.html` already loads. `jh` is the Jack Henry binding,
 * added as a second stylesheet here - both declare every hook at `:root`, so the one that comes
 * later in document order wins, which is deterministic and is exactly the substitution a host makes
 * by importing `jh.css` instead of `index.css`.
 *
 * Both are measured, because the point of splitting them was that neither is allowed to be the one
 * that quietly drops below AA.
 */
type Theme = 'neutral' | 'jh'

const THEMES: Record<Theme, { href: string | undefined; darkClass: string; lightClass?: string }> = {
  neutral: { href: undefined, darkClass: 'openish-dark', lightClass: 'openish-light' },
  jh: { href: '../../theme/css/jh.css', darkClass: 'jh-theme-dark' },
}

/**
 * Every `--openish-*` colour, as the browser actually paints it in one theme and one scheme.
 *
 * Read through a probe element rather than off the custom property directly. A custom property's
 * computed value is its token stream after `var()` substitution and nothing more, so a theme using
 * `light-dark()` hands back the literal `light-dark(#fff, #0f1419)` - both halves, neither chosen.
 * Assigning it to a real colour property forces the browser to resolve it exactly as it would when
 * painting, which is the thing worth measuring, and it normalises hex and JH's functional notation
 * to the same `rgb(...)` on the way out.
 */
const tokensFor = async (theme: Theme, scheme: 'light' | 'dark'): Promise<(name: string) => string> => {
  const harness = await mountReference({ path: '/' })
  const frameDocument = harness.frame.contentDocument!
  const root = frameDocument.documentElement
  const { href, darkClass, lightClass } = THEMES[theme]

  if (href) {
    const link = frameDocument.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(href, frameDocument.baseURI).href
    frameDocument.head.append(link)
    await new Promise<void>((resolve) => {
      link.addEventListener('load', () => resolve(), { once: true })
      link.addEventListener('error', () => resolve(), { once: true })
    })
  }

  /*
   * Both classes are set, not just the dark one: the neutral theme follows the reader's own
   * preference when neither is present, and the machine running these tests has one.
   */
  root.classList.toggle(darkClass, scheme === 'dark')
  if (lightClass) {
    root.classList.toggle(lightClass, scheme === 'light')
  }
  await harness.settle()

  const probe = frameDocument.createElement('div')
  frameDocument.body.append(probe)

  return (name: string) => {
    probe.style.color = ''
    probe.style.color = `var(${name})`
    const value = harness.frame.contentWindow!.getComputedStyle(probe).color.trim()
    if (value === '' || probe.style.color === '') {
      throw new Error(`No value for ${name} in the ${theme} ${scheme} theme.`)
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
  /*
   * The pill's own pair, and it was never measured.
   *
   * It was already load-bearing - an operation's badges and the overview's version chip both sit on
   * it - and every field row on the page wears one now, saying where the value travels. That is the
   * one word telling a query parameter from a body field, so it has to be readable.
   */
  ['--openish-color-text-muted', '--openish-color-surface-muted'],
  ['--openish-color-link', '--openish-color-page'],
  ['--openish-color-accent', '--openish-color-surface-selected'],
  ['--openish-color-danger', '--openish-color-page'],
  ['--openish-color-danger', '--openish-color-danger-surface'],
  ['--openish-color-success', '--openish-color-page'],
  ['--openish-color-info', '--openish-color-page'],
  ['--openish-color-code-content', '--openish-color-code-surface'],
]

/**
 * Non-text pairs, which WCAG 2.1 asks 3:1 of.
 *
 * A different threshold and a different reason. These are not things a reader reads, they are things
 * a reader has to *see*: the ring that says where the keyboard is, and the edge that says where a
 * control ends. 1.4.11 covers both, and nothing measured either before - the ring in particular was
 * a translucent shadow, which is the one form of it that cannot be checked by eye.
 *
 * The ring is measured against every surface it can land on rather than against the page alone,
 * because a control in the request client sits on a raised surface and one in a search result sits
 * on the selected fill, and it is the worst of those that decides whether the ring is visible.
 */
const NON_TEXT_PAIRS: Array<[string, string]> = [
  ['--openish-focus-ring-color', '--openish-color-page'],
  ['--openish-focus-ring-color', '--openish-color-surface'],
  ['--openish-focus-ring-color', '--openish-color-surface-raised'],
  ['--openish-focus-ring-color', '--openish-color-surface-selected'],
  ['--openish-focus-ring-color', '--openish-color-code-surface'],
  ['--openish-border-control-color', '--openish-color-page'],
  ['--openish-border-control-color', '--openish-color-surface'],
  ['--openish-border-action-color', '--openish-color-surface'],
  ['--openish-border-selected-color', '--openish-color-surface'],
  ['--openish-border-selected-color', '--openish-color-surface-selected'],
]

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']

const HIGHLIGHTS = ['keyword', 'string', 'number', 'literal', 'comment', 'attr', 'title', 'punctuation']

describe.each(['neutral', 'jh'] as const)('the %s theme', (theme) => {
  describe.each(['light', 'dark'] as const)('%s', (scheme) => {
    it('meets AA for text on its surfaces', async () => {
      const token = await tokensFor(theme, scheme)

      const failures = TEXT_PAIRS.map(([foreground, background]) => ({
        pair: `${foreground} on ${background}`,
        ratio: contrast(token(foreground), token(background)),
      })).filter((measured) => measured.ratio < 4.5)

      expect(failures.map((f) => `${f.pair}: ${f.ratio.toFixed(2)}:1`)).toEqual([])
    })

    it('meets the 3:1 non-text floor for the focus ring and the borders that carry meaning', async () => {
      const token = await tokensFor(theme, scheme)

      const failures = NON_TEXT_PAIRS.map(([foreground, background]) => ({
        pair: `${foreground} on ${background}`,
        ratio: contrast(token(foreground), token(background)),
      })).filter((measured) => measured.ratio < 3)

      expect(failures.map((f) => `${f.pair}: ${f.ratio.toFixed(2)}:1`)).toEqual([])
    })

    it('meets AA for the method chips, which carry their own background', async () => {
      const token = await tokensFor(theme, scheme)
      const on = token('--openish-method-on-color')

      const failures = METHODS.map((method) => ({
        method,
        ratio: contrast(on, token(`--openish-method-${method}`)),
      })).filter((measured) => measured.ratio < 4.5)

      expect(failures.map((f) => `${f.method}: ${f.ratio.toFixed(2)}:1`)).toEqual([])
    })

    it('meets AA for syntax colours on the code surface', async () => {
      const token = await tokensFor(theme, scheme)
      const background = token('--openish-color-code-surface')

      const failures = HIGHLIGHTS.map((name) => ({
        name,
        ratio: contrast(token(`--openish-hl-${name}`), background),
      })).filter((measured) => measured.ratio < 4.5)

      expect(failures.map((f) => `${f.name}: ${f.ratio.toFixed(2)}:1`)).toEqual([])
    })
  })
})

/**
 * The scheme is chosen by CSS, not by script.
 *
 * These are the two facts that make that true, and both are easy to break by accident: the
 * attribute has to reflect, or setting the property changes nothing the stylesheet can match; and
 * with no attribute at all the tokens must resolve to *something*, or "follow the reader" would
 * really mean "unstyled".
 */
describe('choosing a scheme declaratively', () => {
  /*
   * The probe goes in the shadow root, not the light DOM. A plain child of a shadow host is not
   * assigned to any slot, so it never renders and `getComputedStyle` answers `''` for everything -
   * which reads as "the token is missing" when the token is fine. Inside the shadow tree it also
   * measures the thing that matters: what an element of the reference actually inherits.
   */
  const paint = (harness: Awaited<ReturnType<typeof mountReference>>, name: string) => {
    const probe = harness.frame.contentDocument!.createElement('div')
    harness.element.shadowRoot!.append(probe)
    probe.style.color = `var(${name})`
    const value = harness.frame.contentWindow!.getComputedStyle(probe).color.trim()
    probe.remove()
    return value
  }

  it('reflects color-scheme, so the stylesheet can match the attribute', async () => {
    const harness = await mountReference({ path: '/' })

    harness.element.colorScheme = 'dark'
    await harness.settle()
    expect(harness.element.getAttribute('color-scheme')).toBe('dark')

    const dark = paint(harness, '--openish-color-page')

    harness.element.colorScheme = 'light'
    await harness.settle()
    expect(harness.element.getAttribute('color-scheme')).toBe('light')

    expect(paint(harness, '--openish-color-page')).not.toBe(dark)
  })

  it('defaults to auto, which forces neither scheme', async () => {
    const harness = await mountReference({ path: '/' })

    expect(harness.element.colorScheme).toBe('auto')
    /* Resolved to a real colour without a class, a script, or an attribute that names a scheme. */
    expect(paint(harness, '--openish-color-page')).toMatch(/^rgb/)
  })

  it('scopes the override to the reference, leaving the rest of the page alone', async () => {
    const harness = await mountReference({ path: '/' })
    const frameDocument = harness.frame.contentDocument!

    const outside = frameDocument.createElement('div')
    frameDocument.body.append(outside)
    outside.style.color = 'var(--openish-color-page)'
    const before = harness.frame.contentWindow!.getComputedStyle(outside).color.trim()

    harness.element.colorScheme = 'dark'
    await harness.settle()

    expect(harness.frame.contentWindow!.getComputedStyle(outside).color.trim()).toBe(before)
  })
})

import { DEFAULT_CONFIG } from '@openish/core'
import { describe, expect, it } from 'vitest'

import { ALL_KEYS, CONFIG_CONTROLS, EXCLUDED_KEYS, STRUCTURED_KEYS } from '../src/data/config-matrix.js'

/*
 * The config matrix is built from `DEFAULT_CONFIG` so that an option added to the library appears
 * on the site without anyone remembering. This is the check that it stays that way: every key is
 * either a control, a structured value the page names, or on a short list of deliberate exclusions.
 *
 * The failure it rules out is the quiet one - an option lands in `@openish/core`, the page keeps
 * rendering, and the matrix silently stops being a matrix.
 */
describe('the config matrix', () => {
  it('accounts for every option in DEFAULT_CONFIG', () => {
    const covered = new Set([
      ...CONFIG_CONTROLS.map((control) => control.key),
      ...STRUCTURED_KEYS,
      ...EXCLUDED_KEYS,
    ])
    const missing = ALL_KEYS.filter((key) => !covered.has(key))
    expect(missing, `unaccounted-for options: ${missing.join(', ')}`).toEqual([])
  })

  it('claims no option that does not exist', () => {
    const known = new Set(ALL_KEYS)
    for (const control of CONFIG_CONTROLS) {
      expect(known.has(control.key), `${control.key} is not an OpenishConfig option`).toBe(true)
    }
    for (const key of EXCLUDED_KEYS) {
      expect(known.has(key), `${key} is excluded but does not exist`).toBe(true)
    }
  })

  it('gives every control a default that matches the library’s', () => {
    for (const control of CONFIG_CONTROLS) {
      const actual = DEFAULT_CONFIG[control.key as keyof typeof DEFAULT_CONFIG]
      expect(control.value, `${control.key}`).toBe(
        control.kind === 'boolean' ? actual : String(actual),
      )
    }
  })

  /* A choice list that omits the current default would render a select with nothing selected. */
  it('includes each choice control’s default among its choices', () => {
    for (const control of CONFIG_CONTROLS) {
      if (control.kind === 'choice') {
        expect(control.choices, `${control.key}`).toContain(control.value)
      }
    }
  })

  it('labels every control', () => {
    for (const control of CONFIG_CONTROLS) {
      expect(control.label, `${control.key} has no label`).not.toBe('')
    }
  })
})

import '@openish/theme/index.css'

import type { ColorSchemePreference } from '@openish/core'

/*
 * The site picks a scheme for its *own* chrome - the header, the navigation, the prose - which is
 * this application's markup and not openish's.
 *
 * The reference needs nothing from this: `<openish-api-reference color-scheme="…">` is matched by a
 * rule in `@openish/theme`, and with no attribute at all it follows the reader's system preference.
 * Setting a class here is a host styling its own page. The playground does the same thing for the
 * same reason; this is that file, with `auto` as a value the reader can choose rather than only as
 * the state before they have chosen.
 *
 * Both classes are set rather than only the dark one: with neither present the theme defers to
 * `prefers-color-scheme`, so choosing *light* on a machine set to dark has to say so explicitly -
 * and choosing `auto` has to be able to say nothing at all, which is why it removes both.
 */
const DARK_CLASS = 'openish-dark'
const LIGHT_CLASS = 'openish-light'
const STORAGE_KEY = 'openish-site-color-scheme'

/** The three the toggle cycles through. `auto` is the default, and the one the README argues for. */
export const SCHEMES: readonly ColorSchemePreference[] = ['auto', 'light', 'dark']

export const applyColorScheme = (scheme: ColorSchemePreference): void => {
  document.documentElement.classList.toggle(DARK_CLASS, scheme === 'dark')
  document.documentElement.classList.toggle(LIGHT_CLASS, scheme === 'light')

  if (scheme === 'auto') {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, scheme)
}

/**
 * The stored choice, or `auto`.
 *
 * Deliberately *not* resolved against `prefers-color-scheme` the way the playground resolves it. The
 * playground has to hand a concrete scheme to its toggle button's label; this returns the reader's
 * preference as they expressed it, so "follow my system" survives a reload as itself rather than
 * being frozen into whichever scheme their system happened to be in.
 */
export const initialColorScheme = (): ColorSchemePreference => {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'auto'
}

/** The next scheme in the cycle, so the toggle has one behaviour and not three. */
export const nextColorScheme = (scheme: ColorSchemePreference): ColorSchemePreference =>
  SCHEMES[(SCHEMES.indexOf(scheme) + 1) % SCHEMES.length]!

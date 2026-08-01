import '@openish/theme/index.css'

import type { ColorScheme } from '@openish/core'

/*
 * The playground picks a scheme for its *own* chrome - the toolbar above the reference, which is
 * this app's markup and not openish's.
 *
 * The reference itself needs nothing from this: `<openish-api-reference color-scheme="…">` is
 * matched by a rule in `@openish/theme`, and with no attribute at all it follows the reader's system
 * preference. Setting a class here is a host styling its own page, not openish requiring a host to
 * run script before it can render - which is why there is no longer a copy of the palette behind it.
 *
 * Both classes are set rather than just the dark one: with neither present the theme defers to
 * `prefers-color-scheme`, so choosing *light* on a machine set to dark has to say so explicitly.
 */
const DARK_CLASS = 'openish-dark'
const LIGHT_CLASS = 'openish-light'
const STORAGE_KEY = 'openish-playground-color-scheme'

export const applyColorScheme = (scheme: ColorScheme): void => {
  document.documentElement.classList.toggle(DARK_CLASS, scheme === 'dark')
  document.documentElement.classList.toggle(LIGHT_CLASS, scheme === 'light')
  localStorage.setItem(STORAGE_KEY, scheme)
}

/** Stored choice first, then the OS preference. */
export const initialColorScheme = (): ColorScheme => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

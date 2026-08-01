import '@openish/theme/index.css'

import type { ColorScheme } from '@openish/core'

/*
 * Both JH themes are loaded at once: light declares its tokens on `:root`, dark scopes them to
 * `.jh-theme-dark`. Switching is therefore a class toggle, with no stylesheet swap and no flash.
 */
const DARK_CLASS = 'jh-theme-dark'
const STORAGE_KEY = 'openish-playground-color-scheme'

export const applyColorScheme = (scheme: ColorScheme): void => {
  document.documentElement.classList.toggle(DARK_CLASS, scheme === 'dark')
  document.documentElement.style.colorScheme = scheme
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

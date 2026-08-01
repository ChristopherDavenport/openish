/**
 * The one-script-tag entry.
 *
 *   <script type="module" src="https://cdn.example.com/openish/standalone.js"></script>
 *   <openish-api-reference url="/openapi.yaml"></openish-api-reference>
 *
 * Registering the elements is what `@openish/elements` already does. What this adds is the
 * stylesheet: a consumer with no bundler has no way to resolve `@openish/theme/index.css`, and a
 * reference with no `--openish-*` hooks resolves every one of them to nothing and renders as
 * unstyled text. `THEME_CSS` is replaced at build time with the flattened contents of that file -
 * see `scripts/build-standalone.mjs`.
 *
 * The style element is inserted *first* in `<head>`, not appended, so anything the host already
 * loaded wins on order at equal specificity. Adopting the reference should not restyle the page it
 * is dropped into.
 *
 * Nothing happens if the hooks are already declared - a host that imported the theme itself, or one
 * using `@openish/theme/jh.css`, keeps what it chose.
 */
import './index.js'

declare const THEME_CSS: string

const MARKER = 'data-openish-theme'

const injectTheme = (): void => {
  if (typeof document === 'undefined' || document.querySelector(`[${MARKER}]`)) {
    return
  }

  /*
   * If `--openish-color-page` already resolves, a theme is present and this one is not wanted.
   * Reading it off `<html>` is the same lookup every element makes, so it cannot disagree with them.
   */
  const declared = getComputedStyle(document.documentElement).getPropertyValue('--openish-color-page').trim()
  if (declared !== '') {
    return
  }

  const style = document.createElement('style')
  style.setAttribute(MARKER, '')
  style.textContent = THEME_CSS
  document.head.prepend(style)
}

injectTheme()

export * from './index.js'

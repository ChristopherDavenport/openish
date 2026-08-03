import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'

import '../components/site-code.js'
import '../components/site-example.js'
import { DARK_IN_LIGHT } from '../data/examples.js'
import { siteProseStyles, siteStyles } from '../styles/shared.js'

const FOLLOW = `<!-- Nothing at all: the reference follows the reader. -->
<openish-api-reference url="/openapi.yaml"></openish-api-reference>`

const HOST_CLASS = `<!-- Or let the page decide, for the reference and its own chrome at once. -->
<html class="openish-dark">`

const EVENT = `reference.addEventListener('openish-color-scheme-change', (event) => {
  // 'light', 'dark', or 'auto' — the reader's choice, for the host to store.
  localStorage.setItem('scheme', event.detail)
})`

/**
 * Colour scheme.
 *
 * The claim worth demonstrating rather than describing is that the scheme is decided per element,
 * in CSS, with no script - so a dark reference on a light page is not a special mode, it is what
 * one attribute does. The example below is exactly that, on this page, which is following whatever
 * you have chosen in the header.
 */
@customElement('site-page-color-scheme')
export class SitePageColorScheme extends LitElement {
  static override styles = [
    siteStyles,
    siteProseStyles,
    css`
      :host {
        display: block;
      }

      site-code {
        max-width: 68ch;
        margin-bottom: var(--openish-space-md);
      }
    `,
  ]

  override render(): TemplateResult {
    return html`
      <h1>Colour scheme</h1>
      <p class="lede">
        Light and dark are chosen in CSS, not in script. Every colour is declared once as
        <code>light-dark(light, dark)</code> and the browser picks according to the used value of
        <code>color-scheme</code>.
      </p>

      <h2>Do nothing</h2>
      <p>
        With no attribute the reference follows the reader’s <code>prefers-color-scheme</code>. No
        class, no script, and — because nothing has to run before the right colours are known — no
        flash of the wrong scheme before script arrives. It also follows a reader who changes their
        mind while the page is open, which a scheme resolved once at load cannot.
      </p>
      <site-code .code=${FOLLOW}></site-code>

      <h2>Or decide</h2>
      <p>
        <code>color-scheme="light"</code> or <code>"dark"</code> settles it for that element alone.
        Below is a dark reference on this page, whichever scheme you are reading in — that is the
        whole of the mechanism, and it is why a host embedding a reference in a light page can give
        it a dark one without owning a palette.
      </p>
      <site-example .example=${DARK_IN_LIGHT} label="A dark reference, on this page"></site-example>

      <h2>Or let the page decide</h2>
      <p>
        A host that wants its own chrome and the reference to agree can put
        <code>openish-dark</code> or <code>openish-light</code> on <code>&lt;html&gt;</code>. Both
        classes exist rather than only the dark one: with neither present the theme defers to the
        reader’s preference, so choosing <em>light</em> on a machine set to dark has to be able to
        say so.
      </p>
      <site-code .code=${HOST_CLASS}></site-code>
      <p>
        This site’s own header does exactly that, and its toggle cycles three ways —
        Light, Dark, and Auto — because <code>auto</code> is the real default and a two-way toggle
        would hide it.
      </p>

      <h2>Hearing about it</h2>
      <p>
        The reference applies a scheme to itself and re-dispatches, so a host can do the parts only
        it can: style its own chrome, and remember the choice.
      </p>
      <site-code .code=${EVENT}></site-code>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-color-scheme': SitePageColorScheme
  }
}

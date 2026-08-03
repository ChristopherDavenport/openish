import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'

import '../components/site-code.js'
import '../components/site-example.js'
import { RETHEMED } from '../data/examples.js'
import { repoFile } from '../data/repo.js'
import { siteProseStyles, siteStyles } from '../styles/shared.js'

const HOOKS = `:root {
  --openish-color-accent: #7c3aed;
  --openish-color-link: #7c3aed;
  --openish-radius-md: 0px;
}`

const JH = `<!-- The same components, bound to Jack Henry's design tokens instead. -->
<link rel="stylesheet" href="@openish/theme/jh.css" />`

const PARTS = `openish-api-reference::part(sidebar) {
  border-inline-end: 2px solid rebeccapurple;
}`

/**
 * Theming.
 *
 * The demonstration is the whole argument: the example below is restyled by custom properties
 * written on the element, nothing else - no build step, no agreement about internals, no fork.
 */
@customElement('site-page-theming')
export class SitePageTheming extends LitElement {
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
      <h1>Theming</h1>
      <p class="lede">
        Every colour, space, radius and font openish draws with is a <code>--openish-*</code> custom
        property. Custom properties inherit through a shadow boundary, so a host restyles the whole
        reference from outside it without knowing anything about its internals.
      </p>

      <h2>The hooks</h2>
      <p>
        They are declared in
        <a href=${repoFile('packages/theme/css/tokens.css')} rel="external"
          ><code>packages/theme/css/tokens.css</code></a
        >, grouped by what they are for — surfaces, content, status, borders, focus, spacing, radii,
        type — and every colour among them is a <code>light-dark(…)</code> pair, which is what makes
        the scheme a CSS decision rather than a scripted one.
      </p>
      <site-code .code=${HOOKS}></site-code>

      <h2>Restyled, live</h2>
      <p>
        Below is a reference with seven properties set on the element itself. Nothing else differs
        from the one on the front page — same component, same document, same build.
      </p>
      <site-example .example=${RETHEMED} label="Seven properties, and nothing else"></site-example>

      <h2>A whole design system</h2>
      <p>
        Swapping the stylesheet swaps the binding. <code>@openish/theme/jh.css</code> binds the same
        hooks to Jack Henry design tokens, so a consumer already on that system gets components that
        match it — and openish could be bound to a different one by replacing a single file.
      </p>
      <site-code .code=${JH}></site-code>

      <h2>Parts, for the rest</h2>
      <p>
        Where a token is not enough, the components expose CSS parts, named for what a thing
        <em>is</em> rather than where it sits.
      </p>
      <site-code .code=${PARTS}></site-code>

      <h2>One thing that cannot be a token</h2>
      <p>
        Syntax colours have to be component CSS. Every code block openish renders lives in a shadow
        root, and a <code>.hljs-keyword</code> rule in a stylesheet the host loads does not cross
        that boundary — custom properties do. So the theme declares the
        <code>--openish-hl-*</code> hooks and the components own the rules that read them. Anything
        else styling highlighted code has the same constraint.
      </p>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-theming': SitePageTheming
  }
}

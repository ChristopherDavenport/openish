import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { siteStyles } from '../styles/shared.js'
import { isActive, routePath } from './paths.js'
import { groups, routesIn, type SiteRoute } from './routes.js'

/**
 * The site's navigation, generated from the route table.
 *
 * Nothing here is hand-listed. `routes.ts` is the single source for both this and the `Router`'s
 * route table, so a page cannot exist without appearing here and a link here cannot point at a page
 * that does not exist - the two failures a hand-maintained nav alternates between.
 *
 * Plain `<a href>` throughout. The root `Router` intercepts a same-origin anchor click and turns it
 * into a navigation, so these need no click handler; they also still work as links if script never
 * arrives, which is the reason to render them as links rather than buttons.
 */
@customElement('site-nav')
export class SiteNav extends LitElement {
  static override styles = [
    siteStyles,
    css`
      :host {
        display: block;
        padding: var(--openish-space-lg) var(--openish-space-md);
      }

      h2 {
        font: var(--openish-font-small-bold);
        color: var(--openish-color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin: 0 0 var(--openish-space-2xs);
      }

      section + section {
        margin-top: var(--openish-space-lg);
      }

      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      a {
        display: block;
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        border-radius: var(--openish-radius-sm);
        color: var(--openish-color-text);
      }

      a:hover {
        text-decoration: none;
        background: var(--openish-color-surface-hover);
      }

      /*
       * The current page, marked the way the sidebar of a reference marks one: a surface and a
       * weight, not a colour. aria-current is the state, so the style reads off it rather than off
       * a class the template would have to keep in step with it.
       */
      a[aria-current='page'] {
        background: var(--openish-color-surface-selected);
        font: var(--openish-font-body-bold);
      }
    `,
  ]

  /**
   * The pathname to mark against.
   *
   * A property rather than a read of `window.location`, because `<site-app>` already subscribes to
   * navigation for the router's sake and a second subscriber would be a second thing to keep in
   * step. Properties down.
   */
  @property({ type: String })
  pathname = ''

  #link(route: SiteRoute): TemplateResult {
    const current = isActive(this.pathname, route.slug)
    return html`
      <li>
        <a
          href=${routePath(route.slug)}
          title=${route.blurb}
          aria-current=${current ? 'page' : 'false'}
        >
          ${route.title}
        </a>
      </li>
    `
  }

  override render(): TemplateResult {
    return html`
      <nav aria-label="Site">
        ${repeat(
          groups(),
          (group) => group,
          (group) => html`
            <section>
              <h2>${group}</h2>
              <ul>
                ${repeat(routesIn(group), (route) => route.slug, (route) => this.#link(route))}
              </ul>
            </section>
          `,
        )}
      </nav>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-nav': SiteNav
  }
}

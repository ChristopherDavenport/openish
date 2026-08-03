import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'

import '../components/site-code.js'
import '../components/site-example.js'
import '../components/site-frame.js'
import { routePath } from '../app/paths.js'
import { HOST_ROUTED } from '../data/examples.js'
import { siteProseStyles, siteStyles } from '../styles/shared.js'

const NONE = `<openish-api-reference routing="none"></openish-api-reference>

<script type="module">
  const reference = document.querySelector('openish-api-reference')
  reference.addEventListener('openish-navigate', (event) => {
    // The reference asking. The host decides, and answers by setting \`selected\`.
    router.go(event.detail)
  })
</script>`

const BASE_PATH = `<openish-api-reference routing="history" base-path="/docs"></openish-api-reference>`

/**
 * Routing.
 *
 * The two fragment-owning modes are shown in iframes rather than in the page, and the page says why
 * rather than quietly arranging it: this site's own router owns `location.pathname` in the
 * top-level window, and a mode about owning the address bar cannot be demonstrated in a window
 * where something else already does.
 */
@customElement('site-page-routing')
export class SitePageRouting extends LitElement {
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

      site-frame {
        margin-bottom: var(--openish-space-lg);
      }

      .note {
        border-inline-start: var(--openish-border-selected-width) solid
          var(--openish-border-selected-color);
        padding: var(--openish-space-2xs) 0 var(--openish-space-2xs) var(--openish-space-sm);
        margin-bottom: var(--openish-space-md);
        max-width: 68ch;
      }

      .note p {
        margin: 0;
      }
    `,
  ]

  override render(): TemplateResult {
    return html`
      <h1>Routing</h1>
      <p class="lede">
        Navigation ids are URL paths — <code>tags/accounts/listAccounts</code> — and
        <code>store.bySlug</code> resolves one to a node in a single lookup. So there is no route
        table and no router library: reading the id out of the URL is the whole of it, and it differs
        by mode in about three lines.
      </p>

      <h2><code>hash</code>, the default</h2>
      <p>
        It is the only mode that works with no cooperation from anything.
        <code>…/docs#/tags/accounts</code> asks the server for <code>…/docs</code>, which it already
        serves, so a static host with no rewrite rule deep-links correctly. A fragment link is
        navigation the browser performs by itself, so nothing has to intercept a click. And it works
        from <code>file://</code>.
      </p>
      <p>Watch the address bar above the frame as you click around inside it:</p>
      <site-frame src=${routePath('history-demo.html?mode=hash')} label="routing=hash"></site-frame>

      <h2><code>history</code>, for real paths</h2>
      <p>
        Real URLs, at the cost of a server that serves the application for every one of them. This is
        the mode <code>base-path</code> exists for — the frame below is mounted under its own path
        and told so, which is what a host adopting this most needs to see working.
      </p>
      <site-code .code=${BASE_PATH}></site-code>
      <site-frame
        src=${routePath('history-demo.html?mode=history')}
        label="routing=history"
      ></site-frame>

      <div class="note">
        <p>
          These are iframes, and deliberately. This site’s router owns
          <code>location.pathname</code> in the top-level window; a mode whose job is owning the
          address bar cannot be shown honestly in a window where something else already does. A
          frame has its own <code>location</code>, its own history and its own
          <code>popstate</code>.
        </p>
      </div>

      <h2><code>none</code>, handing it over</h2>
      <p>
        The host sets <code>selected</code> and listens for <code>openish-navigate</code>, which is
        dispatched when a link is clicked rather than only after the fact. This is the mode a
        framework host wants, and — because it hands the URL over completely — the one every other
        page on this site embeds a reference with.
      </p>
      <site-code .code=${NONE}></site-code>
      <site-example .example=${HOST_ROUTED} label="selected, set by the host"></site-example>

      <h2>The URL follows the reader</h2>
      <p>
        The document is one continuous page, so a URL names a position rather than choosing a page.
        Two consequences a host should know about:
      </p>
      <ul>
        <li>
          <strong>Scrolling rewrites the URL</strong>, with <code>replaceState</code>, after about
          120 ms of quiet. Never <code>pushState</code>: every section the reader passed would become
          a history entry, and Back would walk them back up the document instead of leaving.
          <code>openish-navigate</code> fires with it, so a host syncing its own chrome hears from
          scrolling as well as from clicks — which is exactly how the address bars above these
          frames stay current.
        </li>
        <li>
          <strong>A URL that names nothing is left exactly as the reader typed it.</strong> A banner
          says which id failed, with the document on screen behind it. Nothing rewrites it to the
          front page, because a bookmark that has outlived its operation should still be able to say
          so after a reload.
        </li>
      </ul>

      <h2>Changing modes</h2>
      <p>
        <code>routing</code> can be changed on a live element. Nothing is installed at connect time,
        which is a consequence of there being no router: there is nothing to install.
      </p>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-routing': SitePageRouting
  }
}

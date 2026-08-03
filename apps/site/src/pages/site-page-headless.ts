import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'

import '../components/site-code.js'
import { GALAXY } from '../data/documents.js'
import { repoFile } from '../data/repo.js'
import { siteControlStyles, siteProseStyles, siteStyles } from '../styles/shared.js'

const CORE = `import { createDocumentStore, nodeToMarkdown } from '@openish/core'

const store = await createDocumentStore(yamlOrJsonOrObject)

store.navigation   // the navigation tree, built once, up front
store.bySlug       // every node, keyed by its id — the whole of the "router"
store.byPointer    // the same nodes, keyed by JSON pointer
store.document     // the parsed document, with $refs resolvable on access

// A section as Markdown, built from the document rather than from the page.
nodeToMarkdown(store, store.navigation[0])`

const CLIENT = `import { sendRequest, createPkce, discoverOidc } from '@openish/client'

// Zero dependencies, and every network function takes its own fetch —
// so it is testable without a network and usable outside a browser.
const response = await sendRequest(request, { fetch })`

/**
 * The two packages that are not components.
 *
 * One page rather than two, because the point they make is the same one: the render layer is a
 * layer, and everything under it is usable without adopting Lit or anything else. Splitting that
 * across two pages would have made it twice as long and half as clear.
 *
 * The demonstration is live, and it is the honest one for a headless package: run the function,
 * show what it returned. `@openish/core` is imported on demand — it is 88 kB gzipped, and a reader
 * who does not open this page should not pay for it.
 */
@customElement('site-page-headless')
export class SitePageHeadless extends LitElement {
  static override styles = [
    siteStyles,
    siteControlStyles,
    siteProseStyles,
    css`
      :host {
        display: block;
      }

      site-code {
        max-width: 68ch;
        margin-bottom: var(--openish-space-md);
      }

      .run {
        display: flex;
        align-items: center;
        gap: var(--openish-space-xs);
        margin-bottom: var(--openish-space-sm);
      }

      .status {
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
      }
    `,
  ]

  @state()
  private output = ''

  @state()
  private busy = false

  /**
   * Parses a real document with the real package, in this tab.
   *
   * The output below is whatever `createDocumentStore` and the traversal actually returned - not a
   * transcript. If the shape of a navigation node changes, this page changes with it.
   */
  async #run(): Promise<void> {
    if (this.busy) {
      return
    }
    this.busy = true
    this.output = ''

    try {
      const [{ createDocumentStore }, text] = await Promise.all([
        import('@openish/core'),
        fetch(GALAXY.url).then((response) => response.text()),
      ])

      const started = performance.now()
      const store = await createDocumentStore(text)
      const elapsed = Math.round(performance.now() - started)

      const roots = store.navigation
        .slice(0, 6)
        .map((node) => `  ${node.type.padEnd(10)} ${node.id}`)
      this.output = [
        `// Parsed ${(text.length / 1024).toFixed(0)} kB in ${elapsed} ms, in this tab.`,
        ``,
        `store.document.info.title   ${JSON.stringify(store.document.info?.title ?? '')}`,
        `store.navigation.length     ${store.navigation.length}`,
        `store.bySlug.size           ${store.bySlug.size}`,
        ``,
        `store.navigation.slice(0, 6)`,
        ...roots,
      ].join('\n')
    } catch (error) {
      this.output = `// Failed: ${error instanceof Error ? error.message : String(error)}`
    }

    this.busy = false
  }

  override render(): TemplateResult {
    return html`
      <h1>Without any components at all</h1>
      <p class="lede">
        The render layer is a layer. Two of the four packages have no DOM in them, and neither needs
        Lit, a browser, or anything openish draws.
      </p>

      <h2><code>@openish/core</code></h2>
      <p>
        The parser, the <code>$ref</code> machinery, the traversal, the snippet generator and the
        Markdown pipeline — most of it Scalar’s own Vue-free tooling, reused rather than
        reimplemented. Navigation ids are URL paths and <code>store.bySlug</code> is a map keyed by
        them, which is why the reference needs no route table: the id <em>is</em> the lookup.
      </p>
      <site-code .code=${CORE}></site-code>

      <div class="run">
        <button type="button" ?disabled=${this.busy} @click=${() => void this.#run()}>
          Parse a document
        </button>
        <span class="status">
          ${this.busy ? 'Fetching and parsing…' : 'Runs here, with the real package.'}
        </span>
      </div>
      ${this.output ? html`<site-code .code=${this.output} label="What it returned"></site-code>` : ''}

      <h2><code>@openish/client</code></h2>
      <p>
        <strong>Zero dependencies</strong>, 4.0 kB gzipped: the request sender, and the OAuth flows —
        PKCE, OIDC discovery, authorization code, client credentials, the password grant, popup and
        redirect transports. Every network function takes its own <code>fetch</code>, which is what
        makes it testable without a network and usable outside a browser.
      </p>
      <site-code .code=${CLIENT}></site-code>
      <p>
        It is the package to reach for when you want the requests without the reading — a CLI, a test
        harness, or a UI of your own that has no interest in rendering documentation. The proxy
        contract and the rule that a client secret never leaves the server are in
        <a href=${repoFile('packages/client/README.md')} rel="external">its README</a>.
      </p>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-headless': SitePageHeadless
  }
}

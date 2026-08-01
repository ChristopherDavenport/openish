import { consume } from '@lit/context'
import { describeSecurityScheme, getResolvedRef, type NavNode, type DocumentStore } from '@openish/core'
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { stripFirstSegment } from '../router/urls.js'
import { baseStyles } from '../styles/shared.js'
import { OpenishMarkdown } from './openish-markdown.js'
import './openish-download.js'

type SecurityScheme = {
  type?: string
  scheme?: string
  name?: string
  in?: string
  description?: string
  openIdConnectUrl?: string
}

/**
 * The landing page: what the API is, where it lives, and how to authenticate.
 *
 * Headings from `info.description` are navigation targets, so each one gets an `id` matching the
 * `NavTextNode` id that `@openish/core` minted for it. That is what makes a sidebar link to
 * `#overview/getting-started` land somewhere.
 */
@customElement('openish-overview')
export class OpenishOverview extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      h1 {
        font: var(--openish-font-heading-1);
        margin: 0 0 var(--openish-space-2xs);
      }

      .version {
        display: inline-block;
        margin-bottom: var(--openish-space-lg);
        padding: 0 var(--openish-space-xs);
        border-radius: var(--openish-radius-pill);
        background: var(--openish-color-surface-muted);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
      }

      section {
        margin-top: var(--openish-space-xl);
      }

      h2 {
        font: var(--openish-font-heading-2);
        margin: 0 0 var(--openish-space-sm);
      }

      dl {
        margin: 0;
        display: grid;
        grid-template-columns: minmax(6rem, auto) 1fr;
        gap: var(--openish-space-2xs) var(--openish-space-md);
      }

      dt {
        font: var(--openish-font-body-bold);
        color: var(--openish-color-text-muted);
      }

      dd {
        margin: 0;
      }

      .server {
        font-family: var(--openish-font-family-mono);
        word-break: break-all;
      }

      .server-description,
      .scheme-detail {
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
      }

      ul.servers {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--openish-space-sm);
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /**
   * Fragment to scroll to, passed down rather than read from `location` here.
   *
   * A heading from `info.description` is a navigation node, so arriving at one is a normal
   * navigation and the target lives inside `<openish-markdown>`'s shadow root - out of reach of the
   * browser's own fragment scrolling, which only looks at ids in the document. The element that owns
   * the headings is the only one that can do it.
   */
  @property({ type: String })
  hash = ''

  /**
   * The prose block, kept by `@query` rather than looked up by selector at call time.
   *
   * Declared, never initialised: `@query` installs a getter on the prototype, and with
   * `useDefineForClassFields: false` a field initialiser would try to assign through it.
   */
  @query('openish-markdown')
  private prose!: OpenishMarkdown | null

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('hash') || changed.has('store')) {
      this.#scrollToHash()
    }
  }

  #scrollToHash(): void {
    if (!this.hash) {
      return
    }

    /* Description headings live inside `<openish-markdown>`'s shadow root, out of reach of a query here. */
    if (this.prose?.scrollToHeading(this.hash)) {
      return
    }

    this.renderRoot.querySelector(`[id="${CSS.escape(this.hash)}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  /**
   * Heading ids come straight from the navigation nodes, so links and targets cannot drift apart.
   *
   * In the form the *URL* has them, because that is what these are: a heading is not its own page,
   * so `hrefFor` puts its id in the fragment, and the fragment is what gets matched against these
   * when the browser - or `scrollToHeading` - goes looking for the target.
   */
  #headingIds(): string[] {
    const prefix = this.ui?.slugPrefix ?? ''
    const ids: string[] = []
    const visit = (nodes: readonly NavNode[]) => {
      for (const node of nodes) {
        if (node.type === 'text') {
          ids.push(prefix ? stripFirstSegment(node.id) : node.id)
          if (node.children) {
            visit(node.children)
          }
        }
      }
    }
    visit(this.store?.navigation ?? [])
    return ids
  }

  #renderServers(): TemplateResult | typeof nothing {
    /*
     * The host's list replaces the document's, and this page has to agree with the try-it panel
     * about which one is in force - a reference that documents one server and calls another is
     * worse than one that documents neither.
     */
    const configured = this.ui?.config.servers ?? []
    const servers = configured.length > 0 ? configured : this.store?.document.servers
    if (!servers || servers.length === 0) {
      return nothing
    }

    return html`
      <section>
        <h2>Servers</h2>
        <ul class="servers">
          ${repeat(
            servers,
            (server) => server.url ?? '',
            (server) => html`
              <li>
                <div class="server">${server.url}</div>
                ${server.description
                  ? html`<div class="server-description">${server.description}</div>`
                  : nothing}
                ${Object.entries(server.variables ?? {}).map(
                  ([name, variable]) => html`
                    <div class="server-description">
                      <code>${name}</code> defaults to <code>${String(variable?.default ?? '')}</code>
                      ${Array.isArray(variable?.enum) && variable.enum.length > 0
                        ? html` — one of ${variable.enum.map((value) => String(value)).join(', ')}`
                        : nothing}
                    </div>
                  `,
                )}
              </li>
            `,
          )}
        </ul>
      </section>
    `
  }

  #renderSecurity(): TemplateResult | typeof nothing {
    const schemes = this.store?.document.components?.securitySchemes
    if (!schemes || Object.keys(schemes).length === 0) {
      return nothing
    }

    return html`
      <section>
        <h2>Authentication</h2>
        <dl>
          ${Object.entries(schemes).map(([name, raw]) => {
            const scheme = getResolvedRef(raw) as SecurityScheme
            return html`
              <dt>${name}</dt>
              <dd>
                <div>${describeSecurityScheme(scheme, { showUrl: true })}</div>
                ${scheme.description
                  ? html`<openish-markdown .markdown=${scheme.description} .headingOffset=${2}></openish-markdown>`
                  : nothing}
              </dd>
            `
          })}
        </dl>
      </section>
    `
  }

  override render(): TemplateResult | typeof nothing {
    const info = this.store?.document.info
    if (!info) {
      return nothing
    }

    return html`
      <h1>${info.title}</h1>
      ${info.version ? html`<div class="version">${info.version}</div>` : nothing}
      ${info.description
        ? html`
            <openish-markdown
              .markdown=${info.description}
              .headingOffset=${1}
              .headingIds=${this.#headingIds()}
            ></openish-markdown>
          `
        : nothing}
      ${this.#renderServers()} ${this.#renderSecurity()}
      <section><openish-download></openish-download></section>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-overview': OpenishOverview
  }
}

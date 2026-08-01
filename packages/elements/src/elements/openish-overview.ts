import { consume } from '@lit/context'
import { getResolvedRef, type NavNode, type DocumentStore } from '@openish/core'
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext } from '../context/contexts.js'
import { baseStyles } from '../styles/shared.js'
import { OpenishMarkdown } from './openish-markdown.js'

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

  /**
   * Fragment to scroll to, passed down rather than read from `location` here.
   *
   * The router calls `preventDefault()` on link clicks, so the browser never performs its own
   * fragment scroll and `hashchange` never fires. Something has to do it, and the element that owns
   * the headings is the only one that can.
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

  /** Heading ids come straight from the navigation nodes, so links and targets cannot drift apart. */
  #headingIds(): string[] {
    const ids: string[] = []
    const visit = (nodes: readonly NavNode[]) => {
      for (const node of nodes) {
        if (node.type === 'text') {
          ids.push(node.id)
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
    const servers = this.store?.document.servers
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

  /** A one-line summary of how a scheme is supplied, since `type` alone rarely answers it. */
  #describeScheme(scheme: SecurityScheme): string {
    if (scheme.type === 'http') {
      return `HTTP ${scheme.scheme ?? 'authentication'}`
    }
    if (scheme.type === 'apiKey') {
      return `API key in ${scheme.in ?? 'request'}${scheme.name ? ` as ${scheme.name}` : ''}`
    }
    if (scheme.type === 'oauth2') {
      return 'OAuth 2.0'
    }
    if (scheme.type === 'openIdConnect') {
      return `OpenID Connect${scheme.openIdConnectUrl ? ` — ${scheme.openIdConnectUrl}` : ''}`
    }
    if (scheme.type === 'mutualTLS') {
      return 'Mutual TLS'
    }
    return scheme.type ?? 'Unknown scheme'
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
                <div>${this.#describeScheme(scheme)}</div>
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
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-overview': OpenishOverview
  }
}

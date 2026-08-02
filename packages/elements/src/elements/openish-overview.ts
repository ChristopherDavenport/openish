import { consume } from '@lit/context'
import {
  describeSecurityScheme,
  getResolvedRef,
  securitySchemeFlows,
  type NavNode,
  type DocumentStore,
  type OAuthFlowDetail,
} from '@openish/core'
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, query } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { externalDocsStyles, renderExternalDocs } from '../render/external-docs.js'
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
    externalDocsStyles,
    css`
      :host {
        display: block;
        /* Prose, so it caps itself at the reading measure however wide the page around it is. */
        max-width: var(--openish-content-max-width);
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

      .summary {
        margin: 0 0 var(--openish-space-md);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-body);
      }

      .flow {
        margin-top: var(--openish-space-xs);
      }

      .flow-name {
        font: var(--openish-font-body-bold);
      }

      .endpoint {
        font-family: var(--openish-font-family-mono);
        font-size: 0.9em;
        word-break: break-all;
      }

      dl.scopes {
        display: grid;
        grid-template-columns: minmax(6rem, auto) 1fr;
        gap: var(--openish-space-3xs) var(--openish-space-sm);
        margin: var(--openish-space-2xs) 0 0;
      }

      dl.scopes dt {
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text);
      }

      dl.scopes dd {
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
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

  /**
   * Who to talk to, under what licence, on what terms.
   *
   * Every one of these is optional and most documents set none, so the section disappears rather
   * than rendering an empty definition list. `license.identifier` is the 3.1 spelling of an SPDX id
   * and is shown when there is no URL to link, because the identifier is the answer either way.
   */
  #renderAbout(info: Record<string, unknown>): TemplateResult | typeof nothing {
    const contact = (info['contact'] ?? {}) as { name?: string; url?: string; email?: string }
    const license = (info['license'] ?? {}) as { name?: string; url?: string; identifier?: string }
    const terms = typeof info['termsOfService'] === 'string' ? info['termsOfService'] : undefined

    const rows: Array<TemplateResult> = []

    if (contact.name || contact.url || contact.email) {
      rows.push(html`
        <dt>Contact</dt>
        <dd>
          ${contact.url
            ? html`<a href=${contact.url} rel="noreferrer noopener">${contact.name ?? contact.url}</a>`
            : (contact.name ?? nothing)}
          ${contact.email
            ? html`<div><a href=${`mailto:${contact.email}`}>${contact.email}</a></div>`
            : nothing}
        </dd>
      `)
    }

    if (license.name || license.url || license.identifier) {
      const label = license.name ?? license.identifier ?? license.url ?? ''
      rows.push(html`
        <dt>Licence</dt>
        <dd>
          ${license.url ? html`<a href=${license.url} rel="noreferrer noopener">${label}</a>` : label}
          ${license.identifier && license.identifier !== label
            ? html`<span class="scheme-detail"> (${license.identifier})</span>`
            : nothing}
        </dd>
      `)
    }

    if (terms) {
      rows.push(html`
        <dt>Terms of service</dt>
        <dd><a href=${terms} rel="noreferrer noopener">${terms}</a></dd>
      `)
    }

    if (rows.length === 0) {
      return nothing
    }

    return html`
      <section>
        <h2>About</h2>
        <dl>${rows}</dl>
      </section>
    `
  }

  /**
   * The flows an OAuth scheme offers, and above all the scopes.
   *
   * These have always been in the document and only ever been shown inside the auth form, which is a
   * control a reader who is not signing in never opens. A scope list is documentation.
   */
  #renderFlows(flows: readonly OAuthFlowDetail[]): TemplateResult | typeof nothing {
    if (flows.length === 0) {
      return nothing
    }

    return html`
      ${repeat(
        flows,
        (flow) => flow.key,
        (flow) => html`
          <div class="flow">
            <div class="flow-name">${flow.label}</div>
            ${flow.authorizationUrl
              ? html`<div class="scheme-detail">Authorize at <span class="endpoint">${flow.authorizationUrl}</span></div>`
              : nothing}
            ${flow.tokenUrl
              ? html`<div class="scheme-detail">Token at <span class="endpoint">${flow.tokenUrl}</span></div>`
              : nothing}
            ${flow.refreshUrl
              ? html`<div class="scheme-detail">Refresh at <span class="endpoint">${flow.refreshUrl}</span></div>`
              : nothing}
            ${flow.scopes.length > 0
              ? html`
                  <dl class="scopes">
                    ${repeat(
                      flow.scopes,
                      (scope) => scope.name,
                      (scope) => html`
                        <dt>${scope.name}</dt>
                        <dd>${scope.description ?? nothing}</dd>
                      `,
                    )}
                  </dl>
                `
              : nothing}
          </div>
        `,
      )}
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
                ${this.#renderFlows(securitySchemeFlows(scheme))}
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

    const fields = info as unknown as Record<string, unknown>
    const summary = typeof fields['summary'] === 'string' ? fields['summary'] : undefined

    return html`
      <h1>${info.title}</h1>
      ${info.version ? html`<div class="version">${info.version}</div>` : nothing}
      ${summary ? html`<p class="summary">${summary}</p>` : nothing}
      ${info.description
        ? html`
            <openish-markdown
              .markdown=${info.description}
              .headingOffset=${1}
              .headingIds=${this.#headingIds()}
            ></openish-markdown>
          `
        : nothing}
      ${renderExternalDocs(this.store?.document.externalDocs, `More about ${info.title}`)}
      ${this.#renderServers()} ${this.#renderSecurity()} ${this.#renderAbout(fields)}
      <section><openish-download></openish-download></section>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-overview': OpenishOverview
  }
}

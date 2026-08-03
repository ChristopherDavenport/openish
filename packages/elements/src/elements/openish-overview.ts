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
import { customElement, property } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { deepQuery } from '../dom/deep-query.js'
import { asideStyles, renderAside } from '../render/aside.js'
import { externalDocsStyles, renderExternalDocs } from '../render/external-docs.js'
import { heading } from '../render/heading.js'
import { stripFirstSegment } from '../router/urls.js'
import { baseStyles, planeColumnStyles, titleRowStyles, visuallyHidden } from '../styles/shared.js'
import './openish-copy-markdown.js'
import './openish-markdown.js'
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
 * Every heading here is a navigation target, so each one gets an `id` matching the `NavTextNode` id
 * that `@openish/core` minted for it. That is what makes a sidebar link to
 * `#overview/getting-started` land somewhere. Two of them - `Servers` and `Authentication` - are
 * headings this element writes rather than ones the description contains, which is the whole
 * difference `NavTextNode.infoSection` records: they are found by that field, and the prose ones by
 * their position among the headings the markdown pipeline is about to render.
 */
@customElement('openish-overview')
export class OpenishOverview extends LitElement {
  static override styles = [
    baseStyles,
    asideStyles,
    externalDocsStyles,
    titleRowStyles,
    planeColumnStyles,
    visuallyHidden,
    css`
      /* Weight from the class, not the tag - see the note in render/heading.ts. */
      .title {
        font: var(--openish-font-heading-1);
        margin: 0 0 var(--openish-space-2xs);
      }

      /*
       * Three controls where every other section has one, so this row is allowed to wrap - a long
       * title should push them onto their own line rather than be squeezed by them. The override is
       * here rather than in titleRowStyles, which the operation, tag and model pages share and
       * where nothing has ever needed to wrap.
       */
      .title-row {
        flex-wrap: wrap;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--openish-space-xs);
      }

      /*
       * Stacked, the facts follow the prose and need air above them; side by side they are a column
       * of their own, starting level with the title. Which way round it goes is not a rule anyone
       * wrote here: two elements in one grid column are read in the order they were written, and
       * that order is the introduction and then what to do about it.
       *
       * A grid with a gap rather than margins on the blocks inside, because the first block in this
       * column is a slot - display: contents, so a rule about "the first child" lands on something
       * that is not there, and a margin on whatever follows it collapses out through the column and
       * moves the column instead. Grid items' margins do not collapse and an unfilled slot
       * contributes no item, so the spacing is the same whether a host slotted anything in or not.
       */
      .facts {
        display: grid;
        align-content: start;
        gap: var(--openish-space-xl);
        margin-top: var(--openish-space-lg);
      }

      .facts > section {
        margin-top: 0;
      }

      /*
       * What the document is, on one line under its name: version, licence, who to ask, the terms.
       *
       * These used to be an About definition list at the foot of the right-hand column, which on a
       * document with OAuth put the licence below a screenful of scopes - a reader looking for "can
       * I use this" had to scroll past everything they were not looking for to find out. They are
       * identity, not a topic, so they belong with the title, and at that size they are a strip
       * rather than a list.
       *
       * The row gap is smaller than the column gap on purpose: wrapped, these should read as one
       * block of small print, not as rows of a table.
       */
      .meta {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--openish-space-2xs) var(--openish-space-md);
        margin-bottom: var(--openish-space-lg);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
      }

      .version {
        display: inline-block;
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

      .section-title {
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
   * A heading inside the prose to scroll to, passed down rather than read from `location` here.
   *
   * Set only when this section is being rendered on its own, through `renderNodeById` - a host
   * embedding one node has nothing else that could scroll to a heading. On the plane it stays empty
   * and `SectionsController` does the scrolling, because there the correction has to survive several
   * frames of the document settling around it, and two things scrolling one scroller fight.
   */
  @property({ type: String })
  hash = ''

  /** The heading level this section's own title takes. See `<openish-operation>`'s. */
  @property({ type: Number })
  level = 1

  /**
   * The one imperative call this element makes, in response to a property changing.
   *
   * `deepQuery` rather than asking `<openish-markdown>` to find its own heading: the ids are stamped
   * through the markdown transform, so they are ordinary DOM by the time this runs, and a parent
   * calling a method on a child makes that method part of the child's API for the sake of one
   * caller.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (!this.hash || !(changed.has('hash') || changed.has('store'))) {
      return
    }

    deepQuery(this.renderRoot, `[id="${CSS.escape(this.hash)}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  /**
   * Heading ids come straight from the navigation nodes, so links and targets cannot drift apart.
   *
   * In the form the *URL* has them, because that is what these are: a heading is not its own page,
   * so `hrefFor` puts its id in the fragment, and the fragment is what gets matched against these
   * when the browser - or whatever is doing the scrolling - goes looking for the target.
   */
  #headingIds(): string[] {
    const ids: string[] = []
    const visit = (nodes: readonly NavNode[]) => {
      for (const node of nodes) {
        if (node.type === 'text') {
          /*
           * The prose headings only. `<openish-markdown>` matches these to headings by position, so
           * a node for `Servers` - which this element writes itself and the description never
           * mentions - would take the id belonging to whatever heading came next and push every id
           * after it along by one.
           */
          if (!node.infoSection) {
            ids.push(this.#urlId(node.id))
          }
          if (node.children) {
            visit(node.children)
          }
        }
      }
    }
    visit(this.store?.navigation ?? [])
    return ids
  }

  /** The id of a heading this element writes itself, or `undefined` if the traversal minted none. */
  #infoHeadingId(section: 'servers' | 'authentication'): string | undefined {
    const node = this.store?.navigation.find(
      (candidate) => candidate.type === 'text' && candidate.infoSection === section,
    )
    return node ? this.#urlId(node.id) : undefined
  }

  /** An id in the form the URL carries it, which is the form a fragment gets matched against. */
  #urlId(id: string): string {
    return this.ui?.slugPrefix ? stripFirstSegment(id) : id
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
        ${heading(this.level + 1, 'Servers', { 'section-title': true }, this.#infoHeadingId('servers'))}
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
   * The version, and who to talk to, under what licence, on what terms.
   *
   * Every one of these is optional and most documents set none, so the strip disappears rather than
   * rendering an empty row. `license.identifier` is the 3.1 spelling of an SPDX id and is shown when
   * there is no URL to link, because the identifier is the answer either way. Terms is a link
   * labelled `Terms of service` rather than the URL it points at - the URL was readable in a
   * definition list and is not on a line of small print.
   *
   * Each item carries a hidden label, because these are values whose meaning came from the `<dt>`
   * beside them and there is no `<dt>` any more. A reader can see that `MIT` is a licence from
   * where it sits and what it says; a reader hearing `MIT` between a version number and an email
   * address cannot.
   */
  #renderMeta(info: Record<string, unknown>): TemplateResult | typeof nothing {
    const version = typeof info['version'] === 'string' ? info['version'] : undefined
    const contact = (info['contact'] ?? {}) as { name?: string; url?: string; email?: string }
    const license = (info['license'] ?? {}) as { name?: string; url?: string; identifier?: string }
    const terms = typeof info['termsOfService'] === 'string' ? info['termsOfService'] : undefined

    const items: Array<TemplateResult> = []

    if (version) {
      /* The hidden label outside the pill, so the pill's own text is still just the version. */
      items.push(html`
        <span><span class="visually-hidden">Version </span><span class="version">${version}</span></span>
      `)
    }

    if (license.name || license.url || license.identifier) {
      const label = license.name ?? license.identifier ?? license.url ?? ''
      items.push(html`
        <span>
          <span class="visually-hidden">Licence </span>
          ${license.url ? html`<a href=${license.url} rel="noreferrer noopener">${label}</a>` : label}
          ${license.identifier && license.identifier !== label ? html` (${license.identifier})` : nothing}
        </span>
      `)
    }

    if (contact.name || contact.url) {
      const label = contact.name ?? contact.url ?? ''
      items.push(html`
        <span>
          <span class="visually-hidden">Contact </span>
          ${contact.url ? html`<a href=${contact.url} rel="noreferrer noopener">${label}</a>` : label}
        </span>
      `)
    }

    if (contact.email) {
      items.push(html`
        <span>
          <span class="visually-hidden">Contact </span>
          <a href=${`mailto:${contact.email}`}>${contact.email}</a>
        </span>
      `)
    }

    if (terms) {
      items.push(html`<a href=${terms} rel="noreferrer noopener">Terms of service</a>`)
    }

    return items.length > 0 ? html`<div class="meta">${items}</div>` : nothing
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
        ${heading(
          this.level + 1,
          'Authentication',
          { 'section-title': true },
          this.#infoHeadingId('authentication'),
        )}
        <dl>
          ${Object.entries(schemes).map(([name, raw]) => {
            const scheme = getResolvedRef(raw) as SecurityScheme
            return html`
              <dt>${name}</dt>
              <dd>
                <div>${describeSecurityScheme(scheme, { showUrl: true })}</div>
                ${scheme.description
                  ? html`<openish-markdown .markdown=${scheme.description} .headingOffset=${this.level + 1}></openish-markdown>`
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

    /*
     * The introduction reads like every other section: what this is on the left, and on the right
     * the concrete things a reader acts on.
     *
     * Servers and authentication were always the second kind and were stacked under the prose
     * because there was nowhere else to put them - so the band that runs down the right of the whole
     * document started one section late. What an author adds through `x-openish-aside` and what a
     * host slots in join them there, in that order: the host's context is the most specific thing on
     * the page, the author's is next, and the facts the document states are last because they are
     * the ones a reader can always find again.
     *
     * Copying the document for a model and downloading it are the same request - hand me the thing
     * this page is a view of - so they stand together beside the title rather than one being a
     * control on the heading and the other a footnote in the other column.
     */
    return html`
      <div class="columns">
        <div class="docs" part="overview-docs">
          <div class="title-row" part="overview-header">
            ${heading(this.level, info.title, { title: true })}
            <div class="actions">
              <openish-copy-markdown exportparts="copy"></openish-copy-markdown>
              <openish-download></openish-download>
            </div>
          </div>
          ${this.#renderMeta(fields)} ${summary ? html`<p class="summary">${summary}</p>` : nothing}
          ${info.description
            ? html`
                <openish-markdown
                  .markdown=${info.description}
                  .headingOffset=${this.level}
                  .headingIds=${this.#headingIds()}
                ></openish-markdown>
              `
            : nothing}
          ${renderExternalDocs(this.store?.document.externalDocs, `More about ${info.title}`)}
        </div>

        <div class="facts" part="overview-aside">
          <slot name="aside"></slot>
          ${renderAside(info, this.level)} ${this.#renderServers()} ${this.#renderSecurity()}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-overview': OpenishOverview
  }
}

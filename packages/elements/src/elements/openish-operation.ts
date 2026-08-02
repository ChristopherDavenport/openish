import { consume } from '@lit/context'
import {
  collectParameters,
  describeSecurityScheme,
  operationBadges,
  resolveOperationNode,
  securityRequirements,
  type DocumentStore,
  type NavOperationNode,
  type NavWebhookNode,
  type ParameterEntry,
  type ResolvedOperation,
  type SecurityRequirement,
} from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { keyed } from 'lit/directives/keyed.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { externalDocsStyles, renderExternalDocs } from '../render/external-docs.js'
import { baseStyles, methodStyles } from '../styles/shared.js'
import './openish-callbacks.js'
import './openish-code-sample.js'
import './openish-markdown.js'
import './openish-try-it.js'
import './openish-parameters.js'
import './openish-request-body.js'
import './openish-response-list.js'

/**
 * One operation: what it is, what it takes, and what it answers with.
 *
 * The node carries a JSON pointer, but the operation is read by walking the proxied document, so a
 * referenced path item or parameter resolves on access instead of being expanded up front.
 *
 * Both halves of the page - parameters and responses - come from the same reads the HAR builder
 * makes, which is why the merge rule lives in `@openish/core`: a table that disagreed with the code
 * sample beside it would be worse than either alone.
 */
@customElement('openish-operation')
export class OpenishOperation extends LitElement {
  static override styles = [
    baseStyles,
    methodStyles,
    externalDocsStyles,
    css`
      :host {
        display: block;
        /*
         * A container query, not a media query.
         *
         * The question is how wide *this page* is, and that depends on whether the sidebar is
         * showing - which a media query on the viewport cannot see. The navigation switch upstairs
         * stays a media query because it changes the element tree; this only changes placement.
         */
        container-type: inline-size;
        container-name: operation;
      }

      /*
       * An explicit zero minimum on the track, rather than a bare 1fr.
       *
       * A grid track sizes to its content by default, and a wide child - a long code line, a table -
       * makes the track wider than the page and the whole reference scrolls sideways. The explicit
       * zero minimum lets the track shrink and hands the overflow back to the elements that already
       * know how to handle it: the table has its own scroller and the code block its own wrapping.
       */
      .panes {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0 var(--openish-space-xl);
      }

      .docs,
      .examples {
        min-width: 0;
      }

      .intro {
        grid-column: 1 / -1;
        /* Prose spanning both columns still wants one column's worth of measure. */
        max-width: var(--openish-content-max-width);
      }

      /* A pane starts at the top of its column, so the first section needs no gap above it. */
      .docs > section:first-child,
      .examples > section:first-child {
        margin-top: var(--openish-space-lg);
      }

      /*
       * Stacked, the worked example comes second - directly under the description and above the
       * parameter tables, which is where a reader copying a call looks first. Source order puts the
       * documentation first because that is the order it should be read in when the two are columns.
       */
      .examples {
        order: 1;
      }

      .docs {
        order: 2;
      }

      @container operation (min-width: 56rem) {
        .panes {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: start;
        }

        .docs,
        .examples {
          order: 0;
        }

        /*
         * Sticky inside the page's own scroller, so the sample stays beside whichever part of a long
         * schema the reader has scrolled to. The main element is what scrolls - see the height chain
         * the README insists on - and a host that breaks that chain gets a column that scrolls with
         * the page instead, which is what it did before this existed.
         */
        .examples {
          position: sticky;
          top: 0;
          max-height: 100vh;
          overflow-y: auto;
        }
      }

      .header {
        display: flex;
        align-items: center;
        gap: var(--openish-space-xs);
        flex-wrap: wrap;
        margin-bottom: var(--openish-space-sm);
      }

      .path {
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
        word-break: break-all;
      }

      h1 {
        font: var(--openish-font-heading-1);
        margin: 0 0 var(--openish-space-md);
      }

      h1.deprecated {
        text-decoration: line-through;
        color: var(--openish-color-text-muted);
      }

      h2 {
        font: var(--openish-font-heading-2);
        margin: 0 0 var(--openish-space-sm);
      }

      .badge {
        padding: 0 var(--openish-space-xs);
        border-radius: var(--openish-radius-pill);
        background: var(--openish-color-surface-muted);
        color: var(--openish-color-text-muted);
        font: var(--openish-font-micro);
      }

      .badge[data-tone='danger'] {
        background: var(--openish-color-danger-surface);
        color: var(--openish-color-danger);
      }

      .badge[data-tone='success'] {
        background: var(--openish-color-success-surface);
        color: var(--openish-color-success);
      }

      .badge[data-tone='info'] {
        background: var(--openish-color-info-surface);
        color: var(--openish-color-info);
      }

      section {
        margin-top: var(--openish-space-xl);
      }

      .operation-id {
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
      }

      .hint {
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
        margin: 0 0 var(--openish-space-2xs);
      }

      ul.requirement {
        list-style: none;
        margin: 0 0 var(--openish-space-sm);
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--openish-space-2xs);
      }

      ul.requirement > li {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--openish-space-2xs);
      }

      .scheme {
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text);
      }

      .kind {
        color: var(--openish-color-text-muted);
        font: var(--openish-font-small);
      }

      .undeclared {
        color: var(--openish-color-danger);
        font: var(--openish-font-small);
      }

      .scopes {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--openish-space-3xs);
      }

      .scopes code {
        padding: 0 var(--openish-space-2xs);
        border-radius: var(--openish-radius-pill);
        background: var(--openish-color-surface-muted);
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** The operation or webhook to render. */
  @property({ attribute: false })
  node!: NavOperationNode | NavWebhookNode

  /**
   * One way to satisfy the operation: every scheme in it applies together.
   *
   * A scheme the document requires but never declares is said out loud rather than skipped. Real
   * documents do this - the reference document in this repo does - and "required, not declared" is a
   * fact about the document the reader is better off knowing than not.
   */
  #renderRequirement(requirement: SecurityRequirement): TemplateResult {
    if (requirement.anonymous) {
      return html`<p class="hint">May be called without authentication.</p>`
    }

    return html`
      ${requirement.entries.length > 1 ? html`<p class="hint">All of these together.</p>` : nothing}
      <ul class="requirement">
        ${repeat(
          requirement.entries,
          (entry) => entry.name,
          (entry) => html`
            <li>
              <code class="scheme">${entry.name}</code>
              ${entry.scheme
                ? html`<span class="kind">${describeSecurityScheme(entry.scheme, { showUrl: true })}</span>`
                : html`<span class="undeclared">required, but this document never declares it</span>`}
              ${entry.scopes.length > 0
                ? html`
                    <span class="scopes">
                      ${repeat(
                        entry.scopes,
                        (scope) => scope,
                        (scope) => html`<code>${scope}</code>`,
                      )}
                    </span>
                  `
                : nothing}
            </li>
          `,
        )}
      </ul>
    `
  }

  /**
   * What the reader needs in order to call this.
   *
   * The store has always known this - `securityRequirements` is what the try-it panel picks an
   * alternative from - and the page has never said it. An operation inheriting the document's
   * `security` still shows it: "which credential does *this* call need" is a question asked per
   * operation, and answering it only on the overview means answering it somewhere the reader is not.
   */
  #renderSecurity(operation: ResolvedOperation['operation']): TemplateResult | typeof nothing {
    const requirements = securityRequirements(this.store?.document, operation)
    if (requirements.length === 0) {
      return nothing
    }

    return html`
      <section part="security-section">
        <h2>Authorization</h2>
        ${requirements.length > 1 ? html`<p class="hint">Any one of these is enough.</p>` : nothing}
        ${repeat(
          requirements,
          (_, index) => index,
          (requirement) => this.#renderRequirement(requirement),
        )}
      </section>
    `
  }

  override render(): TemplateResult | typeof nothing {
    const node = this.node
    if (!node) {
      return nothing
    }

    const resolved = resolveOperationNode(this.store?.document, node)
    const operation = resolved?.operation
    const deprecated = node.type === 'operation' && node.deprecated === true
    const parameters: ParameterEntry[] = collectParameters(resolved?.pathItem, operation)

    /* A webhook has no panel either, so this is not simply the negation of the config flag. */
    const tryIt = node.type === 'operation' && this.ui?.config.hideTryIt !== true

    /*
     * Two panes, side by side where there is room and stacked where there is not.
     *
     * The split is by *kind*, not by section: everything that describes the interface goes left, and
     * everything that is an instance of it goes right. That is why the request sample and the
     * response examples end up together - they are the two halves of one worked example, and a
     * reader copying a call wants them beside each other rather than a screen apart.
     *
     * Which arrangement is used is decided in CSS by a container query, because both panes are the
     * same DOM either way. Only their placement changes, so nothing here needs to know the width.
     */
    return html`
      <div class="panes">
        <div class="intro">
          <div class="header" part="operation-header">
            <span class="method" data-method=${node.method}>${node.method}</span>
            <code class="path">${node.type === 'webhook' ? node.name : node.path}</code>
            ${deprecated ? html`<span class="badge" data-tone="danger">Deprecated</span>` : nothing}
            ${repeat(
              operationBadges(operation, { deprecated }),
              (badge) => `${badge.tone}:${badge.label}`,
              (badge) => html`<span class="badge" data-tone=${badge.tone}>${badge.label}</span>`,
            )}
          </div>
          <h1 class=${classMap({ deprecated })}>${node.title}</h1>
          ${operation?.operationId
            ? html`<div class="operation-id">${operation.operationId}</div>`
            : nothing}
          ${operation?.description
            ? html`<openish-markdown .markdown=${operation.description} .headingOffset=${1}></openish-markdown>`
            : nothing}
          ${renderExternalDocs(operation?.externalDocs, `More about ${node.title}`)}
        </div>

        <div class="docs" part="operation-docs">
          ${this.#renderSecurity(operation)}
          ${parameters.length > 0
            ? html`
                <section part="parameters-section">
                  <h2>Parameters</h2>
                  <openish-parameters .parameters=${parameters}></openish-parameters>
                </section>
              `
            : nothing}
          ${operation?.requestBody
            ? html`
                <section part="body-section">
                  <h2>Request body</h2>
                  <openish-request-body
                    ?no-example=${tryIt}
                    .requestBody=${operation.requestBody}
                  ></openish-request-body>
                </section>
              `
            : nothing}
          ${operation?.responses
            ? html`
                <section part="response-section">
                  <h2>Responses</h2>
                  <slot name="response-start"></slot>
                  <openish-response-list no-example .responses=${operation.responses}></openish-response-list>
                  <slot name="response-end"></slot>
                </section>
              `
            : nothing}
          ${operation?.callbacks
            ? html`
                <section part="callbacks-section">
                  <h2>Callbacks</h2>
                  <openish-callbacks .callbacks=${operation.callbacks}></openish-callbacks>
                </section>
              `
            : nothing}
        </div>

        <div class="examples" part="operation-examples">
          ${node.type === 'operation'
            ? html`
                <section part="request-section">
                  <h2>Request</h2>
                  <slot name="request-start"></slot>
                  ${tryIt
                    ? /*
                       * Keyed on the operation, so moving to another one builds a new panel rather
                       * than handing the reader the last one with a new `node` on it. The panel holds
                       * what somebody typed and the answer they got back, and neither of those is true
                       * about a different operation - a response to GET /planets shown under
                       * GET /planets/{id} is not untidy, it is wrong.
                       */
                      keyed(`${node.method} ${node.path}`, html`<openish-try-it exportparts="dialog, dialog-bar, code, code-head, copy" .node=${node}></openish-try-it>`)
                    : html`<openish-code-sample exportparts="code, code-head, copy" .node=${node}></openish-code-sample>`}
                  <slot name="request-end"></slot>
                </section>
              `
            : nothing}
          ${operation?.responses
            ? html`
                <section part="examples-section">
                  <h2>Response examples</h2>
                  <openish-response-list examples-only .responses=${operation.responses}></openish-response-list>
                </section>
              `
            : nothing}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-operation': OpenishOperation
  }
}

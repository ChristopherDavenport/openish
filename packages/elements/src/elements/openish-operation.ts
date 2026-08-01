import { consume } from '@lit/context'
import {
  collectParameters,
  resolveOperationNode,
  type DocumentStore,
  type NavOperationNode,
  type NavWebhookNode,
  type ParameterEntry,
} from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'

import { documentContext } from '../context/contexts.js'
import { baseStyles, methodStyles } from '../styles/shared.js'
import './openish-code-sample.js'
import './openish-markdown.js'
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
    css`
      :host {
        display: block;
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
        background: var(--openish-color-danger-surface);
        color: var(--openish-color-danger);
        font: var(--openish-font-micro);
      }

      section {
        margin-top: var(--openish-space-xl);
      }

      .operation-id {
        font: var(--openish-font-micro);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** The operation or webhook to render. */
  @property({ attribute: false })
  node!: NavOperationNode | NavWebhookNode

  override render(): TemplateResult | typeof nothing {
    const node = this.node
    if (!node) {
      return nothing
    }

    const resolved = resolveOperationNode(this.store?.document, node)
    const operation = resolved?.operation
    const deprecated = node.type === 'operation' && node.deprecated === true
    const parameters: ParameterEntry[] = collectParameters(resolved?.pathItem, operation)

    return html`
      <div class="header">
        <span class="method" data-method=${node.method}>${node.method}</span>
        <code class="path">${node.type === 'webhook' ? node.name : node.path}</code>
        ${deprecated ? html`<span class="badge">Deprecated</span>` : nothing}
      </div>
      <h1 class=${classMap({ deprecated })}>${node.title}</h1>
      ${operation?.operationId
        ? html`<div class="operation-id">${operation.operationId}</div>`
        : nothing}
      ${operation?.description
        ? html`<openish-markdown .markdown=${operation.description} .headingOffset=${1}></openish-markdown>`
        : nothing}
      ${node.type === 'operation'
        ? html`
            <section>
              <h2>Request</h2>
              <openish-code-sample .node=${node}></openish-code-sample>
            </section>
          `
        : nothing}
      ${parameters.length > 0
        ? html`
            <section>
              <h2>Parameters</h2>
              <openish-parameters .parameters=${parameters}></openish-parameters>
            </section>
          `
        : nothing}
      ${operation?.requestBody
        ? html`
            <section>
              <h2>Request body</h2>
              <openish-request-body .requestBody=${operation.requestBody}></openish-request-body>
            </section>
          `
        : nothing}
      ${operation?.responses
        ? html`
            <section>
              <h2>Responses</h2>
              <openish-response-list .responses=${operation.responses}></openish-response-list>
            </section>
          `
        : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-operation': OpenishOperation
  }
}

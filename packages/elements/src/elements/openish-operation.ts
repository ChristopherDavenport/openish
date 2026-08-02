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
import { keyed } from 'lit/directives/keyed.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { externalDocsStyles, renderExternalDocs } from '../render/external-docs.js'
import { heading } from '../render/heading.js'
import { hasRenderableContent } from '../render/media-types.js'
import { baseStyles, planeColumnStyles, titleRowStyles } from '../styles/shared.js'
import './openish-callbacks.js'
import './openish-code-sample.js'
import './openish-disclosure.js'
import './openish-copy-markdown.js'
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
    externalDocsStyles,
    planeColumnStyles,
    titleRowStyles,
    css`
      /*
       * Two columns and two elements, in that order.
       *
       * The title and the description belong to the documentation, not to a band above it: they say
       * what this operation is, which is the same question the parameter tables under them answer in
       * more detail. They were a third element spanning both columns and then, briefly, a first grid
       * row of their own - both of which were the same mistake in different arrangements, because
       * either way the reader's eye had to cross the page to get from the title to the sample.
       *
       * One consequence worth stating: stacked, the whole left column comes before the whole right
       * one, with no ordering rules at all. What a reader gets on a narrow screen is the operation described
       * and then the operation demonstrated, which is the order the two were written in.
       */
      /*
       * Each column starts at the top of its row.
       *
       * A column has no padding or border of its own, so the top margin on whatever is first inside
       * it collapses out through it and moves the column itself - which put the examples a hundred
       * and forty pixels below the title they are supposed to start level with, from a rule about
       * the space between sections.
       */
      .docs > :first-child,
      .examples > :first-child {
        margin-top: 0;
      }

      /*
       * The examples column does not stick, and cannot.
       *
       * It used to: the sample stayed beside whichever part of a long schema the reader had scrolled
       * to. On the plane the virtualiser positions each section absolutely and moves it with a
       * transform, and sticky is resolved from *layout* position while the scroll offset is real -
       * so with the scroller seven thousand pixels down and the section's layout position at zero,
       * the browser concluded the element was far above the scrollport and clamped it to the bottom
       * of its containing block. The sample appeared seventeen hundred pixels below the title it
       * belonged to, which is worse than not sticking at all.
       *
       * This was spiked before the plane was built and the spike passed, because it scrolled three
       * hundred pixels and the divergence is proportional to the offset. The test that replaced it
       * says so.
       *
       * The loss is smaller than it sounds: a section is bounded now rather than being the whole
       * page, so the sample is beside its own documentation for the length of one operation.
       */
      @container section (min-width: 56rem) {
        .examples {
          grid-column: 2;
        }
      }

      .badges {
        display: flex;
        align-items: center;
        gap: var(--openish-space-xs);
        flex-wrap: wrap;
        margin-bottom: var(--openish-space-sm);
      }

      /*
       * Authorization, said once and quietly.
       *
       * It is a fact about the call rather than about the interface, so it belongs beside the call -
       * and it is one line nine times out of ten, which is not worth the weight of a section heading
       * and a list in the documentation column. The detail is still all there, behind the disclosure.
       */
      .authorization {
        margin-bottom: var(--openish-space-md);
        padding: var(--openish-space-2xs) var(--openish-space-sm);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-md);
        background: var(--openish-color-surface);
      }

      /*
       * Weight comes from the class, not from the tag.
       *
       * On the plane an operation's own heading is a level-three one under its tag rather than the
       * level-one it was when it had the page to itself, and it should look the same either way - the
       * level says where it sits in the document, not how loud it is.
       */
      .title {
        font: var(--openish-font-heading-1);
        margin: 0 0 var(--openish-space-md);
      }

      .title.deprecated {
        text-decoration: line-through;
        color: var(--openish-color-text-muted);
      }

      .section-title {
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
   * The heading level this section's own title takes.
   *
   * One when the operation is the page, which is what it was before the plane and what a host
   * embedding a single node still gets. On the plane it is however deep the document puts it, so a
   * tag's operations sit under the tag rather than beside it.
   */
  @property({ type: Number })
  level = 1

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

    /*
     * The first alternative on the line, and a count for the rest.
     *
     * Nine operations in ten want one credential and the answer is its name, which is the whole
     * point of putting it on the line: the common case needs no interaction at all. Joining every
     * alternative was the first cut and the galaxy document answered it - eight ways to authorize,
     * three lines of prose, and a summary longer than the thing it was summarising.
     */
    const describe = (requirement: SecurityRequirement): string =>
      requirement.anonymous ? 'none' : requirement.entries.map((entry) => entry.name).join(' and ')

    const [first, ...rest] = requirements
    const hint = rest.length === 0 ? describe(first!) : `${describe(first!)} + ${rest.length} more`

    return html`
      <div class="authorization" part="security-section">
        <openish-disclosure summary="Authorization" .hint=${hint}>
          ${requirements.length > 1 ? html`<p class="hint">Any one of these is enough.</p>` : nothing}
          ${repeat(
            requirements,
            (_, index) => index,
            (requirement) => this.#renderRequirement(requirement),
          )}
        </openish-disclosure>
      </div>
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
     * A webhook's payload is its example, and it belongs in the examples column.
     *
     * An operation's generated body is already over there, inside the request sample the reader can
     * copy. A webhook has no request to send, so the body used to render its example in place - which
     * left the one instance on the section sitting in the documentation column, with the column that
     * exists to hold instances empty beside it.
     */
    const payload: unknown =
      node.type === 'webhook' && hasRenderableContent(operation?.requestBody)
        ? operation?.requestBody
        : undefined

    /*
     * A heading in the examples column only when something is under it.
     *
     * `<openish-response-list examples-only>` drops the statuses with no body - a `204` is a complete
     * answer in the documentation column and an empty tab here - and an operation whose responses are
     * *all* like that left the heading standing over nothing. Which is most visible on a webhook,
     * where it was the only thing in the column.
     */
    const responseExamples = Object.values(operation?.responses ?? {}).some(hasRenderableContent)

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
    const badges = operationBadges(operation, { deprecated })

    return html`
      <div class="columns">
        <div class="docs" part="operation-docs">
          <div class="title-row" part="operation-header">
            ${heading(this.level, node.title, { title: true, deprecated })}
            <openish-copy-markdown exportparts="copy" .node=${node}></openish-copy-markdown>
          </div>
          ${deprecated || badges.length > 0
            ? html`
                <div class="badges">
                  ${deprecated ? html`<span class="badge" data-tone="danger">Deprecated</span>` : nothing}
                  ${repeat(
                    badges,
                    (badge) => `${badge.tone}:${badge.label}`,
                    (badge) => html`<span class="badge" data-tone=${badge.tone}>${badge.label}</span>`,
                  )}
                </div>
              `
            : nothing}
          ${operation?.operationId
            ? html`<div class="operation-id">${operation.operationId}</div>`
            : nothing}
          ${operation?.description
            ? html`<openish-markdown .markdown=${operation.description} .headingOffset=${this.level}></openish-markdown>`
            : nothing}
          ${renderExternalDocs(operation?.externalDocs, `More about ${node.title}`)}
          ${parameters.length > 0
            ? html`
                <section part="parameters-section">
                  ${heading(this.level + 1, 'Parameters', { 'section-title': true })}
                  <openish-parameters .parameters=${parameters}></openish-parameters>
                </section>
              `
            : nothing}
          ${operation?.requestBody
            ? html`
                <section part="body-section">
                  ${heading(this.level + 1, 'Request body', { 'section-title': true })}
                  <openish-request-body
                    ?no-example=${tryIt || payload !== undefined}
                    .requestBody=${operation.requestBody}
                  ></openish-request-body>
                </section>
              `
            : nothing}
          ${operation?.responses
            ? html`
                <section part="response-section">
                  ${heading(this.level + 1, 'Responses', { 'section-title': true })}
                  <slot name="response-start"></slot>
                  <openish-response-list no-example .responses=${operation.responses}></openish-response-list>
                  <slot name="response-end"></slot>
                </section>
              `
            : nothing}
          ${operation?.callbacks
            ? html`
                <section part="callbacks-section">
                  ${heading(this.level + 1, 'Callbacks', { 'section-title': true })}
                  <openish-callbacks .callbacks=${operation.callbacks}></openish-callbacks>
                </section>
              `
            : nothing}
        </div>

        <div class="examples" part="operation-examples">
          ${this.#renderSecurity(operation)}
          ${node.type === 'operation'
            ? html`
                <section part="request-section">
                  ${heading(this.level + 1, 'Request', { 'section-title': true })}
                  <slot name="request-start"></slot>
                  ${tryIt
                    ? /*
                       * Keyed on the operation, so moving to another one builds a new panel rather
                       * than handing the reader the last one with a new `node` on it. The panel holds
                       * what somebody typed and the answer they got back, and neither of those is true
                       * about a different operation - a response to GET /planets shown under
                       * GET /planets/{id} is not untidy, it is wrong.
                       */
                      keyed(`${node.method} ${node.path}`, html`<openish-try-it exportparts="dialog, dialog-toolbar, code, code-toolbar, copy" .node=${node}></openish-try-it>`)
                    : html`<openish-code-sample exportparts="code, code-toolbar, copy" .node=${node}></openish-code-sample>`}
                  <slot name="request-end"></slot>
                </section>
              `
            : nothing}
          ${payload !== undefined
            ? html`
                <section part="payload-section">
                  ${heading(this.level + 1, 'Payload', { 'section-title': true })}
                  <openish-request-body examples-only .requestBody=${payload}></openish-request-body>
                </section>
              `
            : nothing}
          ${responseExamples
            ? html`
                <section part="examples-section">
                  ${heading(this.level + 1, 'Response examples', { 'section-title': true })}
                  <openish-response-list examples-only .responses=${operation?.responses}></openish-response-list>
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

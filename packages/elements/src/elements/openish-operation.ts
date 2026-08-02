import { consume } from '@lit/context'
import {
  collectParameters,
  describeSecurityScheme,
  operationBadges,
  resolveOperationNode,
  securityRequirements,
  variantKey,
  type DocumentStore,
  type NavOperationNode,
  type NavWebhookNode,
  type ParameterEntry,
  type ResolvedOperation,
  type SecurityRequirement,
} from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { keyed } from 'lit/directives/keyed.js'
import { repeat } from 'lit/directives/repeat.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { externalDocsStyles, renderExternalDocs } from '../render/external-docs.js'
import { heading } from '../render/heading.js'
import { hasRenderableContent } from '../render/media-types.js'
import { shownResponseMediaType } from '../render/responses.js'
import { baseStyles, methodStyles, planeColumnStyles, titleRowStyles } from '../styles/shared.js'
import './openish-callbacks.js'
import './openish-code-sample.js'
import './openish-disclosure.js'
import './openish-copy-markdown.js'
import './openish-markdown.js'
import './openish-try-it.js'
import './openish-parameters.js'
import './openish-request-body.js'
import './openish-response-list.js'
import type { OpenishVariantChange } from './openish-schema.js'

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
    methodStyles,
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
       * Stacked, the examples column needs the space its headings used to bring.
       *
       * The grid has a column gap and no row gap, so below the container query's threshold the
       * examples column begins immediately under the last section of the documentation - which was
       * survivable while a heading opened it and is a code block butting against a table now.
       *
       * On the column rather than on its first child, because a column has no padding or border for
       * a top margin to stop at: put it inside and it collapses back out through the column, which
       * is the fault recorded above.
       */
      .examples {
        margin-top: var(--openish-space-xl);
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
          /* Beside the documentation rather than after it, so the sample starts level with the title. */
          margin-top: 0;
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

      /*
       * Which call this is, under the name of it.
       *
       * It was the title of the code sample, which reads well until the two columns are side by side:
       * the reader is on the left with the name and the description, and the one line saying *what
       * gets called* was over on the right, level with the sample rather than with the prose it
       * belongs to. The sample is titled by the client it is written in now, which is the other thing
       * a reader wants to know about a block of code.
       *
       * Spaced on the section's own rhythm rather than tucked under the title, which is not only a
       * matter of taste: section heights feed the virtualiser's estimate for the sections it has not
       * measured, and a document of three hundred short models multiplies a dozen pixels here into
       * ten thousand across the scrollbar. The plane test that walks a hundred thousand pixels back
       * up the document is the one that says so.
       */
      .target {
        display: flex;
        align-items: center;
        gap: var(--openish-space-2xs);
        min-width: 0;
        margin: 0 0 var(--openish-space-md);
      }

      .path {
        font: var(--openish-font-code-small);
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
   * Which media type this operation's request is being shown in.
   *
   * Held here because two controls ask the question - the request body's tab set and the try-it
   * panel's picker - and the answer decides a third thing neither of them owns: what the code sample
   * is a sample of. With the choice inside the tab set, picking `application/xml` moved the schema
   * on the left and left a JSON body under a `Content-Type: application/xml` on the right.
   *
   * Empty until the reader picks, which leaves every consumer on the document's first media type -
   * the behaviour of a page nobody has touched, and the one the sample already assumed.
   */
  @state()
  private requestMediaType = ''

  /**
   * Which response the reader is on, and in which media type.
   *
   * Held for the same reason as the request's: the documentation column and the examples column each
   * showed the status, and moving one left the other behind - a schema for the `200` beside an
   * example of the `404`. The examples column now offers nothing but the status, and that status is
   * this one.
   */
  @state()
  private responseStatus = ''

  @state()
  private responseMediaType = ''

  /**
   * The `oneOf`/`anyOf` branches the reader picked, across every tree in the section.
   *
   * Keyed by shape and path - see `variant-path.ts` - because an operation has several schemas on
   * screen at once and a choice in one says nothing about the others. The trees are in the
   * documentation column and the examples they change are in the other one, so the choice has to
   * live somewhere that can see both, and this is the only element that does.
   */
  @state()
  private variants: ReadonlyMap<string, number> = new Map()

  /**
   * Either control reporting the reader's choice. A bound field: a new arrow function every render
   * would make the binding change identity on every update for no change in behaviour.
   */
  readonly #onMediaType = (event: CustomEvent<string>): void => {
    this.requestMediaType = event.detail
  }

  readonly #onResponseMediaType = (event: CustomEvent<string>): void => {
    this.responseMediaType = event.detail
  }

  /**
   * The media type the examples column is showing an answer in, for the sample to ask for.
   *
   * Derived rather than stored, and derived by the same rules the response list renders by, so the
   * `Accept` in the sample names the response the reader is actually looking at - including before
   * they have touched anything, when both are on the first status the operation answers with.
   */
  #accept(operation: ResolvedOperation['operation'] | undefined): string {
    return shownResponseMediaType(operation?.responses, this.responseStatus, this.responseMediaType) ?? ''
  }

  readonly #onStatus = (event: CustomEvent<string>): void => {
    this.responseStatus = event.detail
  }

  /** A new map rather than a mutation: `@state` compares by identity, and a mutated Map is the same. */
  readonly #onVariant = (event: CustomEvent<OpenishVariantChange>): void => {
    const { scope, path, index } = event.detail
    const next = new Map(this.variants)
    next.set(variantKey(scope, path), index)
    this.variants = next
  }

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
     * A region in the examples column only when something is under it.
     *
     * `<openish-response-list examples-only>` drops the statuses with no body - a `204` is a complete
     * answer in the documentation column and an empty tab here - and an operation whose responses are
     * *all* like that left an empty named region standing over nothing. Which is most visible on a
     * webhook, where it was the only thing in the column.
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
     *
     * The right-hand pane is named rather than titled. Its blocks used to carry headings - "Request"
     * over a sample already headed by the client it is written in, "Response examples" over a row of
     * status tabs - and the column is itself the answer to what kind of thing is in it, which is why
     * the aside a tag or the overview fills the same column with has never written one either.
     *
     * The names survive as `aria-label`s, because the boundary a sighted reader gets from the column
     * is one a screen reader only had from the heading list. Each carries the operation's title,
     * because a named `<section>` is a landmark and a plane holding forty operations at once would
     * otherwise offer forty landmarks all called "Request" - which axe's `landmark-unique` says,
     * correctly, is a list nobody can navigate by.
     */
    const badges = operationBadges(operation, { deprecated })

    return html`
      <div class="columns">
        <div class="docs" part="operation-docs">
          <div class="title-row" part="operation-header">
            ${heading(this.level, node.title, { title: true, deprecated })}
            <openish-copy-markdown exportparts="copy" .node=${node}></openish-copy-markdown>
          </div>
          <div class="target" part="operation-target">
            <span class="method" data-method=${node.method}>${node.method}</span>
            <code class="path">${node.type === 'webhook' ? node.name : node.path}</code>
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
                    media-type=${this.requestMediaType}
                    .requestBody=${operation.requestBody}
                    .variants=${this.variants}
                    @openish-media-type-change=${this.#onMediaType}
                    @openish-variant-change=${this.#onVariant}
                  ></openish-request-body>
                </section>
              `
            : nothing}
          ${operation?.responses
            ? html`
                <section part="response-section">
                  ${heading(this.level + 1, 'Responses', { 'section-title': true })}
                  <slot name="response-start"></slot>
                  <openish-response-list
                    no-example
                    status=${this.responseStatus}
                    media-type=${this.responseMediaType}
                    .responses=${operation.responses}
                    .variants=${this.variants}
                    @openish-status-change=${this.#onStatus}
                    @openish-media-type-change=${this.#onResponseMediaType}
                    @openish-variant-change=${this.#onVariant}
                  ></openish-response-list>
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
                <section part="request-section" aria-label=${`${node.title} request`}>
                  <slot name="request-start"></slot>
                  ${tryIt
                    ? /*
                       * Keyed on the operation, so moving to another one builds a new panel rather
                       * than handing the reader the last one with a new `node` on it. The panel holds
                       * what somebody typed and the answer they got back, and neither of those is true
                       * about a different operation - a response to GET /planets shown under
                       * GET /planets/{id} is not untidy, it is wrong.
                       */
                      keyed(
                        `${node.method} ${node.path}`,
                        html`<openish-try-it
                          exportparts="dialog, dialog-toolbar, code, code-toolbar, copy"
                          media-type=${this.requestMediaType}
                          accept=${this.#accept(operation)}
                          .node=${node}
                          .variants=${this.variants}
                          @openish-media-type-change=${this.#onMediaType}
                        ></openish-try-it>`,
                      )
                    : html`<openish-code-sample
                        exportparts="code, code-toolbar, copy"
                        media-type=${this.requestMediaType}
                        accept=${this.#accept(operation)}
                        .node=${node}
                        .variants=${this.variants}
                      ></openish-code-sample>`}
                  <slot name="request-end"></slot>
                </section>
              `
            : nothing}
          ${payload !== undefined
            ? html`
                <section part="payload-section" aria-label=${`${node.title} payload`}>
                  <openish-request-body
                    examples-only
                    media-type=${this.requestMediaType}
                    .requestBody=${payload}
                    .variants=${this.variants}
                  ></openish-request-body>
                </section>
              `
            : nothing}
          ${responseExamples
            ? html`
                <section part="examples-section" aria-label=${`${node.title} response examples`}>
                  <openish-response-list
                    examples-only
                    status=${this.responseStatus}
                    media-type=${this.responseMediaType}
                    .responses=${operation?.responses}
                    .variants=${this.variants}
                    @openish-status-change=${this.#onStatus}
                  ></openish-response-list>
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

import { consume, provide } from '@lit/context'
import type { DocumentStore } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'

import {
  documentContext,
  schemaContext,
  uiContext,
  type OpenishSchemaState,
  type OpenishUiState,
} from '../context/contexts.js'
import { hrefFor } from '../router/urls.js'
import {
  asSchema,
  hasBody,
  refName,
  refPointer,
  schemaConstraints,
  schemaProperties,
  schemaTypeLabel,
  schemaVariants,
  unwrapArray,
  type SchemaProperty,
  type SchemaVariants,
} from '../schema/summary.js'
import { baseStyles } from '../styles/shared.js'
import type { OpenishTab } from './openish-tabs.js'
import './openish-disclosure.js'
import './openish-markdown.js'
import './openish-tabs.js'

/**
 * The backstop, for nesting that is deep but finite. Cycles are caught by `seenRefs` long before
 * this, and a document that reaches it is one no reader was going to scroll through anyway.
 */
const MAX_DEPTH = 12

const EMPTY_STATE: OpenishSchemaState = { depth: 0, seenRefs: new Set(), expandAll: false }

/**
 * Whether a re-derived traversal state actually says anything new.
 *
 * `willUpdate` rebuilds this value on every update, and without a comparison every render of one
 * schema would notify every schema below it - a re-render of the whole subtree for a value that has
 * not changed. `hasChanged` is Lit's hook for exactly this: same contents, no notification.
 */
const sameState = (left: OpenishSchemaState, right: OpenishSchemaState | undefined): boolean =>
  right !== undefined &&
  left.depth === right.depth &&
  left.expandAll === right.expandAll &&
  left.seenRefs.size === right.seenRefs.size &&
  [...left.seenRefs].every((ref) => right.seenRefs.has(ref))

/**
 * A schema, rendered as a property tree that expands a level at a time.
 *
 * The element renders one schema and calls itself for every schema inside it - properties, `oneOf`
 * branches, array items. What keeps that from running forever is `schemaContext`, which this
 * element consumes and then **re-provides** with its own `$ref` added to the path: a branch that
 * arrives at a pointer already on that path renders a link to the model instead of expanding it.
 *
 * Tracking pointers rather than objects is not a detail. The document is a magic proxy, so
 * resolving the same `$ref` twice yields two different wrappers - a `Set<object>` of visited
 * schemas never matches, and the renderer would run to its depth cap on every ordinary tree-shaped
 * document. See `schemaExample` in `@openish/core`, which solved the same problem first.
 *
 * A closed disclosure renders **nothing** inside it. That is what makes a 600-model document cheap:
 * an unopened branch costs no elements, and the tree grows only where the reader looks.
 */
@customElement('openish-schema')
export class OpenishSchema extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: block;
      }

      .type {
        font: var(--openish-font-code-small);
        color: var(--openish-color-text-muted);
      }

      .constraints {
        margin-top: var(--openish-space-3xs);
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      .recursive {
        margin: var(--openish-space-2xs) 0 0;
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li {
        padding: var(--openish-space-xs) 0;
        border-top: 1px solid var(--openish-color-border);
      }

      li:first-child {
        border-top: 0;
      }

      .head {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: var(--openish-space-xs);
      }

      .name {
        font: var(--openish-font-body-bold);
        font-family: var(--openish-font-family-mono);
      }

      .name.deprecated {
        text-decoration: line-through;
        color: var(--openish-color-text-muted);
      }

      .required {
        color: var(--openish-color-danger);
        font: var(--openish-font-micro);
      }

      .optional,
      .flag {
        color: var(--openish-color-text-muted);
        font: var(--openish-font-micro);
      }

      .variants-label {
        margin-bottom: var(--openish-space-2xs);
        font: var(--openish-font-micro);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--openish-color-text-muted);
      }

      openish-markdown {
        font: var(--openish-font-small);
      }

      /* The nested schema of a property sits under its name, indented by the border. */
      li > openish-schema {
        margin-left: var(--openish-space-sm);
        padding-left: var(--openish-space-sm);
        border-left: 1px solid var(--openish-color-border);
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
   * The state an ancestor `<openish-schema>` left, or `undefined` at the top of a tree.
   *
   * Consuming and providing one context on one element is supported: `ContextProvider` compares the
   * request's target with its own host and refuses to answer itself.
   */
  @consume({ context: schemaContext, subscribe: true })
  inherited: OpenishSchemaState | undefined

  /**
   * What every schema rendered below this one sees: one level deeper, with this one's `$ref` added
   * to the path. Public because it is the element's half of the recursion contract, and readable in
   * a test without reaching through a shadow root.
   */
  @provide({ context: schemaContext })
  @state({ hasChanged: (value: OpenishSchemaState, old: OpenishSchemaState | undefined) => !sameState(value, old) })
  provided: OpenishSchemaState = EMPTY_STATE

  /** The schema to render. May be a `$ref`; it resolves on access through the proxy. */
  @property({ attribute: false })
  schema: unknown = undefined

  /**
   * The JSON pointer this schema was reached by, when it is not itself a `$ref`.
   *
   * A model page hands `<openish-schema>` the schema out of `components.schemas` directly, so there
   * is no `$ref` to learn its identity from - and without one, `Node.parent` would expand `Node` a
   * second time before the cycle guard noticed. `NavModelNode` already carries the pointer, so the
   * page passes it and the traversal starts where the reader is.
   */
  @property({ type: String })
  pointer = ''

  /** Skip the type line, for a caller that has already printed it - a property row does. */
  @property({ type: Boolean, attribute: 'hide-header' })
  hideHeader = false

  /**
   * Show the property list without a disclosure, whatever the depth.
   *
   * A `oneOf` variant panel sets this: the tab the reader just pressed *is* the expansion, and
   * putting a second control inside it to reveal what the tab promised would be absurd.
   */
  @property({ type: Boolean, attribute: 'inline-properties' })
  inlineProperties = false

  /** `undefined` until the reader takes control; `expandAll` decides until then. */
  @state()
  private openedByUser: boolean | undefined = undefined

  /** The state this element was rendered under, with `expandAll` filled in from config. */
  get #state(): OpenishSchemaState {
    return this.inherited ?? { ...EMPTY_STATE, expandAll: this.ui?.config.expandAllSchemaProperties ?? false }
  }

  get #open(): boolean {
    return this.openedByUser ?? this.#state.expandAll
  }

  /** The pointer this schema is known by: its own `$ref`, or the one the caller supplied. */
  get #ref(): string | undefined {
    const { schema: target } = unwrapArray(this.schema)
    return refPointer(target) ?? (this.pointer === '' ? undefined : this.pointer)
  }

  /**
   * Re-derives what this schema hands to the ones inside it.
   *
   * The only derived value in this element that is not a getter, for the one reason that justifies
   * it: a context provider *pushes*, so a provided value has to be assigned somewhere in the update,
   * and an assignment in `willUpdate` joins the update already in flight. Everything else here - the
   * cycle check, the type label, the property list - is computed in `render()` from this element's
   * own fields, because nothing outside it needs those to exist between renders.
   *
   * No `changedProperties` check either: the value is cheap to build, and `hasChanged` above decides
   * whether it is worth telling anyone about - a comparison of the value rather than a guess at
   * which inputs it depends on.
   */
  protected override willUpdate(): void {
    const state = this.#state
    const ref = this.#ref

    this.provided = {
      depth: state.depth + 1,
      seenRefs: ref === undefined ? state.seenRefs : new Set(state.seenRefs).add(ref),
      expandAll: state.expandAll,
    }
  }

  /** The route to a model, when a `$ref` names one this document has a page for. */
  #modelLink(target: unknown): TemplateResult | typeof nothing {
    const name = refName(target)
    if (!name) {
      return nothing
    }

    const node = this.store?.bySlug.get(`models/${name}`)
    if (!node) {
      return html`<code>${name}</code>`
    }

    return html`<a href=${hrefFor(node, this.ui?.basePath ?? '')}>${name}</a>`
  }

  #renderFlags(value: unknown): TemplateResult | typeof nothing {
    const schema = asSchema(value)
    const flags = [
      schema?.['readOnly'] === true ? 'read-only' : undefined,
      schema?.['writeOnly'] === true ? 'write-only' : undefined,
      schema?.['deprecated'] === true ? 'deprecated' : undefined,
    ].filter((flag): flag is string => flag !== undefined)

    return flags.length > 0 ? html`<span class="flag">${flags.join(' · ')}</span>` : nothing
  }

  /**
   * One property: its name and shape on a line, its own schema underneath.
   *
   * The nested `<openish-schema>` is what carries the description, the constraints, and the next
   * level down - so a property row has no idea how deep the thing it names goes.
   */
  #renderProperty(property: SchemaProperty): TemplateResult {
    return html`
      <li>
        <div class="head">
          <code class=${classMap({ name: true, deprecated: property.deprecated })}>${property.name}</code>
          <span class="type">${schemaTypeLabel(property.schema)}</span>
          ${property.required
            ? html`<span class="required">required</span>`
            : html`<span class="optional">optional</span>`}
          ${this.#renderFlags(property.schema)}
        </div>
        ${hasBody(property.schema)
          ? html`<openish-schema .schema=${property.schema} hide-header></openish-schema>`
          : nothing}
      </li>
    `
  }

  /** A map-shaped schema: no named properties, one rule for every key. */
  #renderAdditional(additional: unknown): TemplateResult {
    return html`
      <li>
        <div class="head">
          <code class="name">[key: string]</code>
          <span class="type">${schemaTypeLabel(additional)}</span>
          <span class="flag">any other property</span>
        </div>
        ${hasBody(additional) ? html`<openish-schema .schema=${additional} hide-header></openish-schema>` : nothing}
      </li>
    `
  }

  #renderVariants(variants: SchemaVariants): TemplateResult {
    const label = (branch: unknown, index: number): string => {
      const mapped = variants.mapping?.get(refPointer(branch) ?? '')
      const title = asSchema(branch)?.['title']
      return mapped ?? refName(branch) ?? (typeof title === 'string' ? title : `Option ${index + 1}`)
    }

    const tabs: OpenishTab[] = variants.branches.map((branch, index) => ({
      id: `${index}`,
      label: label(branch, index),
      content: () => html`<openish-schema .schema=${branch} inline-properties></openish-schema>`,
    }))

    return html`
      <div class="variants-label">
        ${variants.keyword === 'oneOf' ? 'One of' : 'Any of'}
        ${variants.discriminator ? html`— by <code>${variants.discriminator}</code>` : nothing}
      </div>
      <openish-tabs label=${`${variants.keyword} variants`} .tabs=${tabs}></openish-tabs>
    `
  }

  /**
   * The property list, inline at the top of a tree and behind a disclosure below it.
   *
   * Nothing is rendered into a closed disclosure, so the recursion stops at every branch the reader
   * has not opened. That is the whole reason `<openish-disclosure>` reports its state upward.
   */
  #renderProperties(target: unknown, isArray: boolean): TemplateResult | typeof nothing {
    const properties = schemaProperties(target)
    const resolved = asSchema(target)
    const additional = resolved?.['additionalProperties']
    const hasAdditional = typeof additional === 'object' && additional !== null && !Array.isArray(additional)

    if (properties.length === 0 && !hasAdditional) {
      return nothing
    }

    const list = html`
      <ul>
        ${repeat(
          properties,
          (property) => property.name,
          (property) => this.#renderProperty(property),
        )}
        ${hasAdditional ? this.#renderAdditional(additional) : nothing}
      </ul>
    `

    if (this.#state.depth === 0 || this.inlineProperties) {
      return list
    }

    const count = properties.length + (hasAdditional ? 1 : 0)
    return html`
      <openish-disclosure
        summary=${isArray ? 'Item properties' : 'Properties'}
        hint=${`${count}`}
        .open=${this.#open}
        @openish-toggle=${(event: CustomEvent<boolean>) => {
          this.openedByUser = event.detail
        }}
      >
        ${this.#open ? list : nothing}
      </openish-disclosure>
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (this.schema === undefined) {
      return nothing
    }

    const state = this.#state
    const { schema: target, isArray } = unwrapArray(this.schema)
    const resolved = asSchema(target)
    const ref = this.#ref

    const header = this.hideHeader
      ? nothing
      : html`<div class="type">${schemaTypeLabel(this.schema)}</div>`

    /*
     * A repeat of a pointer already on the path is where a tree becomes a graph. Linking to the
     * model page is strictly better than truncating: the reader gets the rest of the shape, on a
     * page that has room for it, instead of an ellipsis.
     */
    if (ref !== undefined && state.seenRefs.has(ref)) {
      return html`
        ${header}
        <p class="recursive">Recursive — see ${this.#modelLink(target)}.</p>
      `
    }

    if (state.depth >= MAX_DEPTH) {
      return html`
        ${header}
        <p class="recursive">Nested too deeply to show here${refName(target) ? html` — see ${this.#modelLink(target)}` : nothing}.</p>
      `
    }

    const description = resolved?.['description']
    const constraints = schemaConstraints(target)
    const not = resolved?.['not']
    const variants = schemaVariants(target)

    return html`
      ${header}
      ${typeof description === 'string' && description.trim() !== ''
        ? html`<openish-markdown .markdown=${description} .headingOffset=${4}></openish-markdown>`
        : nothing}
      ${constraints.length > 0 ? html`<div class="constraints">${constraints.join(' · ')}</div>` : nothing}
      ${not !== undefined
        ? html`<div class="constraints">not ${schemaTypeLabel(not) || 'the schema below'}</div>`
        : nothing}
      ${variants ? this.#renderVariants(variants) : this.#renderProperties(target, isArray)}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-schema': OpenishSchema
  }
}

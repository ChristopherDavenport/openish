import { consume, provide } from '@lit/context'
import {
  joinId,
  resolveLocalPointer,
  VARIANT_PATH_ROOT,
  variantAdditional,
  variantAside,
  variantBranch,
  variantProperty,
  type DocumentStore,
} from '@openish/core'
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
import { externalDocsStyles, renderExternalDocs } from '../render/external-docs.js'
import { hrefFor } from '../router/urls.js'
import {
  asSchema,
  hasBody,
  refName,
  refPointer,
  additionalPropertiesName,
  collectDynamicAnchors,
  dynamicRefName,
  ENUM_INLINE_LIMIT,
  enumDescriptions,
  enumValues,
  isUnboundAnchor,
  modelNameFromPointer,
  orderProperties,
  schemaConditional,
  schemaConstraints,
  schemaDependentSchemas,
  schemaPatternProperties,
  schemaPrefixItems,
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

const EMPTY_STATE: OpenishSchemaState = { depth: 0, seenRefs: new Set(), expandAll: false, anchors: new Map() }

/** Which `oneOf`/`anyOf` a reader answered, and how. See `variant-path.ts` for the addressing. */
export type OpenishVariantChange = { scope: string; path: string; index: number }

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
  [...left.seenRefs].every((ref) => right.seenRefs.has(ref)) &&
  /*
   * Anchors compare by *name*, never by the schema behind one.
   *
   * The document is a magic proxy, so reading the same `$defs` entry twice can hand back two
   * different wrappers - an identity comparison here would report "changed" on every update and put
   * the element in a re-render loop. This is the same trap the cycle guard avoids by tracking
   * pointers, from the other end. Names are enough: a comparison is only ever between two successive
   * updates of one element, and that element's scope does not silently rebind a name it already had.
   */
  left.anchors.size === right.anchors.size &&
  [...left.anchors.keys()].every((name) => right.anchors.has(name))

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
    externalDocsStyles,
    css`
      :host {
        display: block;
      }

      .type {
        font: var(--openish-font-code-small);
        color: var(--openish-color-text-muted);
      }

      dl.enum {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: var(--openish-space-3xs) var(--openish-space-xs);
        margin: var(--openish-space-2xs) 0 0;
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }

      dl.enum dt {
        font-family: var(--openish-font-family-mono);
        color: var(--openish-color-text);
      }

      dl.enum dd {
        margin: 0;
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

      .rule {
        margin-top: var(--openish-space-sm);
        padding-left: var(--openish-space-sm);
        border-left: 1px solid var(--openish-color-border);
      }

      .rule-label {
        margin-bottom: var(--openish-space-3xs);
        font: var(--openish-font-micro);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--openish-color-text-muted);
      }

      .rule-label code {
        font-family: var(--openish-font-family-mono);
        text-transform: none;
        letter-spacing: normal;
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

  /**
   * Which shape on the page this tree describes - `request`, or `response:404`.
   *
   * Set by whatever put the tree on the page, and passed down every nesting unchanged. Empty is a
   * tree nobody is listening to, which is what a model page is: the variant tabs still work, they
   * just have no example on the other side of the section to move.
   */
  @property({ type: String })
  scope = ''

  /**
   * Where this tree sits inside the shape named by `scope`, in `variant-path.ts`'s spelling.
   *
   * The root is empty and every nesting extends it. It exists so a `oneOf` deep in a tree can say
   * *which* `oneOf` the reader answered, in terms the example generator resolves independently -
   * neither side holds the other's state, and `core` owns the spelling so they cannot drift.
   */
  @property({ type: String })
  path = VARIANT_PATH_ROOT

  /** `undefined` until the reader takes control; `expandAll` decides until then. */
  @state()
  private openedByUser: boolean | undefined = undefined

  /**
   * Whether the full list of a long enum is showing.
   *
   * Its own flag rather than sharing `openedByUser`: the values of an enum and the properties of an
   * object are two different questions, and `expandAllSchemaProperties` is about the second one.
   */
  @state()
  private enumOpen = false

  /** The state this element was rendered under, with `expandAll` filled in from config. */
  get #state(): OpenishSchemaState {
    return this.inherited ?? { ...EMPTY_STATE, expandAll: this.ui?.config.expandAllSchemaProperties ?? false }
  }

  get #open(): boolean {
    return this.openedByUser ?? this.#state.expandAll
  }

  /**
   * Resolves a pointer against the proxied document.
   *
   * Only `discriminator.mapping` needs this, and it needs it because the mapping holds pointer
   * *strings*: a `$ref` object built here would never resolve, since the magic proxy is what makes
   * `$ref` readable and a hand-built object has never been through it.
   */
  get #resolvePointer(): (pointer: string) => unknown {
    return (pointer) => resolveLocalPointer(this.store?.document, pointer)
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

    /*
     * Anchors this schema brings into scope, with the outermost binding winning.
     *
     * That is the JSON Schema rule and it is the whole point: `PaginatedResource` declares
     * `itemType` as an unbound placeholder, and a `PaginatedPlanets` above it binds the same name to
     * `Planet`. Adding only names that are *not* already in scope keeps the outer one.
     */
    const declared = collectDynamicAnchors(unwrapArray(this.schema).schema)
    let anchors = state.anchors
    if (declared.size > 0) {
      const merged = new Map(state.anchors)
      for (const [name, schema] of declared) {
        if (!merged.has(name)) {
          merged.set(name, schema)
        }
      }
      anchors = merged
    }

    this.provided = {
      depth: state.depth + 1,
      seenRefs: ref === undefined ? state.seenRefs : new Set(state.seenRefs).add(ref),
      expandAll: state.expandAll,
      anchors,
    }
  }

  /** The route to a model, when a `$ref` names one this document has a page for. */
  #modelLink(target: unknown): TemplateResult | typeof nothing {
    const name = refName(target)
    if (!name) {
      return nothing
    }

    /* Ids are namespaced by the document they belong to, so the models section is under its slug. */
    const node = this.store && this.store.bySlug.get(joinId(this.store.source.slug, 'models', name))
    if (!node) {
      return html`<code>${name}</code>`
    }

    return html`<a href=${hrefFor(node, this.ui)}>${name}</a>`
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
          ? html`<openish-schema
              .schema=${property.schema}
              scope=${this.scope}
              path=${variantProperty(this.path, property.name)}
              hide-header
            ></openish-schema>`
          : nothing}
      </li>
    `
  }

  /**
   * The enum, in full, with what each value means where the document says.
   *
   * The constraint line above caps itself at {@link ENUM_INLINE_LIMIT} values, so this is where a
   * long enum is actually readable - and it is behind a disclosure for exactly the enums that needed
   * capping, because a hundred currency codes is a page, not an annotation. A short enum is already
   * on the constraint line and only appears here if the values have descriptions to add.
   */
  #renderEnumValues(target: unknown): TemplateResult | typeof nothing {
    const described = enumDescriptions(target)
    const values = enumValues(target)
    const overflows = values.length > ENUM_INLINE_LIMIT

    if (described.size === 0 && !overflows) {
      return nothing
    }

    /* Every value when there are too many to have been listed above; otherwise just the described. */
    const rows: Array<[string, string | undefined]> = overflows
      ? values.map((value) => [value, described.get(value)])
      : [...described].map(([value, text]) => [value, text])

    const list = html`
      <dl class="enum">
        ${repeat(
          rows,
          ([value]) => value,
          ([value, text]) => html`<dt><code>${value}</code></dt>
            <dd>${text ?? nothing}</dd>`,
        )}
      </dl>
    `

    if (!overflows) {
      return list
    }

    return html`
      <openish-disclosure
        summary="Values"
        hint=${`${values.length}`}
        .open=${this.enumOpen}
        @openish-toggle=${(event: CustomEvent<boolean>) => {
          this.enumOpen = event.detail
        }}
      >
        ${this.enumOpen ? list : nothing}
      </openish-disclosure>
    `
  }

  /** A map-shaped schema: no named properties, one rule for every key. */
  #renderAdditional(additional: unknown, parent: unknown): TemplateResult {
    return html`
      <li>
        <div class="head">
          <code class="name">[${additionalPropertiesName(parent)}: string]</code>
          <span class="type">${schemaTypeLabel(additional)}</span>
          <span class="flag">any other property</span>
        </div>
        ${hasBody(additional)
          ? html`<openish-schema
              .schema=${additional}
              scope=${this.scope}
              path=${variantAdditional(this.path)}
              hide-header
            ></openish-schema>`
          : nothing}
      </li>
    `
  }

  /** A rule for every key matching one regular expression, which is `additionalProperties` with an if. */
  #renderPatternProperty(pattern: string, schema: unknown): TemplateResult {
    return html`
      <li>
        <div class="head">
          <code class="name">[key matching /${pattern}/]</code>
          <span class="type">${schemaTypeLabel(schema)}</span>
          <span class="flag">any matching property</span>
        </div>
        ${hasBody(schema)
          ? html`<openish-schema
              .schema=${schema}
              scope=${this.scope}
              path=${variantAside(this.path, 'patternProperties', pattern)}
              hide-header
            ></openish-schema>`
          : nothing}
      </li>
    `
  }

  /**
   * Says which branch the reader took, and where.
   *
   * Composed, unlike `<openish-tabs>`' own event, because of how far it has to travel: a tree sits
   * inside a schema preview, inside a tab panel, inside a request body or response list, and the
   * thing that owns the choice is the operation above all of them. Every one of those is a shadow
   * boundary. Nothing outside openish is expected to act on it - but a host that wants to know which
   * variant a reader is reading is welcome to.
   */
  #announceVariant(index: number): void {
    this.dispatchEvent(
      new CustomEvent<OpenishVariantChange>('openish-variant-change', {
        detail: { scope: this.scope, path: this.path, index },
        bubbles: true,
        composed: true,
      }),
    )
  }

  #renderVariants(variants: SchemaVariants): TemplateResult {
    /* An inferred branch is a resolved schema, so its pointer travels beside it rather than on it. */
    const pointerAt = (branch: unknown, index: number): string =>
      refPointer(branch) ?? variants.pointers?.[index] ?? ''

    const label = (branch: unknown, index: number): string => {
      const mapped = variants.mapping?.get(pointerAt(branch, index))
      const title = asSchema(branch)?.['title']
      return (
        mapped ??
        refName(branch) ??
        modelNameFromPointer(variants.pointers?.[index]) ??
        (typeof title === 'string' ? title : `Option ${index + 1}`)
      )
    }

    const tabs: OpenishTab[] = variants.branches.map((branch, index) => ({
      id: `${index}`,
      label: label(branch, index),
      content: () => html`
        <openish-schema
          .schema=${branch}
          pointer=${pointerAt(branch, index)}
          scope=${this.scope}
          path=${variantBranch(this.path, variants.keyword, index)}
          inline-properties
        ></openish-schema>
      `,
    }))

    return html`
      <div class="variants-label">
        ${variants.keyword === 'oneOf' ? 'One of' : 'Any of'}
        ${variants.discriminator ? html`— by <code>${variants.discriminator}</code>` : nothing}
      </div>
      <openish-tabs
        label=${`${variants.keyword} variants`}
        .tabs=${tabs}
        @openish-tab-change=${(event: CustomEvent<string>) => this.#announceVariant(Number(event.detail))}
      ></openish-tabs>
    `
  }

  /**
   * The property list, inline at the top of a tree and behind a disclosure below it.
   *
   * Nothing is rendered into a closed disclosure, so the recursion stops at every branch the reader
   * has not opened. That is the whole reason `<openish-disclosure>` reports its state upward.
   */
  #renderProperties(target: unknown, isArray: boolean): TemplateResult | typeof nothing {
    /*
     * A tuple's positions come first and are never reordered: `[0]` before `[1]` is the whole
     * meaning of `prefixItems`, so alphabetising them would describe a different type.
     */
    const positions = schemaPrefixItems(target)
    const properties = orderProperties(schemaProperties(target), {
      by: this.ui?.config.orderSchemaPropertiesBy ?? 'document',
      requiredFirst: this.ui?.config.orderRequiredPropertiesFirst ?? false,
    })
    const patterns = schemaPatternProperties(target)
    const resolved = asSchema(target)
    const additional = resolved?.['additionalProperties']
    const hasAdditional = typeof additional === 'object' && additional !== null && !Array.isArray(additional)

    if (positions.length === 0 && properties.length === 0 && patterns.length === 0 && !hasAdditional) {
      return nothing
    }

    const list = html`
      <ul>
        ${repeat(
          positions,
          (position) => position.name,
          (position) => this.#renderProperty(position),
        )}
        ${repeat(
          properties,
          (property) => property.name,
          (property) => this.#renderProperty(property),
        )}
        ${repeat(
          patterns,
          (entry) => entry.pattern,
          (entry) => this.#renderPatternProperty(entry.pattern, entry.schema),
        )}
        ${hasAdditional ? this.#renderAdditional(additional, target) : nothing}
      </ul>
    `

    if (this.#state.depth === 0 || this.inlineProperties) {
      return list
    }

    const count = positions.length + properties.length + patterns.length + (hasAdditional ? 1 : 0)
    return html`
      <openish-disclosure
        summary=${positions.length > 0 ? 'Elements' : isArray ? 'Item properties' : 'Properties'}
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

  /**
   * Extra shape that one property's mere presence brings with it.
   *
   * `dependentSchemas` is the half of the dependency keywords that carries a schema rather than a
   * list of names, so it cannot be a constraint line the way `dependentRequired` is.
   */
  #renderDependentSchemas(target: unknown): TemplateResult | typeof nothing {
    const dependent = schemaDependentSchemas(target)
    if (dependent.length === 0) {
      return nothing
    }

    return html`
      ${repeat(
        dependent,
        (entry) => entry.property,
        (entry) => html`
          <div class="rule">
            <div class="rule-label">When <code>${entry.property}</code> is present</div>
            <openish-schema
              .schema=${entry.schema}
              scope=${this.scope}
              path=${variantAside(this.path, 'dependentSchemas', entry.property)}
              hide-header
              inline-properties
            ></openish-schema>
          </div>
        `,
      )}
    `
  }

  /**
   * `if`/`then`/`else`, as the rule the author meant rather than three anonymous schemas.
   *
   * The condition is summarised where it is a plain discriminant on one property, which is nearly
   * every real use. Anything more involved renders the `if` schema in full rather than being
   * paraphrased into something that might not be true.
   */
  #renderConditional(target: unknown): TemplateResult | typeof nothing {
    const conditional = schemaConditional(target)
    if (!conditional) {
      return nothing
    }

    return html`
      <div class="rule">
        ${conditional.summary
          ? html`<div class="rule-label">If ${conditional.summary}</div>`
          : html`
              <div class="rule-label">If it matches</div>
              <openish-schema
                .schema=${conditional.condition}
                scope=${this.scope}
                path=${variantAside(this.path, 'if', '')}
                hide-header
                inline-properties
              ></openish-schema>
            `}
        ${conditional.then !== undefined
          ? html`
              <div class="rule-label">then</div>
              <openish-schema
                .schema=${conditional.then}
                scope=${this.scope}
                path=${variantAside(this.path, 'then', '')}
                hide-header
                inline-properties
              ></openish-schema>
            `
          : nothing}
        ${conditional.otherwise !== undefined
          ? html`
              <div class="rule-label">otherwise</div>
              <openish-schema
                .schema=${conditional.otherwise}
                scope=${this.scope}
                path=${variantAside(this.path, 'else', '')}
                hide-header
                inline-properties
              ></openish-schema>
            `
          : nothing}
      </div>
    `
  }

  /**
   * A `$dynamicRef`, resolved against the anchors in scope.
   *
   * This is the one place the renderer needs the *dynamic* scope rather than the lexical one: the
   * schema saying `$dynamicRef: "#itemType"` cannot know what `itemType` is, because the whole point
   * is that a schema above it decides. Unbound, the honest answer is to say so - the placeholder is
   * `not: {}`, which matches nothing, and rendering that as an ordinary `not` would tell the reader
   * the value may be anything except everything.
   */
  #renderDynamicRef(name: string): TemplateResult {
    const bound = this.#state.anchors.get(name)

    if (bound === undefined || isUnboundAnchor(bound)) {
      return html`
        <p class="recursive">
          Decided by the schema that specialises this one, as <code>${name}</code>.
        </p>
      `
    }

    return html`<openish-schema .schema=${bound} scope=${this.scope} path=${this.path}></openish-schema>`
  }

  override render(): TemplateResult | typeof nothing {
    if (this.schema === undefined) {
      return nothing
    }

    const state = this.#state
    const { schema: target, isArray } = unwrapArray(this.schema)
    const resolved = asSchema(target)
    const ref = this.#ref

    /*
     * A dynamic reference stands in for a schema rather than being one, so it is answered before
     * anything else here would try to describe it - there are no properties or constraints of its
     * own to render, only whatever it resolved to.
     */
    const dynamicName = dynamicRefName(target)
    if (dynamicName !== undefined) {
      return html`
        ${this.hideHeader ? nothing : html`<div class="type">${schemaTypeLabel(this.schema)}</div>`}
        ${this.#renderDynamicRef(dynamicName)}
      `
    }

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
    /*
     * Constraints come from both halves of an array.
     *
     * `unwrapArray` hands back the *items* schema, because that is what has properties worth
     * expanding - but `minItems`, `maxItems` and `uniqueItems` are facts about the array, and they
     * were being dropped on the floor with the wrapper. The array's line comes first: how many,
     * then what each one is.
     */
    const constraints = isArray
      ? [...schemaConstraints(this.schema), ...schemaConstraints(target)]
      : schemaConstraints(target)
    const not = resolved?.['not']
    const variants = schemaVariants(target, this.#resolvePointer)

    return html`
      ${header}
      ${typeof description === 'string' && description.trim() !== ''
        ? html`<openish-markdown .markdown=${description} .headingOffset=${4}></openish-markdown>`
        : nothing}
      ${constraints.length > 0 ? html`<div class="constraints">${constraints.join(' · ')}</div>` : nothing}
      ${renderExternalDocs(resolved?.['externalDocs'])}
      ${this.#renderEnumValues(target)}
      ${not !== undefined
        ? html`<div class="constraints">not ${schemaTypeLabel(not) || 'the schema below'}</div>`
        : nothing}
      ${variants ? this.#renderVariants(variants) : this.#renderProperties(target, isArray)}
      ${this.#renderDependentSchemas(target)} ${this.#renderConditional(target)}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-schema': OpenishSchema
  }

  interface HTMLElementEventMap {
    'openish-variant-change': CustomEvent<OpenishVariantChange>
  }
}

import { consume, provide } from '@lit/context'
import {
  resolveLocalPointer,
  VARIANT_PATH_ROOT,
  variantAdditional,
  variantAside,
  variantIndex,
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
import { renderModelName, renderTypeLabel } from '../render/model-link.js'
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
  orderProperties,
  schemaConditional,
  schemaConstraints,
  schemaDependentSchemas,
  schemaExamples,
  schemaPatternProperties,
  schemaPrefixItems,
  schemaProperties,
  schemaTypeLabel,
  schemaVariants,
  unwrapArray,
  variantLabel,
  variantPointer,
  type SchemaProperty,
  type SchemaVariants,
  type VariantChoices,
} from '@openish/core'
import { fieldRowStyles, renderFieldRow, type FieldWhere } from '../render/field-row.js'
import { badgeStyles, baseStyles, controlStyles, visuallyHidden } from '../styles/shared.js'
import type { OpenishTab } from './openish-tabs.js'
import './openish-disclosure.js'
import './openish-markdown.js'
import './openish-tabs.js'

/**
 * The backstop, for nesting that is deep but finite. Cycles are caught by `seenRefs` long before
 * this, and a document that reaches it is one no reader was going to scroll through anyway.
 */
const MAX_DEPTH = 12

/**
 * How many levels are indented by the full step before the tree settles for the border alone.
 *
 * Four, because that is about as deep as a reader gets by hand - every level below the first is a
 * disclosure somebody opened - and because twelve levels of the full step is more of a narrow column
 * than the column has. See the rule in the stylesheet.
 */
const INDENT_LIMIT = 4

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
    badgeStyles,
    baseStyles,
    controlStyles,
    externalDocsStyles,
    visuallyHidden,
    fieldRowStyles,
    css`
      :host {
        display: block;
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

      /*
       * The examples marker: one muted word on the row, and the values over the top of it.
       *
       * Underlined rather than boxed, because it sits in a run of words that are not controls -
       * required, read-only - and a button drawn like a button there would be the loudest thing on
       * a row whose point is the field name.
       */
      .hint {
        position: relative;
        display: inline-flex;
      }

      .marker {
        padding: 0;
        border: 0;
        background: none;
        color: var(--openish-color-text-muted);
        font: var(--openish-font-micro);
        text-decoration: underline dotted;
        text-underline-offset: 0.2em;
      }

      /*
       * Above the row, so it never covers the description belonging to the field it describes.
       *
       * A layer, so it needs to read as one: its own surface, a border, and a shadow. Nothing pushes
       * anything - the row is the same height whether this is showing or not, which is the whole
       * reason the values are not simply printed.
       */
      .tip {
        position: absolute;
        bottom: calc(100% + var(--openish-space-3xs));
        inset-inline-start: 0;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: var(--openish-space-3xs);
        /*
         * Sized by the value, not by the word it hangs off.
         *
         * An absolutely positioned box shrinks to fit its containing block, and the containing block
         * here is the marker - five characters wide - so a URL came out as a column one word deep.
         */
        width: max-content;
        max-width: 24rem;
        padding: var(--openish-space-2xs) var(--openish-space-xs);
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-md);
        background: var(--openish-color-surface-raised);
        box-shadow: var(--openish-shadow-md);
        font: var(--openish-font-micro);
        white-space: pre-wrap;
      }

      /*
       * A class selector beats the UA rule that makes the hidden attribute mean display none, so the
       * display above kept every tip on the page at once. Stated here rather than removed there,
       * because the layout is the point of that rule and the attribute is the state.
       */
      .tip[hidden] {
        display: none;
      }

      .tip code {
        font-family: var(--openish-font-family-mono);
      }

      .recursive {
        margin: var(--openish-space-2xs) 0 0;
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
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

      /*
       * Past the fourth level the step narrows to the border and its padding.
       *
       * Both halves are cumulative and the tree goes twelve levels deep, so the full step spent
       * eighteen rems of a twenty-three rem column on nothing but indentation before a property name
       * was drawn - in a column that has no scroller of its own, so what did not fit pushed a
       * horizontal scrollbar across the whole page.
       *
       * The border stays at every level, because the border is what says this is nested; the margin
       * is what says how deeply, and after four levels the answer is "deeply" either way.
       */
      ul.deep > .field > openish-schema {
        margin-left: 0;
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
   * Where the values in *this* list travel, worn as a chip on every row at this level.
   *
   * `body` on a promoted request body or response body, and empty everywhere else. Set by
   * `renderMediaTypes`, because everything it renders is a body - a request body, a response, a
   * callback's request - so this is a fact about that function rather than an option it takes.
   *
   * Deliberately **not** passed down a nesting. A nested object's properties are inside the thing
   * the chip already named, and `body` printed nine levels deep is the group heading this replaced,
   * wearing a pill.
   *
   * It also decides the fallback. A body whose root has no members and no variants - a `string`, a
   * `binary`, an array of scalars - has nothing to promote, so it renders as a single row wearing
   * the chip and carrying the type. The chip is that row's name; printing `body` twice would be the
   * same word in two typefaces.
   */
  @property({ type: String })
  where = ''

  /**
   * The `oneOf`/`anyOf` branches the reader has picked, so a rebuilt tab set can restore one.
   *
   * The tabs used to keep their own state and nothing read it back, which was invisible while every
   * tree stayed mounted. It stopped being invisible when a closed status accordion began rendering
   * nothing: the tab set is destroyed and rebuilt at branch zero, while the operation still holds
   * the reader's choice and the example beside it still honours it - so the tree said `Cat` and the
   * example said `Dog`.
   *
   * Passed down every nesting beside `scope` and `path`, because a choice can be made at any depth
   * and the key is the pair.
   */
  @property({ attribute: false })
  variants: VariantChoices | undefined = undefined

  /**
   * This tree's rows continue a list begun in another element - the parameters beside a body.
   *
   * A first row draws no rule because whatever is above it already drew one, which is true of the
   * first parameter and false of the first promoted body row. The two lists are in two shadow roots
   * and CSS cannot see across the boundary, so the answer is passed in.
   */
  @property({ type: Boolean, attribute: 'continues-list', reflect: true })
  continuesList = false

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

  /**
   * Which property's examples are showing, by name. Empty is none.
   *
   * A name rather than a boolean because one tree renders many rows and each has its own marker, and
   * a name rather than an index because the row list is re-ordered by `orderSchemaPropertiesBy`.
   */
  @state()
  private openExample = ''

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

  /**
   * The route to the section documenting what a `$ref` names.
   *
   * `renderModelName` rather than an id rebuilt from the name, which is what this was: the pointer
   * the document wrote is the join, and a guess that misses becomes plain text without saying so.
   */
  #modelLink(target: unknown): unknown {
    return renderModelName(this.store, this.ui, target)
  }

  /**
   * What this schema is, on one line above whatever it contains.
   *
   * `schemaTypeLabel` already answers with the model's name where there is a `$ref` to answer with,
   * so on a body this line reads `User` and has since it was written. Linking it is what makes the
   * collapsed tree underneath an abstraction rather than a hidden one: the name says which shape,
   * and the section it names says the rest.
   */
  #renderHeader(): TemplateResult {
    const label = schemaTypeLabel(this.schema)
    return html`<div class="type">${renderTypeLabel(this.store, this.ui, this.schema, label)}</div>`
  }

  /**
   * The values an author wrote for one property, on the row and out of the way.
   *
   * A parameter has shown its examples since the table was written and a property never had, so a
   * document saying `example: acc_1` on a field got it into the generated JSON on the right and
   * nowhere a reader scanning the fields would find it. Printed in the row it would be a second line
   * under every documented field; behind a marker it costs one word and is a pointer away.
   *
   * **Hover is not the affordance, it is one of three.** A tooltip that only answers a mouse is
   * unreachable from a keyboard and absent on a phone, so the marker is a button: it opens on hover,
   * on focus, and on tap, and closes on Escape.
   *
   * And the values are in the button's own accessible name, not in the panel. A description that
   * points at a hidden element resolves to nothing, and one that points at a visible element is only
   * read once it has been opened - so a screen-reader reader would have had to know to open a thing
   * they could not see. Naming the button with what it holds means focus alone says it, and the
   * panel is decoration the a11y tree can skip.
   */
  #renderExampleMarker(name: string, schema: unknown): TemplateResult | typeof nothing {
    const { schema: inner, isArray } = unwrapArray(schema)
    const examples = isArray ? [...schemaExamples(schema), ...schemaExamples(inner)] : schemaExamples(inner)
    if (examples.length === 0) {
      return nothing
    }

    /* A string as it stands, anything else as JSON - what the example block would make of it. */
    const values = examples.map((example) => (typeof example === 'string' ? example : JSON.stringify(example)))
    const open = this.openExample === name

    return html`
      <span class="hint">
        <button
          type="button"
          class="marker"
          aria-expanded=${open}
          @pointerenter=${() => {
            this.openExample = name
          }}
          @pointerleave=${(event: PointerEvent) => {
            /* A pointer leaving a button the reader tabbed to must not close what focus opened. */
            if (this.shadowRoot?.activeElement !== event.currentTarget) {
              this.openExample = ''
            }
          }}
          @focus=${() => {
            this.openExample = name
          }}
          @blur=${() => {
            this.openExample = ''
          }}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              this.openExample = ''
            }
          }}
        >
          <span aria-hidden="true">${values.length > 1 ? 'examples' : 'example'}</span>
          <span class="visually-hidden">for ${name}: ${values.join(', ')}</span>
        </button>
        <span class="tip" aria-hidden="true" ?hidden=${!open}>
          ${repeat(
            values,
            (_, index) => index,
            (value) => html`<code>${value}</code>`,
          )}
        </span>
      </span>
    `
  }

  /** The words that qualify a property without constraining it. `renderFieldRow` joins them. */
  #flags(value: unknown): string[] {
    const schema = asSchema(value)
    return [
      schema?.['readOnly'] === true ? 'read-only' : undefined,
      schema?.['writeOnly'] === true ? 'write-only' : undefined,
      schema?.['deprecated'] === true ? 'deprecated' : undefined,
    ].filter((flag): flag is string => flag !== undefined)
  }

  /**
   * One property: its name and shape on a line, its own schema underneath.
   *
   * The nested `<openish-schema>` is what carries the description, the constraints, and the next
   * level down - so a property row has no idea how deep the thing it names goes.
   *
   * The type is a link where it names a model, which matters more than it did: with bodies arriving
   * collapsed, the tree is where a reader meets a named type, and a name they cannot follow is the
   * abstraction turning into a dead end.
   */
  /** The chip this level's rows wear, if any. Never inherited - see the `where` property. */
  get #chip(): FieldWhere | undefined {
    return this.where === '' ? undefined : (this.where as FieldWhere)
  }

  #renderProperty(property: SchemaProperty): TemplateResult {
    return renderFieldRow({
      name: property.name,
      where: this.#chip,
      type: renderTypeLabel(this.store, this.ui, property.schema, schemaTypeLabel(property.schema)),
      /* `required` or nothing: a body can be sixty properties, and see the note in the parameters. */
      requirement: property.required ? 'required' : undefined,
      deprecated: property.deprecated,
      flags: this.#flags(property.schema),
      aside: this.#renderExampleMarker(property.name, property.schema),
      nested: hasBody(property.schema)
        ? html`<openish-schema
            .schema=${property.schema}
            scope=${this.scope}
            path=${variantProperty(this.path, property.name)}
            hide-header
          ></openish-schema>`
        : nothing,
    })
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
    return renderFieldRow({
      name: `[${additionalPropertiesName(parent)}: string]`,
      where: this.#chip,
      type: schemaTypeLabel(additional),
      flags: ['any other property'],
      nested: hasBody(additional)
        ? html`<openish-schema
            .schema=${additional}
            scope=${this.scope}
            path=${variantAdditional(this.path)}
            hide-header
          ></openish-schema>`
        : nothing,
    })
  }

  /** A rule for every key matching one regular expression, which is `additionalProperties` with an if. */
  #renderPatternProperty(pattern: string, schema: unknown): TemplateResult {
    return renderFieldRow({
      name: `[key matching /${pattern}/]`,
      where: this.#chip,
      type: schemaTypeLabel(schema),
      flags: ['any matching property'],
      nested: hasBody(schema)
        ? html`<openish-schema
            .schema=${schema}
            scope=${this.scope}
            path=${variantAside(this.path, 'patternProperties', pattern)}
            hide-header
          ></openish-schema>`
        : nothing,
    })
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
    /*
     * Naming a branch is `variantLabel`, in core, because the Markdown copy prints every branch and
     * has to call them what these tabs call them.
     */
    const tabs: OpenishTab[] = variants.branches.map((branch, index) => ({
      id: `${index}`,
      label: variantLabel(variants, index),
      content: () => html`
        <openish-schema
          .schema=${branch}
          .variants=${this.variants}
          pointer=${variantPointer(variants, index)}
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
        selected=${String(variantIndex(this.variants, this.scope, this.path, variants.branches.length))}
        .tabs=${tabs}
        @openish-tab-change=${(event: CustomEvent<string>) => this.#announceVariant(Number(event.detail))}
      ></openish-tabs>
    `
  }

  /**
   * The property list, behind a disclosure at every level the caller has not asked to see open.
   *
   * Nothing is rendered into a closed disclosure, so the recursion stops at every branch the reader
   * has not opened. That is the whole reason `<openish-disclosure>` reports its state upward.
   *
   * The root is exempt, and every level below it is a disclosure. For a while the root was exempt
   * only when the caller did not ask otherwise, which let a body arrive as its name alone - the
   * weight argument for that was real but it was a *recursive* weight, and one level is bounded per
   * object. It is also the level a reader arrived asking about, which the collapsed body was not.
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
      <ul class=${classMap({ fields: true, deep: this.#state.depth >= INDENT_LIMIT })}>
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
              .variants=${this.variants}
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
                .variants=${this.variants}
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
                .variants=${this.variants}
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
                .variants=${this.variants}
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
   * What the value may not be.
   *
   * A type label says the whole of it where there is one - `not string` is complete, and costs a
   * line. Where there is not, this used to render `not the schema below` and there was no schema
   * below: the excluded schema was never rendered anywhere, so the reader was pointed at an absence.
   *
   * It is rendered now, in the same rule grammar `if`/`then`/`else` and `dependentSchemas` use,
   * because it is the same kind of thing - a constraint that happens to be shaped like a schema.
   *
   * Two shapes have no body to render and no type to name, and both are said in words instead. A
   * bare `required` list is the commonest `not` in a real document and means the properties must not
   * appear *together*; `not: {}` excludes everything, which is a real thing for a document to say
   * and the only case where "nothing satisfies this" is the honest answer rather than a shrug.
   */
  #renderNot(not: unknown): TemplateResult | typeof nothing {
    if (not === undefined) {
      return nothing
    }

    const label = schemaTypeLabel(not)

    if (hasBody(not)) {
      return html`
        <div class="rule">
          <!-- No type in the label: it would say object nine times in ten, over a tree that says so. -->
          <div class="rule-label">Must not match</div>
          <openish-schema
            .schema=${not}
            .variants=${this.variants}
            scope=${this.scope}
            path=${variantAside(this.path, 'not', '')}
            hide-header
            inline-properties
          ></openish-schema>
        </div>
      `
    }

    if (label !== '') {
      return html`<div class="constraints">not ${label}</div>`
    }

    const required = asSchema(not)?.['required']
    if (Array.isArray(required) && required.length > 0) {
      const names = required.filter((name): name is string => typeof name === 'string')
      /* Both, not either: `not` negates the whole schema, so it is only violated when all are there. */
      const phrase = names.length > 1 ? `all of ${names.join(', ')}` : names[0]
      return html`<div class="constraints">must not have ${phrase}</div>`
    }

    return html`<div class="constraints">nothing satisfies this</div>`
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

    return html`<openish-schema
      .schema=${bound}
      .variants=${this.variants}
      scope=${this.scope}
      path=${this.path}
    ></openish-schema>`
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
        ${this.hideHeader ? nothing : this.#renderHeader()}
        ${this.#renderDynamicRef(dynamicName)}
      `
    }

    const header = this.hideHeader ? nothing : this.#renderHeader()

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
      ${this.#renderNot(not)}
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

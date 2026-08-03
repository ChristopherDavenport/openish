import { css, html, nothing, type TemplateResult } from 'lit'
import { classMap } from 'lit/directives/class-map.js'

/**
 * Where a value travels. The five places an input or an output can live.
 *
 * Spelled exactly as OpenAPI spells `in`, plus `body`, which OpenAPI keeps somewhere else entirely
 * and which is the whole reason the page used to describe it in a different grammar.
 */
export type FieldWhere = 'path' | 'query' | 'header' | 'cookie' | 'body'

/**
 * One named value: what it is called, where it travels, what shape it is, and whether it is
 * required.
 *
 * Four of these are `unknown` rather than data, and that is deliberate - the same division
 * `renderExampleList` draws by taking `MediaTypeExample[]` and not a schema. This fragment owns the
 * *shape* of a row, not the knowledge behind one. Linking a type needs the store and the routing
 * state; an examples marker is a stateful control; a nested tree is a recursive element. None of
 * those belong in a pure function, and a row does not need them to be - it needs a slot.
 */
export type FieldRow = {
  /** The name, as the document writes it. Absent on a row whose chip is its name - see below. */
  name?: string | undefined
  /** The chip. Absent inside a nested object: the chip above already said where this lives. */
  where?: FieldWhere | undefined
  /** Already rendered, so a model name can arrive as a link. */
  type?: unknown
  /**
   * Whether the reader has to supply this, in the three states that are actually distinct.
   *
   * `undefined` says nothing, and is not the same as `'optional'`. A row only prints the word where
   * something is genuinely asking the reader for a value and the answer is a fact about the request:
   * a parameter is, and a response header is not - `required` on one of those is a promise the
   * server makes, which is why those rows carry `Always sent` as a flag and leave this unset.
   *
   * A string rather than a boolean because `false` and "not stated" are one value in a boolean and
   * two answers on the page, and the call site is where the difference is known.
   */
  requirement?: 'required' | 'optional' | undefined
  /**
   * What the caller gets for leaving it out, where the document says.
   *
   * Beside the requirement rather than down among the constraints, because it is not one: it is what
   * finishes the sentence `optional` starts. A reader deciding whether to send a value has to know
   * what happens if they do not, and that answer was two lines below, past the description, among
   * the bounds. It goes here or there and never both - see `schemaDefault`.
   */
  defaultValue?: string | undefined
  deprecated?: boolean | undefined
  /** `read-only`, `write-only`, `any other property` - words that qualify without constraining. */
  flags?: readonly string[] | undefined
  /** Anything else belonging on the head line: an examples marker, `as application/json`. */
  aside?: unknown
  /** Under the head: the description, the constraint line, the enum values. */
  detail?: unknown
  /** What the row opens into - a nested `<openish-schema>` - or nothing for a leaf. */
  nested?: unknown
}

/**
 * One row of a field list.
 *
 * A parameter, a response header and a schema property are three spellings of one idea, and until
 * this existed they were three near-copies: two `<openish-table>` shapes with different column sets,
 * and the `li > .head` the schema tree drew. A reader crossing from `Parameters` to `Returns` met a
 * different grammar for the same facts, and every fact that got added to one of the three - the
 * examples list, the deprecation mark, the read-only flag - had to be remembered into the other two.
 * This is the third one, generalised; the tree's row was already the right shape.
 *
 * **The chip comes first, and that is load-bearing.** The page no longer heads its groups - `Path`,
 * `Query`, `Body` are gone - and what replaces them is that the rows stay in group order and the
 * chips read as a run. A run needs the chips to share an x, which chip-first gives for nothing in a
 * flex row and name-first cannot give at all: a chip that starts where the name ends lands in as
 * many positions as there are name lengths. The arrangement that gets both - a subgrid with an
 * `auto` name track - has no safe answer in a narrow column, where `overflow-wrap: anywhere` drags
 * a generated property name's min-content to a single character.
 *
 * The `<li>` is returned but the `<ul>` is not, which is where this parts company with
 * `renderExampleList`. Each caller needs its own accessible name on the list and its own key
 * function, and neither is something a row can know.
 */
export const renderFieldRow = (field: FieldRow): TemplateResult => html`
  <li class="field">
    <div class="head">
      ${field.where ? html`<span class="badge" data-where=${field.where}>${field.where}</span>` : nothing}
      ${field.name === undefined
        ? nothing
        : html`<code class=${classMap({ name: true, deprecated: field.deprecated === true })}>${field.name}</code>`}
      ${field.type ? html`<span class="type">${field.type}</span>` : nothing}
      ${field.requirement ? html`<span class=${field.requirement}>${field.requirement}</span>` : nothing}
      ${field.defaultValue ? html`<span class="default">${field.defaultValue}</span>` : nothing}
      ${field.flags && field.flags.length > 0 ? html`<span class="flag">${field.flags.join(' · ')}</span>` : nothing}
      ${field.aside ?? nothing}
    </div>
    ${field.detail ?? nothing}${field.nested ?? nothing}
  </li>
`

/**
 * The list's own styles, for the element that renders it into its shadow root.
 *
 * Shared verbatim by every element that draws rows, which is what lets two of them sit one above the
 * other in two different shadow roots and read as one list: the padding, the hairline and the chip
 * width are the same declarations, so they cannot drift apart.
 *
 * Composes with `badgeStyles`, which every caller needs too - this fragment sizes the chip and that
 * one draws it. Kept apart because the badge is not a field-row idea: an operation wears one on its
 * title, and folding it in here would make that element import a row stylesheet to get a pill.
 */
export const fieldRowStyles = css`
  ul.fields {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .field {
    padding: var(--openish-space-xs) 0;
    border-top: 1px solid var(--openish-color-border);
  }

  /*
   * The first row of a list draws no rule, because whatever is above it already drew one.
   *
   * Except where this list *continues* another one in a different shadow root - a promoted request
   * body under the parameters that travel beside it. There the rule is the only thing marking the
   * join, and :first-child is true of a row that is not first on the page at all.
   */
  .field:first-child {
    border-top: 0;
  }

  :host([continues-list]) .field:first-child {
    border-top: 1px solid var(--openish-color-border);
  }

  .head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--openish-space-xs);
  }

  /*
   * Wide enough for "header" and "cookie", the longest of the five, so every chip is the same width
   * and the column is a column. Centred for the same reason the method chip is.
   */
  .badge[data-where] {
    min-width: 4.5em;
    text-align: center;
  }

  .name {
    font: var(--openish-font-body-bold);
    font-family: var(--openish-font-family-mono);
  }

  .name.deprecated {
    text-decoration: line-through;
    color: var(--openish-color-text-muted);
  }

  .type {
    font: var(--openish-font-code-small);
    color: var(--openish-color-text-muted);
  }

  .required {
    color: var(--openish-color-danger);
    font: var(--openish-font-micro);
  }

  /*
   * The same size and position as the required mark, in the muted colour rather than the danger one.
   *
   * It has to be legible without being loud. A list where most rows are optional would read as a
   * column of warnings if this shared the other's weight, and the fact worth noticing on that list
   * is still the handful of rows that ask for something.
   */
  .optional {
    color: var(--openish-color-text-muted);
    font: var(--openish-font-micro);
  }

  .flag,
  .default,
  .media-type {
    color: var(--openish-color-text-muted);
    font: var(--openish-font-micro);
  }

  /* Mono for the value, because it is one: the literal a caller would have written. */
  .default {
    font-family: var(--openish-font-family-mono);
  }

  .constraints {
    margin-top: var(--openish-space-3xs);
    font: var(--openish-font-micro);
    color: var(--openish-color-text-muted);
  }

  /*
   * A name, a type or a constraint can be one long unbreakable token - a pattern, a URI-shaped enum
   * member, a generated property name. Breaking anywhere is what keeps it inside the column it
   * belongs to; a path or a regex has no spaces to break at.
   */
  .name,
  .type,
  .constraints {
    overflow-wrap: anywhere;
  }

  /* The nested schema of a property sits under its name, indented by the border. */
  .field > openish-schema {
    margin-left: var(--openish-space-sm);
    padding-left: var(--openish-space-sm);
    border-left: 1px solid var(--openish-color-border);
  }
`

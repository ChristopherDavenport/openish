import { css } from 'lit'

/**
 * Styles shared across openish elements.
 *
 * Everything here reads `--openish-*` and nothing else. Those hooks are bound to Jack Henry alias
 * tokens in `@openish/theme`, so a consumer can retheme openish without touching JH, and openish
 * could be bound to a different design system by replacing one file.
 */
export const baseStyles = css`
  :host {
    box-sizing: border-box;
    color: var(--openish-color-text);
    font: var(--openish-font-body);
  }

  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }

  a {
    color: var(--openish-color-link);
    text-decoration: none;
  }

  a:hover {
    color: var(--openish-color-link-hover);
    text-decoration: underline;
  }

  /*
   * The focus ring. One rule, for everything that can hold focus.
   *
   * It is here rather than in each component because a ring that is declared sixteen times is a ring
   * that differs in sixteen places, and it already did: some copies added a radius, some did not, and
   * the controls inside a table cell drew a different shape entirely. The list covers the three
   * focusable things that are not controls as well - the virtualised tree, the scrollable regions of
   * a code block and a table, and a tab panel - all of which carry a tabindex.
   *
   * :where() has no specificity, so :focus-visible alone decides this rule's weight. A component
   * that genuinely needs a different ring can still say so with one class; it can no longer do it by
   * accident.
   *
   * An outline, not a shadow. An outline follows border-radius without being told what the radius
   * is, which is why the old copies each had to repeat one, and it is painted in forced-colors mode,
   * where a box-shadow is dropped entirely and the ring simply vanished. The offset keeps it clear
   * of the element's own edge; an element that sits flush inside something that clips - a cell, a
   * frame - negates the offset rather than removing the ring, by redeclaring the token on itself.
   */
  :where(a, button, select, input, textarea, [tabindex]):focus-visible {
    outline: var(--openish-focus-ring-width) var(--openish-focus-ring-style)
      var(--openish-focus-ring-color);
    outline-offset: var(--openish-focus-ring-offset);
  }

  /*
   * Forced colors replaces the palette wholesale, including the ring's colour, which would otherwise
   * resolve to a token the mode has already overridden. Highlight is the system colour that means
   * "this is the thing you are on", so the ring keeps its meaning rather than its hue.
   */
  @media (forced-colors: active) {
    :where(a, button, select, input, textarea, [tabindex]):focus-visible {
      outline-color: Highlight;
    }
  }

  code {
    font: var(--openish-font-code);
  }
`

/**
 * The six states every control is in exactly one of: enabled, hover, focus, active, disabled,
 * pending.
 *
 * The design system names those six and expects all of them from anything interactive. openish had
 * two and a half - focus everywhere, hover on seven of twenty-odd controls, `:active` nowhere at all,
 * and a disabled attribute on buttons that were styled for it in one file out of twenty-seven. This
 * block is the other three and a half, declared once so a new control gets them by existing.
 *
 * What it deliberately does *not* declare is appearance. openish has three button looks - bordered,
 * accent, and plain - and which one a control wears is a decision about the surface it sits on, so
 * it stays with the component. Hover and active are therefore drawn as a tint laid over whatever the
 * component chose, not as a background of their own: an inset shadow spread far enough to fill the
 * element, which works identically on a white chip, a blue button, and a transparent toggle, and
 * costs nothing when the component later changes its mind about which of those it is.
 *
 * `focus` is not here. It is in `baseStyles`, because plenty of things take focus that are not
 * controls.
 *
 * `.pressable` is how an anchor opts in. Some of what a reader presses in this project is a link
 * because it goes somewhere - a sidebar row, a download - and those are controls in every sense that
 * matters to a hand on a mouse, but a bare `a` selector here would also catch every link in a
 * paragraph of documentation, and a word of prose should not grow a ring when it is clicked. So the
 * component that has already decided an anchor is a row or a button says so, and gets the same
 * states rather than a near-copy of them.
 */
export const controlStyles = css`
  :where(button, select, input, textarea) {
    font-family: inherit;
  }

  /* Enabled. A control is a target, and is at least as big as one. */
  :where(button, select) {
    min-block-size: var(--openish-target-min);
    min-inline-size: var(--openish-target-min);
    cursor: pointer;
  }

  :where(input:not([type='checkbox']):not([type='radio']), textarea) {
    min-block-size: var(--openish-target-min);
  }

  /* Hover: a tint over whatever the component chose, moving towards its own text colour. */
  :where(button, select, .pressable):hover:not(:disabled) {
    box-shadow: inset 0 0 0 100vmax var(--openish-state-hover-tint);
  }

  /*
   * Active - the control is being pressed right now.
   *
   * A deeper tint *and* a ring drawn inside the control's edge, for the moment the press lasts. The
   * ring is the part that matters: a tint alone is a change of a few percent in lightness, which is
   * the first thing to disappear on a poor screen, in bright light, or under a finger. An edge
   * appearing where there was none is unambiguous at any contrast.
   *
   * The ring is currentColor, not --openish-border-selected-color, and that is not a shortcut.
   * The selected colour and the accent are the same blue - deliberately, they are one idea - so a
   * selected-coloured ring inside the primary button, whose fill *is* that blue, is invisible: the
   * one control on the page whose press most needs acknowledging was the one that showed nothing.
   * Drawing from the control's own text colour is the same self-correcting move the tint makes: it
   * is white inside a blue button, near-black inside a white one, muted inside a bare toggle, and it
   * cannot collide with a fill because it is the colour chosen to read against that fill.
   *
   * Both halves in one box-shadow, because they are one paint: the later inset spreads to fill the
   * element and the earlier one sits on top of it.
   */
  :where(button, select, .pressable):active:not(:disabled) {
    box-shadow:
      inset 0 0 0 var(--openish-border-selected-width) currentColor,
      inset 0 0 0 100vmax var(--openish-state-active-tint);
  }

  @media (forced-colors: active) {
    /* Every half of that is a shadow, so every half is dropped. An outline is the edge that lives. */
    :where(button, select, .pressable):active:not(:disabled) {
      outline: var(--openish-border-selected-width) solid Highlight;
      outline-offset: calc(-1 * var(--openish-border-selected-width));
    }
  }

  /*
   * Disabled. Quiet, not invisible, and not a target: the tints above are excluded rather than
   * overridden, so a disabled control does not respond to a pointer that is over it.
   */
  :where(button, select, input, textarea):disabled {
    color: var(--openish-color-text-disabled);
    cursor: default;
  }

  :where(button, select):disabled {
    background: var(--openish-color-surface-disabled);
    border-color: var(--openish-border-decorative-color);
  }

  /*
   * Pending: the control has started something that has not finished. One name for what the
   * download button and the authorize button each had their own private word for. aria-busy is
   * the state rather than a class because assistive technology has to hear about it too, and each
   * of those buttons already sits beside a live region saying what is happening.
   *
   * Not every wait is a pending control. Sending a request swaps Send for Cancel, which is a
   * different control and not a busy one, and copying to the clipboard reports a result rather than
   * a wait. Marking either would be describing the page rather than the button.
   */
  :where(button, select)[aria-busy='true'] {
    cursor: progress;
  }

  @media (forced-colors: active) {
    /*
     * The tints are shadows, which forced colors drops, and the disabled colours are tokens it has
     * already replaced. GrayText is the system colour for exactly this, and it is what the browser
     * would have used had the control never been styled.
     */
    :where(button, select, input, textarea):disabled {
      color: GrayText;
      border-color: GrayText;
    }
  }
`

/** The coloured method chip, shared by the sidebar and the operation header. */
export const methodStyles = css`
  .method {
    display: inline-block;
    flex: none;
    min-width: 3.5em;
    padding: 0 var(--openish-space-2xs);
    border-radius: var(--openish-radius-sm);
    font: var(--openish-font-micro);
    font-family: var(--openish-font-family-mono);
    text-align: center;
    text-transform: uppercase;
    color: var(--openish-method-on-color);
    background: var(--openish-color-text-muted);
  }

  .method[data-method='get'] {
    background: var(--openish-method-get);
  }
  .method[data-method='post'] {
    background: var(--openish-method-post);
  }
  .method[data-method='put'] {
    background: var(--openish-method-put);
  }
  .method[data-method='patch'] {
    background: var(--openish-method-patch);
  }
  .method[data-method='delete'] {
    background: var(--openish-method-delete);
  }
  .method[data-method='options'] {
    background: var(--openish-method-options);
  }
  .method[data-method='head'] {
    background: var(--openish-method-head);
  }
  .method[data-method='trace'] {
    background: var(--openish-method-trace);
  }

  /*
   * Forced colors throws the eight method colours away and paints every chip the same, which is not
   * a loss - the chip says GET or DELETE in words, so the colour was never the only carrier - but it
   * does leave the chip shapeless, floating in the row beside the title as if it were part of it. A
   * border puts the shape back.
   */
  @media (forced-colors: active) {
    .method {
      border: 1px solid currentColor;
    }
  }
`

/**
 * Loading, failure, and not-found messages.
 *
 * Shared because the same three states are rendered from two places: the root, while the document
 * is still arriving, and a routed section, when the URL resolves to no node.
 */
export const statusStyles = css`
  .status {
    padding: var(--openish-space-xl);
    color: var(--openish-color-text-muted);
  }

  .error {
    color: var(--openish-color-danger);
    background: var(--openish-color-danger-surface);
    border-radius: var(--openish-radius-lg);
    padding: var(--openish-space-md);
  }

  /* The tinted panel is what makes this read as a failure and not as a paragraph. Keep the edge. */
  @media (forced-colors: active) {
    .error {
      border: 1px solid currentColor;
    }
  }
`

/**
 * Syntax colours for the markup `@scalar/code-highlight` emits.
 *
 * These rules have to live in component CSS, not in the theme package. Every code block openish
 * renders - a markdown fence, a code sample - is inside a shadow root, and a document-level
 * `.hljs-keyword` selector does not cross a shadow boundary, so a stylesheet the host loads can
 * never colour them. Custom properties do cross it, which is why `@openish/theme/highlight.css`
 * still owns the `--openish-hl-*` hooks and this owns nothing but the mapping.
 */
export const highlightStyles = css`
  .hljs-keyword,
  .hljs-selector-tag,
  .hljs-built_in,
  .hljs-name {
    color: var(--openish-hl-keyword);
  }

  .hljs-string,
  .hljs-regexp,
  .hljs-symbol,
  .hljs-template-tag {
    color: var(--openish-hl-string);
  }

  .hljs-number,
  .hljs-bullet,
  .hljs-quote {
    color: var(--openish-hl-number);
  }

  .hljs-literal,
  .hljs-type,
  .hljs-variable,
  .hljs-template-variable {
    color: var(--openish-hl-literal);
  }

  .hljs-comment,
  .hljs-meta {
    color: var(--openish-hl-comment);
    font-style: italic;
  }

  .hljs-attr,
  .hljs-attribute,
  .hljs-property {
    color: var(--openish-hl-attr);
  }

  .hljs-title,
  .hljs-section,
  .hljs-selector-id,
  .hljs-selector-class {
    color: var(--openish-hl-title);
  }

  .hljs-punctuation,
  .hljs-operator {
    color: var(--openish-hl-punctuation);
  }

  .hljs-emphasis {
    font-style: italic;
  }

  .hljs-strong {
    font-weight: bold;
  }
`

/**
 * The two content columns, declared identically by every page element.
 *
 * Column geometry used to live inside `<openish-operation>` alone, so an operation split itself in
 * two while the overview, tag and model pages were a single centred measure - and the layout moved
 * under the reader every time they navigated. Stacked into one scroller that is worse: the examples
 * would start at a different x on every second section instead of reading as a band down the page.
 *
 * So it is one fragment, imported by all four. Every section is the same width, so identical track
 * definitions put the tracks in identical places; there is no cross-boundary layout and no element
 * has to be told how wide the page is.
 *
 * A container query, not a media query, and on a wrapper rather than on `:host`: how wide *this
 * section* is depends on whether the sidebar is showing, which a media query cannot see - and an
 * element is never its own container, so the query has to be answered by a descendant. The 74rem is
 * a literal because a container condition cannot take a `var()`; it is deliberately not a token, and
 * trying to make it one will silently do nothing.
 */
export const planeColumnStyles = css`
  :host {
    display: block;
    container-type: inline-size;
    container-name: section;
  }

  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    column-gap: var(--openish-space-xl);
    align-items: start;
  }

  /*
   * Everything is one column unless it says otherwise, which is what keeps a page that has no
   * examples - the overview, a tag, a model - from having its content dealt alternately into two.
   *
   * No measure of its own: the column *is* the measure. Capping the content inside a track that is
   * already half the page put a band of nothing between the two columns on a wide screen, which
   * reads as a layout fault rather than as breathing room.
   */
  .columns > * {
    grid-column: 1;
    min-width: 0;
  }

  @container section (min-width: 74rem) {
    .columns {
      grid-template-columns: var(--openish-docs-column) var(--openish-examples-column);
    }
  }
`

/**
 * A section's own title, with the controls that act on the whole section beside it.
 *
 * Shared because all four page elements have one and they have to line up: on the plane they are
 * stacked in a single scroller, so a control that sat a few pixels differently on the overview than
 * on an operation would read as a wobble down the right-hand edge rather than as a column.
 *
 * `align-items: start` rather than centre, because a title can wrap to two lines and the control
 * should stay level with the first of them - it belongs to the heading, not to the block.
 */
export const titleRowStyles = css`
  .title-row {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--openish-space-md);
  }

  .title-row > :first-child {
    min-width: 0;
  }
`

/** Visually hidden but available to assistive technology. */
export const visuallyHidden = css`
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
`

/**
 * The dense key-and-value grammar the request panel is built from.
 *
 * One table, hairlines, and borderless inputs that fill their cell. Every kind of thing a reader
 * supplies - a credential, a header, a query parameter, a body - is the same shape, because they are
 * the same kind of thing: a name and a value that will be on the wire. Giving each its own bordered
 * box and its own label above it, which is what this replaced, turned nine short facts into a page.
 */
export const rowStyles = css`
  .rows {
    border: 1px solid var(--openish-color-border);
    border-radius: var(--openish-radius-md);
    overflow: hidden;
  }

  .group {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--openish-space-xs);
    padding: var(--openish-space-3xs) var(--openish-space-xs);
    background: var(--openish-color-surface-raised);
    border-top: 1px solid var(--openish-color-border);
    font: var(--openish-font-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--openish-color-text-muted);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(6rem, 13rem) minmax(0, 1fr);
    border-top: 1px solid var(--openish-color-border);
  }

  /* The first band, whichever kind it is, sits flush against the container's own border. */
  .rows > :first-child {
    border-top: 0;
  }

  /*
   * The name is set smaller than the value beside it. A reader scans values and reads a name only
   * when they need to know which field they are in, so the name is the quieter of the two.
   */
  .key {
    display: flex;
    align-items: center;
    gap: var(--openish-space-3xs);
    padding: var(--openish-space-2xs) var(--openish-space-xs);
    border-right: 1px solid var(--openish-color-border);
    background: var(--openish-color-surface);
    font: var(--openish-font-micro);
    font-family: var(--openish-font-family-mono);
    color: var(--openish-color-text-muted);
    overflow-wrap: anywhere;
  }

  .value {
    display: flex;
    align-items: center;
    gap: var(--openish-space-2xs);
    min-width: 0;
    padding-right: var(--openish-space-3xs);
  }

  /*
   * Borderless, because the cell already has edges. A second border inside one is the single
   * biggest source of the noise this layout exists to remove.
   */
  .value input[type='text'],
  .value input[type='password'],
  .value select,
  .value textarea {
    flex: 1;
    min-width: 0;
    padding: var(--openish-space-3xs) var(--openish-space-xs);
    border: 0;
    background: none;
    color: var(--openish-color-text);
    font: var(--openish-font-code-small);
  }

  /*
   * These controls fill their cell, so the ring goes inside it.
   *
   * Not a different ring - the same one, with its offset negated. The focus foundation allows
   * exactly this for an element with no visible container of its own, which is what a borderless
   * input in a bordered cell is. Redeclaring the token rather than rewriting the rule is what keeps
   * it the same ring: change the width or the colour once and this follows.
   */
  .value :where(input, select, textarea) {
    --openish-focus-ring-offset: calc(-1 * var(--openish-focus-ring-width));
  }

  .required {
    color: var(--openish-color-danger);
  }

  .note {
    padding: 0 var(--openish-space-xs) var(--openish-space-3xs);
    grid-column: 2;
    font: var(--openish-font-micro);
    color: var(--openish-color-text-muted);
  }
`

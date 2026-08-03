import { css } from 'lit'

/**
 * Styles shared across the site's own elements.
 *
 * Everything here reads `--openish-*` and nothing else, which is the whole point: the site is
 * themed by the same tokens as the thing it documents, so a page and the reference embedded in it
 * cannot disagree about what a border or a muted label looks like. A documentation site whose
 * chrome drifts from its subject is hiding exactly the problems it exists to surface.
 *
 * These are restated rather than imported. `packages/elements/src/styles/shared.ts` is internal to
 * that package and not part of its public entry, and reaching past a package's exports to share a
 * stylesheet would make the site a second consumer of something nobody promised to keep. The tokens
 * are the contract; the rules are cheap.
 */
export const siteStyles = css`
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
   * One focus ring, drawn as an outline.
   *
   * The same rule as the elements', for the same reasons: an outline follows each element's own
   * border-radius without being told what it is, and it survives a forced-colors mode where a
   * box-shadow is dropped entirely. guard:focus scans this directory, so a page that removes it
   * fails the build - which is the correct outcome on a site with an accessibility page.
   */
  :where(a, button, select, input, textarea, [tabindex]):focus-visible {
    outline: var(--openish-focus-ring-width) var(--openish-focus-ring-style)
      var(--openish-focus-ring-color);
    outline-offset: var(--openish-focus-ring-offset);
  }

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
 * The six states a control is in exactly one of, restated for the site's buttons.
 *
 * The elements get these from a constructed stylesheet adopted into a shadow root. The site's
 * buttons are in the site's own shadow roots, so they cannot adopt that one - but they can be built
 * from the same tokens, which is the half that has to match.
 */
export const siteControlStyles = css`
  button {
    font: var(--openish-font-body);
    color: var(--openish-color-text);
    background: var(--openish-color-surface-raised);
    border: var(--openish-border-action-width) solid var(--openish-border-action-color);
    border-radius: var(--openish-radius-md);
    padding: var(--openish-space-2xs) var(--openish-space-sm);
    cursor: pointer;
  }

  button:hover {
    box-shadow: inset 0 0 0 100vmax var(--openish-state-hover-tint);
  }

  button:active {
    box-shadow: inset 0 0 0 100vmax var(--openish-state-active-tint);
  }

  button[disabled] {
    cursor: default;
    color: var(--openish-color-text-disabled);
    background: var(--openish-color-surface-disabled);
  }
`

/**
 * Running prose.
 *
 * The site writes its own paragraphs rather than rendering markdown for them, so the typography is
 * a stylesheet rather than a component. `<openish-markdown>` is used where a page is *about* the
 * markdown pipeline - it pulls the deferred highlight chunk with it, which is a cost worth paying
 * deliberately and not by default.
 */
export const siteProseStyles = css`
  h1 {
    font: var(--openish-font-heading-1);
    margin: 0 0 var(--openish-space-sm);
  }

  h2 {
    font: var(--openish-font-heading-2);
    margin: var(--openish-space-xl) 0 var(--openish-space-sm);
  }

  h3 {
    font: var(--openish-font-heading-3);
    margin: var(--openish-space-lg) 0 var(--openish-space-xs);
  }

  p {
    margin: 0 0 var(--openish-space-md);
    max-width: 68ch;
  }

  /*
   * The theme has no "large body" token, and inventing one here would be the site quietly growing a
   * palette of its own. A lede is the body font, in the muted colour, given room.
   */
  .lede {
    font: var(--openish-font-body);
    color: var(--openish-color-text-muted);
    max-width: 68ch;
    margin: 0 0 var(--openish-space-lg);
  }

  ul,
  ol {
    margin: 0 0 var(--openish-space-md);
    padding-inline-start: var(--openish-space-lg);
    max-width: 68ch;
  }

  li {
    margin-bottom: var(--openish-space-2xs);
  }
`

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

  a:focus-visible,
  button:focus-visible {
    outline: none;
    box-shadow: var(--openish-focus-ring);
    border-radius: var(--openish-radius-sm);
  }

  code {
    font: var(--openish-font-code);
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

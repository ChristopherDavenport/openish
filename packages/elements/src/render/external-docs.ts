import { asExternalDocs } from '@openish/core'
import { css, html, nothing } from 'lit'

/**
 * Styles for {@link renderExternalDocs}. Add to any element that renders one.
 *
 * The template is a function rather than an element because a link is not worth a shadow root, and
 * because four different elements render one in four different places on their own pages - a
 * component would have to be told where it was every time.
 */
export const externalDocsStyles = css`
  .external-docs {
    margin: var(--openish-space-sm) 0 0;
    font: var(--openish-font-small);
  }

  .external-docs::after {
    content: ' ↗';
    color: var(--openish-color-text-muted);
  }
`

/**
 * An External Documentation Object as a link.
 *
 * `description` is the link text where the author wrote one, because it is the sentence they chose
 * for exactly this - and `fallback` names the thing being documented where they did not, since
 * "Learn more" on a page with four of them tells the reader nothing about which is which.
 *
 * `rel="noreferrer noopener"` because this is an address out of the document and openish has no
 * reason to hand the destination the reader's current page.
 */
export const renderExternalDocs = (value: unknown, fallback = 'More documentation'): unknown => {
  const docs = asExternalDocs(value)
  if (!docs) {
    return nothing
  }

  return html`
    <p class="external-docs">
      <a href=${docs.url} rel="noreferrer noopener">${docs.description ?? fallback}</a>
    </p>
  `
}

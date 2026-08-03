import type { MediaTypeExample } from '@openish/core'
import { css, html, nothing, type TemplateResult } from 'lit'
import { repeat } from 'lit/directives/repeat.js'

/**
 * The examples an author wrote for one short value, inline.
 *
 * A parameter's value is short by nature, and so is a response header's, so these are a list rather
 * than the picker a request body gets - three values one under the other are easier to compare than
 * three behind a control.
 *
 * Shared because a parameter and a response header carry `example`/`examples` in exactly the shape a
 * media type does, which is why `mediaTypeExamples` reads all three. The list was written for the
 * parameter table; the header table was rendering none of it, and a near-copy is how two lists that
 * are the same idea start looking different.
 */
export const renderExampleList = (examples: readonly MediaTypeExample[]): TemplateResult | typeof nothing => {
  if (examples.length === 0) {
    return nothing
  }

  return html`
    <ul class="examples">
      ${repeat(
        examples,
        (example) => example.name,
        (example) => html`
          <li>
            ${example.value === undefined
              ? html`<a href=${example.externalValue ?? ''} rel="noreferrer noopener">${example.externalValue}</a>`
              : html`<code
                  >${typeof example.value === 'string' ? example.value : JSON.stringify(example.value)}</code
                >`}
            ${example.summary ?? example.name
              ? html`<span class="example-name"> — ${example.summary ?? example.name}</span>`
              : nothing}
          </li>
        `,
      )}
    </ul>
  `
}

/** The list's own styles, for the element that renders it into its shadow root. */
export const exampleListStyles = css`
  ul.examples {
    margin: var(--openish-space-3xs) 0 0;
    padding: 0;
    list-style: none;
    font: var(--openish-font-micro);
  }

  ul.examples code {
    font-family: var(--openish-font-family-mono);
  }

  ul.examples .example-name {
    color: var(--openish-color-text-muted);
  }
`

import { authorAside, authorSamples, type AuthorSample } from '@openish/core'
import { css, html, nothing } from 'lit'

import type { OpenishTab } from '../elements/openish-tabs.js'
import '../elements/openish-code-block.js'
import '../elements/openish-markdown.js'
import '../elements/openish-tabs.js'

/**
 * Styles for {@link renderAside}. Add to any element that renders one.
 *
 * A function rather than an element, the way `renderExternalDocs` is: what it draws is prose and a
 * code block, both of which are already elements with their own shadow roots, and a wrapper around
 * them would exist only to be passed the same two values.
 */
export const asideStyles = css`
  .aside > :first-child {
    margin-top: 0;
  }

  .aside openish-code-block,
  .aside openish-tabs {
    display: block;
    margin-top: var(--openish-space-md);
  }
`

/** Whether a section has anything an author wrote for its examples column. */
export const hasAside = (source: unknown): boolean =>
  authorAside(source) !== undefined || authorSamples(source as object | undefined).length > 0

const renderSample = (sample: AuthorSample) => html`
  <openish-code-block
    exportparts="code, code-toolbar, copy"
    language=${sample.language}
    label=${sample.label}
    .code=${sample.source}
  ></openish-code-block>
`

/**
 * What an author wrote for this section's examples column: prose, curated samples, or both.
 *
 * The two halves answer the questions an operation's column answers for an operation, on a section
 * that has no request to generate either from. `x-openish-aside` is the prose - where to start, what
 * every call needs - and `x-codeSamples` is the same extension an operation already uses, read from
 * `info` or a Tag Object instead. An author who has written one for an operation has learnt this
 * one too.
 *
 * Several samples become a tab set rather than a stack, because they are one example in several
 * languages and a reader wants the one they work in. One sample is just shown: a one-tab tablist is
 * a control that cannot do anything.
 *
 * `headingOffset` is the section's own level, for the same reason `info.description` takes one: an
 * author writing `##` in an aside is writing a subheading of the section they are beside, and a
 * heading that outranked the section's title would be an accessibility defect rather than a
 * styling one.
 *
 * The panels are `<openish-code-block>` rather than a template, because a tab panel renders inside
 * `<openish-tabs>`'s own shadow root - anything that is not a component arrives there unstyled.
 */
export const renderAside = (source: unknown, headingOffset = 1): unknown => {
  const markdown = authorAside(source)
  const samples = authorSamples(source as object | undefined)
  if (markdown === undefined && samples.length === 0) {
    return nothing
  }

  const tabs: OpenishTab[] = samples.map((sample) => ({
    id: sample.id,
    label: sample.label,
    content: () => renderSample(sample),
  }))

  return html`
    <div class="aside" part="aside">
      ${markdown === undefined
        ? nothing
        : html`<openish-markdown .markdown=${markdown} .headingOffset=${headingOffset}></openish-markdown>`}
      ${samples.length === 1
        ? renderSample(samples[0]!)
        : samples.length > 1
          ? html`<openish-tabs label="Examples" .tabs=${tabs}></openish-tabs>`
          : nothing}
    </div>
  `
}

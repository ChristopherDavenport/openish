import { getResolvedRef, mediaTypeExamples, type VariantChoices } from '@openish/core'
import { html, nothing } from 'lit'
import { ifDefined } from 'lit/directives/if-defined.js'

import { pickMediaType } from './responses.js'
import type { OpenishTab } from '../elements/openish-tabs.js'
import '../elements/openish-schema-preview.js'
import '../elements/openish-tabs.js'

export { languageForMediaType } from './media-language.js'
export { hasRenderableContent } from './responses.js'

type MediaType = {
  schema?: unknown
  example?: unknown
  examples?: Record<string, unknown>
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The example to show for a media type, when only one of them can be shown.
 *
 * Kept for callers that have nowhere to put a picker - the code sample and the try-it editor both
 * need a single body to fill in. Everything that renders a *reader-facing* example goes through
 * `mediaTypeExamples` instead and offers all of them. An entry that is only an `externalValue` has
 * no inline value to hand back, so this skips to the next one that does.
 *
 * Returning `undefined` lets `<openish-schema-preview>` generate one from the schema instead.
 */
export const mediaTypeExample = (media: MediaType | undefined): unknown =>
  mediaTypeExamples(media).find((example) => example.value !== undefined)?.value

/** How to render a `content` map. */
export type MediaTypesOptions = {
  /** Show the schema only. For a body the reader can already see filled in and edit. */
  noExample?: boolean
  /** Show the example only. For an examples column beside the page that documents the schema. */
  noSchema?: boolean
  /**
   * Which media type to show, for a caller that holds the choice rather than leaving it here.
   *
   * A request body's tabs are not only a way to read the schema: what a reader picks there is what
   * the sample beside them should be a sample *of*. That answer lives on the operation, because two
   * controls ask the same question - these tabs and the try-it panel's picker - and a page with two
   * answers to it was the bug this exists to fix.
   */
  selected?: string
  /** Told when the reader picks a tab. Responses leave it unset: nothing outside them follows. */
  onSelect?: (mediaType: string) => void
  /**
   * Render one media type and no tabs at all.
   *
   * The examples column asks for this. Which content type an operation is being read in is a
   * question with one answer per section, and it is asked in the documentation column - so repeating
   * the control beside the example gave the reader two of them to keep in agreement. What is left
   * here is the example itself, under a caption naming the type it is in.
   */
  pick?: string
  /**
   * Drop the caption naming the media type, for a caller whose own control already says it.
   *
   * The caption exists so a block that was picked *elsewhere* still says what it is. Where the thing
   * that picked it is a select on the heading directly above, the caption is that select's value
   * printed a second time.
   */
  hideLabel?: boolean
  /** Which shape these previews are, so a variant choice inside one can be addressed. */
  scope?: string
  /** The `oneOf`/`anyOf` branches the reader picked, for the example to honour. */
  variants?: VariantChoices
}

/**
 * A `content` map, rendered as one schema per media type.
 *
 * More than one media type becomes a tab set, because the alternative - stacking three renderings
 * of nearly the same schema - buries the response that follows. A single media type is just shown,
 * labelled, since a one-tab tablist is a control that cannot do anything.
 *
 * Every tree this builds arrives closed, named by its type. This is the one place that decision is
 * made, and it is made here because everything downstream of it is a body: a request body, a
 * response, a callback's request. A model's own section mounts `<openish-schema>` directly and is
 * untouched, which is the distinction - a body is an aside about a shape, a model section *is* one.
 */
export const renderMediaTypes = (content: unknown, label: string, options: MediaTypesOptions = {}): unknown => {
  if (!isPlainObject(content)) {
    return nothing
  }

  const entries = Object.entries(content)
  if (entries.length === 0) {
    return nothing
  }

  const preview = (mediaType: string, raw: unknown, showLabel: boolean) => {
    const media = getResolvedRef(raw) as MediaType | undefined
    return html`
      <openish-schema-preview
        collapse-root
        ?no-example=${options.noExample === true}
        ?no-schema=${options.noSchema === true}
        label=${ifDefined(showLabel ? mediaType : undefined)}
        media-type=${mediaType}
        scope=${ifDefined(options.scope || undefined)}
        .schema=${media?.schema}
        .examples=${mediaTypeExamples(media)}
        .variants=${options.variants}
      ></openish-schema-preview>
    `
  }

  /*
   * One media type, chosen elsewhere. Falls back to the first the document declares, because a
   * response that does not offer the type the reader picked for its neighbours still has to show
   * the one it does offer.
   */
  if (options.pick !== undefined) {
    const name = pickMediaType(content, options.pick)
    const picked = entries.find(([mediaType]) => mediaType === name) ?? entries[0]!
    return preview(picked[0], picked[1], options.hideLabel !== true)
  }

  const [only] = entries
  if (entries.length === 1 && only) {
    return preview(only[0], only[1], options.hideLabel !== true)
  }

  const tabs: OpenishTab[] = entries.map(([mediaType, raw]) => ({
    id: mediaType,
    label: mediaType,
    content: () => preview(mediaType, raw, false),
  }))

  return html`
    <openish-tabs
      label=${label}
      selected=${ifDefined(options.selected || undefined)}
      .tabs=${tabs}
      @openish-tab-change=${(event: CustomEvent<string>) => options.onSelect?.(event.detail)}
    ></openish-tabs>
  `
}

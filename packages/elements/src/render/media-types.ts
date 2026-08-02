import { getResolvedRef, mediaTypeExamples } from '@openish/core'
import { html, nothing } from 'lit'
import { ifDefined } from 'lit/directives/if-defined.js'

import type { OpenishTab } from '../elements/openish-tabs.js'
import '../elements/openish-schema-preview.js'
import '../elements/openish-tabs.js'

type MediaType = {
  schema?: unknown
  example?: unknown
  examples?: Record<string, unknown>
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The highlight language for a media type.
 *
 * Only consulted for an example the author wrote as a *string*: anything openish generates is
 * serialised as JSON whatever the media type claims, and highlighting that as XML would produce
 * confident nonsense.
 */
export const languageForMediaType = (mediaType: string): string => {
  const type = mediaType.toLowerCase()
  if (type.includes('json')) {
    return 'json'
  }
  if (type.includes('yaml') || type.includes('yml')) {
    return 'yaml'
  }
  if (type.includes('html')) {
    return 'html'
  }
  if (type.includes('xml')) {
    return 'xml'
  }
  if (type.includes('javascript')) {
    return 'javascript'
  }
  return 'plaintext'
}

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
}

/**
 * A `content` map, rendered as one schema per media type.
 *
 * More than one media type becomes a tab set, because the alternative - stacking three renderings
 * of nearly the same schema - buries the response that follows. A single media type is just shown,
 * labelled, since a one-tab tablist is a control that cannot do anything.
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
        ?no-example=${options.noExample === true}
        ?no-schema=${options.noSchema === true}
        label=${ifDefined(showLabel ? mediaType : undefined)}
        language=${languageForMediaType(mediaType)}
        .schema=${media?.schema}
        .examples=${mediaTypeExamples(media)}
      ></openish-schema-preview>
    `
  }

  const [only] = entries
  if (entries.length === 1 && only) {
    return preview(only[0], only[1], true)
  }

  const tabs: OpenishTab[] = entries.map(([mediaType, raw]) => ({
    id: mediaType,
    label: mediaType,
    content: () => preview(mediaType, raw, false),
  }))

  return html`<openish-tabs label=${label} .tabs=${tabs}></openish-tabs>`
}

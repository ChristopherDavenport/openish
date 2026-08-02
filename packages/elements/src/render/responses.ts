import { getResolvedRef } from '@openish/core'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Whether a body has anything for an examples column to show.
 *
 * Asked before the section is written, not after: `renderMediaTypes` on an empty `content` renders
 * nothing, so a section that assumed otherwise stood over a blank half-page - under a "Response
 * examples" heading when it had one, and as an empty named region since.
 * A `204` is the usual reason and a complete answer in the documentation column, and a webhook whose
 * payload is described in prose alone is the other.
 *
 * Takes the containing object - a Response Object, a Request Body Object, either possibly a `$ref` -
 * because `content` is the key both of them hold it under.
 *
 * Here rather than in `media-types.ts`, which re-exports it: this module is the one that decides
 * which responses are worth showing, and having it import that answer from the module that imports
 * *this* one would be a cycle.
 */
export const hasRenderableContent = (container: unknown): boolean => {
  const content = (getResolvedRef(container) as { content?: unknown } | undefined)?.content
  return isPlainObject(content) && Object.keys(content).length > 0
}

/**
 * A Responses Object as a list, in the order a reader meets it.
 *
 * `default` sorts last however the document ordered it: it is the fallback, and reading it first
 * tells you nothing about what the operation normally does.
 *
 * Here rather than inside `<openish-response-list>` because two things now need the same answer.
 * The list renders the tabs; the operation has to know which response is *showing* in order to ask
 * for it in the request sample's `Accept`. Two copies of "which status, and in what order" would be
 * two copies that drift, and the reader would find a sample asking for a media type from a response
 * they are not looking at.
 */
export const responseEntries = (
  responses: unknown,
  options: { withContentOnly?: boolean } = {},
): Array<[string, unknown]> => {
  if (!isPlainObject(responses)) {
    return []
  }

  /*
   * A `204` has a description and no body, which is a complete answer in the documentation column
   * and an empty tab in the examples one. So a caller showing examples asks for the statuses that
   * actually carry one - the reader is not missing anything, because the status is still on a tab
   * beside the description.
   */
  const entries = Object.entries(responses).filter(
    ([, raw]) => options.withContentOnly !== true || hasRenderableContent(raw),
  )

  return [
    ...entries.filter(([status]) => status !== 'default'),
    ...entries.filter(([status]) => status === 'default'),
  ]
}

/**
 * The media type a `content` map is being read in: the one asked for, else the first declared.
 *
 * The same fallback `renderMediaTypes`' `pick` applies, and for the same reason - a `404` that is
 * only ever JSON still has to show something when the reader has chosen XML for its neighbours.
 */
export const pickMediaType = (content: unknown, preferred: string): string | undefined => {
  if (!isPlainObject(content)) {
    return undefined
  }
  const keys = Object.keys(content)
  return keys.find((key) => key === preferred) ?? keys[0]
}

/**
 * The `content` of the response the section is showing, whichever status that is.
 *
 * Two things ask it. The sample's `Accept` needs the media type inside it, and the picker beside the
 * `Returns` heading needs the whole map - it offers the types *this* response declares, because a
 * `404` that is only ever JSON must not be offered the XML its neighbour has.
 */
export const shownResponseContent = (responses: unknown, status: string): unknown => {
  const entries = responseEntries(responses, { withContentOnly: true })
  const shown = entries.find(([code]) => code === status) ?? entries[0]
  return shown === undefined
    ? undefined
    : (getResolvedRef(shown[1]) as { content?: unknown } | undefined)?.content
}

/**
 * What the examples column is showing: the response, and the media type it is being read in.
 *
 * Undefined when the operation answers with nothing that has a body - a `204`-only operation has no
 * response type to ask for, and a sample that invented one would be describing a different API.
 */
export const shownResponseMediaType = (
  responses: unknown,
  status: string,
  mediaType: string,
): string | undefined => {
  const content = shownResponseContent(responses, status)
  return content === undefined ? undefined : pickMediaType(content, mediaType)
}

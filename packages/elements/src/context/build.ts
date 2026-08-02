import { credentialsFrom, type AuthSession } from '@openish/client'
import { resolveServerUrl, type DocumentStore, type ResolvedSource } from '@openish/core'

import type { OpenishRequestState } from './contexts.js'

/**
 * The derivations behind the provided contexts, with the element taken out of them.
 *
 * Only the two that actually compute something live here. `uiContext`'s value is nine fields the
 * root already holds, and wrapping that in a nine-argument function would be a layer rather than a
 * simplification - it stays a literal in `willUpdate`, where a reader can see every field's source
 * at once.
 */

/**
 * The sources, with a generated title replaced by the document's own once it has loaded.
 *
 * A host that named its documents gets exactly those names. One that did not gets `API #2` in the
 * picker until the document arrives and then what the document calls itself, which is the name the
 * reader would recognise. The slug never moves - it is in every URL - so this is a label change and
 * nothing more.
 *
 * The array's identity is preserved when nothing needs renaming, which is what keeps
 * `sameSourcesState` from reporting a change on every update.
 */
export const titledSources = (
  sources: readonly ResolvedSource[],
  stores: ReadonlyMap<string, DocumentStore>,
): readonly ResolvedSource[] => {
  if (!sources.some((source) => source.titleIsGenerated)) {
    return sources
  }

  return sources.map((source) => {
    const title = stores.get(source.slug)?.document.info?.title
    return source.titleIsGenerated && title ? { ...source, title } : source
  })
}

/**
 * What it would take to actually call the API being described.
 *
 * The one derivation in it is `serverUrl`: the reader picks a template, and a template with
 * `{variables}` still in it is not something a request can be built against. A server the host
 * supplied rather than the document has no variable definitions to resolve, so it stands as it is.
 */
export const buildRequestState = (input: {
  readonly store: DocumentStore | undefined
  readonly server: string
  readonly serverVariables: Record<string, string>
  readonly session: AuthSession
}): OpenishRequestState => {
  const declared = input.store?.document.servers?.find((candidate) => candidate.url === input.server)
  const grants = input.session.snapshot()

  return {
    server: input.server,
    serverVariables: input.serverVariables,
    serverUrl: declared ? resolveServerUrl(declared, input.serverVariables) : input.server,
    credentials: credentialsFrom(grants),
    grants,
  }
}

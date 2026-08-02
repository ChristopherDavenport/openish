import type { ResolvedOpenishConfig } from '@openish/core'

/** The shape of a server entry, from either the document or the host's config. */
type ServerLike = { readonly url?: string | undefined }

/**
 * The server templates on offer, in their own order.
 *
 * A host's list *replaces* the document's rather than adding to it. "Both" would leave a reader
 * choosing between environments the host has already decided are not on offer.
 *
 * A relative server is only meaningful against something, and `baseServerURL` is that something.
 */
export const documentServers = (
  config: Pick<ResolvedOpenishConfig, 'servers' | 'baseServerURL'>,
  declared: readonly ServerLike[] | undefined,
): string[] => {
  const servers = config.servers.length > 0 ? config.servers : (declared ?? [])
  const base = config.baseServerURL

  return servers
    .map((server) => server.url ?? '')
    .filter((url) => url !== '')
    .map((url) => (base && url.startsWith('/') ? `${base.replace(/\/$/, '')}${url}` : url))
}

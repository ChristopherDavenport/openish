/**
 * The reader's code-sample client, remembered across reloads.
 *
 * The only thing openish stores on a reader's machine, and only when `config.persistClient` asks it
 * to. Everything else a reader does here is deliberately not persisted: tokens live in memory for
 * the life of the page, because how long a credential survives is a decision with a threat model
 * attached and belongs to the host. A client choice has no such weight - it is a display preference
 * - so the host can switch it on and openish will keep it.
 *
 * Every access is wrapped, because `localStorage` is not always there to be used: a sandboxed iframe
 * without `allow-same-origin` throws on the *getter*, and a browser configured to refuse storage
 * throws on write. Neither is a reason for a documentation page to stop rendering, so a failure here
 * means the preference is simply not remembered.
 */
const KEY = 'openish:client'

export const readStoredClient = (): string | undefined => {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

export const writeStoredClient = (client: string): void => {
  try {
    globalThis.localStorage?.setItem(KEY, client)
  } catch {
    /* Storage refused. The choice still applies for this page's lifetime. */
  }
}

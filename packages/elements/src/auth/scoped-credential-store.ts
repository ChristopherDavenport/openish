import type { CredentialStore } from '@openish/client'

/**
 * Separates one document's slug from a scheme name inside a stored key.
 *
 * A slash, because it cannot appear in a security scheme name - OpenAPI keys `securitySchemes` from
 * a pattern that admits only letters, digits, `.`, `-` and `_` - so there is no escaping to get
 * wrong, and because a slash is already what this project uses to say "inside".
 */
const MARK = '/'

/**
 * A view of the host's credential store scoped to one document.
 *
 * `CredentialStore` is a single `Record<scheme, Grant>`, which is right for a reference showing one
 * document and wrong for several: two documents both declaring `oauth2` are usually two different
 * authorization servers, and sharing the record would send one API's token to the other. This wraps
 * the host's store so each document reads and writes only its own entries, and a write from one
 * leaves the others intact.
 *
 * Only used when the host configured `sources`. A reference configured with `url` or `spec` is
 * handed the host's store untouched, so whatever it has already persisted still reads back.
 */
export const scopedCredentialStore = (store: CredentialStore, slug: string): CredentialStore => {
  const prefix = `${slug}${MARK}`
  const mine = ([key]: [string, unknown]) => key.startsWith(prefix)
  const theirs = (entry: [string, unknown]) => !mine(entry)

  return {
    read: () =>
      Object.fromEntries(
        Object.entries(store.read() ?? {})
          .filter(mine)
          .map(([key, grant]) => [key.slice(prefix.length), grant]),
      ),

    write: (grants) => {
      const others = Object.entries(store.read() ?? {}).filter(theirs)
      const ours = Object.entries(grants).map(([scheme, grant]) => [`${prefix}${scheme}`, grant] as const)
      store.write(Object.fromEntries([...others, ...ours]))
    },

    clear: () => {
      /*
       * Clearing one document must not sign the reader out of the others, so this is a rewrite of
       * what remains rather than a `clear()` - and a real `clear()` only when nothing remains, so an
       * emptied store is emptied rather than left holding `{}`.
       */
      const others = Object.entries(store.read() ?? {}).filter(theirs)
      if (others.length === 0) {
        store.clear()
        return
      }
      store.write(Object.fromEntries(others))
    },
  }
}

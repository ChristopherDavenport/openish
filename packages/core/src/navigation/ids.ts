import { slugify } from '@scalar/helpers/string/slugify'

/**
 * The source of a URL segment, and whether the author chose it as an identifier.
 *
 * The distinction cannot be inferred from the string: a heading of `Authentication` and an
 * `operationId` of `Authentication` are the same characters, but only one of them should keep its
 * capital letter in a URL. Only the caller knows which it is holding, so it says so.
 */
export type SlugSource = {
  value: string
  /**
   * `true` for `operationId` and schema names - identifiers the document author picked and expects
   * to recognise in a URL, so `PaymentIntent` stays `PaymentIntent` instead of collapsing to the
   * unreadable `paymentintent`. `false` for prose (summaries, tag titles, headings), which is
   * slugified: `List all accounts` becomes `list-all-accounts`.
   */
  identifier: boolean
}

export const asIdentifier = (value: string): SlugSource => ({ value, identifier: true })
export const asProse = (value: string): SlugSource => ({ value, identifier: false })

/** Characters that can appear in a URL path segment without escaping. */
const URL_SAFE = /^[A-Za-z0-9_.~-]+$/

/**
 * Mints the ids that double as URL slugs.
 *
 * An id is the node's full path with no leading slash - `tags/accounts/listAccounts`,
 * `models/PaymentIntent` - so the router can resolve a URL to a node with a single map lookup
 * instead of re-walking the document.
 *
 * Collisions are real: two operations under one tag can share a summary, and slugifying discards
 * the punctuation that told them apart. The registry appends `-2`, `-3` in document order, so ids
 * stay unique and stable across runs of the same document.
 */
export class SlugRegistry {
  readonly #used = new Set<string>()

  /**
   * @param prefix Path segments already claimed by the parent, e.g. `tags/accounts`.
   * @param source The text to build the segment from, and how to treat it.
   * @param fallback Used when the source yields nothing (emoji-only summaries, empty strings).
   */
  claim(prefix: string, source: SlugSource, fallback = 'untitled'): string {
    const trimmed = source.value.trim()
    /* An "identifier" that would need escaping is not usable as-is; slugify it anyway. */
    const keepAsIs = source.identifier && URL_SAFE.test(trimmed)
    const base = (keepAsIs ? trimmed : slugify(trimmed)) || fallback

    const withPrefix = (segment: string) => (prefix ? `${prefix}/${segment}` : segment)

    let candidate = withPrefix(base)
    let suffix = 2
    while (this.#used.has(candidate)) {
      candidate = withPrefix(`${base}-${suffix}`)
      suffix += 1
    }

    this.#used.add(candidate)
    return candidate
  }
}

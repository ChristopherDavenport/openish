/**
 * The extension carrying prose an author wrote for a section's examples column.
 *
 * Namespaced, unlike everything else openish reads, and that is the point: `x-codeSamples` and
 * `x-tags` are conventions several tools already share, so openish honours the spelling that exists.
 * This one has no convention to honour - no other reference has a column to put it in - so it takes
 * a name that says whose it is rather than squatting on a plain one another tool may later want.
 */
const ASIDE = 'x-openish-aside'

/**
 * What an author wants beside a section rather than under its title.
 *
 * The examples column is generated for everything that has an instance to show - a request, a
 * response, a payload, a schema filled in. A tag and the introduction have none, so the band that
 * runs down the page stops at exactly the sections whose authors have the most to say: where to
 * start, which header every call needs, what the sandbox is for. This is the way to say it.
 *
 * Markdown, because that is what the rest of a document's prose is: `info.description`, a tag's
 * `description`, and a schema's are all markdown, and an aside that was plain text would be the one
 * place an author could not write a link.
 *
 * Read from any object the document has - `info`, a Tag Object - because the answer is the same
 * shape wherever it is asked.
 */
export const authorAside = (source: unknown): string | undefined => {
  if (typeof source !== 'object' || source === null) {
    return undefined
  }

  const declared = (source as Record<string, unknown>)[ASIDE]
  return typeof declared === 'string' && declared.trim() !== '' ? declared : undefined
}

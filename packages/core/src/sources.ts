import { slugify } from '@scalar/helpers/string/slugify'

import type { ResolvedSource, SourceConfig } from './types.js'

/**
 * Decides the slug and title of every document a reference offers.
 *
 * This is openish's port of Scalar's `normalizeConfigurations`, minus the parts that exist to fold
 * their several configuration spellings into one: openish has a single `sources` array, so there is
 * nothing to flatten. What is kept is the naming, deliberately, so a Scalar `sources` array produces
 * the same slugs here and a host moving between the two keeps its URLs.
 *
 * A source that names neither a `url` nor `content` describes no document and is dropped, which is
 * also what Scalar does. It matters because the alternative is an entry in the picker that can only
 * ever fail to load.
 */
export const resolveSources = (sources: readonly SourceConfig[]): ResolvedSource[] => {
  const usable = sources.filter((source) => source.url?.trim() || source.content)
  const used = new Set<string>()

  const claim = (base: string): string => {
    /*
     * The same collision loop `SlugRegistry` uses, and for a stronger reason: a slug is the first
     * segment of every id in the document beneath it, so two sources sharing one would not collide
     * on a single page, they would collide on all of them.
     */
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    used.add(candidate)
    return candidate
  }

  const resolved = usable.map((source, index): ResolvedSource => {
    /*
     * `title` names it and `slug` addresses it, so either can stand in for the other - but only a
     * generated pair is generated together. A host that gave one and not the other gets the one it
     * gave, echoed, rather than `API #2` next to a slug it chose.
     */
    /*
     * Only an explicit `title` counts as the host having named the document. A `slug` is an address,
     * and it stands in as a placeholder label - but a placeholder is exactly what the element layer
     * should replace with the document's own `info.title` once there is one to read.
     */
    const named = source.title?.trim()
    const title = named || source.slug?.trim() || `API #${index + 1}`
    const chosen = source.slug?.trim() || slugify(title)

    return {
      slug: claim(chosen || `api-${index + 1}`),
      title,
      titleIsGenerated: !named,
      url: source.url?.trim() ?? '',
      isDefault: false,
      content: source.content,
      config: source.config,
    }
  })

  /* The document shown when the URL names none: the one that asked, else the first. */
  const defaultIndex = Math.max(
    usable.findIndex((source) => source.default),
    0,
  )

  return resolved.map((source, index) => ({ ...source, isDefault: index === defaultIndex }))
}

import galaxyUrl from '@scalar/galaxy/latest.yaml?url'

export type SpecSource = {
  /** The whole URL or filename, for the toolbar chip. */
  label: string
  /**
   * A short name, for the picker and therefore for the URL segment.
   *
   * The full label would slugify into the whole URL - `http1270015399consumeryaml` - which is a
   * terrible thing to put in front of every id. `undefined` leaves it to openish, which fills in the
   * document's own `info.title` once it has parsed one.
   */
  name: string | undefined
  text: string
}

/** The last path segment without its extension: `/a/b/consumer.yaml` becomes `consumer`. */
const shortName = (url: string): string | undefined =>
  url.split(/[?#]/)[0]?.split('/').filter(Boolean).pop()?.replace(/\.(ya?ml|json)$/i, '')

/**
 * What the playground is showing: one document, or several with a picker.
 *
 * Two shapes rather than always the array, because the two are genuinely different things to test.
 * A single document must keep the URLs it always had; several must namespace them. Collapsing them
 * here would mean the playground could only ever exercise one of those.
 */
export type PlaygroundSources = { kind: 'single'; source: SpecSource } | { kind: 'many'; sources: SpecSource[] }

const fetchText = async (url: string): Promise<SpecSource> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return { label: url, name: shortName(url), text: await response.text() }
}

/**
 * Where the playground gets its documents.
 *
 * No spec path is ever hardcoded beyond the bundled `@scalar/galaxy` example. Real documents -
 * including large institution-specific ones - are loaded ad hoc via `?url=` or the file picker, so
 * they never enter the repo. See scripts/guard-no-specs.mjs.
 *
 * `?url=` takes a comma-separated list, and the file picker takes several files, so the
 * multi-document path is reachable without committing anything.
 */
export const loadInitialSpec = async (): Promise<PlaygroundSources> => {
  const urls = (new URL(window.location.href).searchParams.get('url') ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)

  if (urls.length > 1) {
    return { kind: 'many', sources: await Promise.all(urls.map(fetchText)) }
  }

  if (urls.length === 1) {
    return { kind: 'single', source: await fetchText(urls[0]!) }
  }

  const response = await fetch(galaxyUrl)
  return {
    kind: 'single',
    source: { label: '@scalar/galaxy (example)', name: 'galaxy', text: await response.text() },
  }
}

export const loadSpecFromFiles = async (files: readonly File[]): Promise<PlaygroundSources> => {
  const sources = await Promise.all(
    files.map(async (file) => ({ label: file.name, name: shortName(file.name), text: await file.text() })),
  )
  return sources.length > 1 ? { kind: 'many', sources } : { kind: 'single', source: sources[0]! }
}

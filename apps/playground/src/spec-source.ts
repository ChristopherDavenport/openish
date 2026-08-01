import galaxyUrl from '@scalar/galaxy/latest.yaml?url'

export type SpecSource = {
  label: string
  text: string
}

/**
 * Where the playground gets a document.
 *
 * No spec path is ever hardcoded beyond the bundled `@scalar/galaxy` example. Real documents -
 * including large institution-specific ones - are loaded ad hoc via `?url=` or the file picker, so
 * they never enter the repo. See scripts/guard-no-specs.mjs.
 */
export const loadInitialSpec = async (): Promise<SpecSource> => {
  const url = new URL(window.location.href).searchParams.get('url')

  if (url) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    }
    return { label: url, text: await response.text() }
  }

  const response = await fetch(galaxyUrl)
  return { label: '@scalar/galaxy (example)', text: await response.text() }
}

export const loadSpecFromFile = async (file: File): Promise<SpecSource> => ({
  label: file.name,
  text: await file.text(),
})

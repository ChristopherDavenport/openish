/**
 * The document, as a file a reader can keep.
 *
 * What gets serialised is `store.raw` - the document *after* bundling external `$ref`s and upgrading
 * to 3.1, and *before* the magic proxy. That is a deliberate choice in both directions: the proxy
 * would serialise every reference into an expanded copy of whatever it points at, turning a 900 KB
 * document into something enormous and cyclic; and the upgraded form is the one the reference is
 * describing, so a reader who downloads it gets the document these pages were rendered from.
 *
 * A host that would rather hand over the exact published bytes sets `documentDownloadType: 'direct'`
 * and openish links `url` instead of serialising anything.
 */
export type DocumentFormat = 'json' | 'yaml'

/** The file extension and MIME type for a format, which a download needs both of. */
export const FORMAT_DETAILS: Record<DocumentFormat, { extension: string; mimeType: string }> = {
  json: { extension: 'json', mimeType: 'application/json' },
  yaml: { extension: 'yaml', mimeType: 'application/yaml' },
}

/**
 * Serialises the document.
 *
 * `yaml` is loaded on demand. It is already in the dependency graph - `@scalar/openapi-parser` parses
 * with it - but a page that never offers a download should not pay to have the *writer* in its first
 * chunk, and the same argument already applies to `@scalar/snippetz` and to `ajv`.
 */
export const serializeDocument = async (raw: unknown, format: DocumentFormat): Promise<string> => {
  if (format === 'json') {
    return JSON.stringify(raw, null, 2)
  }

  const { stringify } = await import('yaml')
  /*
   * `lineWidth: 0` disables folding. A folded description turns one paragraph into several lines
   * with different indentation, which is valid YAML and an unreadable diff against the file the
   * author maintains.
   */
  return stringify(raw, { lineWidth: 0 })
}

/**
 * A filename for the download, from the document's own title.
 *
 * Falls back to `openapi` rather than to something clever: a file called `untitled-api.yaml` in a
 * downloads folder is worse than one called `openapi.yaml`.
 */
export const documentFilename = (title: string | undefined, format: DocumentFormat): string => {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'openapi'}.${FORMAT_DETAILS[format].extension}`
}

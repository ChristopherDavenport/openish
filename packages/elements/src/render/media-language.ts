/**
 * The highlight language for a media type.
 *
 * Trustworthy now, which it was not: an example used to be serialised as JSON whatever the media
 * type claimed, so this had to be treated as a hint about author-written strings alone. `core`'s
 * `serializeExample` writes the example in the syntax the media type names, so the colours and the
 * bytes agree.
 *
 * A module of its own, small as it is, because `<openish-schema-preview>` needs it and
 * `render/media-types.ts` imports that element - so keeping it there would make the two files a
 * cycle. Nothing here renders, which is why it can sit below both of them.
 */
export const languageForMediaType = (mediaType: string): string => {
  const type = mediaType.toLowerCase()
  if (type.includes('json')) {
    return 'json'
  }
  if (type.includes('yaml') || type.includes('yml')) {
    return 'yaml'
  }
  if (type.includes('html')) {
    return 'html'
  }
  if (type.includes('xml')) {
    return 'xml'
  }
  if (type.includes('javascript')) {
    return 'javascript'
  }
  return 'plaintext'
}

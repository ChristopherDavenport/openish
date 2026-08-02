import { xmlExample } from './xml-example.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'

/** One field's value. A nested structure has no form encoding, so it goes in as its JSON text. */
const fieldText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ''
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/**
 * `key=value&key=value`, with a repeated key for an array.
 *
 * Repeating is `style: form, explode: true`, which is the OpenAPI default and what every server-side
 * form parser reads back as a list.
 */
const formUrlencoded = (value: unknown): string => {
  if (!isPlainObject(value)) {
    return JSON.stringify(value, null, 2)
  }

  const pairs: string[] = []
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue
    }
    const values = Array.isArray(entry) ? entry : [entry]
    for (const one of values) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(fieldText(one))}`)
    }
  }

  return pairs.join('&')
}

/**
 * An example value, written the way its media type says it is written.
 *
 * There was one answer to this before - `JSON.stringify` - and it was given under every media type a
 * document declared, so the `application/xml` tab showed JSON and the try-it panel prefilled JSON
 * beside a `Content-Type: application/xml` header. A generated example is a JavaScript value with no
 * syntax of its own; deciding it is JSON is a decision, and it was being made in four places.
 *
 * The schema comes along because XML needs it: element names, attributes and array wrapping are all
 * written in the schema's `xml` object, and the value alone cannot say what any of them are.
 *
 * A value the author wrote as a *string* is handed back untouched under every media type. Someone who
 * wrote the example as text wrote the bytes they meant, and re-encoding them would be this function
 * overruling the document.
 *
 * JSON is the fallback rather than a refusal, and a better one than it looks: it is what a document
 * declaring no syntax anyone knows gets, and it is valid YAML, so the `application/yaml` tab is right
 * for free.
 */
export const serializeExample = (value: unknown, mediaType = 'application/json', schema?: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (value === undefined) {
    return ''
  }

  const type = mediaType.toLowerCase()

  if (type.includes('xml')) {
    return `${XML_DECLARATION}\n${xmlExample(value, schema)}`
  }
  if (type.includes('x-www-form-urlencoded')) {
    return formUrlencoded(value)
  }

  return JSON.stringify(value, null, 2)
}

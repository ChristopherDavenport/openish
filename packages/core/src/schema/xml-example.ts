import { getResolvedRef } from '../ref.js'
import { refName } from './type-label.js'

/**
 * A generated example, written as XML.
 *
 * `schemaExample` produces a JavaScript value and nothing more - which is the right shape for a
 * generator, and the wrong thing to show a reader who picked `application/xml`. This walks that value
 * and its schema together, so the OpenAPI XML Object decides the markup rather than the walker
 * guessing: `xml.name` renames an element, `xml.attribute` moves a property onto its parent,
 * `xml.wrapped` says whether an array has a container, and `xml.prefix`/`xml.namespace` qualify it.
 *
 * The value leads and the schema follows, not the other way round. An author-supplied example may
 * hold properties the schema never mentions, and dropping them because there was no `properties`
 * entry to walk would be answering a question nobody asked.
 *
 * Schemas are read as `Record<string, unknown>` for the reason `type-label.ts` gives: a walker that
 * probes keywords cannot usefully narrow a discriminated union at every step.
 */
type AnySchema = Record<string, unknown>

/** A backstop for a value nested past anything real. `schemaExample` has already bounded it. */
const MAX_DEPTH = 32

const isPlainObject = (value: unknown): value is AnySchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The OpenAPI XML Object, as far as this cares about it. */
type XmlHints = {
  name?: string
  namespace?: string
  prefix?: string
  attribute?: boolean
  wrapped?: boolean
}

const xmlHints = (schema: unknown): XmlHints => {
  const resolved = getResolvedRef(schema)
  const xml = isPlainObject(resolved) ? resolved['xml'] : undefined
  return isPlainObject(xml) ? (xml as XmlHints) : {}
}

const schemaOf = (value: unknown): AnySchema | undefined => {
  const resolved = getResolvedRef(value)
  return isPlainObject(resolved) ? resolved : undefined
}

/**
 * A name XML will accept.
 *
 * Property keys and component names are almost always fine already; the ones that are not - a key
 * with a space, or one starting with a digit - would otherwise produce markup no parser reads.
 */
const asName = (name: string): string => {
  const cleaned = name.replace(/[^\w.-]/g, '_')
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`
}

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttribute = (value: string): string => escapeText(value).replace(/"/g, '&quot;')

/** What a primitive looks like between two tags. `null` never gets here - it is a closed element. */
const asText = (value: unknown): string => escapeText(typeof value === 'string' ? value : String(value))

const isPrimitive = (value: unknown): boolean => value === null || typeof value !== 'object'

/** `xmlns` on the element that declares it, prefixed when the schema names a prefix. */
const namespaceOf = (hints: XmlHints): string => {
  if (typeof hints.namespace !== 'string' || hints.namespace === '') {
    return ''
  }
  return hints.prefix ? ` xmlns:${asName(hints.prefix)}="${escapeAttribute(hints.namespace)}"` : ` xmlns="${escapeAttribute(hints.namespace)}"`
}

/** The tag itself: the local name this element was given, qualified by its own prefix. */
const qualify = (name: string, hints: XmlHints): string =>
  hints.prefix ? `${asName(hints.prefix)}:${asName(name)}` : asName(name)

/**
 * One value as lines of markup.
 *
 * Lines rather than a string because an *unwrapped* array is several sibling elements with no parent
 * of its own, so a node cannot always hand back a single element.
 */
const render = (value: unknown, schema: unknown, name: string, depth: number, indent: string): string[] => {
  if (depth >= MAX_DEPTH || value === undefined) {
    return []
  }

  const hints = xmlHints(schema)
  const resolved = schemaOf(schema)
  const tag = qualify(name, hints)
  const namespace = namespaceOf(hints)

  if (Array.isArray(value)) {
    const items = resolved?.['items']
    const itemName = xmlHints(items).name ?? name
    const inner = indent + (hints.wrapped ? '  ' : '')
    const lines = value.flatMap((entry) => render(entry, items, itemName, depth + 1, inner))

    if (hints.wrapped !== true) {
      return lines
    }
    return lines.length === 0
      ? [`${indent}<${tag}${namespace}/>`]
      : [`${indent}<${tag}${namespace}>`, ...lines, `${indent}</${tag}>`]
  }

  if (isPlainObject(value)) {
    const properties = resolved?.['properties']
    const attributes: string[] = [namespace]
    const children: string[] = []

    for (const [key, child] of Object.entries(value)) {
      const childSchema = isPlainObject(properties) ? properties[key] : undefined
      const childHints = xmlHints(childSchema)
      const childName = childHints.name ?? key

      /* An attribute has to be a value, not a structure - a nested object stays an element. */
      if (childHints.attribute === true && isPrimitive(child)) {
        attributes.push(` ${qualify(childName, childHints)}="${child === null ? '' : escapeAttribute(String(child))}"`)
        continue
      }

      children.push(...render(child, childSchema, childName, depth + 1, `${indent}  `))
    }

    const open = `${tag}${attributes.join('')}`
    return children.length === 0
      ? [`${indent}<${open}/>`]
      : [`${indent}<${open}>`, ...children, `${indent}</${tag}>`]
  }

  /* `null` is an element with nothing in it, which is as close as XML gets to saying so. */
  return value === null
    ? [`${indent}<${tag}${namespace}/>`]
    : [`${indent}<${tag}${namespace}>${asText(value)}</${tag}>`]
}

/** How to name the outermost element, for a caller that knows something the schema does not. */
export type XmlExampleOptions = {
  /** The last fallback before `root`. */
  name?: string
}

/** `title`, when the schema has one worth naming an element after. */
const titleOf = (schema: unknown): string | undefined => {
  const title = schemaOf(schema)?.['title']
  return typeof title === 'string' && title !== '' ? title : undefined
}

/**
 * Renders a value as an XML document body, named after the schema it came from.
 *
 * The root element takes the first name available: `xml.name`, then the model a `$ref` points at -
 * read from the pointer, because resolving it discards the one place the name is written - then
 * `title`, then whatever the caller suggested.
 *
 * A root array is wrapped whatever `xml.wrapped` says. Unwrapped is the correct reading of the
 * keyword and it describes a *property*, where the siblings have a parent element to sit in; at the
 * root there is none, and a run of sibling elements is not a document any parser will accept.
 */
export const xmlExample = (value: unknown, schema?: unknown, options: XmlExampleOptions = {}): string => {
  if (value === undefined) {
    return ''
  }

  const hints = xmlHints(schema)
  const name = hints.name ?? refName(schema) ?? titleOf(schema) ?? options.name ?? 'root'

  if (Array.isArray(value) && hints.wrapped !== true) {
    const items = schemaOf(schema)?.['items']
    const itemName = xmlHints(items).name ?? refName(items) ?? titleOf(items) ?? name
    const lines = value.flatMap((entry) => render(entry, items, itemName, 1, '  '))
    const tag = qualify(name, hints)
    const namespace = namespaceOf(hints)

    return lines.length === 0
      ? `<${tag}${namespace}/>`
      : [`<${tag}${namespace}>`, ...lines, `</${tag}>`].join('\n')
  }

  return render(value, schema, name, 0, '').join('\n')
}

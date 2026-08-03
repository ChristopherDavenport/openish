import type { HarRequest } from '@scalar/types/snippetz'
import type {
  Document as OpenApiDocument,
  OperationObject,
  PathItemObject,
  ServerObject,
} from '@scalar/openapi-types/3.1'

import { collectParameters, type ParameterEntry } from '../operation/parameters.js'
import { securityRequirements } from '../operation/security.js'
import { getResolvedRef } from '../ref.js'
import { schemaExample } from '../schema/schema-example.js'
import { serializeExample } from '../schema/serialize-example.js'
import type { VariantChoices } from '../schema/variant-path.js'
import type { HttpMethod } from '../types.js'

type NameValue = { name: string; value: string }

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export type OperationToHarOptions = {
  /** Overrides the document's first server. Useful when the reader has picked one in the UI. */
  server?: string
  /** Values for server template variables, e.g. `{ region: 'eu' }`. Defaults come from the document. */
  serverVariables?: Record<string, string>
  /** Media type to send. Defaults to the first one the request body declares. */
  contentType?: string
  /**
   * Media type to ask for back, as an `Accept` header.
   *
   * A reader reading the `application/xml` response is being shown an answer this request would not
   * receive: with no `Accept`, a server that offers both is free to send whichever it prefers, and
   * for most it prefers JSON. Which type the page is showing is a question the operation already
   * answers - this is that answer, put where it changes what comes back.
   *
   * A header the document itself declares wins: an author who wrote an `Accept` parameter has said
   * something specific about it, and overruling that would be this builder second-guessing them.
   */
  accept?: string
  /**
   * The `oneOf`/`anyOf` branches the reader picked in the request body's property tree.
   *
   * Carried this far because the snippet is the one place the choice becomes something a reader can
   * run: a tree showing `Dog` beside a curl that posts a cat is two answers to one question.
   */
  variants?: VariantChoices
  /** Which shape the choices are about. `request` is what the operation page uses. */
  variantScope?: string
  /**
   * What the reader typed, keyed `"{in}:{name}"`.
   *
   * The same key {@link collectParameters} merges on, so a table, a form, and this builder identify
   * a parameter the same way with nothing to keep in step. A value here replaces the one derived
   * from the document, and an empty string means "send it empty" rather than "fall back".
   */
  parameterValues?: Record<string, string>
  /** A body the reader edited, replacing the one generated from the schema. */
  body?: { mediaType: string; text: string }
  /**
   * Credentials by security scheme name.
   *
   * A scheme with no value here keeps its {@link AUTH_PLACEHOLDER}, so a sample still shows where
   * the credential goes before anyone has entered one.
   */
  credentials?: Record<string, string>
  /**
   * Which alternative from `security` to apply, by index. Defaults to the first.
   *
   * OpenAPI lists alternatives - "OAuth or an API key" - and only the reader knows which one they
   * hold.
   */
  securityIndex?: number
}

/** Placeholders for auth, so a generated snippet shows where the credential goes. */
const AUTH_PLACEHOLDER = {
  bearer: 'Bearer YOUR_TOKEN',
  basic: 'Basic BASE64_CREDENTIALS',
  apiKey: 'YOUR_API_KEY',
} as const

const asString = (value: unknown): string => {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

/** Substitutes `{variable}` placeholders in a server URL using the document's declared defaults. */
export const resolveServerUrl = (
  server: ServerObject | undefined,
  overrides: Record<string, string> = {},
): string => {
  if (!server?.url) {
    return ''
  }

  return server.url.replace(/{([^}]+)}/g, (match, name: string) => {
    const override = overrides[name]
    if (override !== undefined) {
      return override
    }
    const variable = server.variables?.[name]
    return variable?.default !== undefined ? String(variable.default) : match
  })
}

/**
 * The server an operation is on, where it is not the one the rest of the document is on.
 *
 * OpenAPI lets `servers` be declared at three levels and the innermost wins: an operation overrides
 * its path item, which overrides the document. Real documents use it - an upload endpoint on a
 * different host, an auth endpoint on the identity provider, a sandbox for one call - and openish
 * read none of it. The generated sample named the document's host, the try-it panel *sent* to the
 * document's host, and nothing on the page said otherwise.
 *
 * `undefined` where the operation is on the document's own servers, which is the common case and is
 * what lets a caller tell "no override" from "overridden, and here it is". Only the first entry is
 * used, the same way the document's own list is: a picker among an operation's private servers would
 * be a control for a case that does not arise.
 */
export const operationServer = (
  pathItem: PathItemObject | undefined,
  operation: OperationObject | undefined,
  overrides: Record<string, string> = {},
): string | undefined => {
  const declared = operation?.servers?.[0] ?? pathItem?.servers?.[0]
  if (declared === undefined) {
    return undefined
  }

  const url = resolveServerUrl(getResolvedRef(declared), overrides)
  return url === '' ? undefined : url
}

/**
 * The sample value for a parameter, preferring what the author supplied.
 *
 * `example` on the parameter wins, then the first entry of `examples`, then a value generated from
 * the parameter's schema.
 */
const parameterValue = (parameter: ParameterEntry): string => {
  if (parameter.example !== undefined) {
    return asString(parameter.example)
  }

  const first = getResolvedRef(Object.values(parameter.examples ?? {})[0])
  if (isPlainObject(first) && first['value'] !== undefined) {
    return asString(first['value'])
  }

  if (parameter.schema) {
    return asString(schemaExample(parameter.schema))
  }

  return ''
}

/**
 * Whether a parameter belongs in a sample request.
 *
 * Required parameters always. Optional ones only when the author gave them an example or a default -
 * that is a deliberate signal that the value is worth showing. Including every optional query
 * parameter would bury the useful ones.
 */
const shouldInclude = (parameter: ParameterEntry): boolean => {
  if (parameter.required) {
    return true
  }
  if (parameter.example !== undefined || parameter.examples !== undefined) {
    return true
  }
  const schema = getResolvedRef(parameter.schema)
  return isPlainObject(schema) && (schema['default'] !== undefined || schema['example'] !== undefined)
}

/**
 * Places the credential for one security alternative, or a placeholder where there is none yet.
 *
 * The scheme decides *where* it goes - a header, a query parameter, a `Bearer` prefix - and the
 * reader decides *what* goes there. Both halves matter: a sample with the value in the wrong place
 * is not a sample, and a request with a placeholder in the right place is not a request.
 */
const applySecurity = (
  document: OpenApiDocument,
  operation: OperationObject,
  headers: NameValue[],
  queryString: NameValue[],
  options: OperationToHarOptions,
): void => {
  const requirements = securityRequirements(document, operation)
  const requirement = requirements[options.securityIndex ?? 0] ?? requirements[0]
  if (!requirement || requirement.anonymous) {
    return
  }

  for (const entry of requirement.entries) {
    const scheme = entry.scheme
    if (!scheme) {
      /* Required but never declared. Nothing to place, and nowhere to place it. */
      continue
    }

    const supplied = options.credentials?.[entry.name]

    if (scheme.type === 'http') {
      const basic = scheme.scheme?.toLowerCase() === 'basic'
      const fallback = basic ? AUTH_PLACEHOLDER.basic : AUTH_PLACEHOLDER.bearer
      const prefix = basic ? 'Basic ' : 'Bearer '
      /* A reader who pasted the whole header value meant it; do not prefix it twice. */
      const value = supplied ? (hasScheme(supplied) ? supplied : `${prefix}${supplied}`) : fallback
      headers.push({ name: 'Authorization', value })
    } else if (scheme.type === 'apiKey' && scheme.name) {
      const value = supplied ?? AUTH_PLACEHOLDER.apiKey
      if (scheme.in === 'query') {
        queryString.push({ name: scheme.name, value })
      } else if (scheme.in === 'header') {
        headers.push({ name: scheme.name, value })
      }
    } else if (scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
      const value = supplied ? (hasScheme(supplied) ? supplied : `Bearer ${supplied}`) : AUTH_PLACEHOLDER.bearer
      headers.push({ name: 'Authorization', value })
    }
  }
}

/** Whether a pasted credential already carries its own scheme prefix, e.g. `Bearer eyJ…`. */
const hasScheme = (value: string): boolean => /^(bearer|basic|dpop)\s/i.test(value)

export type OperationToHarInput = {
  document: OpenApiDocument
  operation: OperationObject
  pathItem?: PathItemObject | undefined
  path: string
  method: HttpMethod
}

/**
 * Builds a HAR request for an operation, which is what `@scalar/snippetz` turns into a code sample.
 *
 * Scalar's equivalent lives in `@scalar/oas-utils`, which depends on Vue, so openish carries its
 * own. Everything here is derived from the document - path and server templates are expanded,
 * parameters and body come from the author's examples where they exist, and auth is a labelled
 * placeholder rather than a fabricated credential.
 */
export const operationToHar = (input: OperationToHarInput, options: OperationToHarOptions = {}): HarRequest => {
  const { document, operation, pathItem, path, method } = input

  const parameters = collectParameters(pathItem, operation)
  /* What the reader typed wins over what the document implies, including an empty string. */
  const supplied = (parameter: ParameterEntry): string | undefined =>
    options.parameterValues?.[`${parameter.in}:${parameter.name}`]
  const headers: NameValue[] = []
  const queryString: NameValue[] = []
  const cookies: NameValue[] = []
  let resolvedPath = path

  for (const parameter of parameters) {
    const value = supplied(parameter) ?? parameterValue(parameter)

    if (parameter.in === 'path') {
      /* Path parameters are always required in practice; substitute whatever we can derive. */
      resolvedPath = resolvedPath.replace(`{${parameter.name}}`, encodeURIComponent(value))
      continue
    }

    /* A value the reader typed is included whatever the document would have decided. */
    if (supplied(parameter) === undefined && !shouldInclude(parameter)) {
      continue
    }

    const entry = { name: parameter.name, value }
    if (parameter.in === 'query') {
      queryString.push(entry)
    } else if (parameter.in === 'header') {
      headers.push(entry)
    } else if (parameter.in === 'cookie') {
      cookies.push(entry)
    }
  }

  /*
   * Asked for before the credential goes on, so the sample reads as a request rather than as a
   * header dump: what I want, then who I am.
   */
  if (options.accept && !headers.some((header) => header.name.toLowerCase() === 'accept')) {
    headers.push({ name: 'Accept', value: options.accept })
  }

  applySecurity(document, operation, headers, queryString, options)

  /*
   * An operation's own server beats the one the reader picked, and that is the right way round: the
   * picker offers the document's servers, and an operation that declares its own is saying it is not
   * on any of them. It used to be the other way - `options.server` is set on every call the element
   * layer makes, so the override was read and then discarded on the next line.
   */
  const serverUrl =
    operationServer(pathItem, operation, options.serverVariables ?? {}) ??
    options.server ??
    resolveServerUrl(getResolvedRef(document.servers?.[0]), options.serverVariables ?? {})

  const request: HarRequest = {
    method: method.toUpperCase(),
    url: `${serverUrl.replace(/\/$/, '')}${resolvedPath}`,
    httpVersion: 'HTTP/1.1',
    headers,
    queryString,
    cookies,
    headersSize: -1,
    bodySize: -1,
  }

  /* An edited body replaces the generated one entirely - it is already the text to send. */
  if (options.body) {
    headers.push({ name: 'Content-Type', value: options.body.mediaType })
    request.postData = { mimeType: options.body.mediaType, text: options.body.text }
    return request
  }

  const requestBody: unknown = getResolvedRef(operation.requestBody)
  const content = isPlainObject(requestBody) ? requestBody['content'] : undefined

  if (isPlainObject(content)) {
    const mimeType = options.contentType ?? Object.keys(content)[0]
    const media = mimeType ? getResolvedRef(content[mimeType]) : undefined

    if (mimeType && isPlainObject(media)) {
      const examples = isPlainObject(media['examples']) ? media['examples'] : {}
      const namedExample = getResolvedRef(Object.values(examples)[0])
      const value =
        media['example'] ??
        (isPlainObject(namedExample) ? namedExample['value'] : undefined) ??
        schemaExample(media['schema'], {
          ...(options.variants ? { variants: options.variants } : {}),
          ...(options.variantScope ? { variantScope: options.variantScope } : {}),
        })

      headers.push({ name: 'Content-Type', value: mimeType })
      /* Serialised as the header it just wrote says it is: a JSON body under `application/xml` is a
       * sample nobody can send. */
      request.postData = {
        mimeType,
        text: serializeExample(value, mimeType, media['schema']),
      }
    }
  }

  return request
}

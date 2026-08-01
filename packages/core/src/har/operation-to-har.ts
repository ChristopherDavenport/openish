import type { HarRequest } from '@scalar/types/snippetz'
import type {
  Document as OpenApiDocument,
  OperationObject,
  PathItemObject,
  SecuritySchemeObject,
  ServerObject,
} from '@scalar/openapi-types/3.1'

import { collectParameters, type ParameterEntry } from '../operation/parameters.js'
import { getResolvedRef } from '../ref.js'
import { schemaExample } from '../schema/schema-example.js'
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

/** Applies the document's first security requirement as a placeholder header or query parameter. */
const applySecurity = (
  document: OpenApiDocument,
  operation: OperationObject,
  headers: NameValue[],
  queryString: NameValue[],
): void => {
  const requirements = operation.security ?? document.security
  const requirement = requirements?.[0]
  if (!requirement) {
    return
  }

  for (const name of Object.keys(requirement)) {
    const scheme = getResolvedRef(document.components?.securitySchemes?.[name]) as
      | SecuritySchemeObject
      | undefined
    if (!scheme) {
      continue
    }

    if (scheme.type === 'http') {
      const value = scheme.scheme?.toLowerCase() === 'basic' ? AUTH_PLACEHOLDER.basic : AUTH_PLACEHOLDER.bearer
      headers.push({ name: 'Authorization', value })
    } else if (scheme.type === 'apiKey' && scheme.name) {
      if (scheme.in === 'query') {
        queryString.push({ name: scheme.name, value: AUTH_PLACEHOLDER.apiKey })
      } else if (scheme.in === 'header') {
        headers.push({ name: scheme.name, value: AUTH_PLACEHOLDER.apiKey })
      }
    } else if (scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
      headers.push({ name: 'Authorization', value: AUTH_PLACEHOLDER.bearer })
    }
  }
}

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
  const headers: NameValue[] = []
  const queryString: NameValue[] = []
  const cookies: NameValue[] = []
  let resolvedPath = path

  for (const parameter of parameters) {
    if (parameter.in === 'path') {
      /* Path parameters are always required in practice; substitute whatever we can derive. */
      resolvedPath = resolvedPath.replace(`{${parameter.name}}`, encodeURIComponent(parameterValue(parameter)))
      continue
    }

    if (!shouldInclude(parameter)) {
      continue
    }

    const entry = { name: parameter.name, value: parameterValue(parameter) }
    if (parameter.in === 'query') {
      queryString.push(entry)
    } else if (parameter.in === 'header') {
      headers.push(entry)
    } else if (parameter.in === 'cookie') {
      cookies.push(entry)
    }
  }

  applySecurity(document, operation, headers, queryString)

  const serverUrl =
    options.server ??
    resolveServerUrl(getResolvedRef(operation.servers?.[0] ?? document.servers?.[0]), options.serverVariables ?? {})

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
        schemaExample(media['schema'])

      headers.push({ name: 'Content-Type', value: mimeType })
      request.postData = {
        mimeType,
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      }
    }
  }

  return request
}

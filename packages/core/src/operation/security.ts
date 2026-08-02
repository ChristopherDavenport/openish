import type { Document as OpenApiDocument, OperationObject, SecuritySchemeObject } from '@scalar/openapi-types/3.1'

import { getResolvedRef } from '../ref.js'

/**
 * One scheme an operation asks for, and the scopes it asks for with it.
 *
 * `scheme` is `undefined` when the requirement names something `components.securitySchemes` does not
 * declare. That is not hypothetical: the reference document in this repo requires a scheme it never
 * declares, and a reference that threw on it would render nothing at all. Saying "required, not
 * declared" is both honest and more useful than a blank page.
 */
export type SecurityEntry = {
  name: string
  scheme: SecuritySchemeObject | undefined
  scopes: readonly string[]
}

/**
 * One way to satisfy an operation: every entry in it is required *together*.
 *
 * An empty `entries` array is the OpenAPI spelling of "this operation may be called anonymously",
 * which a document expresses as `security: [{}]`. It is a real alternative, not an absence, so it
 * survives as an option the reader can pick.
 */
export type SecurityRequirement = {
  entries: readonly SecurityEntry[]
  /** True for the `{}` requirement: no credential needed. */
  anonymous: boolean
}

export const resolveSecurityScheme = (
  document: OpenApiDocument | undefined,
  name: string,
): SecuritySchemeObject | undefined =>
  getResolvedRef(document?.components?.securitySchemes?.[name]) as SecuritySchemeObject | undefined

/**
 * The alternatives an operation accepts, in the order the document lists them.
 *
 * OpenAPI's `security` is a list of alternatives, each an object of schemes that apply together -
 * "OAuth **or** an API key", where one alternative might itself be "this API key **and** that
 * signature". The HAR builder has only ever read the first alternative and could not be told which
 * one the reader chose; this is the shape a picker needs.
 *
 * An operation's own `security` replaces the document's, including when it is an empty array, which
 * is how an operation opts out of a document-wide requirement.
 */
export const securityRequirements = (
  document: OpenApiDocument | undefined,
  operation: OperationObject | undefined,
): SecurityRequirement[] => {
  const declared = operation?.security ?? document?.security
  if (!declared) {
    return []
  }

  return declared.map((requirement) => {
    const names = Object.keys(requirement ?? {})

    return {
      anonymous: names.length === 0,
      entries: names.map((name) => ({
        name,
        scheme: resolveSecurityScheme(document, name),
        scopes: (requirement[name] ?? []) as readonly string[],
      })),
    }
  })
}

/**
 * The keys {@link describeSecurityScheme} reads, stated structurally.
 *
 * `SecuritySchemeObject` is a discriminated union, so `Pick`ing five keys off it distributes over
 * every branch and asks each one for keys only its siblings have - the same shape of problem
 * `SchemaObject` has. A function that probes across the branches takes the loose type instead.
 */
export type DescribableSecurityScheme = {
  type?: string | undefined
  scheme?: string | undefined
  in?: string | undefined
  name?: string | undefined
  openIdConnectUrl?: string | undefined
}

/**
 * A one-line description of how a scheme is supplied, since `type` alone rarely answers it.
 *
 * This lives in core rather than in an element because it is a fact about the document, and because
 * it had already been written twice - the overview's copy named `mutualTLS` and appended the
 * `openIdConnectUrl`, the auth form's did neither, and a reader moving between the two pages was
 * told different things about the same scheme.
 *
 * `showUrl` is the one real difference between the two callers: the overview is documenting the
 * scheme and the URL belongs there, while the auth form is a control with a discovery status of its
 * own beneath it and does not need the endpoint restated in its label.
 */
export const describeSecurityScheme = (
  scheme: DescribableSecurityScheme | undefined,
  { showUrl = false }: { showUrl?: boolean } = {},
): string => {
  switch (scheme?.type) {
    case 'http':
      return `HTTP ${scheme.scheme ?? 'authentication'}`
    case 'apiKey':
      return `API key in ${scheme.in ?? 'request'}${scheme.name ? ` as ${scheme.name}` : ''}`
    case 'oauth2':
      return 'OAuth 2.0'
    case 'openIdConnect':
      return `OpenID Connect${showUrl && scheme.openIdConnectUrl ? ` — ${scheme.openIdConnectUrl}` : ''}`
    case 'mutualTLS':
      return 'Mutual TLS'
    default:
      return scheme?.type ?? 'Unknown scheme'
  }
}

/**
 * One OAuth flow a scheme offers, flattened for display.
 *
 * `scopes` is a list rather than the document's object because it is rendered in order and the
 * description is the half that matters - a scope name without one is a string the reader has to
 * guess the meaning of, and guessing is what this section exists to prevent.
 */
export type OAuthFlowDetail = {
  /** The key the document used, e.g. `authorizationCode`. */
  key: string
  /** That key as prose, e.g. `Authorization code`. */
  label: string
  authorizationUrl?: string | undefined
  tokenUrl?: string | undefined
  refreshUrl?: string | undefined
  scopes: ReadonlyArray<{ name: string; description?: string | undefined }>
}

/** The flow keys OpenAPI defines, and what to call each one on a page a person reads. */
const FLOW_LABELS: Readonly<Record<string, string>> = {
  authorizationCode: 'Authorization code',
  clientCredentials: 'Client credentials',
  implicit: 'Implicit',
  password: 'Password',
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asUrl = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined

/**
 * Every flow an `oauth2` scheme declares, with its endpoints and its scopes.
 *
 * {@link describeSecurityScheme} answers `oauth2` with the bare string `OAuth 2.0`, which is true and
 * useless: the flows, the endpoints, and above all the scopes are the part a reader needs, and until
 * now they existed only inside the auth form - a control, not documentation, and one a reader who is
 * not signing in never opens.
 *
 * An unknown flow key is kept rather than dropped. A document declaring a flow OpenAPI has not
 * standardised is telling the reader something, and the endpoints under it still resolve.
 */
export const securitySchemeFlows = (scheme: unknown): OAuthFlowDetail[] => {
  const flows = isPlainObject(scheme) ? scheme['flows'] : undefined
  if (!isPlainObject(flows)) {
    return []
  }

  const details: OAuthFlowDetail[] = []

  for (const [key, raw] of Object.entries(flows)) {
    const flow = getResolvedRef(raw)
    if (!isPlainObject(flow)) {
      continue
    }

    const scopes = isPlainObject(flow['scopes']) ? flow['scopes'] : {}

    details.push({
      key,
      label: FLOW_LABELS[key] ?? key,
      authorizationUrl: asUrl(flow['authorizationUrl']),
      tokenUrl: asUrl(flow['tokenUrl']),
      refreshUrl: asUrl(flow['refreshUrl']),
      scopes: Object.entries(scopes).map(([name, description]) => ({
        name,
        description: typeof description === 'string' && description.trim() !== '' ? description : undefined,
      })),
    })
  }

  return details
}

/**
 * Which alternative to satisfy, given what the reader is holding.
 *
 * `applySecurity` has always taken a `securityIndex` and nothing has ever passed one, so a document
 * offering "OAuth **or** an API key" sent the OAuth header no matter which of the two the reader had
 * actually obtained - a 401 that looked like the API's fault. The index is not something to ask the
 * reader for: they answered it when they signed in, and the answer is which credentials exist.
 *
 * In order:
 * 1. An alternative the host named through `preferredSecurityScheme`, if the document has one.
 * 2. The first alternative every one of whose schemes the reader can satisfy right now.
 * 3. The first alternative they can satisfy *any* of, so a partly-filled AND still sends what it has.
 * 4. The first one, which is what the document itself puts forward.
 *
 * The anonymous alternative (`{}`) is never chosen automatically - a reader holding a credential
 * means to use it, and an operation that also permits anonymous access will accept it anyway.
 */
export const preferredSecurityIndex = (
  requirements: readonly SecurityRequirement[],
  {
    credentials = {},
    preferred,
  }: { credentials?: Readonly<Record<string, string>>; preferred?: string | readonly string[] } = {},
): number => {
  if (requirements.length === 0) {
    return 0
  }

  const wanted = preferred === undefined ? [] : Array.isArray(preferred) ? preferred : [preferred as string]
  const held = (entry: SecurityEntry): boolean => credentials[entry.name] !== undefined && credentials[entry.name] !== ''

  if (wanted.length > 0) {
    const named = requirements.findIndex(
      (requirement) =>
        requirement.entries.length > 0 && wanted.every((name) => requirement.entries.some((entry) => entry.name === name)),
    )
    if (named !== -1) {
      return named
    }
  }

  const satisfied = requirements.findIndex(
    (requirement) => !requirement.anonymous && requirement.entries.length > 0 && requirement.entries.every(held),
  )
  if (satisfied !== -1) {
    return satisfied
  }

  const partial = requirements.findIndex((requirement) => !requirement.anonymous && requirement.entries.some(held))
  return partial === -1 ? 0 : partial
}

/** Every scheme any alternative mentions, deduplicated - what an auth form needs to render. */
export const securitySchemesFor = (
  document: OpenApiDocument | undefined,
  operation: OperationObject | undefined,
): SecurityEntry[] => {
  const seen = new Map<string, SecurityEntry>()

  for (const requirement of securityRequirements(document, operation)) {
    for (const entry of requirement.entries) {
      const existing = seen.get(entry.name)
      /* One scheme can appear in several alternatives with different scopes; keep the union. */
      seen.set(entry.name, {
        name: entry.name,
        scheme: entry.scheme,
        scopes: [...new Set([...(existing?.scopes ?? []), ...entry.scopes])],
      })
    }
  }

  return [...seen.values()]
}

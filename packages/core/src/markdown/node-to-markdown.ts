import type { Document as OpenApiDocument, OperationObject } from '@scalar/openapi-types/3.1'

import { authorAside } from '../aside.js'
import { authorSamples } from '../har/author-samples.js'
import { operationToHar, resolveServerUrl } from '../har/operation-to-har.js'
import { declarationFor } from '../navigation/declaration.js'
import { resolveOperationNode } from '../navigation/resolve.js'
import { mediaTypeExamples } from '../operation/examples.js'
import { collectParameters, type ParameterEntry } from '../operation/parameters.js'
import {
  describeSecurityScheme,
  securityRequirements,
  type DescribableSecurityScheme,
} from '../operation/security.js'
import { getResolvedRef } from '../ref.js'
import { schemaExample } from '../schema/schema-example.js'
import { asSchema, schemaTypeLabel } from '../schema/type-label.js'
import type { DocumentStore, NavNode } from '../types.js'

export type NodeMarkdownOptions = {
  /**
   * The heading level the node's own title takes. Everything under it is relative to this.
   *
   * A section copied on its own is a document, so it starts at 1. A section copied as part of its
   * parent is a chapter of one, so the parent passes its own level plus one.
   */
  depth?: number
  /** Which server the request line is built against. Defaults to the document's first. */
  server?: string
}

/** The deepest heading markdown has. Past it, nesting stops getting deeper rather than breaking. */
const MAX_LEVEL = 6

/** ATX heading and code fence, read the same way {@link extractHeadings} reads them. */
const HEADING = /^(#{1,6})(\s+.*)$/
const FENCE = /^\s*(```|~~~)/

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const heading = (level: number, text: string): string => `${'#'.repeat(Math.min(level, MAX_LEVEL))} ${text}`

/** Joins the parts of a document, dropping the ones that had nothing to say. */
const blocks = (...parts: Array<string | undefined>): string =>
  parts.filter((part): part is string => part !== undefined && part !== '').join('\n\n')

/**
 * Pushes an author's headings down to where they belong under ours.
 *
 * The same job `headingOffset` does for `<openish-markdown>` on the page. Without it, an
 * `info.description` that opens with `# Getting started` would sit at the same level as the document
 * title above it, and a reader - or a model - would have no way to tell which contains which.
 *
 * Fenced code is skipped, because a `# comment` in a shell example is not a heading. That is the
 * same rule `extractHeadings` follows, and for the same reason.
 */
const demoteHeadings = (markdown: string, by: number): string => {
  if (by <= 0) {
    return markdown
  }

  let fence: string | undefined

  return markdown
    .split('\n')
    .map((line) => {
      const fenceMatch = FENCE.exec(line)
      if (fenceMatch) {
        const marker = fenceMatch[1]!
        if (fence === undefined) {
          fence = marker
        } else if (fence === marker) {
          fence = undefined
        }
        return line
      }

      if (fence !== undefined) {
        return line
      }

      const match = HEADING.exec(line)
      return match ? `${'#'.repeat(Math.min(match[1]!.length + by, MAX_LEVEL))}${match[2]!}` : line
    })
    .join('\n')
}

/** A value in a table cell: one line, and never able to end the cell early. */
const cell = (value: string | undefined): string =>
  (value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()

const table = (columns: readonly string[], rows: ReadonlyArray<readonly string[]>): string | undefined =>
  rows.length === 0
    ? undefined
    : [
        `| ${columns.join(' | ')} |`,
        `| ${columns.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
      ].join('\n')

const fence = (language: string, body: string): string => `\`\`\`${language}\n${body}\n\`\`\``

const asJson = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2)

/**
 * The overview: what the document says about itself.
 *
 * Servers and security come from the document rather than from `config`, because this is a copy of
 * what the API *is* - a host's server override is a fact about one deployment of the reference, not
 * about the interface being described.
 */
/**
 * What an author wrote for a section's examples column, in the copy of it a reader takes away.
 *
 * It goes in because it is the document talking: `x-openish-aside` is prose about this section and
 * `x-codeSamples` is an example of it, and a copy that dropped both would be missing the part the
 * author added by hand. Where it *cannot* go is a host's slotted DOM - openish has no way to
 * serialise someone else's components, and guessing at their text would be worse than the omission.
 *
 * Under the prose rather than above it, which is where the column puts it relative to the reading
 * order: the section says what it is, and then what to do about it.
 */
const asideMarkdown = (source: unknown, level: number): string | undefined => {
  const aside = authorAside(source)
  const samples = authorSamples(source as object | undefined)

  return blocks(
    aside ? demoteHeadings(aside, level) : undefined,
    ...samples.map((sample) => blocks(`**${sample.label}**`, fence(sample.language, sample.source))),
  )
}

const infoMarkdown = (document: OpenApiDocument, level: number): string => {
  const info = document.info
  const servers = (document.servers ?? []).map((raw) => {
    const server = getResolvedRef(raw)
    const url = resolveServerUrl(server, {})
    return `- \`${url}\`${server?.description ? ` — ${server.description}` : ''}`
  })

  const schemes = Object.entries(document.components?.securitySchemes ?? {}).map(([name, raw]) => {
    const scheme = getResolvedRef(raw) as DescribableSecurityScheme | undefined
    return `- \`${name}\` — ${describeSecurityScheme(scheme, { showUrl: true })}`
  })

  return blocks(
    heading(level, info?.title ?? 'API reference'),
    info?.version ? `Version ${info.version}` : undefined,
    info?.summary,
    info?.description ? demoteHeadings(info.description, level) : undefined,
    asideMarkdown(info, level),
    servers.length > 0 ? blocks(heading(level + 1, 'Servers'), servers.join('\n')) : undefined,
    schemes.length > 0 ? blocks(heading(level + 1, 'Authentication'), schemes.join('\n')) : undefined,
  )
}

/** What the reader has to hold to make this call, in the shape `securityRequirements` reports it. */
const securityMarkdown = (
  document: OpenApiDocument | undefined,
  operation: OperationObject | undefined,
  level: number,
): string | undefined => {
  const requirements = securityRequirements(document, operation)
  if (requirements.length === 0) {
    return undefined
  }

  const lines = requirements.map((requirement) => {
    if (requirement.anonymous) {
      return '- No credential needed.'
    }
    const entries = requirement.entries.map((entry) => {
      const scopes = entry.scopes.length > 0 ? ` with scopes ${entry.scopes.map((s) => `\`${s}\``).join(', ')}` : ''
      return `\`${entry.name}\` (${describeSecurityScheme(entry.scheme)})${scopes}`
    })
    return `- ${entries.join(' and ')}`
  })

  return blocks(
    heading(level, 'Authorization'),
    requirements.length > 1 ? 'Any one of these is enough.' : undefined,
    lines.join('\n'),
  )
}

const parametersMarkdown = (parameters: readonly ParameterEntry[], level: number): string | undefined => {
  const rows = parameters.map((parameter) => [
    `\`${parameter.name}\``,
    parameter.in,
    schemaTypeLabel(parameter.schema) || '—',
    parameter.required ? 'Yes' : 'No',
    parameter.description ?? '',
  ])

  const body = table(['Name', 'In', 'Type', 'Required', 'Description'], rows)
  return body ? blocks(heading(level, 'Parameters'), body) : undefined
}

/**
 * The example an author wrote, or one generated from the schema.
 *
 * Same order of preference the page uses: a named example first, then the singular `example`, then
 * the schema. A copy that generated its own example while the page showed the author's would be the
 * two-answers problem again, in a place nobody would think to look for it.
 */
const exampleFor = (media: unknown): unknown => {
  if (!isPlainObject(media)) {
    return undefined
  }
  const [authored] = mediaTypeExamples(media)
  return authored?.value ?? media['example'] ?? schemaExample(media['schema'])
}

const mediaMarkdown = (content: unknown, withExample = true): string | undefined => {
  if (!isPlainObject(content)) {
    return undefined
  }

  return blocks(
    ...Object.entries(content).map(([mimeType, raw]) => {
      const media = getResolvedRef(raw)
      const schema = asSchema(isPlainObject(media) ? media['schema'] : undefined)
      const label = schemaTypeLabel(isPlainObject(media) ? media['schema'] : undefined)
      const example = withExample ? exampleFor(media) : undefined

      return blocks(
        `\`${mimeType}\`${label ? ` — ${label}` : ''}`,
        schema && example !== undefined ? fence('json', asJson(example)) : undefined,
      )
    }),
  )
}

/**
 * The body, documented once.
 *
 * `withExample` is off wherever a Request block follows, which is the same seam
 * `<openish-request-body no-example>` uses on the page and for the same reason M14 gave: the request
 * is the copy the reader can act on, and printing the generated body twice on the way to it is a
 * paragraph of noise between them. A webhook has no request block, so it keeps its example.
 */
const requestBodyMarkdown = (
  operation: OperationObject | undefined,
  level: number,
  withExample: boolean,
): string | undefined => {
  /* Typed `unknown` on the way in, the way the HAR builder does: the resolved value is a union of
   * the reference and the object, and probing keys across that narrows at every access for nothing. */
  const requestBody: unknown = getResolvedRef(operation?.requestBody)
  if (!isPlainObject(requestBody)) {
    return undefined
  }

  return blocks(
    heading(level, 'Request body'),
    requestBody['required'] === true ? 'Required.' : undefined,
    typeof requestBody['description'] === 'string' ? requestBody['description'] : undefined,
    mediaMarkdown(requestBody['content'], withExample),
  )
}

const responsesMarkdown = (operation: OperationObject | undefined, level: number): string | undefined => {
  const responses = operation?.responses
  if (!isPlainObject(responses)) {
    return undefined
  }

  const entries = Object.entries(responses).map(([status, raw]) => {
    const response = getResolvedRef(raw)
    const description = isPlainObject(response) && typeof response['description'] === 'string' ? response['description'] : ''

    return blocks(
      heading(level + 1, `\`${status}\`${description ? ` — ${description}` : ''}`),
      isPlainObject(response) ? mediaMarkdown(response['content']) : undefined,
    )
  })

  return entries.length === 0 ? undefined : blocks(heading(level, 'Responses'), ...entries)
}

/**
 * The request itself, built by the same builder the code sample on the page uses.
 *
 * `operationToHar` rather than `generateSnippet`, and the difference is not a shortcut: generating a
 * snippet is asynchronous, which would make this whole function asynchronous and the copy button a
 * two-step - and a snippet is one language's spelling of the request, where what a reader pasting a
 * section into a model wants is the request. The HAR is the shape both are built from.
 */
const requestMarkdown = (
  document: OpenApiDocument,
  resolved: ReturnType<typeof resolveOperationNode>,
  level: number,
  server: string | undefined,
): string | undefined => {
  if (!resolved?.operation) {
    return undefined
  }

  const har = operationToHar(
    {
      document,
      operation: resolved.operation,
      pathItem: resolved.pathItem,
      path: resolved.path,
      method: resolved.method,
    },
    server === undefined ? {} : { server },
  )

  const query = har.queryString.map(({ name, value }) => `${name}=${value}`).join('&')
  const lines = [
    `${har.method} ${har.url}${query ? `?${query}` : ''}`,
    ...har.headers.map(({ name, value }) => `${name}: ${value}`),
  ]
  if (har.postData?.text) {
    lines.push('', har.postData.text)
  }

  return blocks(heading(level, 'Request'), fence('http', lines.join('\n')))
}

const operationMarkdown = (
  store: DocumentStore,
  node: Extract<NavNode, { type: 'operation' | 'webhook' }>,
  level: number,
  server: string | undefined,
): string => {
  const resolved = resolveOperationNode(store.document, node)
  const operation = resolved?.operation
  const parameters = collectParameters(resolved?.pathItem, operation)
  const target = node.type === 'webhook' ? node.name : node.path
  /* A webhook is a call the API makes to the reader, so there is no request for them to send. */
  const sendable = node.type === 'operation'

  return blocks(
    heading(level, node.title),
    `\`${node.method.toUpperCase()} ${target}\``,
    node.type === 'operation' && node.deprecated === true ? '**Deprecated.**' : undefined,
    operation?.description ? demoteHeadings(operation.description, level) : undefined,
    operation?.operationId ? `Operation ID: \`${operation.operationId}\`` : undefined,
    securityMarkdown(store.document, operation, level + 1),
    parametersMarkdown(parameters, level + 1),
    requestBodyMarkdown(operation, level + 1, !sendable),
    sendable ? requestMarkdown(store.document, resolved, level + 1, server) : undefined,
    responsesMarkdown(operation, level + 1),
  )
}

const modelMarkdown = (store: DocumentStore, node: Extract<NavNode, { type: 'model' }>, level: number): string => {
  const schema = asSchema(store.document.components?.schemas?.[node.name])
  const properties = asSchema(schema?.['properties'])
  const required = new Set(Array.isArray(schema?.['required']) ? (schema['required'] as string[]) : [])

  const rows = Object.entries(properties ?? {}).map(([name, property]) => {
    const resolved = asSchema(property)
    return [
      `\`${name}\``,
      schemaTypeLabel(property) || '—',
      required.has(name) ? 'Yes' : 'No',
      typeof resolved?.['description'] === 'string' ? resolved['description'] : '',
    ]
  })

  return blocks(
    heading(level, node.title),
    typeof schema?.['description'] === 'string' ? demoteHeadings(schema['description'], level) : undefined,
    table(['Property', 'Type', 'Required', 'Description'], rows),
    schema ? blocks(heading(level + 1, 'Example'), fence('json', asJson(schemaExample(schema)))) : undefined,
  )
}

/**
 * A section of the document as a Markdown document.
 *
 * In core rather than in an element for the same reason the HAR builder is: it is a string out of a
 * document, with no DOM and no component model in it - and, more to the point, it has to agree with
 * what the page says. Every fact here comes from the reader the page uses for the same fact, which
 * is why this composes `collectParameters`, `securityRequirements`, `mediaTypeExamples` and
 * `schemaTypeLabel` rather than reading the document again.
 *
 * `node` is `undefined` for the overview, which is the one section that is not a node.
 *
 * A `tag` or a `group` renders its own prose and then everything inside it, one level down - so
 * "copy this tag" is the tag and all of its operations, and the heading levels say which is which.
 * That also makes this the honest answer to a virtualised page: it hands over the whole section,
 * not the part that happened to be rendered.
 */
export const nodeToMarkdown = (
  store: DocumentStore,
  node: NavNode | undefined,
  options: NodeMarkdownOptions = {},
): string => {
  const level = Math.max(1, options.depth ?? 1)

  if (!node) {
    return infoMarkdown(store.document, level)
  }

  switch (node.type) {
    case 'operation':
    case 'webhook':
      return operationMarkdown(store, node, level, options.server)

    case 'model':
      return modelMarkdown(store, node, level)

    case 'tag':
    case 'group':
      return blocks(
        heading(level, node.title),
        node.type === 'tag' && node.description ? demoteHeadings(node.description, level) : undefined,
        asideMarkdown(declarationFor(store.document, node), level),
        ...node.children.map((child) => nodeToMarkdown(store, child, { ...options, depth: level + 1 })),
      )

    case 'text':
      /*
       * A description heading is part of the overview's prose, not a section of its own - the same
       * rule the plane follows. Copying one copies the overview it belongs to.
       */
      return infoMarkdown(store.document, level)
  }
}

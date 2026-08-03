/**
 * A large OpenAPI document, generated rather than fetched.
 *
 * The claim being demonstrated is that a document with hundreds of operations opens in well under a
 * second, and the honest way to show that is to let a reader produce one on their own machine and
 * time it there. A generator beats a vendored document on every axis that matters here: nothing is
 * committed, so `guard:specs` has nothing to object to and is not being worked around; nothing is
 * fetched, so the number is not measuring someone's CDN; and the size is a parameter, so the
 * interesting comparison - fifty against a thousand - is a slider rather than three files.
 *
 * This is a `.ts` module producing an object, not a document on disk. That is a real distinction
 * rather than a loophole: `guard:specs` exists to keep real API documents out of the repository, and
 * a parameterised generator is not one.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/** Something for the schema tree to render, so the sections are not trivially empty. */
const resourceSchema = (tag: string): Record<string, unknown> => ({
  type: 'object',
  required: ['id', 'name'],
  properties: {
    id: { type: 'string', format: 'uuid', description: `Identifier of the ${tag} resource.` },
    name: { type: 'string', description: 'Human-readable name.' },
    createdAt: { type: 'string', format: 'date-time' },
    tags: { type: 'array', items: { type: 'string' } },
    meta: {
      type: 'object',
      description: 'Free-form metadata.',
      additionalProperties: { type: 'string' },
    },
  },
})

/**
 * `operations` is a target rather than a promise: they are spread evenly across `tags`, so the
 * total is rounded to whole tags. The page reports what came back rather than what was asked for.
 */
export const makeLargeDocument = (operations: number, tags: number): Record<string, unknown> => {
  const perTag = Math.max(1, Math.round(operations / tags))
  const paths: Record<string, unknown> = {}
  const schemas: Record<string, unknown> = {}
  const tagList: { name: string; description: string }[] = []

  for (let tagIndex = 0; tagIndex < tags; tagIndex += 1) {
    const tag = `Resource ${tagIndex + 1}`
    tagList.push({ name: tag, description: `Operations on resource group ${tagIndex + 1}.` })
    schemas[`Resource${tagIndex + 1}`] = resourceSchema(tag)

    for (let index = 0; index < perTag; index += 1) {
      const method = METHODS[index % METHODS.length]!
      const path = `/resource-${tagIndex + 1}/item-${index + 1}`
      const existing = (paths[path] ?? {}) as Record<string, unknown>
      existing[method] = {
        tags: [tag],
        operationId: `resource${tagIndex + 1}Item${index + 1}${method}`,
        summary: `${method.toUpperCase()} item ${index + 1} of resource ${tagIndex + 1}`,
        description:
          'Generated for the scale demonstration. Every operation carries a body, parameters and two responses so that a section costs what a real one costs.',
        parameters: [
          {
            name: 'expand',
            in: 'query',
            description: 'Related resources to inline.',
            schema: { type: 'array', items: { type: 'string' } },
          },
          {
            name: 'X-Request-Id',
            in: 'header',
            description: 'Correlation id.',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: `#/components/schemas/Resource${tagIndex + 1}` } },
          },
        },
        responses: {
          '200': {
            description: 'The resource.',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/Resource${tagIndex + 1}` },
              },
            },
          },
          '404': { description: 'No such resource.' },
        },
      }
      paths[path] = existing
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: `Generated API — ${tags * perTag} operations`,
      version: '1.0.0',
      description:
        'This document was generated in the browser, just now, to time how long a large document takes to open. It is not fetched and it is not committed.',
    },
    tags: tagList,
    paths,
    components: { schemas },
  }
}

/** The sizes the page offers. Kept here so the page and any test agree on what "large" means. */
export const SCALE_STEPS: readonly { operations: number; tags: number }[] = [
  { operations: 50, tags: 5 },
  { operations: 250, tags: 15 },
  { operations: 1000, tags: 40 },
]

/** How many operations a generated document actually has, which is not always what was asked. */
export const operationCount = (document: Record<string, unknown>): number => {
  const paths = (document['paths'] ?? {}) as Record<string, Record<string, unknown>>
  return Object.values(paths).reduce((total, item) => total + Object.keys(item).length, 0)
}

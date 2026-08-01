/**
 * A small document that exercises what the shell and the operation page need: description headings,
 * two tags, an operation with an `operationId`, a deprecated one, models, and a webhook - plus a
 * path item whose parameters an operation overrides, two media types on a request body, and a
 * response with no content at all.
 *
 * Inline rather than read from disk because these tests run in a browser, where there is no `fs`.
 */
export const SHELL_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Shell API',
    version: '2.3.0',
    description: '# Getting started\n\nSome prose.\n\n## Authentication\n\nMore prose.',
  },
  servers: [{ url: 'https://api.example.com/v1', description: 'Production' }],
  /* A document-level requirement, so a generated sample shows where the credential goes. */
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'accounts', description: 'Everything about accounts.' },
    { name: 'admin', 'x-displayName': 'Administration' },
  ],
  paths: {
    '/accounts': {
      get: {
        summary: 'List accounts',
        operationId: 'listAccounts',
        tags: ['accounts'],
        description: 'Returns every account.',
        responses: { '200': { description: 'OK' } },
      },
      post: {
        summary: 'Create an account',
        operationId: 'createAccount',
        tags: ['accounts'],
        responses: { '201': { description: 'Created' } },
      },
    },
    '/accounts/{accountId}': {
      /* Path-level parameters: `accountId` is inherited as-is, `expand` is overridden below. */
      parameters: [
        {
          name: 'accountId',
          in: 'path',
          required: true,
          description: 'The account to read.',
          schema: { type: 'string', format: 'uuid' },
        },
        {
          name: 'expand',
          in: 'query',
          description: 'Declared on the path item.',
          schema: { type: 'string' },
        },
      ],
      get: {
        summary: 'Get an account',
        operationId: 'getAccount',
        tags: ['accounts'],
        parameters: [
          {
            name: 'expand',
            in: 'query',
            description: 'Declared on the operation.',
            schema: { type: 'string', enum: ['balance', 'owner'] },
          },
          /* Optional and exampleless: the HAR builder skips it, the table must not. */
          { name: 'X-Trace-Id', in: 'header', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'The account.',
            headers: {
              'X-Request-Id': { description: 'Correlation id.', schema: { type: 'string' } },
            },
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Account' } },
              'text/csv': { schema: { type: 'string' } },
            },
          },
          '404': { description: 'No account with that id.' },
          default: {
            description: 'Unexpected error.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      put: {
        summary: 'Replace an account',
        operationId: 'replaceAccount',
        tags: ['accounts'],
        requestBody: {
          required: true,
          description: 'The replacement account.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Account' } },
            'application/xml': { schema: { $ref: '#/components/schemas/Account' } },
          },
        },
        responses: { '204': { description: 'Replaced.' } },
      },
    },
    '/admin/purge': {
      delete: {
        summary: 'Purge everything',
        operationId: 'purge',
        tags: ['admin'],
        deprecated: true,
        responses: { '204': { description: 'No content' } },
      },
    },
  },
  webhooks: {
    accountCreated: {
      post: { summary: 'An account was created', responses: { '200': { description: 'OK' } } },
    },
  },
  components: {
    schemas: {
      Account: {
        type: 'object',
        description: 'A bank account.',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Opaque account id.' },
          balance: { type: 'integer', description: 'Minor units.' },
        },
      },
      Error: {
        type: 'object',
        properties: { message: { type: 'string' } },
      },
    },
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'A signed JWT.' },
    },
  },
} as const

/**
 * Self-reference and mutual recursion — the two shapes that make a naive schema walker hang.
 *
 * The same document as `packages/core/test/fixtures/cyclic.yaml`, inline because these tests run in
 * a browser and there is no `fs` to read a fixture from.
 */
export const CYCLIC_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Cyclic', version: '1.0.0' },
  paths: {
    '/tree': {
      get: {
        summary: 'Get the tree',
        tags: ['tree'],
        responses: {
          '200': {
            description: 'The root node',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Node: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          parent: { $ref: '#/components/schemas/Node' },
          children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
        },
      },
      Pair: {
        type: 'object',
        properties: { left: { $ref: '#/components/schemas/Other' } },
      },
      Other: {
        type: 'object',
        properties: { back: { $ref: '#/components/schemas/Pair' } },
      },
    },
  },
} as const

/** Composition keywords, each isolated so a failure names the keyword that broke. */
export const COMPOSITION_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Composition', version: '1.0.0' },
  paths: {
    '/pets': {
      post: {
        summary: 'Create a pet',
        tags: ['pets'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
  },
  components: {
    schemas: {
      Base: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      Named: { type: 'object', properties: { name: { type: 'string', description: 'What to call it.' } } },
      Pet: {
        allOf: [
          { $ref: '#/components/schemas/Base' },
          { $ref: '#/components/schemas/Named' },
          { type: 'object', properties: { legs: { type: 'integer', default: 4 } } },
        ],
      },
      Payment: {
        oneOf: [
          { title: 'Card', type: 'object', properties: { card: { type: 'string' } } },
          { title: 'Transfer', type: 'object', properties: { iban: { type: 'string' } } },
        ],
      },
      Status: { type: 'string', enum: ['active', 'archived'] },
      Nullable: { type: ['string', 'null'] },
      Dictionary: { type: 'object', additionalProperties: { type: 'integer' } },
      /* A nesting that is neither cyclic nor flat, so `expandAllSchemaProperties` has work to do. */
      Envelope: {
        type: 'object',
        properties: {
          payload: { $ref: '#/components/schemas/Pet' },
          meta: { type: 'object', properties: { version: { type: 'string' } } },
        },
      },
    },
  },
} as const

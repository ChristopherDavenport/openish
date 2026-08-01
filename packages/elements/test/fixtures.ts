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
  servers: [
    { url: 'https://api.example.com/v1', description: 'Production' },
    { url: 'https://sandbox.example.com/v1', description: 'Sandbox' },
  ],
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

/**
 * An OpenID Connect scheme with nothing but a discovery URL, which is what real documents declare -
 * the reference document in this repo has three of them. There is no token to paste until someone
 * has completed a flow, which is why the flow is part of the element and not of the host.
 */
export const OAUTH_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Secured API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  security: [{ consumer: ['openid'] }],
  paths: {
    '/accounts': {
      get: {
        summary: 'List accounts',
        operationId: 'listAccounts',
        tags: ['accounts'],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    securitySchemes: {
      consumer: {
        type: 'openIdConnect',
        openIdConnectUrl: 'https://issuer.example.com/.well-known/openid-configuration',
      },
    },
  },
} as const

/**
 * One operation, two ways to authenticate it.
 *
 * The shape `securityIndex` exists for: a reader holding the API key must not have the bearer header
 * sent on their behalf, which is what happened for as long as nothing passed the index through.
 */
export const EITHER_AUTH_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Either', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/accounts': {
      get: {
        summary: 'List accounts',
        operationId: 'listAccounts',
        tags: ['accounts'],
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      apiKeyAuth: { type: 'apiKey', name: 'X-Api-Key', in: 'header' },
    },
  },
} as const

/**
 * The constraint keywords a reference has to be able to say out loud, plus the three extensions that
 * explain an enum and name a map key.
 */
export const CONSTRAINTS_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Constraints', version: '1.0.0' },
  paths: {
    '/things': {
      get: {
        summary: 'List things',
        operationId: 'listThings',
        tags: ['things'],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    schemas: {
      Bounded: {
        type: 'object',
        required: ['count'],
        properties: {
          zulu: { type: 'string' },
          count: { type: 'integer', exclusiveMinimum: 0, exclusiveMaximum: 100, multipleOf: 5 },
          alpha: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8, uniqueItems: true },
          bag: { type: 'object', minProperties: 1, maxProperties: 4 },
          kind: { const: 'bounded' },
        },
      },
      Status: {
        type: 'string',
        enum: ['PENDING', 'SETTLED', 'REVERSED'],
        'x-enumDescriptions': {
          PENDING: 'Authorised, not yet captured.',
          SETTLED: 'Money has moved.',
        },
      },
      Codes: {
        type: 'string',
        enum: ['a', 'b'],
        'x-enum-varnames': ['ALPHA', 'BRAVO'],
      },
      Balances: {
        type: 'object',
        'x-additionalPropertiesName': 'currency',
        additionalProperties: { type: 'integer' },
      },
    },
  },
} as const

/** An operation whose author wrote the SDK call, in two spellings that must not both be read. */
export const CODE_SAMPLES_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Samples', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/accounts': {
      get: {
        summary: 'List accounts',
        operationId: 'listAccounts',
        tags: ['accounts'],
        'x-codeSamples': [
          { lang: 'node', label: 'Node.js SDK', source: 'await client.accounts.list()' },
          { lang: 'python', source: 'client.accounts.list()' },
        ],
        'x-stainless-snippets': {
          node: { source: 'GENERATED_AND_SHOULD_NOT_WIN' },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/plain': {
      get: {
        summary: 'Plain',
        operationId: 'plain',
        tags: ['accounts'],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
} as const

/** Operation annotations: stability, arbitrary badges, and the duplicate a document can create. */
export const BADGES_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Badged API', version: '1.0.0' },
  paths: {
    '/beta': {
      get: {
        summary: 'Beta thing',
        operationId: 'betaThing',
        tags: ['things'],
        'x-scalar-stability': 'experimental',
        'x-badges': [{ name: 'Beta', color: 'info' }, 'Rate limited'],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/old': {
      get: {
        summary: 'Old thing',
        operationId: 'oldThing',
        tags: ['things'],
        deprecated: true,
        'x-scalar-stability': 'deprecated',
        responses: { '200': { description: 'OK' } },
      },
    },
  },
} as const

/** Prose and field names that only a deeper index can find. */
export const SEARCHABLE_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Searchable', version: '1.0.0' },
  paths: {
    '/transfers': {
      post: {
        summary: 'Move money',
        operationId: 'createTransfer',
        tags: ['transfers'],
        description: 'Requests are idempotent when you supply a key.',
        parameters: [{ name: 'X-Correlation-Id', in: 'header', schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { destinationAccount: { type: 'string' }, amountMinor: { type: 'integer' } },
              },
            },
          },
        },
        responses: { '200': { description: 'The transfer was accepted.' } },
      },
    },
    '/unrelated': {
      get: {
        summary: 'Something else',
        operationId: 'unrelated',
        tags: ['transfers'],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    schemas: {
      Ledger: {
        type: 'object',
        description: 'A double-entry record.',
        properties: { postingDate: { type: 'string' } },
      },
    },
  },
} as const

/** One scheme per OAuth grant, so the form can be asked what it does with each. */
export const GRANTS_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Grants', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/machine': {
      get: {
        summary: 'Machine',
        operationId: 'machine',
        tags: ['grants'],
        security: [{ machine: ['read'] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/person': {
      get: {
        summary: 'Person',
        operationId: 'person',
        tags: ['grants'],
        security: [{ person: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/legacy': {
      get: {
        summary: 'Legacy',
        operationId: 'legacy',
        tags: ['grants'],
        security: [{ legacy: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    securitySchemes: {
      machine: {
        type: 'oauth2',
        flows: { clientCredentials: { tokenUrl: 'https://issuer.example.com/token', scopes: { read: 'Read' } } },
      },
      person: {
        type: 'oauth2',
        flows: { password: { tokenUrl: 'https://issuer.example.com/token', scopes: {} } },
      },
      legacy: {
        type: 'oauth2',
        flows: { implicit: { authorizationUrl: 'https://issuer.example.com/authorize', scopes: {} } },
      },
    },
  },
} as const

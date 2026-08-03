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
    /* Content for a column the introduction cannot generate one for. openish's own extension. */
    'x-openish-aside': '### Before you start\n\nEvery call needs an institution id.',
    /* And the spelling operations already use, read from `info` rather than from an operation. */
    'x-codeSamples': [{ lang: 'bash', label: 'Get a token', source: 'curl -X POST /token' }],
  },
  servers: [
    { url: 'https://api.example.com/v1', description: 'Production' },
    { url: 'https://sandbox.example.com/v1', description: 'Sandbox' },
  ],
  /* A document-level requirement, so a generated sample shows where the credential goes. */
  security: [{ bearerAuth: [] }],
  tags: [
    {
      name: 'accounts',
      description: 'Everything about accounts.',
      'x-openish-aside': 'Balances are in minor units.',
      'x-codeSamples': [
        { lang: 'bash', label: 'Shell', source: 'curl /accounts' },
        { lang: 'javascript', label: 'JavaScript', source: "fetch('/accounts')" },
      ],
    },
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
              'X-Request-Id': {
                description: 'Correlation id.',
                required: true,
                schema: { type: 'string' },
                example: 'req_8f2b',
              },
              /* On its way out, and the table has to say so rather than listing it like the rest. */
              'X-Legacy-Cursor': {
                description: 'Use the Link header.',
                deprecated: true,
                schema: { type: 'string' },
              },
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
    '/accounts/{accountId}/documents': {
      post: {
        summary: 'Attach a document',
        operationId: 'attachDocument',
        tags: ['accounts'],
        parameters: [{ name: 'accountId', in: 'path', required: true, schema: { type: 'string' } }],
        /*
         * An upload, described the way the specification provides for: the parts carry their own
         * content types, and without them a reader has a `string` where a PNG goes.
         */
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  scan: { type: 'string', format: 'binary' },
                  metadata: { type: 'object', properties: { kind: { type: 'string' } } },
                  note: { type: 'string' },
                },
              },
              encoding: {
                scan: { contentType: 'image/png', headers: { 'X-Checksum': { schema: { type: 'string' } } } },
                metadata: { contentType: 'application/json' },
                /* Says nothing, so it earns no row. */
                note: {},
              },
            },
          },
        },
        responses: { '201': { description: 'Attached.' } },
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
      post: {
        summary: 'An account was created',
        /* Standard `tags` on a standard Operation Object: the accounts tag lists this as an event. */
        tags: ['accounts'],
        /* The payload the API sends: a webhook's only instance, since nobody calls it. */
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Account' } } },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    schemas: {
      Account: {
        type: 'object',
        /* Redoc's convention, and the only way a schema can name a tag - JSON Schema has no `tags`. */
        'x-tags': ['accounts'],
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
 * JSON Schema keywords a 3.1 document may use that a 3.0 one could not.
 *
 * `Coordinate` is a tuple: `prefixItems` says position 0 is a number and position 1 a string, which
 * `array` alone cannot express. `Headers` constrains its *keys* two different ways. `Currency` has
 * more enum members than a one-line constraint should ever print.
 */
export const JSON_SCHEMA_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Keywords', version: '1.0.0' },
  paths: {
    '/points': {
      get: { summary: 'List points', operationId: 'listPoints', tags: ['points'], responses: { '200': { description: 'OK' } } },
    },
  },
  components: {
    schemas: {
      Coordinate: {
        type: 'array',
        prefixItems: [
          { type: 'number', description: 'Latitude.' },
          { type: 'string', description: 'A label.' },
        ],
        minItems: 1,
      },
      Headers: {
        type: 'object',
        propertyNames: { pattern: '^x-' },
        patternProperties: {
          '^x-count-': { type: 'integer' },
          '^x-name-': { type: 'string' },
        },
      },
      Keyed: {
        type: 'object',
        propertyNames: { enum: ['alpha', 'bravo'] },
        additionalProperties: { type: 'string' },
      },
      Currency: {
        type: 'string',
        enum: ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NZD', 'USD', 'ZAR'],
        'x-enumDescriptions': { GBP: 'Pounds sterling.' },
      },
      Shade: { type: 'string', enum: ['light', 'dark'] },
      /* A string that is not text: rendered as `string`, a reader sends the wrong thing. */
      Avatar: { type: 'string', contentMediaType: 'image/png', contentEncoding: 'base64' },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          billingAddress: { type: 'string' },
          billingPostcode: { type: 'string' },
          card: { type: 'string' },
        },
        dependentRequired: { billingAddress: ['billingPostcode'] },
        dependentSchemas: {
          card: { type: 'object', required: ['cvc'], properties: { cvc: { type: 'string' } } },
        },
      },
      Payment: {
        type: 'object',
        properties: { method: { type: 'string', enum: ['card', 'transfer'] } },
        if: { properties: { method: { const: 'card' } } },
        then: { required: ['pan'], properties: { pan: { type: 'string' } } },
        else: { required: ['iban'], properties: { iban: { type: 'string' } } },
      },
      /*
       * Both spellings of an example, which changed between 3.0 and 3.1.
       *
       * `example` is the singular 3.0 keyword and `examples` is JSON Schema's array. A reader wants
       * the value beside the field either way, and the generated example beside the tree picks the
       * singular first - so the tree has to as well, or the two disagree about `label`.
       */
      Sample: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'acc_1' },
          tags: { type: 'array', items: { type: 'string' }, examples: [['live', 'archived']] },
          label: { type: 'string', example: 'Primary', examples: ['Ignored'] },
          size: { type: 'integer', examples: [1, 2] },
        },
      },
      /*
       * The three shapes of `not`.
       *
       * `Excluded` has a body and gets the schema rendered; `NotText` is said by its type alone;
       * `NotBoth` is the commonest real one - two properties that may not appear together - and has
       * neither a type to name nor a body to draw, so it is said in words.
       */
      Excluded: {
        type: 'object',
        properties: { kind: { type: 'string' } },
        not: { properties: { legacyField: { type: 'string' } }, required: ['legacyField'] },
      },
      NotText: { not: { type: 'string' } },
      NotBoth: {
        type: 'object',
        properties: { card: { type: 'string' }, iban: { type: 'string' } },
        not: { required: ['card', 'iban'] },
      },
      /* A shape the author named without putting it in components; the tree used to say "object". */
      Titled: {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            title: 'Postal address',
            properties: { line1: { type: 'string' }, postcode: { type: 'string' } },
          },
          /* A title on something that already has a better label is a caption, not a type. */
          reference: { type: 'string', title: 'Reference' },
        },
      },
      /* A named scalar whose format is the only thing telling a reader what to send. */
      AccountId: { type: 'string', format: 'uuid' },
      Holder: {
        type: 'object',
        properties: { account: { $ref: '#/components/schemas/AccountId' } },
      },
      /* A condition too involved to paraphrase: the `if` schema renders in full instead. */
      Complex: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        if: { required: ['a', 'b'] },
        then: { properties: { both: { type: 'boolean' } } },
      },
    },
  },
} as const

/**
 * `$dynamicRef` and `$dynamicAnchor`, in the shape the Scalar galaxy document actually uses.
 *
 * `Page` is generic: it declares `itemType` as an unbound placeholder (`not: {}` matches nothing,
 * which is JSON Schema's way of saying a specialising schema has to bind it) and refers to it for
 * its items. `PageOfPlanets` binds the same name to `Planet` and refers to `Page` - so resolving the
 * reference needs the *dynamic* scope, not the lexical one, and the outermost binding wins.
 */
export const DYNAMIC_REF_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Dynamic', version: '1.0.0' },
  paths: {
    '/planets': {
      get: {
        summary: 'List planets',
        operationId: 'listPlanets',
        tags: ['planets'],
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PageOfPlanets' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Planet: {
        type: 'object',
        properties: { name: { type: 'string' }, moons: { type: 'integer' } },
      },
      Page: {
        type: 'object',
        $defs: { itemType: { $dynamicAnchor: 'itemType', not: {} } },
        properties: {
          data: { type: 'array', items: { $dynamicRef: '#itemType' } },
          total: { type: 'integer' },
        },
      },
      PageOfPlanets: {
        $defs: { itemType: { $dynamicAnchor: 'itemType', $ref: '#/components/schemas/Planet' } },
        $ref: '#/components/schemas/Page',
      },
    },
  },
} as const

/**
 * An operation that calls back, which is the one place the document describes a request the *API*
 * makes rather than one the reader makes.
 *
 * Two callbacks, one of them with two methods at the same expression, so the flattening has three
 * levels to get right and the count in the disclosure has something to be wrong about.
 */
export const CALLBACKS_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Callbacks', version: '1.0.0' },
  paths: {
    '/subscriptions': {
      post: {
        summary: 'Subscribe',
        operationId: 'subscribe',
        tags: ['hooks'],
        responses: { '201': { description: 'Created' } },
        callbacks: {
          onData: {
            '{$request.body#/callbackUrl}': {
              post: {
                summary: 'New data is ready',
                description: 'Sent whenever the ledger changes.',
                requestBody: {
                  content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } },
                },
                responses: { '204': { description: 'Acknowledged' } },
              },
              delete: {
                summary: 'The subscription was dropped',
                responses: { '204': { description: 'Acknowledged' } },
              },
            },
          },
          onError: {
            '{$request.body#/errorUrl}': {
              post: {
                summary: 'Something went wrong',
                parameters: [{ name: 'X-Attempt', in: 'header', schema: { type: 'integer' } }],
                responses: { '204': { description: 'Acknowledged' } },
              },
            },
          },
        },
      },
    },
  },
} as const

/**
 * How a parameter reaches the wire, which a table of names and types cannot say on its own.
 *
 * `filter` is the case the whole feature exists for: `style: deepObject` with `explode` makes
 * `?filter[status]=open`, and rendered as a bare `object` it is indistinguishable from the `form`
 * default that would make something else entirely. `region` is described by `content` rather than a
 * schema, which used to render an empty type cell.
 */
export const PARAMETER_DETAIL_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Parameters', version: '1.0.0' },
  paths: {
    '/things': {
      get: {
        summary: 'List things',
        operationId: 'listThings',
        tags: ['things'],
        parameters: [
          {
            name: 'filter',
            in: 'query',
            style: 'deepObject',
            explode: true,
            schema: { type: 'object', properties: { status: { type: 'string' } } },
          },
          {
            name: 'tags',
            in: 'query',
            explode: false,
            allowReserved: true,
            schema: { type: 'array', items: { type: 'string' } },
            examples: {
              one: { summary: 'A single tag', value: ['ledger'] },
              many: { value: ['ledger', 'audit'] },
            },
          },
          {
            name: 'region',
            in: 'query',
            content: { 'application/json': { schema: { type: 'object', properties: { iso: { type: 'string' } } } } },
          },
          { name: 'debug', in: 'query', allowEmptyValue: true, schema: { type: 'boolean' } },
          { name: 'plain', in: 'query', schema: { type: 'string' }, example: 'hello' },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
} as const

/**
 * The half of a document that is about the document: who wrote it, under what licence, and where the
 * rest of the story is.
 *
 * `externalDocs` appears at all four levels it is allowed at - document, tag, operation and schema -
 * because they are four separate call sites and a fixture covering one proves nothing about the
 * other three. The OAuth scheme carries two flows so the scope lists cannot be confused for one.
 */
export const DOCUMENT_INFO_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Chronicle',
    version: '2.1.0',
    summary: 'A ledger you can read.',
    description: 'The long version.',
    termsOfService: 'https://example.com/terms',
    contact: { name: 'The API team', url: 'https://example.com/support', email: 'api@example.com' },
    license: { name: 'Apache 2.0', identifier: 'Apache-2.0', url: 'https://example.com/licence' },
  },
  externalDocs: { url: 'https://example.com/guides', description: 'Guides and tutorials' },
  security: [{ ledger: ['entries:read'] }],
  tags: [
    {
      name: 'entries',
      description: 'Ledger entries.',
      externalDocs: { url: 'https://example.com/guides/entries', description: 'The entries guide' },
    },
  ],
  paths: {
    '/entries': {
      get: {
        summary: 'List entries',
        operationId: 'listEntries',
        tags: ['entries'],
        externalDocs: { url: 'https://example.com/guides/list' },
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Entry' } } },
            /* The one place OpenAPI says how two operations join up. Nobody renders it. */
            links: {
              entry: {
                operationId: 'getEntry',
                description: 'The entry this row names.',
                parameters: { entryId: '$response.body#/id' },
              },
            },
          },
        },
      },
    },
    '/entries/{entryId}': {
      get: {
        summary: 'Get entry',
        operationId: 'getEntry',
        tags: ['entries'],
        parameters: [{ name: 'entryId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    schemas: {
      Entry: {
        type: 'object',
        externalDocs: { url: 'https://example.com/guides/entry-model', description: 'How an entry is built' },
        properties: { id: { type: 'string' } },
      },
    },
    securitySchemes: {
      ledger: {
        type: 'oauth2',
        description: 'Sign in with the ledger.',
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://issuer.example.com/authorize',
            tokenUrl: 'https://issuer.example.com/token',
            refreshUrl: 'https://issuer.example.com/refresh',
            scopes: { 'entries:read': 'Read the ledger', 'entries:write': 'Write to the ledger' },
          },
          clientCredentials: {
            tokenUrl: 'https://issuer.example.com/machine-token',
            scopes: { 'entries:audit': 'Audit the ledger' },
          },
        },
      },
    },
  },
} as const

/**
 * Every shape `security` takes, one operation each, so a failure names the shape that broke.
 *
 * The document declares a requirement of its own, which `/inherited` never overrides and `/public`
 * opts out of with an empty array - the two halves of the rule that an operation's `security`
 * replaces the document's rather than adding to it.
 */
export const OPERATION_SECURITY_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Secured', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/inherited': {
      get: { summary: 'Inherited', operationId: 'inherited', tags: ['secured'], responses: { '200': { description: 'OK' } } },
    },
    '/either': {
      get: {
        summary: 'Either',
        operationId: 'either',
        tags: ['secured'],
        security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/both': {
      get: {
        summary: 'Both',
        operationId: 'both',
        tags: ['secured'],
        security: [{ apiKeyAuth: [], signature: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/scoped': {
      get: {
        summary: 'Scoped',
        operationId: 'scoped',
        tags: ['secured'],
        security: [{ machine: ['accounts:read', 'accounts:write'] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/maybe': {
      get: {
        summary: 'Maybe',
        operationId: 'maybe',
        tags: ['secured'],
        security: [{}, { bearerAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/public': {
      get: {
        summary: 'Public',
        operationId: 'publicThing',
        tags: ['secured'],
        security: [],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/ghost': {
      get: {
        summary: 'Ghost',
        operationId: 'ghost',
        tags: ['secured'],
        security: [{ ghost: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      apiKeyAuth: { type: 'apiKey', name: 'X-Api-Key', in: 'header' },
      signature: { type: 'apiKey', name: 'X-Signature', in: 'header' },
      machine: {
        type: 'oauth2',
        flows: {
          clientCredentials: {
            tokenUrl: 'https://issuer.example.com/token',
            scopes: { 'accounts:read': 'Read accounts', 'accounts:write': 'Move money' },
          },
        },
      },
    },
  },
} as const

/**
 * Named examples, which are the half of the Media Type Object a reference has to offer rather than
 * pick from.
 *
 * `/accounts` has three, one of them external; `/ping` has the singular keyword and no names, which
 * must not produce a picker with one option in it.
 */
export const EXAMPLES_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Examples', version: '1.0.0' },
  paths: {
    '/accounts': {
      get: {
        summary: 'List accounts',
        operationId: 'listAccounts',
        tags: ['accounts'],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Account' },
                examples: {
                  settled: {
                    summary: 'A settled account',
                    description: 'The balance has cleared.',
                    value: { id: 'acc_1', balance: 500 },
                  },
                  overdrawn: { summary: 'An overdrawn account', value: { id: 'acc_2', balance: -250 } },
                  archive: { summary: 'A year of them', externalValue: 'https://example.com/accounts.json' },
                },
              },
            },
          },
        },
      },
    },
    '/accounts/{accountId}': {
      get: {
        summary: 'Get an account',
        operationId: 'getAccount',
        tags: ['accounts'],
        responses: {
          '200': {
            description: 'OK',
            /* One account offered in two syntaxes. The example under each tab has to be written in
             * the syntax that tab names, which is what `xml` on the schema decides. */
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/XmlAccount' } },
              'application/xml': { schema: { $ref: '#/components/schemas/XmlAccount' } },
            },
          },
        },
      },
    },
    '/ping': {
      get: {
        summary: 'Ping',
        operationId: 'ping',
        tags: ['accounts'],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { type: 'object' }, example: { pong: true } },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Account: {
        type: 'object',
        properties: { id: { type: 'string' }, balance: { type: 'integer' } },
      },
      XmlAccount: {
        type: 'object',
        xml: { name: 'account' },
        properties: {
          id: { type: 'string', example: 'acc_1', xml: { attribute: true } },
          balance: { type: 'integer', example: 500 },
        },
      },
    },
  },
} as const

/**
 * A document whose shapes are choices, for the seam between the two columns.
 *
 * The tree that offers a `oneOf` is in the documentation column and the example that has to honour
 * it is in the other one, so everything here exists to be picked in one place and read in another:
 * a variant at the root of a request body, a second one nested inside the branch of the first, two
 * media types, and two statuses.
 */
export const VARIANTS_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Pets', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/pets': {
      post: {
        summary: 'Create a pet',
        operationId: 'createPet',
        tags: ['pets'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
        },
        responses: {
          '201': {
            description: 'Created.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Pet' } },
              'application/xml': { schema: { $ref: '#/components/schemas/Pet' } },
            },
          },
          '404': {
            description: 'No such owner.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
      },
      Cat: {
        type: 'object',
        title: 'Cat',
        properties: { kind: { type: 'string', example: 'cat' }, lives: { type: 'integer', example: 9 } },
      },
      Dog: {
        type: 'object',
        title: 'Dog',
        properties: {
          kind: { type: 'string', example: 'dog' },
          /* A choice inside a choice: only reachable once the reader has taken the outer one. */
          collar: {
            oneOf: [
              { type: 'object', title: 'Nylon', properties: { material: { type: 'string', example: 'nylon' } } },
              { type: 'object', title: 'Leather', properties: { material: { type: 'string', example: 'leather' } } },
            ],
          },
        },
      },
      Error: { type: 'object', properties: { message: { type: 'string', example: 'Not found' } } },
    },
  },
} as const

/**
 * Three shapes Scalar renders wrongly today, kept as a fixture so a regression here is caught rather
 * than assumed away.
 *
 * These are not our bugs; they are the ones the evaluation claims we do not share, and a claim like
 * that is worth exactly as much as the test behind it. Each is named for the report it came from:
 *
 * - `Cat` — a variant composing a discriminated base with `allOf`. Scalar re-renders the base
 *   recursively (scalar#9771). Ours flattens, because `schemaProperties` merges `allOf` and
 *   `schemaVariants` only fires on `oneOf`/`anyOf`.
 * - `Described` — a `$ref` with a sibling `description`, in both spellings. Scalar resolves the
 *   `allOf` form to `null` (scalar#8753), which is the shape `zod-to-openapi` emits constantly.
 * - `ChoiceList` — a discriminated union used as array `items` rather than as a property. Scalar
 *   offers no variant selector there.
 */
export const SCALAR_REGRESSIONS_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Regressions', version: '1.0.0' },
  paths: {
    '/pets': {
      get: {
        summary: 'List pets',
        tags: ['pets'],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    schemas: {
      Animal: {
        type: 'object',
        required: ['petType'],
        properties: { petType: { type: 'string' } },
        discriminator: {
          propertyName: 'petType',
          mapping: { cat: '#/components/schemas/Cat', dog: '#/components/schemas/Dog' },
        },
      },
      Cat: {
        allOf: [
          { $ref: '#/components/schemas/Animal' },
          { type: 'object', properties: { huntingSkill: { type: 'string' } } },
        ],
      },
      Dog: {
        allOf: [
          { $ref: '#/components/schemas/Animal' },
          { type: 'object', properties: { packSize: { type: 'integer' } } },
        ],
      },
      Base: { type: 'object', description: 'The base.', properties: { id: { type: 'string' } } },
      Described: {
        type: 'object',
        properties: {
          viaAllOf: {
            allOf: [{ $ref: '#/components/schemas/Base' }],
            description: 'Overridden through allOf.',
          },
          viaSibling: { $ref: '#/components/schemas/Base', description: 'Overridden through a sibling key.' },
        },
      },
      Choice: {
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: {
          propertyName: 'petType',
          mapping: { cat: '#/components/schemas/Cat', dog: '#/components/schemas/Dog' },
        },
      },
      ChoiceList: { type: 'array', items: { $ref: '#/components/schemas/Choice' } },
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
        parameters: [
          /* Optional with a default, which is the pair the row's head line has to say together. */
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 100 } },
          /* Optional with nothing to fall back to: the word alone, and no default beside it. */
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          /* A default the caller can never reach. The document said it, so the page says it. */
          { name: 'thingId', in: 'path', required: true, schema: { type: 'string', default: 'first' } },
        ],
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
          /* A body property keeps its default among the constraints - only parameters promote it. */
          zulu: { type: 'string', default: 'z' },
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
      /* The two boolean forms, which are a contract and used to render as nothing at all. */
      Closed: {
        type: 'object',
        properties: { id: { type: 'string' } },
        additionalProperties: false,
      },
      Open: {
        type: 'object',
        properties: { id: { type: 'string' } },
        additionalProperties: true,
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

/**
 * Responses whose shape has no name, and a response with no shape at all.
 *
 * The two cases the payload identity has to answer differently: an inline object names nothing, so
 * the type is dropped and the chip stays - it is what says which of the rows below are the body's -
 * and a status that promises only headers has no body to introduce, so nothing is said.
 */
export const INLINE_RESPONSE_SPEC = {
  openapi: '3.1.0',
  info: { title: 'Inline', version: '1.0.0' },
  paths: {
    '/inline': {
      get: {
        summary: 'Inline thing',
        operationId: 'inlineThing',
        tags: ['things'],
        responses: {
          '200': {
            description: 'OK',
            headers: { 'X-Request-ID': { schema: { type: 'string' }, description: 'The request.' } },
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'string' }, size: { type: 'integer' } } },
              },
            },
          },
        },
      },
    },
    '/empty': {
      get: {
        summary: 'Empty thing',
        operationId: 'emptyThing',
        tags: ['things'],
        responses: {
          '200': {
            description: 'OK',
            headers: { 'X-Request-ID': { schema: { type: 'string' }, description: 'The request.' } },
          },
        },
      },
    },
  },
} as const

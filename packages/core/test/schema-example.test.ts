import { describe, expect, it } from 'vitest'

import { schemaExample } from '../src/schema/schema-example.js'
import { storeFromFixture } from './helpers.js'

describe('schemaExample', () => {
  it('prefers what the author supplied, in order', () => {
    expect(schemaExample({ type: 'string', example: 'from-example', default: 'from-default' })).toBe('from-example')
    expect(schemaExample({ type: 'string', examples: ['from-examples'], default: 'x' })).toBe('from-examples')
    expect(schemaExample({ type: 'string', default: 'from-default' })).toBe('from-default')
    expect(schemaExample({ const: 'from-const' })).toBe('from-const')
    expect(schemaExample({ type: 'string', enum: ['first', 'second'] })).toBe('first')
  })

  it('synthesises values from type and format', () => {
    expect(schemaExample({ type: 'string' })).toBe('string')
    expect(schemaExample({ type: 'string', format: 'date-time' })).toBe('2024-01-01T00:00:00Z')
    expect(schemaExample({ type: 'string', format: 'uuid' })).toBe('00000000-0000-0000-0000-000000000000')
    expect(schemaExample({ type: 'integer' })).toBe(0)
    expect(schemaExample({ type: 'integer', minimum: 5 })).toBe(5)
    expect(schemaExample({ type: 'boolean' })).toBe(true)
    expect(schemaExample({ type: 'null' })).toBeNull()
  })

  it('samples a nullable union as its non-null type', () => {
    expect(schemaExample({ type: ['string', 'null'] })).toBe('string')
  })

  it('builds objects and arrays', () => {
    expect(schemaExample({ type: 'object', properties: { id: { type: 'string' } } })).toEqual({ id: 'string' })
    expect(schemaExample({ type: 'array', items: { type: 'integer' } })).toEqual([0])
  })

  it('shows one entry for a map-shaped schema', () => {
    expect(schemaExample({ type: 'object', additionalProperties: { type: 'integer' } })).toEqual({ key: 0 })
  })

  it('can restrict output to required properties', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' }, note: { type: 'string' } },
    }

    expect(schemaExample(schema)).toEqual({ id: 'string', note: 'string' })
    expect(schemaExample(schema, { includeOptional: false })).toEqual({ id: 'string' })
  })

  it('omits writeOnly properties', () => {
    const schema = {
      type: 'object',
      properties: { id: { type: 'string' }, secret: { type: 'string', writeOnly: true } },
    }

    expect(schemaExample(schema)).toEqual({ id: 'string' })
  })

  describe('against the composition fixture', () => {
    it('merges every allOf branch', async () => {
      const store = await storeFromFixture('composition.yaml')

      expect(schemaExample(store.document.components?.schemas?.['Pet'])).toEqual({
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Rex',
        legs: 4,
      })
    })

    it('takes the first branch of a oneOf', async () => {
      const store = await storeFromFixture('composition.yaml')

      expect(schemaExample(store.document.components?.schemas?.['Payment'])).toEqual({ card: '4242' })
    })
  })

  describe('against the cyclic fixture', () => {
    /*
     * A recursive schema renders one level of nesting and then stops. That is deliberate: showing
     * `{ id, parent: { id, parent: … } }` communicates the shape, where truncating at the first
     * reference would only show `{ id, parent: … }` and hide the recursion entirely.
     *
     * Where it stops it says so. It used to write `null`, which a reader copying the sample cannot
     * tell from a field the document really does send as null - and `parent` is never null here, it
     * is another Node. The ellipsis carries the name of what was cut, because at a `$ref` the walker
     * knows it.
     */
    it('renders one level of a self-referential schema, then stops', async () => {
      const store = await storeFromFixture('cyclic.yaml')

      const value = schemaExample(store.document.components?.schemas?.['Node'])

      /*
       * Two spellings of the same stop, and both are honest: `children` is cut as an array whose
       * item is a Node, and one level further down the array's own schema has already been walked,
       * so the walk ends at the property rather than inside it.
       */
      expect(value).toEqual({
        id: 'string',
        parent: { id: 'string', parent: '… (Node)', children: ['… (Node)'] },
        children: [{ id: 'string', parent: '… (Node)', children: '…' }],
      })
    })

    it('terminates on mutual recursion', async () => {
      const store = await storeFromFixture('cyclic.yaml')

      expect(schemaExample(store.document.components?.schemas?.['Pair'])).toEqual({
        left: { back: { left: '… (Other)' } },
      })
    })

    it('terminates when entered at a reference rather than the resolved schema', async () => {
      const store = await storeFromFixture('cyclic.yaml')
      const node = store.document.components?.schemas?.['Node'] as Record<string, Record<string, unknown>>

      /* `Node.properties.parent` is still a `$ref` in the proxied document - the guard's real input. */
      const value = schemaExample(node['properties']?.['parent'])

      expect(value).toEqual({ id: 'string', parent: '… (Node)', children: ['… (Node)'] })
    })

    it('stops at the depth cap even without a cycle', () => {
      /* Build a finite but very deep schema; the cap is what ends this one. */
      let schema: Record<string, unknown> = { type: 'string' }
      for (let depth = 0; depth < 50; depth += 1) {
        schema = { type: 'object', properties: { next: schema } }
      }

      const value = schemaExample(schema, { maxDepth: 3 }) as Record<string, unknown>

      /* No name to carry here: the cap is a count, not a reference to anything. */
      expect(value).toEqual({ next: { next: { next: '…' } } })
    })
  })
})

describe('dynamic references', () => {
  const PAGE = {
    type: 'object',
    $defs: { itemType: { $dynamicAnchor: 'itemType', not: {} } },
    properties: { data: { type: 'array', items: { $dynamicRef: '#itemType' } } },
  }

  /* Nothing validates against the placeholder, so there is no example to invent. */
  it('gives an unbound item type no value rather than an empty object', () => {
    expect(schemaExample(PAGE)).toEqual({ data: [] })
  })

  it('uses the binding a specialising schema makes', () => {
    const specialised = {
      ...PAGE,
      $defs: { itemType: { $dynamicAnchor: 'itemType', type: 'object', properties: { name: { type: 'string' } } } },
    }

    expect(schemaExample(specialised)).toEqual({ data: [{ name: 'string' }] })
  })

  /* The outermost binding wins, which is the whole reason the scope travels rather than being read. */
  it('keeps the outer binding when an inner schema declares the same name', () => {
    const inner = {
      ...PAGE,
      $defs: { itemType: { $dynamicAnchor: 'itemType', type: 'integer' } },
    }
    const outer = {
      $defs: { itemType: { $dynamicAnchor: 'itemType', type: 'string' } },
      type: 'object',
      properties: { page: inner },
    }

    expect(schemaExample(outer)).toEqual({ page: { data: ['string'] } })
  })
})

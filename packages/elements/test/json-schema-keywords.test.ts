import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { DYNAMIC_REF_SPEC, JSON_SCHEMA_SPEC, SCALAR_REGRESSIONS_SPEC } from './fixtures.js'
import {
  deepQuery,
  deepTextOf,
  disposeAll,
  mountReference,
  schemaFor,
  schemaRows,
  shadowOf,
  textOf,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

const modelSchema = async (
  spec: unknown,
  name: string,
): Promise<{ harness: Harness; schema: Element }> => {
  const harness = await mountReference({ path: `/models/${name}`, spec })
  const schema = shadowOf(harness.element.shadowRoot!, 'openish-model').querySelector('openish-schema')
  if (!schema) {
    throw new Error(`No schema tree on the ${name} page.`)
  }
  return { harness, schema }
}

describe('prefixItems', () => {
  it('names the type by its positions rather than calling it an array', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Coordinate')

    expect(textOf(schema.shadowRoot!.querySelector('.type'))).toBe('[number, string]')
  })

  it('renders one row per position, in order, never reordered', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Coordinate')

    expect(schemaRows(schema)).toEqual([
      { name: '[0]', type: 'number', required: 'required' },
      /* `minItems: 1` means only the first position is guaranteed to be there. */
      { name: '[1]', type: 'string', required: 'optional' },
    ])
  })
})

describe('key constraints', () => {
  it('says what the keys of an object have to match', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Headers')

    expect(textOf(schema.shadowRoot!.querySelector('.constraints'))).toContain('keys match ^x-')
  })

  it('lists the keys when the document enumerates them', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Keyed')

    expect(textOf(schema.shadowRoot!.querySelector('.constraints'))).toContain('keys: one of alpha, bravo')
  })

  it('gives each patternProperties entry a row of its own', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Headers')

    expect(schemaRows(schema)).toEqual([
      { name: '[key matching /^x-count-/]', type: 'integer', required: '' },
      { name: '[key matching /^x-name-/]', type: 'string', required: '' },
    ])
  })
})

describe('a long enum', () => {
  it('caps the constraint line and says how many were left off', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Currency')
    const constraints = textOf(schema.shadowRoot!.querySelector('.constraints'))

    expect(constraints).toContain('one of AUD, CAD, CHF, EUR, GBP, JPY and 3 more')
    expect(constraints).not.toContain('ZAR')
  })

  it('puts every value behind a disclosure, with the descriptions the document gave', async () => {
    const { harness, schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Currency')
    const disclosure = schema.shadowRoot!.querySelector('openish-disclosure')!

    expect(disclosure.getAttribute('hint')).toBe('9')
    expect(schema.shadowRoot!.querySelectorAll('dl.enum dt')).toHaveLength(0)

    disclosure.shadowRoot!.querySelector('button')!.click()
    await harness.settle()

    const values = [...schema.shadowRoot!.querySelectorAll('dl.enum dt')].map((one) => textOf(one))
    expect(values).toHaveLength(9)
    expect(values).toContain('ZAR')
    expect(textOf(schema.shadowRoot!.querySelector('dl.enum dd + dt + dd'))).toBeDefined()
  })

  /* A short enum is already on the constraint line; a second copy underneath it is noise. */
  it('leaves a short enum inline, with no disclosure', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Shade')

    expect(textOf(schema.shadowRoot!.querySelector('.constraints'))).toContain('one of light, dark')
    expect(schema.shadowRoot!.querySelector('openish-disclosure')).toBeNull()
  })
})

describe('a discriminator with no oneOf', () => {
  /*
   * The document named the deciding property and the schema each value selects. That is a union,
   * written without the keyword - and rendering only the base leaves the reader with no route to
   * the shape they will actually receive.
   */
  it('infers the variants from the mapping', async () => {
    const { schema } = await modelSchema(SCALAR_REGRESSIONS_SPEC, 'Animal')
    const tabs = deepQuery(schema.shadowRoot!, 'openish-tabs')

    expect(tabs).not.toBeNull()
    expect(
      [...tabs!.shadowRoot!.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].map((tab) => textOf(tab)),
    ).toEqual(['cat', 'dog'])
  })

  /*
   * The mapped schemas compose the base with allOf. Inferring variants for them too would expand
   * the base inside each of its own branches - which is exactly the bug this feature has in Scalar.
   */
  it('does not re-infer inside a branch, which is where the recursion would start', async () => {
    const { harness, schema } = await modelSchema(SCALAR_REGRESSIONS_SPEC, 'Animal')
    const tabs = deepQuery(schema.shadowRoot!, 'openish-tabs')!
    await harness.settle()

    const panel = tabs.shadowRoot!.querySelector('[role="tabpanel"]')!
    const nested = deepQuery(panel, 'openish-schema')!

    expect(deepQuery(nested.shadowRoot!, 'openish-tabs')).toBeNull()
    expect(schemaRows(nested).map((row) => row.name)).toEqual(['petType', 'huntingSkill'])
  })
})

describe('the content keywords', () => {
  /* `string` alone tells a reader to send text. It is a PNG. */
  it('says what a string actually carries', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Avatar')
    const constraints = textOf(schema.shadowRoot!.querySelector('.constraints'))

    expect(constraints).toContain('image/png content')
    expect(constraints).toContain('base64-encoded')
  })
})

describe('the dependency keywords', () => {
  it('states a requirement that only applies when another property is sent', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Order')

    expect(textOf(schema.shadowRoot!.querySelector('.constraints'))).toContain(
      'with billingAddress: also requires billingPostcode',
    )
  })

  it('renders the extra shape a property brings with it', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Order')
    const rule = schema.shadowRoot!.querySelector('.rule')!

    expect(textOf(rule.querySelector('.rule-label'))).toBe('When card is present')
    expect(deepTextOf(rule)).toContain('cvc')
  })
})

describe('if/then/else', () => {
  it('reads a plain discriminant as the rule the author meant', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Payment')
    const labels = [...schema.shadowRoot!.querySelectorAll('.rule-label')].map((one) => textOf(one))

    expect(labels).toEqual(['If method is card', 'then', 'otherwise'])
  })

  it('renders both branches, so the reader can see which fields each one needs', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Payment')
    const rule = deepTextOf(schema.shadowRoot!.querySelector('.rule')!)

    expect(rule).toContain('pan')
    expect(rule).toContain('iban')
  })

  /* A condition that is not a single discriminant is shown, not paraphrased into something untrue. */
  it('renders the condition in full when it cannot be summarised', async () => {
    const { schema } = await modelSchema(JSON_SCHEMA_SPEC, 'Complex')
    const labels = [...schema.shadowRoot!.querySelectorAll('.rule-label')].map((one) => textOf(one))

    expect(labels).toEqual(['If it matches', 'then'])
  })
})

describe('$dynamicRef', () => {
  /*
   * The generic on its own: `itemType` is declared but unbound, and the honest answer is that a
   * specialising schema decides. Rendering the `not: {}` placeholder as an ordinary `not` would say
   * the item may be anything except everything, which is true and useless.
   */
  it('says an unbound item type is decided by the specialising schema', async () => {
    const { harness, schema } = await modelSchema(DYNAMIC_REF_SPEC, 'Page')
    const data = schemaFor(schema, 'data')
    if (!data) {
      throw new Error('No nested schema for data.')
    }
    await harness.settle()

    expect(deepTextOf(data.shadowRoot!)).toContain('Decided by the schema that specialises this one')
    expect(deepTextOf(data.shadowRoot!)).toContain('itemType')
  })

  it('resolves the item type through the binding a specialising schema makes', async () => {
    const { harness, schema } = await modelSchema(DYNAMIC_REF_SPEC, 'PageOfPlanets')
    const data = schemaFor(schema, 'data')
    if (!data) {
      throw new Error('No nested schema for data.')
    }
    await harness.settle()

    /* The outermost binding wins, so the items are Planets rather than the placeholder. */
    const text = deepTextOf(data.shadowRoot!)
    expect(text).not.toContain('Decided by the schema that specialises this one')
    expect(text).toContain('Planet')
  })

  it('carries the binding into the properties of the resolved item type', async () => {
    const { harness, schema } = await modelSchema(DYNAMIC_REF_SPEC, 'PageOfPlanets')
    const data = schemaFor(schema, 'data')!
    await harness.settle()

    /* Nested properties live behind a closed disclosure, which is what keeps a big tree cheap. */
    const nested = deepQuery(data.shadowRoot!, 'openish-schema')!
    nested.shadowRoot!.querySelector('openish-disclosure')!.shadowRoot!.querySelector('button')!.click()
    await harness.settle()

    expect(schemaRows(nested).map((row) => row.name)).toEqual(['name', 'moons'])
  })
})

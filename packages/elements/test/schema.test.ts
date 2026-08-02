import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { COMPOSITION_SPEC, CYCLIC_SPEC, SCALAR_REGRESSIONS_SPEC } from './fixtures.js'
import {
  deepQuery,
  deepTextOf,
  disposeAll,
  mountReference,
  openBodies,
  schemaFor,
  schemaRows,
  shadowOf,
  textOf,
  sectionOf,
  titleOf,
  type Harness,
} from './helpers.js'

afterEach(() => {
  disposeAll()
})

/** The `<openish-schema>` a model page renders for the model itself. */
const modelSchema = async (
  spec: unknown,
  name: string,
  config?: Record<string, unknown>,
): Promise<{ harness: Harness; schema: Element }> => {
  const harness = await mountReference(
    config ? { path: `/models/${name}`, spec, config } : { path: `/models/${name}`, spec },
  )
  const model = shadowOf(sectionOf(harness), 'openish-model')
  const schema = model.querySelector('openish-schema')
  if (!schema) {
    throw new Error(`No schema tree on the ${name} page.`)
  }
  return { harness, schema }
}

describe('recursion', () => {
  it('renders a self-referential schema without expanding it a second time', async () => {
    const { schema } = await modelSchema(CYCLIC_SPEC, 'Node')

    expect(schemaRows(schema)).toEqual([
      { name: 'id', type: 'string', required: 'required' },
      { name: 'parent', type: 'Node', required: 'optional' },
      { name: 'children', type: 'Node[]', required: 'optional' },
    ])
  })

  it('links a repeated schema to its own page instead of expanding it', async () => {
    const { schema } = await modelSchema(CYCLIC_SPEC, 'Node')
    const parent = schemaFor(schema, 'parent')!

    expect(deepTextOf(parent.shadowRoot!)).toContain('Recursive')
    expect(parent.shadowRoot!.querySelector('a')?.getAttribute('href')).toBe('#/models/Node')
    /* A link, not a disclosure: there is nothing to open that is not already on that page. */
    expect(parent.shadowRoot!.querySelector('openish-disclosure')).toBeNull()
  })

  it('stops at the item schema of a self-referential array too', async () => {
    const { schema } = await modelSchema(CYCLIC_SPEC, 'Node')
    const children = schemaFor(schema, 'children')!

    expect(children.shadowRoot!.querySelector('a')?.getAttribute('href')).toBe('#/models/Node')
  })

  it('terminates on mutual recursion, one level further down', async () => {
    const { harness, schema } = await modelSchema(CYCLIC_SPEC, 'Pair')

    /* Pair -> Other is not a repeat, so it opens. */
    const left = schemaFor(schema, 'left')!
    const disclosure = left.shadowRoot!.querySelector('openish-disclosure')!
    disclosure.shadowRoot!.querySelector('button')!.click()
    await harness.settle()

    expect(schemaRows(left)).toEqual([{ name: 'back', type: 'Pair', required: 'optional' }])

    /* Other -> Pair is, so it stops. */
    const back = schemaFor(left, 'back')!
    expect(back.shadowRoot!.querySelector('a')?.getAttribute('href')).toBe('#/models/Pair')
  })

  it('renders nothing inside a disclosure until it is opened', async () => {
    const { harness, schema } = await modelSchema(CYCLIC_SPEC, 'Pair')
    const left = schemaFor(schema, 'left')!

    expect(left.shadowRoot!.querySelectorAll('li')).toHaveLength(0)

    left.shadowRoot!.querySelector('openish-disclosure')!.shadowRoot!.querySelector('button')!.click()
    await harness.settle()

    expect(left.shadowRoot!.querySelectorAll('li')).toHaveLength(1)
  })

  it('carries the path down as context, not as a property', async () => {
    const { schema } = await modelSchema(CYCLIC_SPEC, 'Node')
    const provided = (schema as Element & { provided: { depth: number; seenRefs: ReadonlySet<string> } }).provided

    expect(provided.depth).toBe(1)
    expect([...provided.seenRefs]).toEqual(['#/components/schemas/Node'])
  })
})

describe('composition', () => {
  it('merges allOf branches into one property list', async () => {
    const { schema } = await modelSchema(COMPOSITION_SPEC, 'Pet')

    expect(schemaRows(schema)).toEqual([
      { name: 'id', type: 'string (uuid)', required: 'required' },
      { name: 'name', type: 'string', required: 'optional' },
      { name: 'legs', type: 'integer', required: 'optional' },
    ])
    /* `required` came from one branch and the property from another; the merge keeps both. */
    expect(deepTextOf(schema.shadowRoot!)).toContain('What to call it.')
  })

  it('renders oneOf as variants the reader switches between', async () => {
    const { harness, schema } = await modelSchema(COMPOSITION_SPEC, 'Payment')
    const tabs = deepQuery(schema.shadowRoot!, 'openish-tabs')!
    const buttons = () => [...tabs.shadowRoot!.querySelectorAll<HTMLButtonElement>('button[role="tab"]')]

    expect(buttons().map((tab) => textOf(tab))).toEqual(['Card', 'Transfer'])
    expect(deepTextOf(tabs.shadowRoot!)).toContain('card')
    expect(deepTextOf(tabs.shadowRoot!)).not.toContain('iban')

    buttons()[1]!.click()
    await harness.settle()

    expect(deepTextOf(tabs.shadowRoot!)).toContain('iban')
    expect(buttons()[1]!.getAttribute('aria-selected')).toBe('true')
  })

  it('names a nullable union and an enum for what they are', async () => {
    const nullable = await modelSchema(COMPOSITION_SPEC, 'Nullable')
    expect(textOf(nullable.schema.shadowRoot!.querySelector('.type'))).toBe('string or null')

    disposeAll()

    const status = await modelSchema(COMPOSITION_SPEC, 'Status')
    expect(textOf(status.schema.shadowRoot!.querySelector('.constraints'))).toContain('one of active, archived')
  })

  it('gives a map-shaped schema a row for its value type', async () => {
    const { schema } = await modelSchema(COMPOSITION_SPEC, 'Dictionary')

    expect(schemaRows(schema)).toEqual([{ name: '[key: string]', type: 'integer', required: '' }])
  })
})

describe('expandAllSchemaProperties', () => {
  it('opens every level at once', async () => {
    const { schema } = await modelSchema(COMPOSITION_SPEC, 'Envelope', { expandAllSchemaProperties: true })
    const payload = schemaFor(schema, 'payload')!

    expect(payload.shadowRoot!.querySelector('openish-disclosure')!.hasAttribute('open')).toBe(true)
    /* Two levels down without a click: Envelope -> payload (Pet) -> legs. */
    expect(schemaRows(payload).map((row) => row.name)).toEqual(['id', 'name', 'legs'])
  })

  it('leaves them closed by default', async () => {
    const { schema } = await modelSchema(COMPOSITION_SPEC, 'Envelope')
    const payload = schemaFor(schema, 'payload')!

    expect(payload.shadowRoot!.querySelector('openish-disclosure')!.hasAttribute('open')).toBe(false)
    expect(schemaRows(payload)).toEqual([])
  })

  /*
   * The flag means every level, and the outermost one is a level.
   *
   * A body collapses on arrival now, so a host that had switched this on to see whole schemas would
   * otherwise have got a page that opened everything except the thing they were looking at.
   */
  it('opens a collapsed body too', async () => {
    const harness = await mountReference({
      path: '/tags/pets/post-pets',
      spec: COMPOSITION_SPEC,
      config: { expandAllSchemaProperties: true },
    })
    const body = shadowOf(sectionOf(harness), 'openish-request-body')

    expect(schemaRows(deepQuery(body, 'openish-schema')).map((row) => row.name)).toEqual([
      'id',
      'name',
      'legs',
    ])
  })
})

/*
 * A named body says which shape it is and where the rest of it lives.
 *
 * The tree underneath is closed, so this line is the whole of what a reader sees on arrival - and it
 * has to survive a document that has no section to point at, because `hideModels` and `x-internal`
 * both remove one while leaving every reference to it perfectly valid.
 */
describe('a body naming its model', () => {
  const bodyTree = async (config?: Record<string, unknown>): Promise<Element> => {
    const harness = await mountReference(
      config
        ? { path: '/tags/pets/post-pets', spec: COMPOSITION_SPEC, config }
        : { path: '/tags/pets/post-pets', spec: COMPOSITION_SPEC },
    )
    return deepQuery(shadowOf(sectionOf(harness), 'openish-request-body'), 'openish-schema')!
  }

  it('links the name to the section that documents it', async () => {
    const link = (await bodyTree()).shadowRoot!.querySelector('.type a')

    expect(textOf(link)).toBe('Pet')
    expect(link?.getAttribute('href')).toContain('models/Pet')
  })

  it('still names it where the document has no section to link', async () => {
    const header = (await bodyTree({ hideModels: true })).shadowRoot!.querySelector('.type')

    expect(textOf(header)).toBe('Pet')
    expect(header?.querySelector('a')).toBeNull()
  })
})

/*
 * A named type inside the tree goes to that type's own section.
 *
 * This is what stops a collapsed body being a dead end: the tree is where a reader now meets a named
 * type, and following it is the whole reason the shape was allowed to live somewhere else.
 */
describe('a type naming its model', () => {
  it('links the name and leaves the array brackets as text beside it', async () => {
    const { schema } = await modelSchema(CYCLIC_SPEC, 'Node')
    /* Property rows only: the first `.type` in the root is the header naming the schema itself. */
    const types = [...schema.shadowRoot!.querySelectorAll('li .type')]

    /* `parent` is `Node`, `children` is `Node[]` - the name is a link in both, the `[]` is not. */
    expect(types.map((type) => textOf(type))).toEqual(['string', 'Node', 'Node[]'])
    expect(types.map((type) => textOf(type.querySelector('a')))).toEqual(['', 'Node', 'Node'])
    expect(types[2]!.querySelector('a')?.getAttribute('href')).toBe('#/models/Node')
  })

  /* Read off an operation, because `hideModels` is exactly the config with no model page to mount. */
  it('leaves a type with no section of its own as plain text', async () => {
    const harness = await mountReference({
      path: '/tags/tree/get-tree',
      spec: CYCLIC_SPEC,
      config: { hideModels: true },
    })
    const responses = shadowOf(sectionOf(harness), 'openish-response-list')
    await openBodies(harness, responses)
    const schema = deepQuery(responses, 'openish-schema')!

    expect(schema.shadowRoot!.querySelectorAll('li .type a')).toHaveLength(0)
    expect(schemaRows(schema).map((row) => row.type)).toEqual(['string', 'Node', 'Node[]'])
  })
})

/*
 * Shapes that are open bugs in Scalar. The evaluation claims openish does not share them, and this
 * is where that claim is either earned or withdrawn - see SCALAR_REGRESSIONS_SPEC for the reports.
 */
describe('shapes Scalar gets wrong', () => {
  it('flattens a variant that composes a discriminated base, without re-expanding the base', async () => {
    const { schema } = await modelSchema(SCALAR_REGRESSIONS_SPEC, 'Cat')

    /* One row per field, once each. The base contributed `petType` and kept it required. */
    expect(schemaRows(schema)).toEqual([
      { name: 'petType', type: 'string', required: 'required' },
      { name: 'huntingSkill', type: 'string', required: 'optional' },
    ])
    /* The base is merged, not offered as a variant: a discriminator alone is not a choice. */
    expect(deepQuery(schema.shadowRoot!, 'openish-tabs')).toBeNull()
  })

  it('applies a sibling description over a $ref, in both spellings', async () => {
    const { schema } = await modelSchema(SCALAR_REGRESSIONS_SPEC, 'Described')

    for (const [name, description] of [
      ['viaAllOf', 'Overridden through allOf.'],
      ['viaSibling', 'Overridden through a sibling key.'],
    ] as const) {
      const property = schemaFor(schema, name)
      if (!property) {
        throw new Error(`No nested schema for ${name}.`)
      }
      const text = deepTextOf(property.shadowRoot!)
      expect(text).toContain(description)
      /* The referenced schema still resolved - the override replaces the prose, not the shape. */
      expect(text).not.toContain('The base.')
    }
  })

  it('offers the variant selector when a discriminated union is the item type of an array', async () => {
    const { schema } = await modelSchema(SCALAR_REGRESSIONS_SPEC, 'ChoiceList')
    const tabs = deepQuery(schema.shadowRoot!, 'openish-tabs')

    expect(tabs).not.toBeNull()
    expect(
      [...tabs!.shadowRoot!.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].map((tab) => textOf(tab)),
    ).toEqual(['cat', 'dog'])
    /* Named by the discriminator mapping, and the property said which key decides. */
    expect(deepTextOf(schema.shadowRoot!)).toContain('petType')
  })
})

describe('the model page', () => {
  it('renders a property tree and an example side by side', async () => {
    const { harness, schema } = await modelSchema(CYCLIC_SPEC, 'Node')
    const model = shadowOf(sectionOf(harness), 'openish-model')

    expect(schemaRows(schema).map((row) => row.name)).toEqual(['id', 'parent', 'children'])
    expect(textOf(deepQuery(model, 'pre'))).toContain('"id"')
    /* An example is code, so it is highlighted and copyable like every other block on the page. */
    const example = deepQuery(model, 'openish-code-block')!
    expect(example.shadowRoot!.querySelector('.hljs-attr')).not.toBeNull()
    expect(deepQuery(example.shadowRoot!, 'button[part="copy"]')).not.toBeNull()
    expect(titleOf(model)).toBe('Node')
  })

  it('renders the tree for a document’s own models', async () => {
    const harness = await mountReference({ path: '/models/Account' })
    const model = shadowOf(sectionOf(harness), 'openish-model')

    expect(schemaRows(model.querySelector('openish-schema'))).toEqual([
      { name: 'id', type: 'string', required: 'required' },
      { name: 'balance', type: 'integer', required: 'optional' },
    ])
    expect(deepTextOf(model)).toContain('Opaque account id.')
  })
})

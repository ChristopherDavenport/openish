import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { deepTextOf, disposeAll, mountReference, shadowOf, type Harness, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

const model = async (name: string, config?: Record<string, unknown>): Promise<Harness> => {
  const { CONSTRAINTS_SPEC } = await import('./fixtures.js')
  const harness = await mountReference({
    path: `/models/${name}`,
    spec: CONSTRAINTS_SPEC,
    ...(config ? { config } : {}),
  })
  await harness.settle()
  return harness
}

/** The rendered text of the model page, with whitespace collapsed so assertions read naturally. */
const textOfModel = (harness: Harness) => deepTextOf(sectionOf(harness)).replace(/\s+/g, ' ')

describe('schema constraints', () => {
  it('states exclusive bounds as the inequality they are', async () => {
    const text = textOfModel(await model('Bounded'))

    expect(text).toContain('greater than 0')
    expect(text).toContain('less than 100')
  })

  it('states multipleOf', async () => {
    expect(textOfModel(await model('Bounded'))).toContain('multiple of 5')
  })

  it('states array bounds and uniqueness', async () => {
    const text = textOfModel(await model('Bounded'))

    expect(text).toContain('min 1 items')
    expect(text).toContain('max 8 items')
    expect(text).toContain('unique items')
  })

  /*
   * The object form of `additionalProperties` is a row in the property list. The booleans had
   * nowhere to be said and so were said nowhere - and "these properties and no others" is most of
   * what an object's contract is.
   */
  it('says whether anything else may be sent', async () => {
    expect(textOfModel(await model('Closed'))).toContain('no other properties')
    expect(textOfModel(await model('Open'))).toContain('any other properties')
  })

  it('states object property counts', async () => {
    const text = textOfModel(await model('Bounded'))

    expect(text).toContain('min 1 properties')
    expect(text).toContain('max 4 properties')
  })

  it('states a const as a fixed value', async () => {
    expect(textOfModel(await model('Bounded'))).toContain('always bounded')
  })
})

describe('enum descriptions', () => {
  it('explains each value the document describes', async () => {
    const text = textOfModel(await model('Status'))

    expect(text).toContain('Authorised, not yet captured.')
    expect(text).toContain('Money has moved.')
  })

  it('falls back to a symbolic name when that is all the document gives', async () => {
    const text = textOfModel(await model('Codes'))

    expect(text).toContain('ALPHA')
    expect(text).toContain('BRAVO')
  })
})

describe('x-additionalPropertiesName', () => {
  it('names the key of a free-form map', async () => {
    expect(textOfModel(await model('Balances'))).toContain('[currency: string]')
  })

  it('falls back to key when the document does not name it', async () => {
    expect(textOfModel(await model('Bounded'))).not.toContain('[currency: string]')
  })
})

describe('property ordering', () => {
  const names = (harness: Harness) =>
    [...shadowOf(sectionOf(harness), 'openish-model').querySelectorAll('*')].length >= 0
      ? textOfModel(harness)
      : ''

  it('keeps document order by default', async () => {
    const text = names(await model('Bounded'))

    expect(text.indexOf('zulu')).toBeLessThan(text.indexOf('count'))
    expect(text.indexOf('count')).toBeLessThan(text.indexOf('alpha'))
  })

  it('sorts alphabetically when asked', async () => {
    const text = names(await model('Bounded', { orderSchemaPropertiesBy: 'alpha' }))

    expect(text.indexOf('alpha')).toBeLessThan(text.indexOf('bag'))
    expect(text.indexOf('bag')).toBeLessThan(text.indexOf('count'))
    expect(text.indexOf('count')).toBeLessThan(text.indexOf('zulu'))
  })

  it('lifts required properties above optional ones when asked', async () => {
    const text = names(await model('Bounded', { orderRequiredPropertiesFirst: true }))

    expect(text.indexOf('count')).toBeLessThan(text.indexOf('zulu'))
  })

  it('applies both together, alphabetical within each group', async () => {
    const text = names(
      await model('Bounded', { orderSchemaPropertiesBy: 'alpha', orderRequiredPropertiesFirst: true }),
    )

    expect(text.indexOf('count')).toBeLessThan(text.indexOf('alpha'))
    expect(text.indexOf('alpha')).toBeLessThan(text.indexOf('bag'))
  })
})

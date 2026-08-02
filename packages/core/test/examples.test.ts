import { describe, expect, it } from 'vitest'

import { mediaTypeExamples } from '../src/operation/examples.js'

describe('mediaTypeExamples', () => {
  it('reads every named example, keeping document order and the author’s key', () => {
    const examples = mediaTypeExamples({
      examples: {
        Overdrawn: { summary: 'A negative balance', value: { balance: -100 } },
        settled: { description: 'After the money moved.', value: { balance: 0 } },
      },
    })

    expect(examples).toEqual([
      { name: 'Overdrawn', summary: 'A negative balance', description: undefined, value: { balance: -100 }, externalValue: undefined },
      { name: 'settled', summary: undefined, description: 'After the money moved.', value: { balance: 0 }, externalValue: undefined },
    ])
  })

  it('gives the singular keyword one nameless entry', () => {
    expect(mediaTypeExamples({ example: { id: 'a' } })).toEqual([{ name: '', value: { id: 'a' } }])
  })

  it('prefers the plural keyword when a document declares both', () => {
    const examples = mediaTypeExamples({
      example: { ignored: true },
      examples: { only: { value: { kept: true } } },
    })

    expect(examples).toHaveLength(1)
    expect(examples[0]?.value).toEqual({ kept: true })
  })

  it('keeps an example that only points at an external URL', () => {
    const examples = mediaTypeExamples({
      examples: { big: { summary: 'Too big to inline', externalValue: 'https://example.com/big.json' } },
    })

    expect(examples).toEqual([
      {
        name: 'big',
        summary: 'Too big to inline',
        description: undefined,
        value: undefined,
        externalValue: 'https://example.com/big.json',
      },
    ])
  })

  /* An entry naming neither is an empty option in a picker, which is worse than one fewer option. */
  it('drops an entry with nothing to show', () => {
    expect(mediaTypeExamples({ examples: { empty: { summary: 'Nothing here' } } })).toEqual([])
  })

  it('falls back to the singular keyword when every plural entry was empty', () => {
    const examples = mediaTypeExamples({ example: { kept: true }, examples: { empty: { summary: 'x' } } })

    expect(examples).toEqual([{ name: '', value: { kept: true } }])
  })

  it('returns nothing for a media type with no example at all, so the caller generates one', () => {
    expect(mediaTypeExamples({})).toEqual([])
    expect(mediaTypeExamples(undefined)).toEqual([])
  })

  /* `null` is a value an author can legitimately mean, and it is not the same as saying nothing. */
  it('treats an explicit null as a value', () => {
    expect(mediaTypeExamples({ examples: { nothing: { value: null } } })).toEqual([
      { name: 'nothing', summary: undefined, description: undefined, value: null, externalValue: undefined },
    ])
  })
})

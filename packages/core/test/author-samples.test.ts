import { describe, expect, it } from 'vitest'

import { authorSamples } from '../src/har/author-samples.js'

/* `authorSamples` probes an operation for extension keys, so a bare object is the whole input. */
const operation = (extensions: Record<string, unknown>) => extensions as never

describe('author-supplied code samples', () => {
  it('reads the OpenAPI-community spelling', () => {
    const samples = authorSamples(
      operation({ 'x-codeSamples': [{ lang: 'python', label: 'SDK', source: 'client.list()' }] }),
    )

    expect(samples).toHaveLength(1)
    expect(samples[0]?.label).toBe('SDK')
    expect(samples[0]?.source).toBe('client.list()')
  })

  it.each(['x-code-samples', 'x-custom-examples', 'x-scalar-examples', 'x-stainless-examples'])(
    'reads %s',
    (key) => {
      const samples = authorSamples(operation({ [key]: [{ lang: 'go', source: 'client.List()' }] }))

      expect(samples).toHaveLength(1)
      expect(samples[0]?.source).toBe('client.List()')
    },
  )

  /*
   * `x-readme` is a namespace, not a list - the samples are one key further down. Reading the
   * namespace itself treated `code-samples` as a language name and found no source at all.
   */
  it('reaches through x-readme to its code-samples key', () => {
    const samples = authorSamples(
      operation({ 'x-readme': { 'code-samples': [{ language: 'ruby', code: 'client.list' }], 'samples-languages': ['ruby'] } }),
    )

    expect(samples).toHaveLength(1)
    expect(samples[0]?.source).toBe('client.list')
    expect(samples[0]?.language).toBe('ruby')
  })

  /*
   * A generated document often carries several. Concatenating would show the reader the same request
   * three times, so the highest-priority list that has anything in it wins outright.
   */
  it('takes the highest-priority list and ignores the rest', () => {
    const samples = authorSamples(
      operation({
        'x-codeSamples': [{ lang: 'python', source: 'the one an author wrote' }],
        'x-stainless-snippets': { python: { source: 'the generated one' } },
      }),
    )

    expect(samples).toHaveLength(1)
    expect(samples[0]?.source).toBe('the one an author wrote')
  })

  it('falls through a key that is present but empty', () => {
    const samples = authorSamples(
      operation({ 'x-codeSamples': [], 'x-scalar-examples': [{ lang: 'php', source: '$client->list();' }] }),
    )

    expect(samples).toHaveLength(1)
    expect(samples[0]?.source).toBe('$client->list();')
  })

  it('reads a map-shaped extension, with the key standing in for a missing lang', () => {
    const samples = authorSamples(operation({ 'x-stainless-snippets': { typescript: { source: 'await client.list()' } } }))

    expect(samples[0]?.language).toBe('typescript')
    expect(samples[0]?.source).toBe('await client.list()')
  })

  it('returns nothing for an operation that supplied none', () => {
    expect(authorSamples(operation({}))).toEqual([])
    expect(authorSamples(undefined)).toEqual([])
  })
})

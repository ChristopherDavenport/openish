import { describe, expect, it } from 'vitest'

import { flatten, relativeIdsOf, storeFromFixture } from './helpers.js'

/*
 * Relative to the document, because this suite is about what a host's slug generators do to a
 * *segment*. The source slug in front of every id is the same string on every node here and would
 * only be noise in the expectations - `sources.test.ts` is where it is the subject.
 */
const ids = async (config: Record<string, unknown>) => {
  const store = await storeFromFixture('navigation.yaml', { config })
  return relativeIdsOf(store, flatten(store.navigation))
}

describe('slug overrides', () => {
  it('mints openish ids when the host asks for nothing', async () => {
    const withDefaults = await ids({})

    expect(withDefaults.some((id) => id.startsWith('tags/'))).toBe(true)
  })

  it('lets a host reproduce another tool’s operation URLs', async () => {
    const generated = await ids({
      slugs: { operation: ({ method, path }: { method: string; path: string }) => `${method}${path.replace(/\//g, '-')}` },
    })

    expect(generated.some((id) => id.includes('get-alpha'))).toBe(true)
  })

  it('keeps the section prefix, because that is how a URL resolves back to a node', async () => {
    const generated = await ids({ slugs: { model: () => 'anything' } })
    const models = generated.filter((id) => id.startsWith('models/'))

    expect(models.length).toBeGreaterThan(0)
    expect(models.every((id) => id.startsWith('models/'))).toBe(true)
  })

  it('still resolves a collision rather than letting two nodes share a URL', async () => {
    const generated = await ids({ slugs: { operation: () => 'same' } })
    const operations = generated.filter((id) => id.includes('same'))

    expect(new Set(operations).size).toBe(operations.length)
    expect(operations.some((id) => id.endsWith('same-2'))).toBe(true)
  })

  it('slugifies a generated segment that a URL could not carry', async () => {
    const generated = await ids({ slugs: { tag: () => 'Has Spaces & Symbols' } })

    expect(generated.some((id) => id.includes('has-spaces-symbols'))).toBe(true)
  })

  it('renames a tag without moving its operations out from under it', async () => {
    const generated = await ids({ slugs: { tag: ({ name }: { name: string }) => `t-${name}` } })
    const tag = generated.find((id) => id.startsWith('tags/t-'))!

    expect(generated.some((id) => id.startsWith(`${tag}/`))).toBe(true)
  })
})

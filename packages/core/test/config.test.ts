import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG, resolveConfig } from '../src/config.js'

describe('resolveConfig', () => {
  it('fills in every option so components never see undefined', () => {
    const resolved = resolveConfig()

    for (const key of Object.keys(DEFAULT_CONFIG)) {
      expect(resolved[key as keyof typeof resolved]).toBeDefined()
    }
  })

  it('keeps caller overrides', () => {
    expect(resolveConfig({ hideModels: true, modelsSectionLabel: 'Schemas' })).toMatchObject({
      hideModels: true,
      modelsSectionLabel: 'Schemas',
      layout: 'modern',
    })
  })

  it('ignores explicitly undefined values rather than blanking the default', () => {
    expect(resolveConfig({ layout: undefined }).layout).toBe('modern')
  })

  it('returns a frozen config, since the store is immutable by contract', () => {
    expect(Object.isFrozen(resolveConfig())).toBe(true)
  })
})

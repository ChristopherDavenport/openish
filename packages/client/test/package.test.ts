import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import * as client from '../src/index.js'

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }

/**
 * The boundary, as a test.
 *
 * This package exists so that sending a request and obtaining a token do not drag a framework - or
 * anything else - along with them. Both halves of that are checked here rather than trusted: the
 * dependency list is empty, and this suite runs in Node with no DOM and no Lit, so an import of
 * either would fail before an assertion ever ran.
 */
describe('@openish/client', () => {
  it('declares no dependencies', () => {
    expect(manifest.dependencies ?? {}).toEqual({})
    expect(manifest.peerDependencies ?? {}).toEqual({})
  })

  it('imports with no DOM present', () => {
    expect(typeof globalThis.document).toBe('undefined')
    expect(client).toBeTypeOf('object')
  })
})

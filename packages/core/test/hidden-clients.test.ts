import { describe, expect, it } from 'vitest'

import { SNIPPET_CLIENTS, snippetClients } from '../src/har/snippet.js'

const ids = (hidden: Parameters<typeof snippetClients>[0]) => snippetClients(hidden).map((client) => client.id)

describe('hiddenClients', () => {
  it('offers everything when the host says nothing', () => {
    expect(snippetClients()).toHaveLength(SNIPPET_CLIENTS.length)
  })

  it('removes a client named by its full id', () => {
    const offered = ids(['shell/curl'])

    expect(offered).not.toContain('shell/curl')
    expect(offered).toContain('shell/httpie')
  })

  it('removes a whole target named on its own', () => {
    const offered = ids(['shell'])

    expect(offered.some((id) => id.startsWith('shell/'))).toBe(false)
    expect(offered).toContain('js/fetch')
  })

  /* Scalar's spelling: `true` means generate nothing. An author's own samples are unaffected. */
  it('removes every generated client when told true', () => {
    expect(snippetClients(true)).toEqual([])
  })

  it('keeps everything when told false', () => {
    expect(snippetClients(false)).toHaveLength(SNIPPET_CLIENTS.length)
  })

  it('reads a per-target record, hiding a whole language or named clients within it', () => {
    const offered = ids({ js: true, shell: ['httpie'] })

    expect(offered.some((id) => id.startsWith('js/'))).toBe(false)
    expect(offered).not.toContain('shell/httpie')
    expect(offered).toContain('shell/curl')
    expect(offered).toContain('python/requests')
  })

  it('leaves a target the record does not mention alone', () => {
    expect(ids({ js: true })).toContain('shell/curl')
  })
})

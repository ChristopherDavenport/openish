import { afterEach, describe, expect, it } from 'vitest'

import '../src/index.js'
import { OPERATION_SECURITY_SPEC } from './fixtures.js'
import { disposeAll, mountReference, shadowOf, textOf, sectionOf } from './helpers.js'

afterEach(() => {
  disposeAll()
})

/** The Authorization section of one operation page, or null when it has none. */
const securityOf = async (id: string): Promise<Element | null> => {
  const harness = await mountReference({ path: `/tags/secured/${id}`, spec: OPERATION_SECURITY_SPEC })
  const operation = shadowOf(sectionOf(harness), 'openish-operation')
  return operation.querySelector('[part~="security-section"]')
}

/** Each scheme the section names, as `name` plus how it is supplied. */
const schemesOf = (section: Element | null): Array<{ name: string; kind: string; scopes: string[] }> =>
  [...(section?.querySelectorAll('ul.requirement > li') ?? [])].map((row) => ({
    name: textOf(row.querySelector('.scheme')),
    kind: textOf(row.querySelector('.kind, .undeclared')),
    scopes: [...row.querySelectorAll('.scopes code')].map((scope) => textOf(scope)),
  }))

const hintsOf = (section: Element | null): string[] =>
  [...(section?.querySelectorAll('.hint') ?? [])].map((hint) => textOf(hint))

describe('the Authorization section', () => {
  it('says what the document requires when the operation declares nothing of its own', async () => {
    const section = await securityOf('inherited')

    expect(schemesOf(section)).toEqual([{ name: 'bearerAuth', kind: 'HTTP bearer', scopes: [] }])
  })

  it('presents alternatives as a choice', async () => {
    const section = await securityOf('either')

    expect(hintsOf(section)).toEqual(['Any one of these is enough.'])
    expect(schemesOf(section).map((entry) => entry.name)).toEqual(['bearerAuth', 'apiKeyAuth'])
  })

  it('says when two schemes are required together, which is not the same as a choice', async () => {
    const section = await securityOf('both')

    expect(hintsOf(section)).toEqual(['All of these together.'])
    expect(schemesOf(section)).toEqual([
      { name: 'apiKeyAuth', kind: 'API key in header as X-Api-Key', scopes: [] },
      { name: 'signature', kind: 'API key in header as X-Signature', scopes: [] },
    ])
  })

  it('lists the scopes an OAuth requirement asks for', async () => {
    const section = await securityOf('scoped')

    expect(schemesOf(section)[0]?.scopes).toEqual(['accounts:read', 'accounts:write'])
  })

  /* `security: [{}, …]` is the document saying the credential is optional, not that there is none. */
  it('keeps the anonymous alternative as an option rather than dropping it', async () => {
    const section = await securityOf('maybe')

    expect(hintsOf(section)).toEqual(['Any one of these is enough.', 'May be called without authentication.'])
    expect(schemesOf(section).map((entry) => entry.name)).toEqual(['bearerAuth'])
  })

  /* An empty array is how an operation opts out of a document-wide requirement entirely. */
  it('renders no section for an operation that replaced the requirement with nothing', async () => {
    expect(await securityOf('publicThing')).toBeNull()
  })

  /*
   * Real documents require schemes they never declare - the reference document in this repo does -
   * and a reader is better off being told than being shown a scheme name with no explanation.
   */
  it('says so when a required scheme is never declared', async () => {
    const section = await securityOf('ghost')

    expect(schemesOf(section)).toEqual([
      { name: 'ghost', kind: 'required, but this document never declares it', scopes: [] },
    ])
  })
})

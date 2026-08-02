import { describe, expect, it } from 'vitest'

import { serializeExample } from '../src/schema/serialize-example.js'

describe('serializeExample', () => {
  const value = { id: 'acct_1', name: 'Checking' }
  const schema = { type: 'object', title: 'Account', properties: { id: { type: 'string' }, name: { type: 'string' } } }

  it('writes JSON for JSON, and for anything it does not recognise', () => {
    expect(serializeExample(value, 'application/json')).toBe('{\n  "id": "acct_1",\n  "name": "Checking"\n}')
    expect(serializeExample(value, 'application/vnd.acme.v2+json')).toContain('"id": "acct_1"')
    expect(serializeExample(value, 'application/octet-stream')).toContain('"id": "acct_1"')
    expect(serializeExample(value)).toContain('"id": "acct_1"')
  })

  it('writes XML for an XML media type, named and shaped by the schema', () => {
    expect(serializeExample(value, 'application/xml', schema)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Account>',
        '  <id>acct_1</id>',
        '  <name>Checking</name>',
        '</Account>',
      ].join('\n'),
    )
    expect(serializeExample(value, 'text/xml', schema)).toContain('<Account>')
    expect(serializeExample(value, 'application/atom+xml', schema)).toContain('<Account>')
  })

  it('writes form fields for a form body, repeating a key for a list', () => {
    expect(serializeExample({ name: 'Checking & Co', limit: 5 }, 'application/x-www-form-urlencoded')).toBe(
      'name=Checking%20%26%20Co&limit=5',
    )
    expect(serializeExample({ tags: ['a', 'b'] }, 'application/x-www-form-urlencoded')).toBe('tags=a&tags=b')
    expect(serializeExample({ owner: { id: 1 } }, 'application/x-www-form-urlencoded')).toBe(
      `owner=${encodeURIComponent('{"id":1}')}`,
    )
  })

  it('hands back a string the author wrote, whatever the media type', () => {
    expect(serializeExample('<already>xml</already>', 'application/xml', schema)).toBe('<already>xml</already>')
    expect(serializeExample('id=1', 'application/x-www-form-urlencoded')).toBe('id=1')
    expect(serializeExample('plain', 'application/json')).toBe('plain')
  })

  it('has nothing to say about nothing', () => {
    expect(serializeExample(undefined, 'application/xml')).toBe('')
    expect(serializeExample(undefined, 'application/json')).toBe('')
  })

  it('is case-insensitive about the media type', () => {
    expect(serializeExample(value, 'Application/XML', schema)).toContain('<Account>')
  })
})

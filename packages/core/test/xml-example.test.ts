import { describe, expect, it } from 'vitest'

import { schemaExample } from '../src/schema/schema-example.js'
import { xmlExample } from '../src/schema/xml-example.js'

describe('xmlExample', () => {
  it('names the root from xml.name, a $ref, then title', () => {
    expect(xmlExample({ id: '1' }, { type: 'object', xml: { name: 'account' } })).toContain('<account>')
    expect(xmlExample({ id: '1' }, { $ref: '#/components/schemas/Account' })).toContain('<Account>')
    expect(xmlExample({ id: '1' }, { type: 'object', title: 'Account' })).toContain('<Account>')
    expect(xmlExample({ id: '1' }, undefined, { name: 'body' })).toContain('<body>')
    expect(xmlExample({ id: '1' })).toContain('<root>')
  })

  it('writes an object as elements, one per property', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' }, active: { type: 'boolean' } }, title: 'Account' }

    expect(xmlExample({ id: 'acct_1', active: true }, schema)).toBe(
      ['<Account>', '  <id>acct_1</id>', '  <active>true</active>', '</Account>'].join('\n'),
    )
  })

  it('moves a property onto its parent when the schema says it is an attribute', () => {
    const schema = {
      type: 'object',
      title: 'Account',
      properties: {
        id: { type: 'string', xml: { attribute: true } },
        name: { type: 'string' },
      },
    }

    expect(xmlExample({ id: 'acct_1', name: 'Checking' }, schema)).toBe(
      ['<Account id="acct_1">', '  <name>Checking</name>', '</Account>'].join('\n'),
    )
  })

  it('keeps a structure an element even when it is marked as an attribute', () => {
    const schema = {
      type: 'object',
      title: 'Account',
      properties: { owner: { type: 'object', properties: { name: { type: 'string' } }, xml: { attribute: true } } },
    }

    expect(xmlExample({ owner: { name: 'Ada' } }, schema)).toContain('<owner>')
  })

  it('wraps an array only when the schema asks, and renames items', () => {
    const unwrapped = {
      type: 'object',
      title: 'Account',
      properties: { tags: { type: 'array', items: { type: 'string' } } },
    }
    expect(xmlExample({ tags: ['a', 'b'] }, unwrapped)).toBe(
      ['<Account>', '  <tags>a</tags>', '  <tags>b</tags>', '</Account>'].join('\n'),
    )

    const wrapped = {
      type: 'object',
      title: 'Account',
      properties: { tags: { type: 'array', xml: { wrapped: true }, items: { type: 'string', xml: { name: 'tag' } } } },
    }
    expect(xmlExample({ tags: ['a', 'b'] }, wrapped)).toBe(
      ['<Account>', '  <tags>', '    <tag>a</tag>', '    <tag>b</tag>', '  </tags>', '</Account>'].join('\n'),
    )
  })

  it('wraps a root array whatever wrapped says, because siblings are not a document', () => {
    const schema = { type: 'array', title: 'Accounts', items: { $ref: '#/components/schemas/Account' } }

    expect(xmlExample([{ id: 'acct_1' }], schema)).toBe(
      ['<Accounts>', '  <Account>', '    <id>acct_1</id>', '  </Account>', '</Accounts>'].join('\n'),
    )
  })

  it('qualifies with a prefix and declares the namespace', () => {
    const schema = { type: 'object', xml: { name: 'account', prefix: 'acc', namespace: 'https://example.com/acc' } }

    expect(xmlExample({ id: '1' }, schema)).toBe(
      ['<acc:account xmlns:acc="https://example.com/acc">', '  <id>1</id>', '</acc:account>'].join('\n'),
    )
    expect(xmlExample({ id: '1' }, { xml: { name: 'account', namespace: 'https://example.com/acc' } })).toContain(
      '<account xmlns="https://example.com/acc">',
    )
  })

  it('escapes text and attribute values', () => {
    const schema = {
      type: 'object',
      xml: { name: 'note' },
      properties: { title: { type: 'string', xml: { attribute: true } }, body: { type: 'string' } },
    }

    expect(xmlExample({ title: 'a "quoted" & <tagged>', body: 'x < y & y > z' }, schema)).toBe(
      [
        '<note title="a &quot;quoted&quot; &amp; &lt;tagged&gt;">',
        '  <body>x &lt; y &amp; y &gt; z</body>',
        '</note>',
      ].join('\n'),
    )
  })

  it('closes an element that has nothing in it', () => {
    expect(xmlExample({ owner: null }, { xml: { name: 'account' } })).toBe(
      ['<account>', '  <owner/>', '</account>'].join('\n'),
    )
    expect(xmlExample({}, { xml: { name: 'account' } })).toBe('<account/>')
    expect(xmlExample([], { xml: { name: 'accounts' } })).toBe('<accounts/>')
  })

  it('makes a name XML will accept out of one it will not', () => {
    expect(xmlExample({ '2fa enabled': true }, { xml: { name: 'account' } })).toContain('<_2fa_enabled>true</_2fa_enabled>')
  })

  it('renders what the schema never described', () => {
    /* An author example may hold more than `properties` lists; dropping the rest answers nobody. */
    expect(xmlExample({ extra: 'kept' }, { type: 'object', xml: { name: 'account' }, properties: {} })).toContain(
      '<extra>kept</extra>',
    )
  })

  it('takes a generated example straight from schemaExample', () => {
    const schema = {
      type: 'object',
      title: 'Account',
      properties: {
        id: { type: 'string', xml: { attribute: true } },
        balances: { type: 'array', xml: { wrapped: true }, items: { type: 'integer', minimum: 12 } },
      },
    }

    expect(xmlExample(schemaExample(schema), schema)).toBe(
      ['<Account id="string">', '  <balances>', '    <balances>12</balances>', '  </balances>', '</Account>'].join('\n'),
    )
  })
})

#!/usr/bin/env node
/**
 * Renders the element reference in `packages/elements/README.md` from `custom-elements.json`.
 *
 * Generated rather than written, because a hand-kept table of twenty elements' properties is a
 * table that is wrong within a milestone. The prose around it is written by hand; only the region
 * between the markers is replaced.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST = `${ROOT}packages/elements/custom-elements.json`
const README = `${ROOT}packages/elements/README.md`
const START = '<!-- elements:start -->'
const END = '<!-- elements:end -->'

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

const elements = manifest.modules
  .flatMap((module) => module.declarations ?? [])
  .filter((declaration) => declaration.tagName)
  .sort((left, right) => left.tagName.localeCompare(right.tagName))

/** The first sentence of a doc comment: enough to say what something is in a table. */
const summary = (text) => {
  const first = (text ?? '').trim().split(/\n\s*\n/)[0] ?? ''
  return first.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

const escape = (text) => (text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

const publicFields = (declaration) =>
  (declaration.members ?? []).filter(
    (member) => member.kind === 'field' && member.privacy !== 'private' && !member.static,
  )

const lines = []

for (const element of elements) {
  lines.push(`### \`<${element.tagName}>\``, '')
  lines.push(summary(element.description) || '_No description._', '')

  const fields = publicFields(element)
  if (fields.length > 0) {
    lines.push('| Property | Attribute | Type | Default | |')
    lines.push('|---|---|---|---|---|')
    for (const field of fields) {
      const attribute = (element.attributes ?? []).find((candidate) => candidate.fieldName === field.name)
      lines.push(
        `| \`${field.name}\` | ${attribute ? `\`${attribute.name}\`` : '—'} | \`${escape(field.type?.text ?? 'unknown')}\` | ${
          field.default ? `\`${escape(field.default)}\`` : '—'
        } | ${summary(field.description)} |`,
      )
    }
    lines.push('')
  }

  if ((element.events ?? []).length > 0) {
    lines.push('| Event | |')
    lines.push('|---|---|')
    for (const event of element.events) {
      lines.push(`| \`${event.name}\` | ${summary(event.description)} |`)
    }
    lines.push('')
  }
}

const readme = readFileSync(README, 'utf8')
const before = readme.slice(0, readme.indexOf(START) + START.length)
const after = readme.slice(readme.indexOf(END))

writeFileSync(README, `${before}\n\n${lines.join('\n')}\n${after}`)

console.log(`docs:elements - wrote ${elements.length} elements into packages/elements/README.md`)

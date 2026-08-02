#!/usr/bin/env node
/**
 * Focus is never removed, only relocated.
 *
 * This one is a drift guard rather than a correctness guard. openish had a perfectly good focus ring
 * and drew it in sixteen places, each of which first said `outline: none` and then replaced it with a
 * shadow of its own - and the copies had already diverged from each other before anyone noticed,
 * which is the failure mode: not one component with no ring, but twenty with almost the same one.
 *
 * So the rule is the mechanism. `outline: none` is how a ring gets removed and the shadow is how it
 * used to get put back, and neither is allowed in component source any more. The ring lives in
 * `baseStyles`, and an element that needs it drawn somewhere else redeclares
 * `--openish-focus-ring-offset` on itself rather than starting over.
 *
 * Scanned: the source of every workspace package and app. Not `dist`, which is generated, and not
 * `@openish/theme`, which declares the tokens the rule is built from.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EXTENSIONS = ['.ts', '.js', '.css', '.html']

const BANNED = [
  {
    pattern: /outline\s*:\s*none/,
    why: 'removes the focus ring. Redeclare --openish-focus-ring-offset instead if it lands in the wrong place.',
  },
  {
    pattern: /outline\s*:\s*0(?![.\d])/,
    why: 'removes the focus ring. Redeclare --openish-focus-ring-offset instead if it lands in the wrong place.',
  },
  {
    pattern: /box-shadow\s*:[^;]*--openish-focus-ring/,
    why: 'draws the ring as a shadow. Shadows are not painted in forced-colors mode; the ring is an outline, in baseStyles.',
  },
]

/** Where a component's own styles live. `dist` is generated and the theme owns the tokens. */
const ROOTS = [
  join(ROOT, 'packages/elements/src'),
  join(ROOT, 'packages/core/src'),
  join(ROOT, 'packages/client/src'),
  join(ROOT, 'apps/playground/src'),
]

function* walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      yield* walk(path)
    } else if (EXTENSIONS.some((extension) => path.endsWith(extension))) {
      yield path
    }
  }
}

const failures = []

for (const dir of ROOTS) {
  for (const file of walk(dir)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      /* A line that only talks about the rule is fine - this file is full of them. */
      if (/^\s*(\*|\/\/|\/\*)/.test(line)) {
        return
      }
      for (const { pattern, why } of BANNED) {
        if (pattern.test(line)) {
          failures.push(`${relative(ROOT, file)}:${index + 1} ${line.trim()}\n      ${why}`)
        }
      }
    })
  }
}

if (failures.length > 0) {
  console.error('guard:focus FAILED\n')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  console.error('\nThe focus ring is one rule, in packages/elements/src/styles/shared.ts.')
  process.exit(1)
}

console.log('guard:focus passed - the ring is declared once and removed nowhere.')

#!/usr/bin/env node
/**
 * A backtick inside a comment inside a `css` or `html` template.
 *
 * This one has cost real time four separate times, and it never announces itself. Inside a template
 * literal there are no comments - `/* … *\/` is just text - so a backtick written inside one closes
 * the template early. Everything after it is reparsed as code, and TypeScript reports the wreckage
 * wherever it finally gives up:
 *
 *     apps/site/src/styles/shared.ts(44,39): error TS1005: ',' expected.
 *
 * Which is true, and says nothing about the prose two lines above that caused it. The habit that
 * produces it is a good one - this repository writes `guard:focus` and `store.bySlug` in backticks
 * everywhere else, including in the JSDoc immediately above the template.
 *
 * So this finds it and says what it is. The check is exact rather than heuristic: a tagged template
 * that closes while a `/*` inside it has no `*\/` did not close where its author thought it did.
 * Nothing else produces that shape.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Where templates are written. The same ground `guard:templates` covers. */
const ROOTS = [
  join(ROOT, 'packages/elements/src'),
  join(ROOT, 'packages/core/src'),
  join(ROOT, 'packages/client/src'),
  join(ROOT, 'apps/playground/src'),
  join(ROOT, 'apps/site/src'),
]

/** Only these two. A backtick inside any other template is ordinary string content. */
const TAGS = new Set(['css', 'html', 'svg'])

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
    } else if (path.endsWith('.ts')) {
      yield path
    }
  }
}

const lineAt = (source, index) => source.slice(0, index).split('\n').length

/**
 * Enough of a JavaScript lexer to know where a template literal starts and stops.
 *
 * The states that matter: code, where `//` and `/*` really are comments; and a tagged template,
 * where they are not. `${` inside a template goes back to code, so a nested `html` template in an
 * expression is read correctly rather than being mistaken for the outer one closing.
 */
const findStrays = (source, file) => {
  const findings = []
  /* Where we are, and what we are inside of. A stack, because templates and expressions nest. */
  const stack = []
  let index = 0

  /** The identifier immediately before a backtick, which is what makes a template *tagged*. */
  const tagBefore = (at) => /([A-Za-z_$][\w$]*)$/.exec(source.slice(Math.max(0, at - 40), at))?.[1] ?? ''

  while (index < source.length) {
    const inTemplate = stack.at(-1)?.kind === 'template'
    const char = source[index]
    const next = source[index + 1]

    if (char === '\\') {
      index += 2
      continue
    }

    if (inTemplate) {
      const frame = stack.at(-1)
      if (char === '`') {
        if (frame.commentAt !== undefined && frame.tagged) {
          findings.push({ file, line: lineAt(source, frame.commentAt) })
        }
        stack.pop()
      } else if (char === '$' && next === '{') {
        stack.push({ kind: 'expression', depth: 0 })
        index += 2
        continue
      } else if (frame.commentAt === undefined && char === '/' && next === '*') {
        /* Not a comment here - but if the template ends before this closes, it was meant to be. */
        frame.commentAt = index
        frame.closer = '*/'
      } else if (frame.commentAt === undefined && source.startsWith('<!--', index)) {
        /*
         * The same trap, in the other syntax. A `<!-- … -->` in an `html` template is markup rather
         * than a comment to the parser, and a backtick inside one closes the template exactly as
         * readily - which is how `site-example.ts` came to fail with `';' expected`.
         */
        frame.commentAt = index
        frame.closer = '-->'
      } else if (frame.commentAt !== undefined && source.startsWith(frame.closer, index)) {
        frame.commentAt = undefined
      }
      index += 1
      continue
    }

    /* In code. Here the comment and string forms are real, and are skipped whole. */
    if (char === '/' && next === '/') {
      index = source.indexOf('\n', index)
      if (index === -1) break
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      continue
    }
    if (char === "'" || char === '"') {
      index += 1
      while (index < source.length && source[index] !== char) {
        index += source[index] === '\\' ? 2 : 1
      }
      index += 1
      continue
    }
    if (char === '`') {
      stack.push({ kind: 'template', tagged: TAGS.has(tagBefore(index)), commentAt: undefined })
      index += 1
      continue
    }
    /*
     * Braces are counted, not just matched against the first `}` seen.
     *
     * An interpolated expression is very often an arrow function with a body - a `@click` handler,
     * a `repeat` callback - and closing the expression at that body's brace hands the rest of the
     * handler back to the template as if it were text. Every comment in it then looks like a comment
     * inside a template, which is exactly the thing being looked for: the first version of this
     * reported two handlers in `@openish/elements` that were perfectly correct.
     */
    if (stack.at(-1)?.kind === 'expression') {
      const frame = stack.at(-1)
      if (char === '{') {
        frame.depth += 1
      } else if (char === '}') {
        if (frame.depth === 0) {
          stack.pop()
        } else {
          frame.depth -= 1
        }
      }
    }

    index += 1
  }

  return findings
}

const failures = []
for (const dir of ROOTS) {
  for (const file of walk(dir)) {
    const relativePath = relative(ROOT, file)
    for (const finding of findStrays(readFileSync(file, 'utf8'), relativePath)) {
      failures.push(`${finding.file}:${finding.line}`)
    }
  }
}

if (failures.length > 0) {
  console.error('guard:backticks FAILED\n')
  for (const failure of failures) {
    console.error(`  - ${failure} opens a comment inside a css/html template that never closes.`)
  }
  console.error(
    '\nA backtick inside that comment ended the template early - there are no comments inside a\n' +
      'template literal, so the text is read as content and the first backtick closes it. Write the\n' +
      'name without backticks; the surrounding JSDoc is the place for them.',
  )
  process.exit(1)
}

console.log('guard:backticks passed - no backtick closes a css or html template from inside a comment.')

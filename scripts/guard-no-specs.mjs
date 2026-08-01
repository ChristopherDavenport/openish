#!/usr/bin/env node
/**
 * OpenAPI documents belong in exactly one place: packages/core/test/fixtures/.
 *
 * Real-world specs are large, often institution-specific, and must never be committed or referenced
 * from source. They are loaded by hand in the playground for stress-testing and nothing else.
 * This check keeps that out by construction rather than by discipline.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE_DIR = 'packages/core/test/fixtures'

/** Fixtures exist to isolate one behaviour each; anything this big is a real-world document. */
const MAX_FIXTURE_BYTES = 64 * 1024

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.claude', 'coverage'])
const SPEC_EXTENSIONS = ['.yaml', '.yml', '.json']

/** Cheap structural sniff: enough to spot a spec, cheap enough to run over every candidate file. */
function looksLikeOpenApiDocument(source) {
  return (
    /^\s*"?openapi"?\s*:/m.test(source) ||
    /^\s*"?swagger"?\s*:/m.test(source) ||
    /^\s*"?asyncapi"?\s*:/m.test(source)
  )
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      yield* walk(path)
    } else if (SPEC_EXTENSIONS.some((extension) => path.endsWith(extension))) {
      yield path
    }
  }
}

/**
 * Only files that could actually be committed matter. A gitignored spec sitting in the working tree
 * is the supported workflow - drop a document at the root, load it in the playground, never commit
 * it - so ignored paths are skipped rather than flagged.
 */
function buildIsIgnored(candidates) {
  if (candidates.length === 0) {
    return () => false
  }

  try {
    const output = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: ROOT,
      encoding: 'utf8',
      input: candidates.join('\n'),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const ignored = new Set(output.split('\n').filter(Boolean))
    return (relativePath) => ignored.has(relativePath)
  } catch (error) {
    /* Exit code 1 means "nothing ignored", which is a legitimate answer. */
    if (error.status === 1 && typeof error.stdout === 'string') {
      const ignored = new Set(error.stdout.split('\n').filter(Boolean))
      return (relativePath) => ignored.has(relativePath)
    }

    /*
     * Not a git repo (or no git). Fall back to the root-level rule that .gitignore encodes, so the
     * documented "drop a spec at the root" workflow keeps working before `git init`.
     */
    console.warn('guard:specs - git unavailable, falling back to the root-level ignore rule.')
    return (relativePath) => !relativePath.includes('/')
  }
}

const candidates = [...walk(ROOT)].map((path) => relative(ROOT, path))
const isIgnored = buildIsIgnored(candidates)

const failures = []

for (const relativePath of candidates) {
  if (isIgnored(relativePath)) continue

  const path = join(ROOT, relativePath)

  let source
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    continue
  }

  if (!looksLikeOpenApiDocument(source)) continue

  if (!relativePath.startsWith(FIXTURE_DIR)) {
    failures.push(
      `${relativePath} looks like an API document but lives outside ${FIXTURE_DIR}/. ` +
        `Load real specs by hand in the playground; commit only a minimal fixture that reproduces the behaviour.`,
    )
    continue
  }

  const bytes = Buffer.byteLength(source)
  if (bytes > MAX_FIXTURE_BYTES) {
    failures.push(
      `${relativePath} is ${Math.round(bytes / 1024)} KB, over the ${MAX_FIXTURE_BYTES / 1024} KB fixture ceiling. ` +
        `Fixtures should isolate a single behaviour.`,
    )
  }
}

if (failures.length > 0) {
  console.error('guard:specs FAILED\n')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.log(`guard:specs passed - no API documents outside ${FIXTURE_DIR}/.`)

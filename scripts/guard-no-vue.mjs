#!/usr/bin/env node
/**
 * The load-bearing invariant of this repo: no Vue, anywhere.
 *
 * openish exists so that a team on web components can render OpenAPI docs without adopting Vue.
 * Several `@scalar/*` packages (workspace-store, sidebar, components, oas-utils, icons,
 * openapi-to-markdown, api-reference, api-client) import from `vue`, so a careless dependency
 * addition silently reintroduces it. This check fails loudly instead.
 *
 * Two independent checks, because either alone can be fooled:
 *   1. Dependency graph — is `vue` (or `@vue/*`) resolvable from any workspace package?
 *   2. Build output    — does any emitted file import from `vue`?
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BANNED_PACKAGES = ['vue', '@vue/reactivity', '@vue/runtime-core', '@vue/shared']

/** `@scalar/*` packages known to depend on Vue. Listing them by name gives a far better error. */
const VUE_TAINTED_SCALAR = [
  '@scalar/workspace-store',
  '@scalar/sidebar',
  '@scalar/components',
  '@scalar/oas-utils',
  '@scalar/icons',
  '@scalar/openapi-to-markdown',
  '@scalar/api-reference',
  '@scalar/api-client',
]

const failures = []

// ---------------------------------------------------------------------------
// 1. Dependency graph
// ---------------------------------------------------------------------------

/** `npm ls` exits non-zero when nothing matches, which is the success case here. */
function npmLs(names) {
  try {
    return JSON.parse(execFileSync('npm', ['ls', ...names, '--all', '--json'], { cwd: ROOT, encoding: 'utf8' }))
  } catch (error) {
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout)
      } catch {
        /* fall through */
      }
    }
    return null
  }
}

/** Walk the `npm ls` tree collecting the paths at which a banned package was found. */
function collectHits(node, trail, hits) {
  for (const [name, child] of Object.entries(node?.dependencies ?? {})) {
    const next = [...trail, name]
    if (BANNED_PACKAGES.includes(name) && child?.version) {
      hits.push(next.join(' > '))
    }
    collectHits(child, next, hits)
  }
  return hits
}

const tree = npmLs(BANNED_PACKAGES)
if (tree) {
  const hits = collectHits(tree, [tree.name ?? 'openish'], [])
  if (hits.length > 0) {
    failures.push(`Vue is reachable in the dependency graph:\n    ${hits.join('\n    ')}`)
  }
}

// ---------------------------------------------------------------------------
// 2. Declared dependencies of each workspace package
// ---------------------------------------------------------------------------

for (const group of ['packages', 'apps']) {
  const groupDir = join(ROOT, group)
  let entries
  try {
    entries = readdirSync(groupDir)
  } catch {
    continue
  }

  for (const entry of entries) {
    const manifestPath = join(groupDir, entry, 'package.json')
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      continue
    }

    const declared = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    }

    for (const name of Object.keys(declared)) {
      if (BANNED_PACKAGES.includes(name) || name.startsWith('@vue/')) {
        failures.push(`${manifest.name} declares a banned dependency: ${name}`)
      }
      if (VUE_TAINTED_SCALAR.includes(name)) {
        failures.push(
          `${manifest.name} declares ${name}, which depends on vue. ` +
            `Use the Vue-free Scalar packages instead (openapi-parser, json-magic, openapi-types, types, helpers, snippetz, code-highlight).`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Build output
// ---------------------------------------------------------------------------

const VUE_IMPORT = /\bfrom\s*['"](vue|@vue\/[\w-]+)['"]/

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
    } else if (path.endsWith('.js')) {
      yield path
    }
  }
}

for (const group of ['packages', 'apps']) {
  for (const file of walk(join(ROOT, group))) {
    if (!file.includes('/dist/')) continue
    const source = readFileSync(file, 'utf8')
    const match = source.match(VUE_IMPORT)
    if (match) {
      failures.push(`Build output imports ${match[1]}: ${relative(ROOT, file)}`)
    }
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error('guard:vue FAILED\n')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  console.error('\nopenish must not depend on Vue. See the dependency contract in the README.')
  process.exit(1)
}

console.log('guard:vue passed - no Vue in the dependency graph or build output.')

#!/usr/bin/env node
/**
 * Put one version on every package, and on every reference between them.
 *
 * The versions committed here are all `0.0.0` and mean nothing. The tag is what decides a release,
 * so cutting one takes no commit, and no branch carries a number that went stale the moment it was
 * written. This is what turns the tag into the version, and CI runs it between the gate and the
 * publish.
 *
 *   node scripts/set-version.mjs 0.0.2
 *
 * `npm version --workspaces --no-git-tag-version` is most of this and not all of it: it writes each
 * package's own version and leaves the pins *between* them exactly where they were. Measured rather
 * than assumed - run both with and without npm's own update pass, `@openish/elements` came out at
 * the new version still asking for `@openish/core@0.0.1`. Published, that is a package whose
 * dependency will never exist at the version it names, and npm reports it to the person installing
 * it rather than to us.
 *
 * Rewritten by hand rather than re-serialised, because `JSON.stringify` would reformat six files to
 * say one number, and a release diff should be readable.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Every workspace, published or not: the apps pin the packages and break locally if left behind. */
const WORKSPACES = [
  'packages/core',
  'packages/client',
  'packages/theme',
  'packages/elements',
  'apps/site',
  'apps/playground',
]

const version = process.argv[2]

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Usage: node scripts/set-version.mjs <version>\nGot: ${version ?? '(nothing)'}`)
  process.exit(1)
}

for (const workspace of WORKSPACES) {
  const path = `${ROOT}${workspace}/package.json`
  const before = readFileSync(path, 'utf8')

  let after = before.replace(/^(\s*"version":\s*)"[^"]*"/m, `$1"${version}"`)
  /* Exact pins, so the four move as one release and a consumer cannot mix versions of them. */
  after = after.replace(/("@openish\/[a-z]+":\s*)"[^"]*"/g, `$1"${version}"`)

  if (after === before) {
    console.error(`${workspace}: nothing matched - the manifest is not shaped the way this expects`)
    process.exit(1)
  }

  writeFileSync(path, after)

  const manifest = JSON.parse(after)
  const pinned = Object.entries(manifest.dependencies ?? {})
    .filter(([name]) => name.startsWith('@openish/'))
    .map(([name]) => name.slice('@openish/'.length))
  console.log(`${workspace.padEnd(20)} ${manifest.version}${pinned.length ? `  (pins: ${pinned.join(', ')})` : ''}`)
}

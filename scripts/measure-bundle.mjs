#!/usr/bin/env node
/**
 * What it costs to put openish on a page.
 *
 * The premise of the project is "an API reference without the overhead", and a premise with no
 * number attached is a slogan. This bundles the public entry the way an application would - one ESM
 * entry, minified, tree-shaken - and reports the transfer size.
 *
 * `@scalar/api-reference` is measured for comparison in a throwaway directory outside the
 * workspace, because installing it here would put Vue in the dependency graph and `guard:vue` would
 * fail - correctly. Pass `--with-scalar` to install and measure it (needs the network); without it,
 * only openish is reported.
 */
import { execFileSync } from 'node:child_process'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const withScalar = process.argv.includes('--with-scalar')

const sizes = (code) => ({
  raw: Buffer.byteLength(code),
  gzip: gzipSync(code, { level: 9 }).length,
  brotli: brotliCompressSync(code).length,
})

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

const report = (label, code) => {
  const { raw, gzip, brotli } = sizes(code)
  console.log(`${label.padEnd(34)} ${kb(raw).padStart(9)}  ${kb(gzip).padStart(9)} gzip  ${kb(brotli).padStart(9)} br`)
}

/** Bundles one entry from a working directory, with no externals: this is what ships. */
const bundleOf = async (entry, workingDirectory) => {
  const result = await build({
    stdin: { contents: entry, resolveDir: workingDirectory, loader: 'ts' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
    loader: { '.css': 'text', '.woff2': 'dataurl', '.yaml': 'text' },
  })
  return result.outputFiles[0].text
}

console.log('entry'.padEnd(34), 'raw'.padStart(9), '     gzip', '        brotli')
console.log('-'.repeat(78))

report('@openish/core', await bundleOf(`export * from '@openish/core'`, join(ROOT, 'packages/core/src')))
report(
  '@openish/elements (everything)',
  await bundleOf(`import '@openish/elements'`, join(ROOT, 'packages/elements/src')),
)

/* The lazy half, so the split is visible rather than asserted. */
report(
  '  of which @scalar/snippetz',
  await bundleOf(`export { snippetz } from '@scalar/snippetz'`, join(ROOT, 'packages/core/src')),
)

if (!withScalar) {
  console.log('\nRun with --with-scalar to install and measure @scalar/api-reference for comparison.')
  process.exit(0)
}

const scratch = mkdtempSync(join(tmpdir(), 'openish-bundle-'))
try {
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ name: 'measure', private: true, type: 'module' }))
  console.log('\ninstalling @scalar/api-reference…')
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', '@scalar/api-reference'], {
    cwd: scratch,
    stdio: 'ignore',
  })
  const version = JSON.parse(
    readFileSync(join(scratch, 'node_modules/@scalar/api-reference/package.json'), 'utf8'),
  ).version
  report(
    `@scalar/api-reference ${version}`,
    await bundleOf(`import '@scalar/api-reference'`, scratch),
  )
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

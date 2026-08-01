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

/**
 * The same bundle, split at its dynamic imports.
 *
 * Without splitting, esbuild inlines an `import()` into the single output file, so the total is all
 * you can see - and the total is not what a reader waits for. openish defers three things on
 * purpose (the markdown pipeline, the syntax highlighter, and the snippet generator), so the number
 * that matters is the entry chunk: what has to arrive before the page exists.
 */
const splitBundleOf = async (entry, workingDirectory) => {
  const result = await build({
    stdin: { contents: entry, resolveDir: workingDirectory, loader: 'ts', sourcefile: 'entry.ts' },
    bundle: true,
    minify: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    outdir: 'out',
    write: false,
    logLevel: 'silent',
    loader: { '.css': 'text', '.woff2': 'dataurl', '.yaml': 'text' },
  })

  let entryCode = ''
  let lazyBytes = { raw: 0, gzip: 0, brotli: 0 }
  for (const file of result.outputFiles) {
    if (file.path.endsWith('stdin.js') || file.path.endsWith('entry.js')) {
      entryCode = file.text
    } else {
      const measured = sizes(file.text)
      lazyBytes = {
        raw: lazyBytes.raw + measured.raw,
        gzip: lazyBytes.gzip + measured.gzip,
        brotli: lazyBytes.brotli + measured.brotli,
      }
    }
  }

  return { entryCode, lazyBytes }
}

console.log('entry'.padEnd(34), 'raw'.padStart(9), '     gzip', '        brotli')
console.log('-'.repeat(78))

report('@openish/core', await bundleOf(`export * from '@openish/core'`, join(ROOT, 'packages/core/src')))
report('@openish/client', await bundleOf(`export * from '@openish/client'`, join(ROOT, 'packages/client/src')))
report(
  '@openish/elements (everything)',
  await bundleOf(`import '@openish/elements'`, join(ROOT, 'packages/elements/src')),
)

/*
 * The split, so what a reader actually waits for is visible rather than asserted. The entry chunk is
 * the shell, the sidebar, the schema renderer and the parser; the deferred chunks are the markdown
 * pipeline, the syntax highlighter, and the snippet generator.
 */
const split = await splitBundleOf(`import '@openish/elements'`, join(ROOT, 'packages/elements/src'))
report('  entry chunk (before first paint)', split.entryCode)
console.log(
  `${'  deferred chunks'.padEnd(34)} ${kb(split.lazyBytes.raw).padStart(9)}  ${kb(split.lazyBytes.gzip).padStart(9)} gzip  ${kb(split.lazyBytes.brotli).padStart(9)} br`,
)

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

#!/usr/bin/env node
/**
 * The build that makes openish droppable onto a page that has no bundler.
 *
 * Two things stand between `npm install` and a `<script>` tag: the module graph, which esbuild
 * flattens, and the stylesheet, which a consumer with no resolver cannot import by package
 * specifier. Both are handled here - the CSS is inlined into `src/standalone.ts`'s `THEME_CSS`
 * placeholder, so the emitted file needs nothing else to render correctly.
 *
 * The output is ESM. `<script type="module">` is the only form worth shipping now, and it is what
 * lets the bundle use top-level `await` and dynamic `import()` - which openish does, for the snippet
 * generator, so an IIFE build would have to give one of those up.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const THEME = join(ROOT, 'packages/theme/css/index.css')
const ENTRY = join(ROOT, 'packages/elements/src/standalone.ts')
const OUT = join(ROOT, 'packages/elements/dist/standalone.js')

/**
 * The theme as one string.
 *
 * `index.css` is a list of `@import`s, and an `@import` inside an inlined `<style>` would be a
 * relative URL resolved against the *host page* - so it would either 404 or, worse, fetch something
 * of the host's. Flattening is what makes the inlined copy self-contained.
 */
const flatten = (file, seen = new Set()) => {
  const path = resolve(file)
  if (seen.has(path)) {
    return ''
  }
  seen.add(path)

  return readFileSync(path, 'utf8').replace(/@import\s+['"]([^'"]+)['"]\s*;/g, (_, target) =>
    flatten(join(dirname(path), target), seen),
  )
}

const css = flatten(THEME)

mkdirSync(dirname(OUT), { recursive: true })

const result = await build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  /* The placeholder in `standalone.ts`. `define` substitutes it as a literal before minification. */
  define: { THEME_CSS: JSON.stringify(css) },
  legalComments: 'none',
  metafile: true,
})

const bytes = Object.values(result.metafile.outputs).reduce((total, output) => total + output.bytes, 0)
writeFileSync(
  join(dirname(OUT), 'standalone.d.ts'),
  "export * from './index.js'\n",
)

console.log(`standalone: ${(bytes / 1000).toFixed(1)} kB raw, ${(css.length / 1000).toFixed(1)} kB of it theme CSS`)
console.log(`wrote ${OUT}`)

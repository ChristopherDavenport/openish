import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/*
 * GitHub Pages serves this repository at /openish/, and `@lit-labs/router` matches
 * `location.pathname` against a URLPattern - it has no base option and no hash mode, so the base has
 * to be part of every route pattern and every href.
 *
 * Set for `dev` as well as `build`, deliberately. A dev server at `/` would mean every path in
 * `routes.ts` is a lie that only comes true after a deploy, and the class of bug that hides there -
 * a hard-coded `/guide/x` that resolves in development and 404s in production - is exactly the one
 * nobody finds until a reader does.
 */
const BASE = '/openish/'

/**
 * The SPA fallback Pages does not have.
 *
 * There is no rewrite rule to configure, so a deep link like /openish/start is a real 404. The
 * convention is a `404.html` byte-identical to `index.html`: Pages serves it, the browser renders it
 * and keeps the URL it asked for, and the module entry runs with `location.pathname` intact for the
 * router to read. Copied rather than committed as a second source file, because two files that have
 * to stay identical eventually are not.
 */
const spaFallback = (): Plugin => ({
  name: 'openish-site-404',
  apply: 'build',
  closeBundle() {
    copyFileSync(resolve('./dist/index.html'), resolve('./dist/404.html'))
  },
})

export default defineConfig({
  base: BASE,
  plugins: [spaFallback()],
  build: {
    rollupOptions: {
      /*
       * Two entries. `history-demo.html` is the document the routing guide frames - it has no site
       * router in it, which is the only way `hash` and `history` can be shown owning an address bar
       * while this site's own router owns the one in the top-level window.
       */
      input: {
        index: resolve('./index.html'),
        'history-demo': resolve('./history-demo.html'),
      },
    },
  },
  resolve: {
    /*
     * `@jack-henry/jh-ui` pins `lit@2.1.1` as a hard dependency, so without deduping the app loads
     * two copies of Lit and logs "Multiple versions of Lit loaded" - the same reason the playground
     * dedupes.
     */
    dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'],
    alias: {
      /* Against source, so the site is a live view of the working tree and needs no package build. */
      '@openish/core': resolve('../../packages/core/src/index.ts'),
      '@openish/client': resolve('../../packages/client/src/index.ts'),
      '@openish/elements': resolve('../../packages/elements/src/index.ts'),
      /*
       * The six committed fixtures, for the guides that need one specific behaviour rather than a
       * whole API. Nothing is added to the repository by pointing at them: they are already the one
       * place `guard:specs` allows an API document to live.
       */
      '@fixtures': resolve('../../packages/core/test/fixtures'),
    },
  },
  server: {
    /* 5173 is the playground's. Both should be able to run at once. */
    port: 5174,
    /* The fixtures and the packages are outside this app's root. */
    fs: { allow: [resolve('../..')] },
  },
})

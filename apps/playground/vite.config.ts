import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    /*
     * `@jack-henry/jh-ui` pins `lit@2.1.1` as a hard dependency, so without deduping the app loads
     * two copies of Lit and logs "Multiple versions of Lit loaded". See the README for the fallback
     * if a jh component turns out to need Lit 2 specifically.
     */
    dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'],
    alias: {
      /* Run against source so the playground picks up edits without a package build. */
      '@openish/core': resolve('../../packages/core/src/index.ts'),
      '@openish/elements': resolve('../../packages/elements/src/index.ts'),
    },
  },
  server: {
    /* Deep links like /tags/planets/ must serve index.html - the router reads the pathname. */
    port: 5173,
  },
})

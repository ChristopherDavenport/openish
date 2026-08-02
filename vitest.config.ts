import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const alias = {
  '@openish/core': resolve('./packages/core/src/index.ts'),
  '@openish/client': resolve('./packages/client/src/index.ts'),
  '@openish/elements': resolve('./packages/elements/src/index.ts'),
}

/**
 * Tests run against source, not `dist`, so a failing build never masks a failing test.
 *
 * `elements` runs in real Chromium rather than a simulated DOM. jh-ui calls `attachInternals()`,
 * which happy-dom does not implement, and the router needs real `URLPattern` and history - shimming
 * either would turn this suite into a test of the shim.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'core',
          environment: 'node',
          include: ['packages/core/test/**/*.test.ts'],
        },
      },
      {
        /*
         * `@openish/client` has no framework and no DOM except in its OAuth transports, so its suite
         * runs in Node - which is also how it stays honest about that. The transports are tested in
         * the browser project below, by the `.browser.test.ts` suffix.
         */
        resolve: { alias },
        test: {
          name: 'client',
          environment: 'node',
          include: ['packages/client/test/**/*.test.ts'],
          exclude: ['packages/client/test/**/*.browser.test.ts'],
        },
      },
      {
        resolve: { alias, dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'] },
        /*
         * Named up front rather than discovered.
         *
         * Vite optimises a dependency the first time something imports it and then reloads the page,
         * which mid-run means a test file is torn down and re-imported - and the failure that comes
         * out is not "the dependency is missing", it is a dozen unrelated assertions failing in
         * whichever files happened to be in flight. The virtualiser's entry points are the ones that
         * appear late, because only the plane and one spike reach for them.
         */
        optimizeDeps: {
          include: [
            '@lit-labs/virtualizer',
            '@lit-labs/virtualizer/virtualize.js',
            '@lit-labs/virtualizer/layouts/flow.js',
          ],
        },
        test: {
          name: 'elements',
          include: ['packages/elements/test/**/*.test.ts', 'packages/client/test/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})

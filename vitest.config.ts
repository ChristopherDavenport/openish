import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import { diagnoseServer } from './scripts/diagnose-server.mjs'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const alias = {
  '@openish/core': resolve('./packages/core/src/index.ts'),
  '@openish/client': resolve('./packages/client/src/index.ts'),
  '@openish/elements': resolve('./packages/elements/src/index.ts'),
  /* Mirrors `apps/site/vite.config.ts`, so the site's tests resolve fixtures the way the site does. */
  '@fixtures': resolve('./packages/core/test/fixtures'),
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
        /*
         * The parts of `@openish/elements` that are not elements.
         *
         * URL and id maths, the plane's scroll target, the convergence arithmetic and the OAuth flow
         * precedence rules are all pure functions of their arguments, and every one of them was
         * arrived at through a failure rather than derived. Running them in Node rather than in
         * Chromium is not only faster - it is what keeps them honest about having no DOM, the same
         * way the `client` project keeps that package honest. Anything here that reaches for
         * `document` or `customElements` fails immediately and belongs in the project below.
         */
        resolve: { alias },
        test: {
          name: 'elements-pure',
          environment: 'node',
          include: ['packages/elements/test/pure/**/*.test.ts'],
        },
      },
      {
        /*
         * `@openish/site` is an application, but the parts of it worth testing without a browser are
         * the same shape as `elements-pure`: the base-path arithmetic, which is a pure function and
         * is the one thing here that a local browser cannot catch - a path that is wrong under
         * `/openish/` resolves perfectly against a dev server rooted at `/`.
         *
         * Anything in the site's tests that reaches a page module reaches `customElements.define`,
         * and is named `.browser.test.ts` so it runs in the project below.
         */
        resolve: { alias },
        test: {
          name: 'site',
          environment: 'node',
          include: ['apps/site/test/**/*.test.ts'],
          exclude: ['apps/site/test/**/*.browser.test.ts'],
        },
      },
      {
        resolve: { alias, dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'] },
        /*
         * Nothing at all unless `DIAGNOSE_LOG` names a file, and Vite drops the falsy plugin when it
         * does not. Only this project serves documents to a browser, so it is the only one with a
         * server worth recording. See `scripts/diagnose-server.mjs`.
         */
        plugins: [diagnoseServer()],
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
            /* The site's own late arrivals, for the same reason: only its tests reach for them. */
            '@lit-labs/router',
            'lit/directives/style-map.js',
          ],
        },
        test: {
          name: 'elements',
          include: [
            'packages/elements/test/**/*.test.ts',
            'packages/client/test/**/*.browser.test.ts',
            'apps/site/test/**/*.browser.test.ts',
          ],
          exclude: ['packages/elements/test/pure/**'],
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

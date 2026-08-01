import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const alias = {
  '@openish/core': resolve('./packages/core/src/index.ts'),
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
        resolve: { alias, dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'] },
        test: {
          name: 'elements',
          include: ['packages/elements/test/**/*.test.ts'],
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

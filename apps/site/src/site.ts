/**
 * The site's entry point, and the one module in it whose import order is load-bearing.
 *
 * `@lit-labs/router` matches with `URLPattern`, which Safari and Firefox only shipped recently, and
 * a documentation site should not require a 2025 browser to render a paragraph. So the polyfill goes
 * in first — and conditionally, because a static import would ship it to every browser that already
 * has the thing.
 *
 * Everything below it is a dynamic import for that reason alone. A static `import` is hoisted and
 * evaluated before any statement in this file runs, so the conditional above would be decided after
 * the router had already been loaded and a `Router` possibly constructed. Top-level `await` plus
 * `import()` is what actually sequences them, and it is available because this ships as ESM.
 */
if (!('URLPattern' in globalThis)) {
  await import('urlpattern-polyfill')
}

await import('./styles/site.css')
await import('./app/site-app.js')

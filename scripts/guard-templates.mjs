#!/usr/bin/env node
/**
 * The templates are typechecked too.
 *
 * `tsc` sees an `html` tagged template as a string and stops there, so everything inside one - the
 * tag names, the attributes, the types either side of a binding - was unchecked by anything in this
 * repo. `lit-analyzer` is the checker for that half, and it earned its place immediately: it is what
 * said a `keyFunction` for `NavRow` cannot be handed to an element the tag map declares with an
 * `unknown` item type, and that a ternary ending in `nothing` is not a value an ARIA attribute
 * accepts.
 *
 * The rules below are named rather than taken from `--strict`, because two of the strict set do not
 * work against this codebase and the difference is worth stating each time rather than discovering
 * again. Everything named here is an `error`: a guard with a warning tier is a guard that gets
 * ignored, and every one of these was verified to be silent on the tree when it was added.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/*
 * Source only. The test suite builds templates too, but out of fixtures rather than out of the
 * document model, and it is checked by running.
 */
const GLOBS = ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts']

/**
 * Every rule the analyzer has, except the three below, and all of them fatal.
 *
 * Named one by one rather than taken from `--strict`, for two reasons. `--strict` assigns its own
 * severities and a warning does not fail the process, so half the set would be advisory - and a
 * guard that can be ignored is one that will be. And a new rule in a future release should arrive as
 * a decision rather than as a build that broke overnight.
 */
const ERRORS = [
  'no-boolean-in-attribute-binding',
  'no-complex-attribute-binding',
  'no-expressionless-property-binding',
  'no-incompatible-property-type',
  'no-incompatible-type-binding',
  'no-invalid-attribute-name',
  'no-invalid-boolean-binding',
  'no-invalid-directive-binding',
  'no-invalid-tag-name',
  'no-legacy-attribute',
  'no-missing-element-type-definition',
  'no-missing-import',
  'no-noncallable-event-binding',
  'no-nullable-attribute-binding',
  'no-property-visibility-mismatch',
  'no-unclosed-tag',
  'no-unintended-mixed-binding',
  'no-unknown-property',
  'no-unknown-slot',
  'no-unknown-tag-name',
]

/**
 * Off, and why. Both are the analyzer being behind rather than the code being wrong.
 *
 * - `no-invalid-css`: the CSS database bundled with `lit-analyzer` predates container queries, so
 *   `@container`, `container-type` and `container-name` are all reported as unknown. Those are load
 *   bearing here - the three-column section layout is a container query, in five files - so the rule
 *   is seven false reports and nothing else. A `--maxWarnings 7` that has to be edited every time a
 *   section gains a column would be worse than either.
 * - `no-unknown-attribute`: `web-component-analyzer` does not read the `attribute:` rename off
 *   `@property({ type: Boolean, attribute: 'hide-header' })` under this repo's legacy decorators, so
 *   every renamed boolean attribute - `hide-header`, `no-example`, `examples-only`,
 *   `inline-properties`, `has-children` - is reported as unknown. They are declared correctly:
 *   `@custom-elements-manifest/analyzer` finds all of them, and `custom-elements.json` lists them.
 * - `no-unknown-event`: the analyzer's built-in HTML data has no `close` on `<dialog>`, which is a
 *   real event and the only way to hear Escape or a backdrop click. It is off reluctantly - it is
 *   the rule that found `openish-sidebar-toggle` missing from the global `HTMLElementEventMap` - but
 *   that particular drift is now caught at compile time and more thoroughly, by `AllEventsDeclared`
 *   in `src/events.ts`, which fails for an event nothing happens to bind in a template too.
 *
 * All three are worth re-checking when `lit-analyzer` updates. What they give up is real.
 */
const OFF = ['no-invalid-css', 'no-unknown-attribute', 'no-unknown-event']

const rules = [
  ...ERRORS.flatMap((rule) => [`--rules.${rule}`, 'error']),
  ...OFF.flatMap((rule) => [`--rules.${rule}`, 'off']),
]

const result = spawnSync('npx', ['lit-analyzer', ...GLOBS, '--format', 'code', ...rules], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.status !== 0) {
  console.error('\nguard:templates FAILED - see the report above.')
  process.exit(result.status ?? 1)
}

console.log('guard:templates passed - every binding matches what the element on the other side takes.')

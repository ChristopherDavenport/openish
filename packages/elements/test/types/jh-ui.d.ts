/**
 * `@jack-henry/jh-ui` ships a single `index.d.ts` and no types for its per-component entry points,
 * which are the ones you import to register a tag. Declaring them keeps side-effect imports
 * typechecked without asserting an API surface jh-ui does not publish.
 *
 * These live under `test/` rather than `src/` because nothing in `@openish/elements` imports jh-ui:
 * the components are built from `--openish-*` tokens alone, and the Jack Henry binding lives in
 * `@openish/theme`. jh-ui is a root devDependency so `jh-ui-lit3.test.ts` can keep asserting that
 * openish and jh-ui coexist on one copy of Lit - which is a fact about a host application, not a
 * dependency openish is entitled to install on anyone's behalf.
 */
declare module '@jack-henry/jh-ui/components/*'
declare module '@jack-henry/jh-icons/icons-wc/*'

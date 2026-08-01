/**
 * `@jack-henry/jh-ui` ships a single `index.d.ts` and no types for its per-component entry points,
 * which are the ones you import to register a tag. Declaring them keeps side-effect imports
 * typechecked without asserting an API surface jh-ui does not publish.
 *
 * The real contract for these components is `custom-elements.json` in the jh-ui package.
 */
declare module '@jack-henry/jh-ui/components/*'
declare module '@jack-henry/jh-icons/icons-wc/*'

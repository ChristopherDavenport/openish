/**
 * Where a `oneOf`/`anyOf` choice sits, written as a path.
 *
 * A reader picking `Dog` in a variant tab set is answering a question about one place in one schema,
 * and two quite different pieces of code have to agree about which place that is: the property tree
 * that offered the choice, and the example generator that has to honour it. Neither can hold the
 * other's state, so they hold a string instead, and this module is the only definition of it.
 *
 * The path addresses the shape *as the reader sees it*, not as the document writes it, which is why
 * three things contribute no segment:
 *
 * - `$ref` — resolved on both sides before anything looks at it.
 * - `allOf` — the tree merges the branches into one property list, so there is no branch to name.
 * - `items` — the tree unwraps an array and shows what is in it, however many levels deep.
 *
 * What is left is what a reader would say out loud: this property, then this one, then this variant.
 */

/** The path of the schema a preview was handed. Everything else is relative to it. */
export const VARIANT_PATH_ROOT = ''

/** JSON Pointer's escaping, for the one segment that carries an author's name. */
const escapeSegment = (name: string): string => name.replace(/~/g, '~0').replace(/\//g, '~1')

const child = (path: string, ...segments: readonly string[]): string =>
  [path, ...segments].filter((segment) => segment !== '').join('/')

/** The path of one named property of the schema at `path`. */
export const variantProperty = (path: string, name: string): string =>
  child(path, 'properties', escapeSegment(name))

/** The path of the schema every other key has to match. */
export const variantAdditional = (path: string): string => child(path, 'additionalProperties')

/** The path of one branch of the variant set at `path`. */
export const variantBranch = (path: string, keyword: 'oneOf' | 'anyOf', index: number): string =>
  child(path, keyword, String(index))

/**
 * The path of something the example generator does not model - `patternProperties`, `if`/`then`, a
 * `dependentSchemas` rule.
 *
 * The tree renders all of them and a reader can pick a variant inside one. Giving those subtrees a
 * segment the generator never emits is what makes that harmless: the choice is recorded, no example
 * path can ever match it, and nothing has to special-case the difference.
 */
export const variantAside = (path: string, keyword: string, name: string): string =>
  child(path, keyword, escapeSegment(name))

/**
 * One reader's variant choices, by key.
 *
 * Scoped as well as pathed, because an operation has several shapes on screen at once - the request
 * body and one schema per response - and a `oneOf` at the root of each of them has the same path.
 */
export type VariantChoices = ReadonlyMap<string, number>

/** The key a choice is filed under: which shape, and where in it. */
export const variantKey = (scope: string, path: string): string => `${scope}#${path}`

/** The branch to show at `path`, or the first, which is what a document with no reader implies. */
export const variantIndex = (
  variants: VariantChoices | undefined,
  scope: string,
  path: string,
  count: number,
): number => {
  const chosen = variants?.get(variantKey(scope, path))
  return chosen !== undefined && chosen >= 0 && chosen < count ? chosen : 0
}

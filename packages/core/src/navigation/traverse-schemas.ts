import { escapeJsonPointer } from '@scalar/json-magic/helpers/escape-json-pointer'
import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import { getResolvedRef } from '../ref.js'
import type { NavGroupNode, NavModelNode, SlugOverrides } from '../types.js'
import { isHidden } from './hidden.js'
import { asIdentifier, asProse, joinId, type SlugRegistry } from './ids.js'
import { declaredTags } from './tags.js'

/**
 * Builds the Models section from `components.schemas`.
 *
 * Schema names are used verbatim as titles - `PaymentIntent` is what the document calls it and what
 * a reader will search for, so it is not prettified into `Payment Intent`. Only the slug is
 * normalised.
 */
export const traverseSchemas = (
  document: OpenApiDocument,
  label: string,
  registry: SlugRegistry,
  slugs: SlugOverrides = {},
  prefix = '',
): NavGroupNode | undefined => {
  const schemas = document.components?.schemas
  if (!schemas) {
    return undefined
  }

  /*
   * A schema the document marks internal is dropped from the Models section, but the schema itself
   * is untouched: an operation whose request body refers to it still renders its property tree, and
   * the reader still gets the shape they need to call the operation. `x-internal` on a schema means
   * "this is not a type worth listing in the dictionary", not "pretend it does not exist".
   */
  const names = Object.keys(schemas).filter((name) => !isHidden(getResolvedRef(schemas[name])))
  if (names.length === 0) {
    return undefined
  }

  const children: NavModelNode[] = names.map((name) => {
    const node: NavModelNode = {
      type: 'model',
      id: registry.claim(joinId(prefix, 'models'), asIdentifier(name), 'model', slugs.model?.({ name })),
      title: name,
      name,
      pointer: `#/components/schemas/${escapeJsonPointer(name)}`,
    }

    /*
     * `x-tags`, read but not obeyed as a move.
     *
     * The dictionary is still the dictionary: a model tagged `Planets` is listed under the Planets
     * tag *and* stays in Models, because a reader who wants the type by name looks where the types
     * are. Moving it would also break its id, which is the one thing an extension should never do.
     */
    const tags = declaredTags(getResolvedRef(schemas[name]), 'x-tags')
    if (tags) {
      node.tags = tags
    }
    return node
  })

  return {
    type: 'group',
    id: registry.claim(prefix, asProse('models'), 'models'),
    title: label,
    children,
  }
}

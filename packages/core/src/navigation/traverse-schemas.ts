import { escapeJsonPointer } from '@scalar/json-magic/helpers/escape-json-pointer'
import type { Document as OpenApiDocument } from '@scalar/openapi-types/3.1'

import type { NavGroupNode, NavModelNode } from '../types.js'
import { asIdentifier, asProse, type SlugRegistry } from './ids.js'

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
): NavGroupNode | undefined => {
  const schemas = document.components?.schemas
  if (!schemas) {
    return undefined
  }

  const names = Object.keys(schemas)
  if (names.length === 0) {
    return undefined
  }

  const children: NavModelNode[] = names.map((name) => ({
    type: 'model',
    id: registry.claim('models', asIdentifier(name), 'model'),
    title: name,
    name,
    pointer: `#/components/schemas/${escapeJsonPointer(name)}`,
  }))

  return {
    type: 'group',
    id: registry.claim('', asProse('models'), 'models'),
    title: label,
    children,
  }
}

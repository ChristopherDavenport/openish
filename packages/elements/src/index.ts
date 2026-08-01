/**
 * Entry point for the openish custom elements.
 *
 * Importing this module registers every `openish-*` tag as a side effect. Pair it with a stylesheet
 * from `@openish/theme`, which declares the `--openish-*` hooks these components read.
 */
import './elements/openish-api-reference.js'
import './elements/openish-code-block.js'
import './elements/openish-code-sample.js'
import './elements/openish-disclosure.js'
import './elements/openish-markdown.js'
import './elements/openish-model.js'
import './elements/openish-operation.js'
import './elements/openish-overview.js'
import './elements/openish-parameters.js'
import './elements/openish-request-body.js'
import './elements/openish-response-list.js'
import './elements/openish-schema.js'
import './elements/openish-search.js'
import './elements/openish-schema-preview.js'
import './elements/openish-section.js'
import './elements/openish-sidebar.js'
import './elements/openish-sidebar-item.js'
import './elements/openish-table.js'
import './elements/openish-tabs.js'
import './elements/openish-tag-section.js'

export { OpenishApiReference } from './elements/openish-api-reference.js'
export { OpenishCodeBlock } from './elements/openish-code-block.js'
export { OpenishCodeSample } from './elements/openish-code-sample.js'
export { OpenishDisclosure } from './elements/openish-disclosure.js'
export { OpenishMarkdown } from './elements/openish-markdown.js'
export { OpenishModel } from './elements/openish-model.js'
export { OpenishOperation } from './elements/openish-operation.js'
export { OpenishOverview } from './elements/openish-overview.js'
export { OpenishParameters } from './elements/openish-parameters.js'
export { OpenishRequestBody } from './elements/openish-request-body.js'
export { OpenishResponseList } from './elements/openish-response-list.js'
export { OpenishSchema } from './elements/openish-schema.js'
export { OpenishSchemaPreview } from './elements/openish-schema-preview.js'
export { OpenishSearch } from './elements/openish-search.js'
export { OpenishSection, type SectionName } from './elements/openish-section.js'
export { OpenishSidebar } from './elements/openish-sidebar.js'
export { OpenishSidebarItem } from './elements/openish-sidebar-item.js'
export { OpenishTable, type OpenishTableRow } from './elements/openish-table.js'
export { OpenishTabs, type OpenishTab } from './elements/openish-tabs.js'
export { OpenishTagSection } from './elements/openish-tag-section.js'

export { HotkeyController, type Hotkey } from './controllers/hotkey.js'
export { LocationController } from './controllers/location.js'
export { mediaTypeExample, renderMediaTypes } from './render/media-types.js'
export { searchNodes, type SearchResult } from './search/search.js'
export { renderNode, renderNodeById, renderOverview } from './render/render-node.js'
export {
  asSchema,
  refName,
  refPointer,
  schemaConstraints,
  schemaProperties,
  schemaTypeLabel,
  schemaVariants,
  unwrapArray,
  type SchemaProperty,
  type SchemaVariants,
} from './schema/summary.js'

export {
  documentContext,
  schemaContext,
  uiContext,
  type OpenishSchemaState,
  type OpenishUiState,
} from './context/contexts.js'
export { dispatch, type OpenishEvent, type OpenishEventMap } from './events.js'
export { navigate } from './router/navigate.js'
export { hrefFor, idFromPathname, isAncestorId, normalizeBasePath } from './router/urls.js'

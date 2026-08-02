/**
 * Entry point for the openish custom elements.
 *
 * Importing this module registers every `openish-*` tag as a side effect. Pair it with a stylesheet
 * from `@openish/theme`, which declares the `--openish-*` hooks these components read.
 */
import './elements/openish-api-reference.js'
import './elements/openish-auth-form.js'
import './elements/openish-callbacks.js'
import './elements/openish-code-block.js'
import './elements/openish-code-sample.js'
import './elements/openish-copy-button.js'
import './elements/openish-copy-markdown.js'
import './elements/openish-disclosure.js'
import './elements/openish-download.js'
import './elements/openish-markdown.js'
import './elements/openish-model.js'
import './elements/openish-operation.js'
import './elements/openish-overview.js'
import './elements/openish-parameters.js'
import './elements/openish-request-body.js'
import './elements/openish-request-form.js'
import './elements/openish-response-list.js'
import './elements/openish-response-view.js'
import './elements/openish-schema.js'
import './elements/openish-search.js'
import './elements/openish-server-select.js'
import './elements/openish-schema-preview.js'
import './elements/openish-sidebar.js'
import './elements/openish-sidebar-item.js'
import './elements/openish-source-select.js'
import './elements/openish-table.js'
import './elements/openish-tabs.js'
import './elements/openish-tag-section.js'
import './elements/openish-try-it.js'

export { OpenishApiReference } from './elements/openish-api-reference.js'
export { OpenishAuthForm } from './elements/openish-auth-form.js'
export { OpenishCallbacks } from './elements/openish-callbacks.js'
export { OpenishCodeBlock } from './elements/openish-code-block.js'
export { OpenishCodeSample } from './elements/openish-code-sample.js'
export { OpenishCopyButton } from './elements/openish-copy-button.js'
export { OpenishCopyMarkdown } from './elements/openish-copy-markdown.js'
export { OpenishDisclosure } from './elements/openish-disclosure.js'
export { OpenishDownload } from './elements/openish-download.js'
export { OpenishMarkdown } from './elements/openish-markdown.js'
export { OpenishModel } from './elements/openish-model.js'
export { OpenishOperation } from './elements/openish-operation.js'
export { OpenishOverview } from './elements/openish-overview.js'
export { OpenishParameters } from './elements/openish-parameters.js'
export { OpenishRequestBody } from './elements/openish-request-body.js'
export { OpenishRequestForm, type ParameterChange } from './elements/openish-request-form.js'
export { OpenishResponseList } from './elements/openish-response-list.js'
export { OpenishResponseView } from './elements/openish-response-view.js'
export { OpenishSchema } from './elements/openish-schema.js'
export { OpenishSectionIndex } from './elements/openish-section-index.js'
export { OpenishSectionList } from './elements/openish-section-list.js'
export { OpenishSchemaPreview } from './elements/openish-schema-preview.js'
export { OpenishSearch } from './elements/openish-search.js'
export { OpenishServerSelect } from './elements/openish-server-select.js'
export { OpenishSidebar } from './elements/openish-sidebar.js'
export { OpenishSidebarItem } from './elements/openish-sidebar-item.js'
export { OpenishSourceSelect } from './elements/openish-source-select.js'
export { OpenishTable, type OpenishTableRow } from './elements/openish-table.js'
export { OpenishTabs, type OpenishTab } from './elements/openish-tabs.js'
export { OpenishTagSection } from './elements/openish-tag-section.js'
export { OpenishTryIt } from './elements/openish-try-it.js'

export { HotkeyController, type Hotkey } from './controllers/hotkey.js'
export { LocationController } from './controllers/location.js'
export { SourcePrefetchController } from './controllers/source-prefetch.js'
export { languageForMediaType, mediaTypeExample, renderMediaTypes } from './render/media-types.js'
export { searchNodes, type SearchResult } from './search/search.js'
export { heading, headingTag } from './render/heading.js'
export { renderNode, renderNodeById, renderOverview } from './render/render-node.js'
export {
  documentSections,
  overviewAnchors,
  sectionIndex,
  type Section,
  type SectionKind,
} from './render/sections.js'
export { sectionLinks, type SectionLinkGroup, type SectionParent } from './render/section-links.js'
export {
  additionalPropertiesName,
  asSchema,
  enumDescriptions,
  hasBody,
  orderProperties,
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
  requestContext,
  schemaContext,
  sourcesContext,
  uiContext,
  type OpenishRequestState,
  type OpenishSchemaState,
  type OpenishSourcesState,
  type OpenishUiState,
} from './context/contexts.js'
export {
  dispatch,
  type OpenishAuthChange,
  type OpenishEvent,
  type OpenishEventMap,
  type OpenishServerChange,
} from './events.js'
export { navigate } from './router/navigate.js'
export { navRows, isExpanded, type Expansion, type NavRow } from './navigation/rows.js'
export {
  hrefFor,
  hrefForOverview,
  idFromHash,
  idFromPathname,
  isAncestorId,
  normalizeBasePath,
  type RoutingMode,
  type RoutingState,
} from './router/urls.js'

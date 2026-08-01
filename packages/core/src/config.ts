import type { OpenishConfig, ResolvedOpenishConfig } from './types.js'

export const DEFAULT_CONFIG: ResolvedOpenishConfig = {
  layout: 'modern',
  hideModels: false,
  modelsSectionLabel: 'Models',
  showSidebar: true,
  hideSearch: false,
  showOperationId: false,
  operationTitleSource: 'summary',
  defaultOpenFirstTag: false,
  defaultOpenAllTags: false,
  searchHotKey: '/',
  baseServerURL: '',
  expandAllResponses: false,
  expandAllSchemaProperties: false,
  orderSchemaPropertiesBy: 'document',
  orderRequiredPropertiesFirst: false,
  untaggedLabel: 'Default',
  operationSort: 'document',
  tagSort: 'document',
  defaultHttpClient: 'shell/curl',
  hiddenClients: [],
  colorScheme: 'auto',
  documentDownloadType: 'both',
  hideTryIt: false,
  proxyUrl: '',
  revealCredentialsInSamples: false,
  oauthRedirectUri: '',
  oauthRedirectMode: 'popup',
  preferredSecurityScheme: '',
  oauth: {},
  slugs: {},
  servers: [],
}

/** Fills in every unset option so components never have to handle `undefined`. */
export const resolveConfig = (config: OpenishConfig = {}): ResolvedOpenishConfig => {
  const resolved: ResolvedOpenishConfig = { ...DEFAULT_CONFIG }

  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined) {
      Object.assign(resolved, { [key]: value })
    }
  }

  return Object.freeze(resolved)
}

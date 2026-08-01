import type { OpenishConfig, ResolvedOpenishConfig } from './types.js'

export const DEFAULT_CONFIG: ResolvedOpenishConfig = {
  layout: 'modern',
  hideModels: false,
  modelsSectionLabel: 'Models',
  showSidebar: true,
  hideSearch: false,
  showOperationId: false,
  expandAllResponses: false,
  expandAllSchemaProperties: false,
  untaggedLabel: 'Default',
  operationSort: 'document',
  tagSort: 'document',
  defaultHttpClient: 'shell/curl',
  hiddenClients: [],
  colorScheme: 'light',
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

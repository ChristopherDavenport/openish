import { DEFAULT_CONFIG } from '@openish/core'

/**
 * Every `OpenishConfig` option, as something a page can render a control for.
 *
 * Derived from `DEFAULT_CONFIG` rather than transcribed, so an option added to the library appears
 * on the site without anyone remembering to add it. What is written by hand here is only what the
 * defaults cannot say: the human label, the sentence explaining it, and — for the string options
 * that are really unions — which values are legal, since a default of `'document'` cannot tell you
 * that `'alpha'` exists.
 *
 * An option with no entry in {@link DETAIL} still gets a control, inferred from the type of its
 * default. That is the point: a new boolean becomes a checkbox the day it lands, unlabelled but
 * present, which is a much smaller failure than not being there at all.
 */
export type ConfigControl =
  | { readonly key: string; readonly kind: 'boolean'; readonly label: string; readonly blurb: string; readonly value: boolean }
  | { readonly key: string; readonly kind: 'choice'; readonly label: string; readonly blurb: string; readonly value: string; readonly choices: readonly string[] }
  | { readonly key: string; readonly kind: 'text'; readonly label: string; readonly blurb: string; readonly value: string }

/** The unions the defaults cannot describe, and the prose the type's JSDoc carries. */
const DETAIL: Readonly<
  Record<string, { label: string; blurb: string; choices?: readonly string[] }>
> = {
  showSidebar: { label: 'Sidebar', blurb: 'The navigation column.' },
  hideSearch: { label: 'Hide search', blurb: 'Turns off the dialog and its hotkeys.' },
  hideModels: { label: 'Hide models', blurb: 'Drops components.schemas from the navigation and from search.' },
  hideTryIt: { label: 'Hide try-it', blurb: 'Renders operations without the panel that sends requests.' },
  showOperationId: { label: 'Show operationId', blurb: 'Alongside the summary in the navigation.' },
  operationTitleSource: {
    label: 'Operation titles',
    blurb: 'What the sidebar calls an operation. A document whose summaries are generated reads better by path.',
    choices: ['summary', 'path'],
  },
  defaultOpenFirstTag: { label: 'Open the first tag', blurb: 'When the URL names nothing in particular.' },
  defaultOpenAllTags: { label: 'Open every tag', blurb: 'Costly on a large document, which is why it is not the default.' },
  expandAllResponses: { label: 'Expand responses', blurb: 'Every response open rather than one at a time.' },
  expandAllSchemaProperties: { label: 'Expand schemas', blurb: 'Every level of the property tree at once.' },
  orderSchemaPropertiesBy: {
    label: 'Property order',
    blurb: 'document keeps the order the author wrote, which is often meaningful. alpha is easier to scan in a type with fifty fields.',
    choices: ['document', 'alpha'],
  },
  orderRequiredPropertiesFirst: { label: 'Required first', blurb: 'Whatever the order within each group.' },
  operationSort: {
    label: 'Operation order',
    blurb: 'Within a tag. document preserves source order.',
    choices: ['document', 'alpha', 'method'],
  },
  tagSort: { label: 'Tag order', blurb: 'document preserves the tags declaration order, then first-seen order.', choices: ['document', 'alpha'] },
  documentDownloadType: {
    label: 'Download button',
    blurb: 'Which formats the overview offers the document in. direct links the URL as-is rather than serialising what was parsed.',
    choices: ['both', 'yaml', 'json', 'direct', 'none'],
  },
  modelsSectionLabel: { label: 'Models label', blurb: 'What the models section is called.' },
  untaggedLabel: { label: 'Untagged label', blurb: 'For operations that declare no tags.' },
  searchHotKey: { label: 'Search hotkey', blurb: 'A single character, alongside Cmd/Ctrl-K.' },
  defaultHttpClient: { label: 'Default client', blurb: 'As target/client, e.g. shell/curl.' },
  persistClient: { label: 'Remember the client', blurb: 'Across reloads. Off by default because storing anything silently is the part that should never happen.' },
  revealCredentialsInSamples: {
    label: 'Real credentials in samples',
    blurb: 'Off, deliberately: a documentation page should not be what puts a production token into a shell history. The request that is sent always carries the real value.',
  },
}

/**
 * Options a control cannot sensibly stand in for, listed rather than hidden.
 *
 * `servers`, `slugs`, `oauth` and the rest take structured values or callbacks - a text box for a
 * function would be a worse lie than an absence. They are named on the page so the matrix reads as
 * complete, which it is: this list plus the controls is every key in `DEFAULT_CONFIG`.
 */
export const STRUCTURED_KEYS: readonly string[] = Object.entries(DEFAULT_CONFIG)
  .filter(([, value]) => typeof value === 'object' && value !== null)
  .map(([key]) => key)

/**
 * Options that are real but not worth a live control on a documentation page.
 *
 * `proxyUrl` and the OAuth redirect settings only mean anything against a real authorization
 * server, and `colorScheme` has a page of its own. Excluded explicitly, by name, so that the
 * completeness check below stays honest.
 */
const NOT_DEMONSTRABLE: readonly string[] = [
  'proxyUrl',
  'oauthRedirectUri',
  'oauthRedirectMode',
  'preferredSecurityScheme',
  'baseServerURL',
  'colorScheme',
]

export const CONFIG_CONTROLS: readonly ConfigControl[] = Object.entries(DEFAULT_CONFIG)
  .filter(([key, value]) => !STRUCTURED_KEYS.includes(key) && !NOT_DEMONSTRABLE.includes(key) && value !== undefined)
  .map(([key, value]) => {
    const detail = DETAIL[key]
    const label = detail?.label ?? key
    const blurb = detail?.blurb ?? ''

    if (typeof value === 'boolean') {
      return { key, kind: 'boolean', label, blurb, value } as const
    }
    if (detail?.choices) {
      return { key, kind: 'choice', label, blurb, value: String(value), choices: detail.choices } as const
    }
    return { key, kind: 'text', label, blurb, value: String(value) } as const
  })

/** Every key accounted for, one way or another. Asserted by `apps/site/test/config-matrix.test.ts`. */
export const ALL_KEYS: readonly string[] = Object.keys(DEFAULT_CONFIG)
export const EXCLUDED_KEYS: readonly string[] = NOT_DEMONSTRABLE

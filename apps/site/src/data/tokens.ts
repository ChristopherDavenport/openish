import tokensCss from '@openish/theme/tokens.css?raw'

import { parseTokens, type Token, type TokenGroup } from './parse-tokens.js'

export { isColour, type Token, type TokenGroup } from './parse-tokens.js'

/**
 * The theme, parsed.
 *
 * All this module does is bring the file in. The parsing lives in `parse-tokens.ts`, which imports
 * nothing and is therefore testable in Node - Vitest stubs CSS imports to the empty string outside a
 * browser, so a parser that read the import itself could only ever be checked in Chromium.
 */
export const TOKEN_GROUPS: readonly TokenGroup[] = parseTokens(tokensCss)

/** Every token, flattened. */
export const TOKENS: readonly Token[] = TOKEN_GROUPS.flatMap((group) => group.tokens)

/** The file the groups and values above were read from, rendered on the page. */
export const TOKENS_SOURCE = 'packages/theme/css/tokens.css'

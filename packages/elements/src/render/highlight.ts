/**
 * The markdown and syntax-highlighting pipeline, loaded when something actually needs it.
 *
 * `@scalar/code-highlight` is 176 kB gzipped - well over half of everything openish ships - and it
 * is the same code Scalar uses, so there is nothing to trim inside it. What there is to do is not
 * make the reader wait for it before the page exists: the shell, the sidebar, the operation
 * structure, and the parameter tables need none of it, and they are what a reader is looking at
 * while prose is still arriving.
 *
 * Two entry points, one rule. Both cache the module, and both expose a **synchronous** accessor for
 * the case that matters most: once the pipeline has loaded, every subsequent render must be able to
 * use it without awaiting, or navigating between pages would flash empty prose on every hop.
 */
import type { Node } from '@scalar/code-highlight/markdown'

export type { Node }

type MarkdownModule = typeof import('@scalar/code-highlight/markdown')
type CodeModule = {
  syntaxHighlight: typeof import('@scalar/code-highlight/code').syntaxHighlight
  standardLanguages: typeof import('@scalar/code-highlight/languages').standardLanguages
}

let markdown: MarkdownModule | undefined
let markdownPending: Promise<MarkdownModule> | undefined

let code: CodeModule | undefined
let codePending: Promise<CodeModule> | undefined

/** The markdown pipeline if it is already here, else `undefined`. Never triggers a load. */
export const markdownNow = (): MarkdownModule | undefined => markdown

/** Loads the markdown pipeline, or returns the loaded one. Safe to call on every render. */
export const loadMarkdown = async (): Promise<MarkdownModule> => {
  if (markdown) {
    return markdown
  }
  markdownPending ??= import('@scalar/code-highlight/markdown').then((module) => {
    markdown = module
    return module
  })
  return markdownPending
}

/** The syntax highlighter if it is already here, else `undefined`. Never triggers a load. */
export const codeNow = (): CodeModule | undefined => code

/**
 * Loads the syntax highlighter, or returns the loaded one.
 *
 * The highlighter and the language definitions are two entry points but one unit - highlighting with
 * no languages registered returns the input unchanged - so they are awaited together and cached as
 * one thing.
 */
export const loadCode = async (): Promise<CodeModule> => {
  if (code) {
    return code
  }
  codePending ??= Promise.all([
    import('@scalar/code-highlight/code'),
    import('@scalar/code-highlight/languages'),
  ]).then(([highlighter, languages]) => {
    code = { syntaxHighlight: highlighter.syntaxHighlight, standardLanguages: languages.standardLanguages }
    return code
  })
  return codePending
}

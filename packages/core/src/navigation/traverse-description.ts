import type { NavNode, NavTextNode } from '../types.js'
import { asProse, type SlugRegistry } from './ids.js'

/** ATX heading: one to six `#`, a space, then the text. Setext headings are not supported. */
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE = /^\s*(```|~~~)/

type Heading = { level: number; text: string }

/**
 * Pulls headings out of a markdown description.
 *
 * Written by hand rather than pulled from a markdown library: core stays dependency-light and
 * DOM-free, and the rendering side already has a full pipeline for the prose itself. All this needs
 * to do is find the headings a reader could link to.
 *
 * Fenced code blocks are skipped - a `# comment` inside a shell example is not a heading.
 */
export const extractHeadings = (markdown: string): Heading[] => {
  const headings: Heading[] = []
  let fence: string | undefined

  for (const line of markdown.split('\n')) {
    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1]!
      if (fence === undefined) {
        fence = marker
      } else if (fence === marker) {
        fence = undefined
      }
      continue
    }

    if (fence !== undefined) {
      continue
    }

    const match = HEADING.exec(line)
    if (match) {
      headings.push({ level: match[1]!.length, text: match[2]! })
    }
  }

  return headings
}

/**
 * Turns `info.description` headings into navigable nodes under the overview route.
 *
 * Headings nest by level, so an `##` following an `#` becomes its child. A level that skips (an
 * `###` directly after an `#`) attaches to the nearest shallower heading rather than being dropped.
 */
export const traverseDescription = (description: string | undefined, registry: SlugRegistry): NavNode[] => {
  if (!description?.trim()) {
    return []
  }

  const roots: NavNode[] = []
  /** Open ancestors, shallowest first. */
  const stack: NavTextNode[] = []

  for (const { level, text } of extractHeadings(description)) {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    const node: NavTextNode = {
      type: 'text',
      id: registry.claim(parent ? parent.id : 'overview', asProse(text), 'section'),
      title: text,
      level,
    }

    if (parent) {
      parent.children ??= []
      parent.children.push(node)
    } else {
      roots.push(node)
    }

    stack.push(node)
  }

  return roots
}

import { html as staticHtml, literal, type StaticValue } from 'lit/static-html.js'
import { classMap, type ClassInfo } from 'lit/directives/class-map.js'
import type { TemplateResult } from 'lit'

/**
 * A heading whose level is a property rather than a fact about the markup.
 *
 * A page element used to know it was the whole page, so its title was an `h1` and the things inside
 * it were `h2`s. On the plane it is one section among several hundred, and the level it takes
 * depends on how deep in the document it sits - a tag's operations belong under the tag, and saying
 * so is the only structure a reader using a screen reader's heading list has to navigate by.
 *
 * The six tags are literals rather than an interpolated string: `lit/static-html.js` re-parses the
 * template whenever a static value changes, so a value that could be anything would be a new
 * template on every render. Six of them, chosen from, are six templates for the life of the page.
 *
 * Appearance does not come from the tag. An element styles its headings by class, so a section title
 * looks like a section title whether the document put it at level two or level four - which is the
 * separation this makes possible: the tag is structure, the class is weight.
 */
const TAGS: readonly StaticValue[] = [
  literal`h1`,
  literal`h2`,
  literal`h3`,
  literal`h4`,
  literal`h5`,
  literal`h6`,
]

/** h6 is the floor, the same one `<openish-markdown>` clamps demoted prose headings to. */
export const headingTag = (level: number): StaticValue =>
  TAGS[Math.min(Math.max(Math.trunc(level), 1), TAGS.length) - 1]!

export const heading = (level: number, content: unknown, classes: ClassInfo = {}): TemplateResult => {
  const tag = headingTag(level)
  return staticHtml`<${tag} class=${classMap(classes)}>${content}</${tag}>`
}

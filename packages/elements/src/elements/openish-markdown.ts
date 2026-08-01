import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

import { loadMarkdown, markdownNow, type Node } from '../render/highlight.js'
import { baseStyles, highlightStyles } from '../styles/shared.js'

/**
 * Renders a markdown string from the document - descriptions, summaries, tag prose.
 *
 * `htmlFromMarkdown` runs `rehype-sanitize`, so the output is already stripped of scripts, event
 * handlers, and unsafe URLs before it reaches `unsafeHTML`. That sanitisation is the reason this
 * element exists at all rather than each caller reaching for the directive: there is exactly one
 * place where document-authored HTML enters the page, and it is this one.
 *
 * Headings are demoted by `headingOffset` levels. An `info.description` is body copy inside a page
 * that already has an `h1`, so a document's `#` heading must not become a second one - that is a
 * genuine accessibility defect, not a styling preference.
 *
 * `htmlFromMarkdown` also runs `rehype-highlight`, so fenced code blocks come out with highlight.js
 * class names - coloured by `highlightStyles`, which has to be component CSS because a stylesheet
 * the host loads cannot reach inside this shadow root - and `rehype-external-links`, which gives
 * outbound links `target="_blank"`, which incidentally stops the router intercepting them.
 */
@customElement('openish-markdown')
export class OpenishMarkdown extends LitElement {
  static override styles = [
    baseStyles,
    highlightStyles,
    css`
      :host {
        display: block;
      }

      .prose > :first-child {
        margin-top: 0;
      }

      .prose > :last-child {
        margin-bottom: 0;
      }

      .prose h1,
      .prose h2 {
        font: var(--openish-font-heading-2);
        margin: var(--openish-space-lg) 0 var(--openish-space-xs);
      }

      .prose h3 {
        font: var(--openish-font-heading-3);
        margin: var(--openish-space-md) 0 var(--openish-space-xs);
      }

      .prose h4,
      .prose h5,
      .prose h6 {
        font: var(--openish-font-heading-4);
        margin: var(--openish-space-md) 0 var(--openish-space-2xs);
      }

      .prose p,
      .prose ul,
      .prose ol,
      .prose blockquote,
      .prose table {
        margin: 0 0 var(--openish-space-md);
      }

      .prose code {
        padding: 0 var(--openish-space-3xs);
        border-radius: var(--openish-radius-sm);
        background: var(--openish-color-code-surface);
      }

      .prose pre {
        margin: 0 0 var(--openish-space-md);
        padding: var(--openish-space-md);
        border-radius: var(--openish-radius-lg);
        background: var(--openish-color-code-surface);
        color: var(--openish-color-code-content);
        overflow-x: auto;
      }

      .prose pre code {
        padding: 0;
        background: none;
      }

      .prose blockquote {
        padding-left: var(--openish-space-md);
        border-left: 3px solid var(--openish-color-border-strong);
        color: var(--openish-color-text-muted);
      }

      .prose table {
        border-collapse: collapse;
        display: block;
        overflow-x: auto;
      }

      .prose th,
      .prose td {
        padding: var(--openish-space-2xs) var(--openish-space-xs);
        border: 1px solid var(--openish-color-border);
        text-align: left;
      }

      .prose img {
        max-width: 100%;
      }

      .prose hr {
        border: 0;
        border-top: 1px solid var(--openish-color-border);
        margin: var(--openish-space-lg) 0;
      }
    `,
  ]

  /** The markdown to render. Sanitised before it reaches the DOM. */
  @property({ type: String })
  markdown = ''

  /** Levels to push headings down by, so document prose nests under the page's own heading. */
  @property({ type: Number })
  headingOffset = 1

  /**
   * Ids to give the rendered headings, in document order - normally the `NavTextNode` ids that
   * `@openish/core` minted from the same markdown, so a sidebar link has something to land on.
   *
   * Set through the same transform that demotes the headings, as `hProperties`, which is the
   * documented way to give an mdast node attributes on its way to HTML. The alternative - stamping
   * them onto the DOM in `updated()` - makes the rendered output depend on something that happens
   * after rendering, so the markup is briefly wrong and `render()` stops describing the result.
   */
  @property({ attribute: false })
  headingIds: readonly string[] = []

  /**
   * Bumped once the pipeline arrives, purely to ask for another render.
   *
   * The load is a module-level cache shared by every instance, so this is not "the module" - it is
   * this element's record that it is worth trying again. The alternative, a `Task` keyed on the
   * markdown, would re-await on every property change for a module that is already in memory.
   */
  @state()
  private loaded = 0

  /** Scrolls to a stamped heading. Returns whether one was found. */
  scrollToHeading(id: string): boolean {
    const target = this.renderRoot.querySelector(`[id="${CSS.escape(id)}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return target !== null
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.markdown.trim()) {
      return nothing
    }

    /*
     * Nothing until the pipeline is here, rather than the raw source.
     *
     * Showing unrendered markdown would put literal `##` and `[text](url)` on the page for a frame,
     * which reads as a broken document rather than as a loading one. An empty block for the same
     * frame reads as prose that has not arrived, which is what it is.
     */
    const pipeline = markdownNow()
    if (!pipeline) {
      void loadMarkdown().then(() => {
        this.loaded += 1
      })
      return nothing
    }

    const offset = this.headingOffset
    const ids = this.headingIds
    let index = 0

    const rendered = pipeline.htmlFromMarkdown(this.markdown, {
      transformType: 'heading',
      transform: (node: Node) => {
        if ('depth' in node && typeof node.depth === 'number') {
          /* h6 is the floor; deeper is not expressible in HTML. */
          node.depth = Math.min(node.depth + offset, 6)
        }

        const id = ids[index]
        index += 1
        if (id) {
          const data = (node.data ?? {}) as { hProperties?: Record<string, unknown> }
          node.data = { ...data, hProperties: { ...data.hProperties, id } }
        }

        return node
      },
    })

    return html`<div class="prose">${unsafeHTML(rendered)}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-markdown': OpenishMarkdown
  }
}

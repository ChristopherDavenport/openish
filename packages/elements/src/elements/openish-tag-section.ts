import { consume } from '@lit/context'
import type { NavGroupNode, NavNode, NavTagNode } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'

import { uiContext, type OpenishUiState } from '../context/contexts.js'
import { externalDocsStyles, renderExternalDocs } from '../render/external-docs.js'
import { heading } from '../render/heading.js'
import { hrefFor } from '../router/urls.js'
import { baseStyles, methodStyles, planeColumnStyles, titleRowStyles } from '../styles/shared.js'
import './openish-copy-markdown.js'
import './openish-markdown.js'

/**
 * The landing page for a tag, a group, or any other node that has children: its prose, then an
 * index of what is inside it.
 */
@customElement('openish-tag-section')
export class OpenishTagSection extends LitElement {
  static override styles = [
    baseStyles,
    methodStyles,
    externalDocsStyles,
    titleRowStyles,
    planeColumnStyles,
    css`
      /* Weight from the class, not the tag - see the note in render/heading.ts. */
      .title {
        font: var(--openish-font-heading-1);
        margin: 0 0 var(--openish-space-md);
      }

      ul {
        margin: var(--openish-space-lg) 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--openish-space-2xs);
      }

      a {
        display: flex;
        align-items: baseline;
        gap: var(--openish-space-xs);
        padding: var(--openish-space-xs);
        border-radius: var(--openish-radius-md);
        color: var(--openish-color-text);
      }

      a:hover {
        background: var(--openish-color-surface-hover);
        text-decoration: none;
      }

      .path {
        margin-left: auto;
        font-family: var(--openish-font-family-mono);
        font-size: 0.9em;
        color: var(--openish-color-text-muted);
      }

      .deprecated {
        text-decoration: line-through;
        color: var(--openish-color-text-muted);
      }
    `,
  ]

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** The tag or group whose children this page indexes. */
  @property({ attribute: false })
  node!: NavTagNode | NavGroupNode

  /** The heading level this section's own title takes. See `<openish-operation>`'s. */
  @property({ type: Number })
  level = 1

  #renderChild(child: NavNode): TemplateResult {
    const deprecated = child.type === 'operation' && child.deprecated === true

    return html`
      <li>
        <a href=${hrefFor(child, this.ui)}>
          ${child.type === 'operation' || child.type === 'webhook'
            ? html`<span class="method" data-method=${child.method}>${child.method}</span>`
            : nothing}
          <span class=${classMap({ deprecated })}>${child.title}</span>
          ${child.type === 'operation' ? html`<code class="path">${child.path}</code>` : nothing}
        </a>
      </li>
    `
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.node) {
      return nothing
    }

    const description = this.node.type === 'tag' ? this.node.description : undefined
    const externalDocs = this.node.type === 'tag' ? this.node.externalDocs : undefined

    return html`
      <div class="columns">
        <div class="title-row">
          ${heading(this.level, this.node.title, { title: true })}
          <openish-copy-markdown exportparts="copy" .node=${this.node}></openish-copy-markdown>
        </div>
        ${description
          ? html`<openish-markdown .markdown=${description} .headingOffset=${this.level}></openish-markdown>`
          : nothing}
        ${renderExternalDocs(externalDocs, `More about ${this.node.title}`)}
        <ul>
          ${repeat(
            this.node.children,
            (child) => child.id,
            (child) => this.#renderChild(child),
          )}
        </ul>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-tag-section': OpenishTagSection
  }
}

import { consume } from '@lit/context'
import { nodeToMarkdown, type DocumentStore, type NavNode } from '@openish/core'
import { LitElement, html, css, nothing, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { documentContext } from '../context/contexts.js'
import { baseStyles } from '../styles/shared.js'
import './openish-copy-button.js'

/**
 * The section, on the clipboard, as a Markdown document.
 *
 * For a reader who is about to paste it into a model. A tag takes everything under it, so "copy this
 * tag" is the tag and all of its operations - which is also why this is the honest answer to a page
 * that only renders what is on screen: it hands over the whole section, not the part that happens to
 * be rendered.
 *
 * `node` undefined means the overview, which is the one section that is not a node. That is the same
 * spelling `nodeToMarkdown` takes and the same one the plane's first section carries, so there is no
 * second way to say it - but it does mean this element with nothing set copies the front of the
 * document rather than nothing.
 */
@customElement('openish-copy-markdown')
export class OpenishCopyMarkdown extends LitElement {
  static override styles = [
    baseStyles,
    css`
      :host {
        display: contents;
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** The section to copy. Undefined is the overview. */
  @property({ attribute: false })
  node: NavNode | undefined

  /**
   * Built when the button is pressed, not when this renders.
   *
   * A bound field rather than an arrow in the template: the property would otherwise change identity
   * on every render and make the button update for nothing. And it has to be lazy at all because a
   * group can be six hundred models, which is not work to do on the chance somebody clicks.
   */
  readonly #source = (): string => (this.store ? nodeToMarkdown(this.store, this.node) : '')

  override render(): TemplateResult | typeof nothing {
    if (!this.store) {
      return nothing
    }

    const title = this.node?.title ?? this.store.document.info?.title ?? 'this document'

    return html`
      <openish-copy-button
        exportparts="copy"
        action="Copy for LLM"
        .label=${`${title} as Markdown`}
        .source=${this.#source}
      ></openish-copy-button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-copy-markdown': OpenishCopyMarkdown
  }
}

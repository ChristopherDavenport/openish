import { Routes } from '@lit-labs/router'
import { consume } from '@lit/context'
import type { DocumentStore } from '@openish/core'
import { LitElement, type TemplateResult } from 'lit'
import { customElement, property } from 'lit/decorators.js'

import { documentContext, uiContext, type OpenishUiState } from '../context/contexts.js'
import { renderNodeById } from '../render/render-node.js'
import { baseStyles, statusStyles } from '../styles/shared.js'

/** The three routed sections. Each maps to a navigation id prefix, which is also its URL prefix. */
export type SectionName = 'tags' | 'models' | 'webhooks'

/**
 * One routed section of the reference: everything under `/tags`, `/models`, or `/webhooks`.
 *
 * This is where the URL below the section prefix is matched, and it uses `Routes` - not `Router`.
 * There is exactly one `Router` on the page, in `<openish-api-reference>`, because a `Router`
 * installs global `click` and `popstate` listeners; a second one would double-handle every click.
 * `Routes` has no listeners. It finds its parent by dispatching a bubbling `lit-routes-connected`
 * event when it connects, and from then on the parent hands it the tail of whatever it matched.
 *
 * The parent mounts this at `/tags*` rather than `/tags/*` so that the bare section URL still
 * produces a tail - an empty one - and therefore still reaches a child route. With `/tags/*` a
 * request for `/models` would match no parent route at all, and the reader would get the fallback
 * instead of the Models index.
 *
 * Section ids are URL paths (`models/Account`, `tags/accounts/listAccounts`), so a matched route is
 * turned back into an id by joining the section name to its params - no lookup table, and no second
 * idea of what a URL means.
 */
@customElement('openish-section')
export class OpenishSection extends LitElement {
  static override styles = [baseStyles, statusStyles]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** Which section this instance is mounted for. Set by the parent route that renders it. */
  @property({ type: String })
  section: SectionName = 'tags'

  /*
   * Constructed as a class field, so `addController` runs on an unconnected host and `hostConnected`
   * is deferred until the routes are in place. Constructing a `Routes` against an already-connected
   * host trips a bug in @lit-labs/router@0.1.4 - see the note in `openish-api-reference`.
   *
   * Paths are matched against the tail the parent captured, not against the whole URL: `''` is the
   * section index, `/:a` a direct child, `/:a/:b` an operation inside a tag. They deliberately do
   * not mention the section prefix, which the parent has already consumed.
   */
  readonly #routes = new Routes(
    this,
    [
      { path: '', render: () => this.#renderId(this.section) },
      { path: '/', render: () => this.#renderId(this.section) },
      { path: '/:a', render: (params) => this.#renderId(this.section, params['a']) },
      { path: '/:a/:b', render: (params) => this.#renderId(this.section, params['a'], params['b']) },
    ],
    {
      /*
       * Without a fallback, `Routes.goto()` throws on an unmatched path, and it is called from a
       * promise nobody awaits - so a URL like `/models/a/b/c` would surface as an unhandled
       * rejection and a blank page. The id comes from context rather than from params, because by
       * definition nothing matched - and from context rather than from `location`, because the URL
       * is not this element's to read.
       */
      fallback: { render: () => this.#renderMissing() },
    },
  )

  #renderId(...segments: Array<string | undefined>): TemplateResult {
    const id = segments
      .filter((segment): segment is string => segment !== undefined && segment !== '')
      .map((segment) => decodeURIComponent(segment))
      .join('/')

    return renderNodeById(this.store, id)
  }

  #renderMissing(): TemplateResult {
    return renderNodeById(this.store, this.ui?.activeId ?? '')
  }

  override render(): unknown {
    return this.#routes.outlet()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-section': OpenishSection
  }
}

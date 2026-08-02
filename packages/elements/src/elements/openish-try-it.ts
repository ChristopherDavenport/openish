import { consume } from '@lit/context'
import { Task, TaskStatus } from '@lit/task'
import { sendRequest, unsendableCookies, type SendResult } from '@openish/client'
import {
  collectParameters,
  operationToHar,
  preferredSecurityIndex,
  resolveOperationNode,
  schemaExample,
  securityRequirements,
  securitySchemesFor,
  serializeExample,
  type DocumentStore,
  type NavOperationNode,
  type ParameterEntry,
  type VariantChoices,
} from '@openish/core'
import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'

import { documentContext, requestContext, uiContext, type OpenishRequestState, type OpenishUiState } from '../context/contexts.js'
import { mediaTypeExample } from '../render/media-types.js'
import { baseStyles, controlStyles, methodStyles, statusStyles } from '../styles/shared.js'
import type { ParameterChange } from './openish-request-form.js'
import './openish-auth-form.js'
import './openish-code-sample.js'
import './openish-request-form.js'
import './openish-response-view.js'
import './openish-server-select.js'

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Sending the request the page describes.
 *
 * The page itself gets one button, named after what it does rather than after testing: a reader who
 * has read the reference and wants the call made is not running an experiment. It sits at the end of
 * the sample's toolbar, past the controls that adjust the sample.
 *
 * Everything a reader fills in - server, credentials, parameters, body, and the answer that comes
 * back - lives in a modal client behind it, because none of it is documentation: a reference read by
 * someone who is not calling the API today should not be mostly empty form. That is the shape Scalar
 * arrived at too, and for the same reason.
 *
 * The values live here and nowhere else - they are one reader's answers about one operation, and
 * they are not worth persisting or sharing between pages. What *is* shared, because a reader sets it
 * once, is the server and the credentials, and both arrive through context.
 *
 * `<openish-code-sample>` builds its request from these same values, so the snippet on the page is
 * the request this button sends, and it updates as the reader types in the panel. That is the
 * invariant the whole feature rests on: one builder, two consumers.
 */
@customElement('openish-try-it')
export class OpenishTryIt extends LitElement {
  static override styles = [
    baseStyles,
    controlStyles,
    methodStyles,
    statusStyles,
    css`
      :host {
        display: block;
      }

      .run {
        display: inline-flex;
        align-items: center;
        gap: var(--openish-space-3xs);
        padding: var(--openish-space-3xs) var(--openish-space-sm);
        border: 1px solid transparent;
        border-radius: var(--openish-radius-md);
        background: var(--openish-color-accent);
        color: var(--openish-color-text-on-accent);
        font: var(--openish-font-small);
        font-family: inherit;
        cursor: pointer;
      }

      dialog {
        width: min(72rem, calc(100vw - 2rem));
        max-height: min(48rem, calc(100vh - 4rem));
        margin: auto;
        padding: 0;
        border: 1px solid var(--openish-color-border);
        border-radius: var(--openish-radius-lg);
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        box-shadow: var(--openish-shadow-md);
        overflow: hidden;
      }

      dialog::backdrop {
        background: var(--openish-color-overlay);
      }

      /*
       * A column: a fixed bar, then the part that scrolls. Sized to its content rather than to the
       * cap, so an operation that takes two query parameters gets a dialog the size of two query
       * parameters instead of a screen of empty panel.
       */
      .client {
        display: flex;
        flex-direction: column;
        max-height: min(48rem, calc(100vh - 4rem));
      }

      .bar {
        display: flex;
        align-items: center;
        gap: var(--openish-space-xs);
        padding: var(--openish-space-xs);
        border-bottom: 1px solid var(--openish-color-border);
        background: var(--openish-color-surface-raised);
      }

      .url {
        flex: 1;
        min-width: 0;
        font: var(--openish-font-code-small);
        color: var(--openish-color-text);
        overflow-x: auto;
        white-space: nowrap;
      }

      /*
       * Side by side where there is room, because a reader compares what they sent with what came
       * back. Stacked below that, where two columns would be two narrow columns.
       */
      .columns {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }

      @media (min-width: 64rem) {
        .columns {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }

        .response {
          border-top: 0;
          border-left: 1px solid var(--openish-color-border);
        }
      }

      /*
       * The explicit track is what keeps the column a column. Without it the single implicit track
       * is auto-sized, so one long line of JSON makes the grid as wide as the line - measured at
       * 7514px inside a 460px column - and the response spills out of the dialog instead of
       * scrolling inside its own code block.
       */
      .column {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--openish-space-sm);
        align-content: start;
        min-width: 0;
        padding: var(--openish-space-sm);
        overflow: auto;
      }

      .response {
        border-top: 1px solid var(--openish-color-border);
        background: var(--openish-color-surface-raised);
      }

      button {
        padding: var(--openish-space-3xs) var(--openish-space-sm);
        border: 1px solid transparent;
        border-radius: var(--openish-radius-md);
        background: var(--openish-color-accent);
        color: var(--openish-color-text-on-accent);
        font: var(--openish-font-body-bold);
        font-family: inherit;
        cursor: pointer;
      }

      button.secondary {
        background: var(--openish-color-surface);
        color: var(--openish-color-text);
        border-color: var(--openish-border-action-color);
        font: var(--openish-font-body);
      }

      .note,
      .empty {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
      }
    `,
  ]

  /** The parsed document. Provided by `<openish-api-reference>` through context. */
  @consume({ context: documentContext, subscribe: true })
  store: DocumentStore | undefined

  /** Presentation state. Provided by `<openish-api-reference>` through context. */
  @consume({ context: uiContext, subscribe: true })
  ui: OpenishUiState | undefined

  /** The server and credentials the reader has chosen. Provided through context. */
  @consume({ context: requestContext, subscribe: true })
  request: OpenishRequestState | undefined

  /** The operation this panel sends. */
  @property({ attribute: false })
  node!: NavOperationNode

  /** Whether the client is showing. Set it; the element does the rest. */
  @property({ type: Boolean, reflect: true })
  open = false

  /** What the reader typed, keyed `"{in}:{name}"`. One operation's worth. */
  @state()
  private values: Record<string, string> = {}

  @state()
  private body: string | undefined = undefined

  /**
   * Which media type the operation is talking about, when something above owns that choice.
   *
   * `<openish-operation>` does, because the request body's tabs ask the same question this panel's
   * picker does and the two must not answer it differently - the tab said `application/xml` while
   * the sample beside it sent JSON. Empty means nobody above is deciding, which is what a host
   * mounting this panel on its own gets, and then `chosenHere` is the whole answer.
   */
  @property({ type: String, attribute: 'media-type' })
  mediaType = ''

  /**
   * The variant branches picked in the request body's tree.
   *
   * The panel prefills the body from the same generator the documentation column draws its tree
   * with, so a reader who chose `Dog` on the left opens this and finds a dog to send.
   */
  @property({ attribute: false })
  variants: VariantChoices | undefined = undefined

  /**
   * The media type to ask for back, from the response the examples column is showing.
   *
   * On the wire as well as in the sample: a reader who switched the response to `application/xml`
   * and pressed Run was asking for XML, and a request with no `Accept` gets whatever the server
   * prefers - which is the one thing the panel must not do, since its whole claim is that it sends
   * what the snippet shows.
   */
  @property({ type: String })
  accept = ''

  /** The panel picker's own choice. Only consulted when nothing above provides one - see `#mediaType`. */
  @state()
  private chosenHere = ''

  /**
   * The last answer, or nothing.
   *
   * Not read off `#send.value`, which is nearly but not quite the same thing: a task keeps its
   * previous value across a re-run and across an abort, and this has to be *cleared* when the panel
   * is reopened. The answer describes the request as it was when Send was pressed, and by then that
   * may be a different server, a different credential, or a different operation entirely.
   */
  @state()
  private result: SendResult | undefined = undefined

  @query('dialog')
  private dialog!: HTMLDialogElement

  /** The element to hand focus back to. Restoring it is the difference between a dialog and a trap. */
  #opener: HTMLElement | undefined

  get #resolved() {
    return resolveOperationNode(this.store?.document, this.node)
  }

  get #parameters(): ParameterEntry[] {
    const resolved = this.#resolved
    return collectParameters(resolved?.pathItem, resolved?.operation)
  }

  /** The media types the request body declares, in document order. */
  get #mediaTypes(): string[] {
    const content = (this.#resolved?.operation?.requestBody as { content?: unknown } | undefined)?.content
    return isPlainObject(content) ? Object.keys(content) : []
  }

  /**
   * The media type in force: what the operation decided, else this panel's own picker, else the
   * first one the body declares.
   *
   * The operation wins when it has an opinion, so picking `application/xml` in the request body's
   * tabs moves the panel too. Both are empty until somebody chooses, and the form is handed the
   * resolved one - so anything comparing what the form reports against this element's state has to
   * compare against the same value the form was given, not against the empty string behind it.
   */
  get #mediaType(): string {
    return this.mediaType || this.chosenHere || this.#mediaTypes[0] || ''
  }

  /** The body to send: what the reader edited, or the example the document implies. */
  get #bodyText(): string {
    if (this.body !== undefined) {
      return this.body
    }

    const mediaType = this.#mediaType
    const content = (this.#resolved?.operation?.requestBody as { content?: Record<string, unknown> } | undefined)
      ?.content
    const media = isPlainObject(content?.[mediaType]) ? (content[mediaType] as Record<string, unknown>) : undefined
    const example =
      mediaTypeExample(media) ??
      schemaExample(media?.['schema'], {
        ...(this.variants ? { variants: this.variants, variantScope: 'request' } : {}),
      })

    /* In the syntax the picker beside it names, so switching to `application/xml` refills with XML
     * rather than handing the reader JSON to translate. */
    return serializeExample(example, mediaType, media?.['schema'])
  }

  /**
   * The request, built one way, twice.
   *
   * `credentials` is the only difference between what is sent and what is shown: with them, this is
   * the request; without them, `applySecurity` leaves its placeholders and the snippet says where a
   * credential goes without being the thing that puts one in a shell history. Same function, same
   * inputs, same everything else - which is what makes the sample beside the button trustworthy.
   */
  #buildHar(credentials: Readonly<Record<string, string>>) {
    const resolved = this.#resolved
    if (!this.store || !resolved?.operation) {
      return undefined
    }

    const mediaType = this.#mediaType

    /*
     * Which alternative to satisfy, decided from the *real* credentials rather than from the
     * argument: the sample and the request must describe the same alternative, or the snippet stops
     * being the request the button sends. Only the values differ between the two builds.
     */
    const securityIndex = preferredSecurityIndex(securityRequirements(this.store.document, resolved.operation), {
      credentials: this.request?.credentials ?? {},
      ...(this.ui?.config.preferredSecurityScheme ? { preferred: this.ui.config.preferredSecurityScheme } : {}),
    })

    return operationToHar(
      {
        document: this.store.document,
        operation: resolved.operation,
        pathItem: resolved.pathItem,
        path: resolved.path,
        method: resolved.method,
      },
      {
        ...(this.request?.serverUrl ? { server: this.request.serverUrl } : {}),
        parameterValues: this.values,
        credentials,
        securityIndex,
        ...(mediaType ? { contentType: mediaType } : {}),
        ...(this.accept ? { accept: this.accept } : {}),
        ...(this.variants ? { variants: this.variants, variantScope: 'request' } : {}),
        ...(this.#mediaTypes.length > 0 ? { body: { mediaType, text: this.#bodyText } } : {}),
      },
    )
  }

  /** What Send puts on the wire: the reader's real credentials. */
  get #har() {
    return this.#buildHar(this.request?.credentials ?? {})
  }

  /** What the snippet shows and copies: placeholders, unless the host asked otherwise. */
  get #harToShow() {
    return this.#buildHar(this.ui?.config.revealCredentialsInSamples ? (this.request?.credentials ?? {}) : {})
  }

  readonly #send = new Task(this, {
    /* Run only when asked: a docs page must not call an API because someone scrolled past it. */
    autoRun: false,
    task: async ([], { signal }) => {
      const har = this.#har
      if (!har) {
        return undefined
      }

      const proxyUrl = this.ui?.config.proxyUrl ?? ''
      this.result = await sendRequest(har, { ...(proxyUrl ? { proxyUrl } : {}), signal })
      return this.result
    },
    args: () => [] as const,
  })

  #run(): void {
    this.result = undefined
    void this.#send.run()
  }

  /*
   * The task's own signal, which is the one `sendRequest` was given.
   *
   * There used to be a second `AbortController` here, created beside every run and aborted by the
   * Cancel button - and wired to nothing, because the signal that reached the request came from the
   * task. Pressing Cancel stopped the spinner and left the request in flight.
   */
  #cancel(): void {
    this.#send.abort()
  }

  /**
   * Opening is one state change with three parts, so it is one function rather than three writes in
   * the click handler.
   *
   * The last answer goes with it: it describes the request as it was when Send was pressed, and by
   * the time the panel is opened again that may be a different server, a different credential, or a
   * different operation entirely. Showing it under a request it does not answer is worse than
   * showing nothing. What the reader typed does stay - reopening a panel to find the fields empty
   * would be its own bug.
   */
  #show(opener: HTMLElement): void {
    this.#opener = opener
    this.#send.abort()
    this.result = undefined
    this.open = true
  }

  /**
   * The one place `showModal()` and `close()` are called.
   *
   * A `<dialog>` cannot be opened declaratively - `open` as an attribute makes it non-modal, with no
   * focus trap and no backdrop - so the imperative call has to happen somewhere. Here it happens in
   * response to a property change, which keeps every caller declarative.
   */
  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open') || !this.dialog) {
      return
    }

    if (this.open && !this.dialog.open) {
      this.dialog.showModal()
    } else if (!this.open && this.dialog.open) {
      this.dialog.close()
    }
  }

  /**
   * The dialog's own event: Escape, a backdrop click, or `close()`. All of them land here.
   *
   * `close` is fired from a queued task, not synchronously, so an event from a dialog that has
   * since been reopened can still arrive. Acting on it would take the reader's panel away, so a
   * `close` that does not describe the current state is ignored.
   */
  #onClose(): void {
    if (this.dialog.open) {
      return
    }

    /* A reader who closed the panel is not waiting for the answer any more. */
    this.#send.abort()
    this.open = false
    this.#opener?.focus()
  }

  #renderClient(): TemplateResult {
    const resolved = this.#resolved!
    const schemes = securitySchemesFor(this.store?.document, resolved.operation)
    const parameters = this.#parameters
    const mediaTypes = this.#mediaTypes
    const har = this.#harToShow
    const cookies = this.#har ? unsendableCookies(this.#har) : []
    const sending = this.#send.status === TaskStatus.PENDING
    const result = this.result

    return html`
      <div class="client">
        <div class="bar" part="dialog-toolbar">
          <span class="method" data-method=${this.node.method}>${this.node.method}</span>
          <code class="url">${har?.url ?? ''}</code>
          ${sending
            ? html`<button type="button" class="secondary" @click=${this.#cancel}>Cancel</button>`
            : html`<button type="button" @click=${this.#run}>Send</button>`}
          <button type="button" class="secondary" @click=${() => { this.open = false }}>Close</button>
        </div>

        <div class="columns">
          <div class="column">
            <openish-server-select></openish-server-select>
            ${schemes.length > 0 ? html`<openish-auth-form .schemes=${schemes}></openish-auth-form>` : nothing}
            ${parameters.length > 0 || mediaTypes.length > 0
              ? html`
                  <openish-request-form
                    .parameters=${parameters}
                    .values=${this.values}
                    .mediaTypes=${mediaTypes}
                    mediaType=${this.#mediaType}
                    .body=${this.#bodyText}
                    @openish-parameter-input=${(event: CustomEvent<ParameterChange>) => {
                      this.values = { ...this.values, [event.detail.key]: event.detail.value }
                    }}
                    @openish-body-input=${(event: CustomEvent<{ body: string; mediaType: string }>) => {
                      /*
                       * The form re-sends the body it is holding when the media type changes, which
                       * is right for a body the reader typed and wrong for one they never touched:
                       * carried across, a JSON prefill would sit under an `application/xml` header
                       * for them to translate by hand. An untouched body stays untouched - which is
                       * `undefined` - so it refills in the syntax the new type names.
                       */
                      const untouched = this.body === undefined && event.detail.mediaType !== this.#mediaType
                      if (!untouched) {
                        this.body = event.detail.body
                      }

                      if (event.detail.mediaType !== this.#mediaType) {
                        /*
                         * Announced as well as recorded. Inside an operation the announcement is
                         * what moves the request body's tabs to match, and the property comes back
                         * down over `chosenHere`; on its own this element is still the only thing
                         * listening to itself, so the local record is what keeps the picker working.
                         */
                        this.chosenHere = event.detail.mediaType
                        this.dispatchEvent(
                          new CustomEvent<string>('openish-media-type-change', {
                            detail: event.detail.mediaType,
                            bubbles: true,
                          }),
                        )
                      }
                    }}
                  ></openish-request-form>
                `
              : nothing}
            ${cookies.length > 0
              ? html`
                  <p class="note">
                    ${cookies.join(', ')} cannot be sent from a browser; the sample shows
                    ${cookies.length === 1 ? 'it' : 'them'}.
                  </p>
                `
              : nothing}
          </div>

          <div class="column response">
            ${sending ? html`<p class="note" role="status">Sending…</p>` : nothing}
            ${result === undefined && !sending
              ? html`<p class="empty">Send the request to see the response here.</p>`
              : nothing}
            <openish-response-view .result=${result}></openish-response-view>
          </div>
        </div>
      </div>
    `
  }

  override render(): TemplateResult | typeof nothing {
    const resolved = this.#resolved
    if (!this.node || !resolved?.operation) {
      return nothing
    }

    return html`
      <openish-code-sample .node=${this.node} .request=${this.#harToShow}>
        <button
          slot="actions"
          type="button"
          class="run"
          aria-haspopup="dialog"
          aria-label=${`Run ${this.node.title}`}
          @click=${(event: Event) => this.#show(event.currentTarget as HTMLElement)}
        >
          Run
        </button>
      </openish-code-sample>

      <dialog part="dialog" aria-label="Run: ${this.node.title}" @close=${this.#onClose}>
        ${this.open ? this.#renderClient() : nothing}
      </dialog>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'openish-try-it': OpenishTryIt
  }
}

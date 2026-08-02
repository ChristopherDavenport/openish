import type { ReactiveController, ReactiveControllerHost } from 'lit'

export type ServerChoiceOptions = {
  /** The document on screen. The reader's answer follows it. */
  readonly activeSlug: () => string
}

/** One document's answer: the template the reader picked, and what they filled its variables in as. */
export type ServerChoice = {
  readonly server: string
  readonly variables: Record<string, string>
}

const NONE: ServerChoice = { server: '', variables: {} }

/**
 * The server the reader picked, per document.
 *
 * Switching away from a document and back should not forget which environment its reader chose, and
 * a single pair of fields cannot express that - so the inactive documents' answers wait in a map and
 * the current one is swapped in when the active document changes.
 *
 * The swap happens in `hostUpdate`, which is early enough that whatever derives from it in
 * `willUpdate` sees the answer for the document it is about to render. Doing it in `updated` would
 * schedule a second render, which is where the bugs live.
 */
export class ServerChoiceController implements ReactiveController {
  readonly #host: ReactiveControllerHost
  readonly #options: ServerChoiceOptions

  readonly #bySlug = new Map<string, ServerChoice>()

  /** Which document `#current` describes, so the swap knows when it has one to make. */
  #slug: string | undefined
  #current: ServerChoice = NONE

  constructor(host: ReactiveControllerHost, options: ServerChoiceOptions) {
    this.#host = host
    this.#options = options
    host.addController(this)
  }

  hostUpdate(): void {
    const slug = this.#options.activeSlug()
    if (this.#slug === slug) {
      return
    }

    if (this.#slug !== undefined) {
      this.#bySlug.set(this.#slug, this.#current)
    }
    this.#current = this.#bySlug.get(slug) ?? NONE
    this.#slug = slug
  }

  /** The template the reader picked, still carrying its `{variables}`. Empty means "the first one". */
  get server(): string {
    return this.#current.server
  }

  get variables(): Record<string, string> {
    return this.#current.variables
  }

  /** The reader picked a server, or filled in one of its variables. */
  set(server: string, variables: Record<string, string>): void {
    this.#current = { server, variables }
    this.#host.requestUpdate()
  }
}

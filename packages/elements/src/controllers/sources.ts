import { Task, TaskStatus } from '@lit/task'
import {
  createDocumentStore,
  resolveSources,
  type DocumentStore,
  type OpenishConfig,
  type ResolvedSource,
  type SourceConfig,
} from '@openish/core'
import type { ReactiveControllerHost } from 'lit'

import { titledSources } from '../context/build.js'
import type { OpenishSourcesState } from '../context/contexts.js'
import { SourcePrefetchController } from './source-prefetch.js'

/** What the host has configured, in whichever of the two ways it used. */
export type SourcesInput = {
  /** Several documents. Takes precedence over the two below. */
  readonly sources: readonly SourceConfig[] | undefined
  readonly url: string | undefined
  readonly spec: string | Record<string, unknown> | undefined
  readonly config: OpenishConfig | undefined
}

export type SourcesOptions = {
  /** Read afresh each time, so nothing here has to be told when a property changed. */
  readonly configured: () => SourcesInput
  /**
   * The document slug the URL names, or `''` when it names none.
   *
   * A thunk rather than a value, and read only when several documents are configured: with one, the
   * URL never carries a slug, and asking would mean this controller knowing about routing modes.
   */
  readonly named: () => string
  /** A document landed, or failed to. The host announces it; this only decides when. */
  readonly onLoaded: (result: { ok: true; store: DocumentStore } | { ok: false; message: string }) => void
}

/**
 * Every document the reference offers, and which of them are in memory.
 *
 * This is openish's port of Scalar's `ensureDocumentLoaded` with the cache, the in-flight map and
 * the idle prefetch that go with it. It lives in a controller rather than on the root element for
 * one reason: none of it is reactive state, so the element that held it had to announce every
 * mutation by hand. Here the announcements are one `requestUpdate()` in one place, and the element
 * reads getters.
 *
 * Everything is **pulled**. `@lit/task` reads its `args()` from `hostUpdate`, and the element
 * derives from the same values in `willUpdate`, which runs first - so a snapshot taken in either
 * place would be read by the other one update late. Reading through thunks means there is no
 * snapshot to be stale.
 *
 * Not itself a `ReactiveController`: it has no lifecycle of its own to hang on the host's. What it
 * owns are two things that do - the `@lit/task` that loads the document on screen, and the
 * `SourcePrefetchController` that warms the rest - and each of those registers itself.
 */
export class SourcesController {
  readonly #host: ReactiveControllerHost
  readonly #options: SourcesOptions

  /** Stores built so far, keyed by slug. A store is immutable, so one is only ever built once. */
  readonly #stores = new Map<string, DocumentStore>()

  /**
   * Loads in flight, keyed by slug.
   *
   * Two things ask for a document - the reader navigating to it, and the idle prefetch warming it -
   * and without this they would fetch and parse it twice.
   */
  readonly #inflight = new Map<string, Promise<DocumentStore>>()

  /**
   * Bumped whenever the configured documents change, so a load started against the old
   * configuration cannot write its result into the new one's cache.
   */
  #generation = 0

  #key: readonly unknown[] = []
  #resolved: readonly ResolvedSource[] = []

  #store: DocumentStore | undefined

  /** Warms the documents the reader has not asked for, while the browser is idle. */
  readonly #prefetch: SourcePrefetchController

  readonly #task: Task<readonly [string, readonly ResolvedSource[]], DocumentStore | undefined>

  /*
   * Both of these are built in the constructor rather than as field initialisers, because a field
   * initialiser runs before the constructor body and would be handed the `#host` that has not been
   * assigned yet.
   */
  constructor(host: ReactiveControllerHost, options: SourcesOptions) {
    this.#host = host
    this.#options = options

    this.#prefetch = new SourcePrefetchController(host, {
      pending: () => this.sources.map((source) => source.slug).filter((slug) => !this.#stores.has(slug)),
      load: (slug) => this.load(slug).then(() => undefined),
    })

    this.#task = new Task(host, {
      task: async ([slug]) => {
        if (slug === '') {
          return undefined
        }
        return this.load(slug)
      },
      args: () => [this.activeSlug, this.sources] as const,
      onComplete: (value) => {
        this.#store = value
        if (value) {
          this.#options.onLoaded({ ok: true, store: value })
        }
        /* Only once a document is on screen, so the first one is never competing for the network. */
        this.#prefetch.start()
      },
      onError: (error: unknown) => {
        this.#store = undefined
        this.#options.onLoaded({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        })
      },
    })
  }

  /** Whether the host configured several documents rather than one. */
  get usesSources(): boolean {
    return (this.#options.configured().sources?.length ?? 0) > 0
  }

  /**
   * The documents this reference offers, with their slugs and titles decided.
   *
   * A reference configured with `url` or `spec` gets a one-entry list rather than a special case:
   * the store it builds has a source like any other, and the only thing that makes it different is
   * that the URL leaves the slug out.
   *
   * Re-resolved only when the configuration changed, and *invalidating* when it did - so this is a
   * getter with a side effect, which is unusual enough to say out loud. It is here rather than in a
   * lifecycle hook because both readers of it run in the same update and neither may see a different
   * answer; a load already in flight is left to finish and discarded by its generation check.
   */
  get sources(): readonly ResolvedSource[] {
    const input = this.#options.configured()
    const key = [input.sources, input.url, input.spec, input.config] as const
    if (key.length === this.#key.length && key.every((value, index) => this.#key[index] === value)) {
      return this.#resolved
    }

    this.#key = key
    this.#generation += 1
    this.#stores.clear()
    this.#inflight.clear()
    this.#resolved = resolveSources(
      this.usesSources ? [...input.sources!] : [this.#implicitSource(input)],
    )
    return this.#resolved
  }

  /** The single document a host named with `url` or `spec`, as a source like any other. */
  #implicitSource(input: SourcesInput): SourceConfig {
    return {
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.spec !== undefined ? { content: input.spec } : {}),
    }
  }

  /** Whether a document has been configured at all. An empty `url` counts as "not configured". */
  get hasSource(): boolean {
    return this.sources.length > 0
  }

  /** The document on screen: the one the URL names, else the one marked `default`, else the first. */
  get activeSlug(): string {
    const sources = this.sources
    if (sources.length === 0) {
      return ''
    }
    if (!this.usesSources) {
      return sources[0]!.slug
    }

    const named = this.#options.named()
    if (sources.some((source) => source.slug === named)) {
      return named
    }
    return (sources.find((source) => source.isDefault) ?? sources[0]!).slug
  }

  /**
   * The document slug the URL leaves out.
   *
   * Empty whenever `sources` is used: there the slug is what decides which document an id is about,
   * so it has to be in the URL. The single-document case is the only one that can imply it.
   */
  get slugPrefix(): string {
    return this.usesSources ? '' : (this.sources[0]?.slug ?? '')
  }

  /** The store for the document on screen, or `undefined` while it loads or after it failed. */
  get store(): DocumentStore | undefined {
    return this.#store
  }

  get pending(): boolean {
    return this.#task.status === TaskStatus.PENDING
  }

  get error(): unknown {
    return this.#task.error
  }

  /** Every document on offer and which of them are loaded, in the shape `sourcesContext` carries. */
  get state(): OpenishSourcesState {
    return {
      sources: titledSources(this.sources, this.#stores),
      activeSlug: this.activeSlug,
      loaded: new Map(this.#stores),
      loading: new Set(this.#inflight.keys()),
    }
  }

  /**
   * Builds a document's store, or hands back the one already built.
   *
   * Cache, then in-flight, then do the work.
   */
  load(slug: string): Promise<DocumentStore> {
    const cached = this.#stores.get(slug)
    if (cached) {
      return Promise.resolve(cached)
    }
    const pending = this.#inflight.get(slug)
    if (pending) {
      return pending
    }

    const source = this.sources.find((candidate) => candidate.slug === slug)
    if (!source) {
      return Promise.reject(new Error(`No document is configured with the slug "${slug}".`))
    }

    const generation = this.#generation
    const promise = (async () => {
      const input = source.content ?? (source.url ? await this.#fetch(source.url) : undefined)
      if (input === undefined) {
        throw new Error(`The document "${slug}" names neither a url nor content.`)
      }

      const store = await createDocumentStore(input, {
        config: { ...this.#options.configured().config, ...source.config },
        source: { slug: source.slug, title: source.title, url: source.url },
      })

      /* The configuration changed while this was in the air; the result belongs to nothing now. */
      if (generation === this.#generation) {
        this.#stores.set(slug, store)
      }
      return store
    })().finally(() => {
      this.#inflight.delete(slug)
      /* So the picker stops saying "loading" and search picks up a document that has just landed. */
      this.#host.requestUpdate()
    })

    this.#inflight.set(slug, promise)
    return promise
  }

  async #fetch(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }

}

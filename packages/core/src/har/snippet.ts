import { GROUPED_CLIENTS } from '@scalar/types/snippetz'
import type { ClientId, HarRequest, TargetId } from '@scalar/types/snippetz'

/**
 * A code-sample client the reader can pick.
 *
 * `id` is the `target/client` form `config.defaultHttpClient` and `config.hiddenClients` use, and
 * the one `openish-client-change` carries.
 */
export type SnippetClient = {
  id: string
  target: string
  client: string
  /** Display name for the target, e.g. `JavaScript` for `js`. */
  targetLabel: string
  /** Display name for the client itself, e.g. `clj-http` for `clj_http`. */
  clientLabel: string
  /** highlight.js language for this target, for whatever renders the snippet. */
  language: string
}

/**
 * Display name and highlight language per target.
 *
 * The *list* of targets is not repeated here - it comes from `GROUPED_CLIENTS`, so a client Scalar
 * adds or drops changes the picker without an edit. This map only says how to spell and colour one,
 * and an unknown target falls back to its own id and no highlighting rather than disappearing.
 */
const TARGETS: Record<string, { label: string; language: string }> = {
  c: { label: 'C', language: 'c' },
  clojure: { label: 'Clojure', language: 'clojure' },
  csharp: { label: 'C#', language: 'csharp' },
  dart: { label: 'Dart', language: 'dart' },
  fsharp: { label: 'F#', language: 'fsharp' },
  go: { label: 'Go', language: 'go' },
  http: { label: 'HTTP', language: 'http' },
  java: { label: 'Java', language: 'java' },
  js: { label: 'JavaScript', language: 'javascript' },
  kotlin: { label: 'Kotlin', language: 'kotlin' },
  node: { label: 'Node.js', language: 'javascript' },
  objc: { label: 'Objective-C', language: 'objectivec' },
  ocaml: { label: 'OCaml', language: 'ocaml' },
  php: { label: 'PHP', language: 'php' },
  powershell: { label: 'PowerShell', language: 'powershell' },
  python: { label: 'Python', language: 'python' },
  r: { label: 'R', language: 'r' },
  ruby: { label: 'Ruby', language: 'ruby' },
  rust: { label: 'Rust', language: 'rust' },
  shell: { label: 'Shell', language: 'bash' },
  swift: { label: 'Swift', language: 'swift' },
}

/** Every client snippetz can generate, in target order. */
export const SNIPPET_CLIENTS: readonly SnippetClient[] = Object.entries(GROUPED_CLIENTS).flatMap(
  ([target, clients]) =>
    (clients as readonly string[]).map((client) => ({
      id: `${target}/${client}`,
      target,
      client,
      targetLabel: TARGETS[target]?.label ?? target,
      /* `clj_http` and `httpx_sync` are package names with an underscore; a hyphen reads better. */
      clientLabel: client.replace(/_/g, '-'),
      language: TARGETS[target]?.language ?? 'plaintext',
    })),
)

/** The clients a document offers, with `config.hiddenClients` removed. */
export const snippetClients = (hidden: readonly string[] = []): SnippetClient[] =>
  SNIPPET_CLIENTS.filter((client) => !hidden.includes(client.id))

export const findSnippetClient = (id: string): SnippetClient | undefined =>
  SNIPPET_CLIENTS.find((client) => client.id === id)

/**
 * Turns a HAR request into a code sample.
 *
 * The `@scalar/snippetz` barrel imports all forty-one client plugins - around 28 KB gzipped - so it
 * is loaded on demand rather than by anyone who imports this package for the document store. The
 * picker does not need it: {@link SNIPPET_CLIENTS} is built from `@scalar/types`, which is data.
 *
 * Returns `undefined` for a client id that names no plugin, rather than throwing: the id can come
 * from a host's config, and a typo there should cost a code sample, not the page.
 */
export const generateSnippet = async (
  request: HarRequest,
  clientId: string,
): Promise<string | undefined> => {
  const [target, client] = clientId.split('/')
  if (!target || !client) {
    return undefined
  }

  const { snippetz } = await import('@scalar/snippetz')
  const generator = snippetz()
  if (!generator.hasPlugin(target, client)) {
    return undefined
  }

  return generator.print(target as TargetId, client as ClientId<TargetId>, request)
}

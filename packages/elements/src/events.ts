import type { TokenSet } from '@openish/client'
import type { ColorSchemePreference, DocumentStore } from '@openish/core'

/**
 * A change to what the reader is holding for one security scheme.
 *
 * Spelled out as alternatives rather than as a credential string, because "authorizing", "it
 * failed", and "signed out" are states an auth form has to show and a bare value cannot express.
 */
export type OpenishAuthChange =
  | { scheme: string; kind: 'pasted'; value: string }
  | { scheme: string; kind: 'authorizing' }
  | { scheme: string; kind: 'token'; token: TokenSet }
  | { scheme: string; kind: 'failed'; message: string }
  | { scheme: string; kind: 'clear' }

/** The server a request should go to, before its variables are applied. */
/** What `openish-loaded` reports: the store when it parsed, or why it did not. */
export type OpenishLoaded = { ok: true; store: DocumentStore } | { ok: false; message: string }

export type OpenishServerChange = { url: string; variables: Record<string, string> }

/**
 * Every cross-cutting change travels up as a bubbling, composed `CustomEvent` and is handled by
 * `<openish-api-reference>`, which then re-provides context. Children never reach into a parent or
 * mutate shared state, so any element can be rendered in isolation and tested by listening.
 *
 * The root re-dispatches what it handles, because some of it is the host application's business:
 * only the app can swap the Jack Henry theme stylesheet or persist a preference.
 */
export type OpenishEventMap = {
  'openish-color-scheme-change': ColorSchemePreference
  /** A snippetz client id, as `target/client`. */
  'openish-client-change': string
  /** A navigation node id, for hosts driving selection themselves (`routing="none"`). */
  'openish-navigate': string
  /**
   * A sidebar row asked to open or close.
   *
   * Travels up because the tree is flattened for virtualisation and a recycled row cannot hold its
   * own state - `<openish-sidebar>` owns the map and hands `expanded` back down as a property.
   */
  'openish-sidebar-toggle': { id: string; expanded: boolean }
  /**
   * The document finished loading, or failed to.
   *
   * An event rather than an `onLoaded` callback, because that is this project's grammar for
   * everything else and a host already has a listener on the element. It carries the store, so a
   * host can build a table of contents or warm a search index without parsing the document twice.
   */
  'openish-loaded': OpenishLoaded
  /** The reader picked a server, or filled in one of its variables. */
  'openish-server-change': OpenishServerChange
  /**
   * The reader picked a different document from the picker. Carries its slug.
   *
   * The picker changes nothing itself: the root answers by navigating to that document's overview,
   * which moves the URL, which is what every other element already reads. So there is one thing
   * that decides which document is on screen, and it is the same thing that decides it on a reload.
   */
  'openish-source-change': string
  /**
   * The reader's credential for one scheme changed.
   *
   * Re-dispatched by the root like the others, so a host can prefill after its own login or persist
   * a choice. openish itself writes nothing to storage: a token's lifetime is the page's.
   */
  'openish-auth-change': OpenishAuthChange
}

export type OpenishEvent<K extends keyof OpenishEventMap> = CustomEvent<OpenishEventMap[K]>

export const dispatch = <K extends keyof OpenishEventMap>(
  target: EventTarget,
  type: K,
  detail: OpenishEventMap[K],
): void => {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
}

declare global {
  interface HTMLElementEventMap {
    'openish-color-scheme-change': OpenishEvent<'openish-color-scheme-change'>
    'openish-client-change': OpenishEvent<'openish-client-change'>
    'openish-navigate': OpenishEvent<'openish-navigate'>
    'openish-server-change': OpenishEvent<'openish-server-change'>
    'openish-source-change': OpenishEvent<'openish-source-change'>
    'openish-auth-change': OpenishEvent<'openish-auth-change'>
    'openish-sidebar-toggle': OpenishEvent<'openish-sidebar-toggle'>
    'openish-loaded': OpenishEvent<'openish-loaded'>
  }
}

/**
 * Every event above is declared globally, and this is what says so.
 *
 * The two lists had already drifted: `openish-sidebar-toggle` and `openish-loaded` were in the map
 * that types `dispatch` and missing from the one that types `addEventListener` - so a host following
 * the README and listening for `openish-loaded` got an untyped `Event`, and a template binding
 * `@openish-sidebar-toggle` was checked against nothing.
 *
 * A type rather than a test, because it costs a compile and nothing else: the alias resolves only
 * when the exclusion is empty, so adding an event to `OpenishEventMap` and forgetting the global
 * declaration fails `npm run typecheck` on this line, naming the event that was left out.
 */
export type AllEventsDeclared<
  Missing extends never = Exclude<keyof OpenishEventMap, keyof HTMLElementEventMap>,
> = Missing

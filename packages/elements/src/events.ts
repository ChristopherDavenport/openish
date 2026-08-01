import type { ColorScheme } from '@openish/core'

/**
 * Every cross-cutting change travels up as a bubbling, composed `CustomEvent` and is handled by
 * `<openish-api-reference>`, which then re-provides context. Children never reach into a parent or
 * mutate shared state, so any element can be rendered in isolation and tested by listening.
 *
 * The root re-dispatches what it handles, because some of it is the host application's business:
 * only the app can swap the Jack Henry theme stylesheet or persist a preference.
 */
export type OpenishEventMap = {
  'openish-color-scheme-change': ColorScheme
  /** A snippetz client id, as `target/client`. */
  'openish-client-change': string
  /** A navigation node id, for hosts driving selection themselves (`routing="none"`). */
  'openish-navigate': string
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
  }
}

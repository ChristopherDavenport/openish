/**
 * The document behind the routing guide's iframes.
 *
 * A second entry point, with no site router in it, and that is the entire reason it exists.
 * `hash` and `history` are modes *about* owning the address bar, and the site's own router owns the
 * one in the top-level window - so the only truthful way to show either of them working is to give
 * it a document of its own. An iframe has its own `location`, its own history, and its own
 * `popstate`, which is exactly the isolation the demonstration needs.
 *
 * It is also why `history` mode cannot be shown in-page anywhere on this site: two routers cannot
 * both own `location.pathname`, and openish's synthetic `PopStateEvent` would reach the site
 * router's own listener on every navigation.
 *
 * `?mode=hash|history` picks the mode. Under `history` the reference is told the page it is mounted
 * at, so its URLs are real paths beneath that rather than at the root - which is the thing
 * `base-path` exists for and the thing a host adopting the mode most needs to see working.
 */
import '@openish/elements'
import '@openish/theme/index.css'

import type { OpenishApiReference } from '@openish/elements'

import { GALAXY } from './data/documents.js'

const reference = document.querySelector<OpenishApiReference>('#reference')
if (!reference) {
  throw new Error('#reference is missing from history-demo.html')
}

const parameters = new URLSearchParams(window.location.search)
const mode = parameters.get('mode') === 'history' ? 'history' : 'hash'

reference.routing = mode
if (mode === 'history') {
  /*
   * The path this document is served at, whatever it is. Read rather than hard-coded, because the
   * site is served from /openish/ in production and from the same path in development only because
   * `vite.config.ts` says so - and a demo of `base-path` that got its own base path wrong would be
   * a poor advertisement for the option.
   */
  reference.basePath = window.location.pathname
}
reference.url = GALAXY.url

/* Fills the frame. The reference decides nothing about its own height - the host always does. */
document.documentElement.style.height = '100%'
document.body.style.height = '100%'
document.body.style.margin = '0'
reference.style.height = '100%'
reference.style.display = 'block'

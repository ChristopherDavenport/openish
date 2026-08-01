import type { Router } from '@lit-labs/router'

/**
 * Programmatic navigation.
 *
 * `Router.goto()` re-renders the matched route but does not touch the URL bar - that is documented
 * library behaviour, not a bug, and leaving them out of sync is what breaks the back button later.
 * The two always travel together, so they live in one function rather than at each call site.
 *
 * Clicks on an `<a href>` need none of this: the router's own listener handles `pushState` for
 * those, and it reads `composedPath()`, so anchors inside a shadow root are intercepted too.
 */
export const navigate = (router: Router, path: string): void => {
  if (path === window.location.pathname + window.location.hash) {
    return
  }

  window.history.pushState({}, '', path)
  void router.goto(new URL(path, window.location.origin).pathname)
}

import { hrefForId, type RoutingState } from './urls.js'

/**
 * Programmatic navigation to a navigation node id.
 *
 * Ids are the currency everywhere else - `store.bySlug` is keyed by them, `openish-navigate` carries
 * one - so this takes an id rather than a URL and lets {@link hrefFor} keep sole responsibility for
 * what a mode's URLs look like.
 *
 * Clicks on an `<a href>` need none of this. In `hash` mode a fragment link is navigation the
 * browser performs by itself; in `history` mode `<openish-api-reference>` intercepts the click in
 * its own template. This is only for a host that wants to move the reference without a click.
 */
export const navigate = (routing: RoutingState, id: string): void => {
  /* Through `hrefForId`, so a navigation and a link cannot disagree about whether the URL names the
   * document - there is one answer to that and it lives in `urls.ts`. */
  const target = hrefForId(id, routing)

  if (routing.routing === 'history') {
    if (window.location.pathname === target) {
      return
    }
    window.history.pushState({}, '', target)
    /*
     * `pushState` deliberately does not fire `popstate` - the browser only announces navigations it
     * performed itself. `LocationController` is the one subscriber to that announcement, so a
     * navigation openish performs has to make the same one, rather than every caller learning to
     * poke a particular element afterwards.
     */
    window.dispatchEvent(new PopStateEvent('popstate'))
    return
  }

  /* Assigning the fragment fires `hashchange` on its own, and is a no-op when it has not changed. */
  window.location.hash = target
}

# openish — the plan, and what it cost

M0–M7 are done: the reference renders, navigates, searches, generates samples, sends them, and has
been through an accessibility, mobile, bundle, and docs pass. This file is now mostly the second half of its job -
the conventions and the traps, written so the next person does not pay for them twice.

Read `README.md` first for the dependency contract, the integration hazards, and the measured
numbers. Read this file for how the code is meant to be written and what has already gone wrong.

---

## Where things stand

| Milestone | State |
|---|---|
| M0 scaffold | Done — workspaces, TS project refs, Vite 7, Vitest 4, guards |
| M1 core | Done — store, navigation traversal, HAR builder, schema examples |
| M2 shell | Done — root element, router, sidebar, overview, tag/operation/model pages |
| M3 operation detail | Done — tabs/table/disclosure, parameters, request body, responses |
| M4 schema renderer | Done — `openish-schema`, cycle-safe, on models and operations alike |
| M5 code samples + search | Done — snippet per client, highlighted and copyable; search dialog |
| M6 hardening | Done — axe + contrast in both schemes, mobile disclosure, bundle budget, docs |
| M7 try it | Done — `@openish/client`, sending, OIDC discovery, authorization code with PKCE |
| M8 embeddable | Done — hash routing by default and no router at all, neutral theme, standalone build |
| M9 document fidelity | Done — `x-codeSamples`, `x-internal`, `x-tagGroups`, constraints, ordering, download |
| M10 scale | Done — virtualised sidebar, deeper search index, lazy highlight pipeline, config coverage |
| M11 host integration | Done — parts and slots, the remaining OAuth grants, credential store, slug hooks |
| M12 multi-document | Done — `sources`, namespaced ids, a picker, lazy loading with idle prefetch, cross-document search |

`npm run verify` runs guards → typecheck → tests. 402 tests today across three projects: `core` and
`client` in Node, `elements` in real Chromium via Playwright (`npx playwright install chromium`
once). A `.browser.test.ts` suffix inside `packages/client/test` puts a file in the Chromium project
instead - that is where the two OAuth transports are tested, and the suffix is what keeps the rest of
that package honest about having no DOM. `npm run build` also regenerates `custom-elements.json` and
the element reference in `packages/elements/README.md`.

**What is not done, and is worth deciding on next:** localization, which touches every template, and
DPoP and PAR, which the Banno description mentions and no grant here implements. Both are big enough
to be their own milestone rather than a loose end. The obvious follow-on to M12 is `aggregate:
'merge'` — every document in one tree instead of one at a time — which namespaced ids have already
paid for.

---

## Conventions, and why

**Properties down, events up.** No child mutates a parent. Cross-cutting changes are bubbling composed
`CustomEvent`s declared in `src/events.ts`, handled by `openish-api-reference`, which re-provides context.
The root re-dispatches what it handles, because some of it is the host's business — only the host can swap
the Jack Henry theme, which is declared at `:root`.

**Context carries the graph downward.** `documentContext` (the store) and `uiContext` (config, layout,
colour scheme, selected client, base path) come from the root. `schemaContext` is the third, and the
one the rule was written for: `<openish-schema>` consumes it, adds its own `$ref` to the path, and
re-provides it to everything it renders. An element may consume and provide the same context -
`ContextProvider` compares the request's target against its own host and refuses to answer itself.

**Declarative by default.** A component's job is to describe what its shadow tree should be for the
state it holds, and nothing else. In practice that means:

- **No `addEventListener` in an element.** The two cross-cutting events bubble, so the root binds
  `@openish-color-scheme-change` on the element it renders. Only `window` needs a listener, and that
  is what `src/controllers/` is for - a `ReactiveController` ties the subscription to the host's
  connected lifetime instead of a pair of lifecycle overrides that have to stay in step.
- **Nothing reads a global during `render()`.** `LocationController` makes the URL a reactive input;
  `<openish-api-reference>` derives `activeId` from it in `willUpdate` and provides it through
  `uiContext`, so every other element consumes a value rather than re-reading `window.location`.
- **A derived value is a getter.** Not state, not a lifecycle hook: a getter cannot go stale, has no
  second copy to keep in step, and needs nothing to notice that its inputs changed. `willUpdate`
  survives in exactly two elements - `<openish-api-reference>` and `<openish-schema>` - and in both
  for the same reason: the value is *provided*, and a context provider pushes, so it has to be
  assigned somewhere in the update. An assignment in `willUpdate` joins the update already in
  flight; one in `updated` schedules a second render, and a second render is where the bugs live
  (see the `live()` trap below).
- **State is set where it changes, not in a hook that watches for it.** Opening the search dialog
  clears the query and the highlighted row in the function that opens it; typing resets the
  highlight in the input handler. Nothing derives one piece of state from another after the fact.
- **Imperative DOM calls belong in `updated`** - `showModal()`, `focus()`, `scrollIntoView()` - in
  one place each, in response to a property changing.
- **A provided context needs `hasChanged`.** `@lit/context` notifies by identity, so a value rebuilt
  each update re-renders every consumer on the page unless something compares it. Both provided
  contexts here do (`sameUiState`, `sameState`), and the element test suite runs a third faster for
  it.
- **Use the directives.** `repeat()` wherever a list has identity, `classMap`/`ifDefined`/`live`/
  `ref` instead of string concatenation, `?? nothing`, and `querySelector`. `hasChanged` decides
  whether a re-derived value is worth telling anyone about - `<openish-schema>` rebuilds the context
  it provides on every update and compares, rather than guessing which inputs it depended on.

**No router.** Navigation ids are URL paths and `store.bySlug` maps one to a node, so resolving a URL
is a lookup and `renderNodeById` is the whole of rendering it. `LocationController` makes the URL a
reactive input and the root derives `activeId` from it per mode; `hash` needs no click interception at
all, `history` needs about twenty lines of it, `none` forwards the click as `openish-navigate`. Adding
a page shape is a case in `renderNode`, not a route.

**No signals.** `@lit-labs/signals` is deliberately absent. Add it only if a genuine cross-root need
appears — two references on one page sharing client selection would qualify; nothing so far does.

**Legacy decorators.** `experimentalDecorators: true`, `useDefineForClassFields: false`. Use plain class
fields with `@property`/`@state` — **not** the `accessor` keyword, which is standard-decorator syntax and
will not compile here.

**Reuse upstream unless Vue is in the graph.** The project exists to replace Scalar's render layer,
not its OpenAPI work. Anything of theirs with no `vue` in its dependency graph, and no assumption
about a component model, belongs here rather than reimplemented - the markdown pipeline is the model
case: `htmlFromMarkdown` is a string in, string out, which is exactly what a declarative element
wants. Before writing something that upstream already has, check whether the entry point still
reaches Vue; the answer changes between releases. The verified state as of
`@scalar/workspace-store@0.56.0` and `@scalar/oas-utils@0.19.9` is a table in the README.

**Only `--openish-*` in component CSS.** `packages/theme/css/tokens.css` is the single place those bind to
Jack Henry alias tokens. Two documented exceptions reach for JH *global* tokens because the alias tier has
no equivalent semantic: the HTTP method palette and the syntax-highlight palette. Both restate themselves
under `.jh-theme-dark`, because globals do not re-point per scheme — aliases do.

**Fixtures.** Committed API documents live only in `packages/core/test/fixtures/`, 64 KB ceiling, one
behaviour each; `npm run guard:specs` enforces it. Real documents are loaded by hand in the playground and
never committed. If one surfaces a defect, reproduce it as a small fixture *first*, then fix it.

---

## Traps already paid for

These cost real time. Do not rediscover them.

**The magic proxy does not return stable object identities.** `getResolvedRef` hands back a fresh wrapper
each time a `$ref` resolves, so a `Set<object>` of visited schemas never fires. Cycles must be tracked by
the **`$ref` pointers on the current path**, with identity kept only as a secondary guard for YAML-anchor
sharing. `schemaExample` in `packages/core/src/schema/schema-example.ts` and `<openish-schema>` both do
it that way; anything else recursing over a document has the same problem.

**A schema reached without a `$ref` has no identity to track.** A model page reads its schema straight
out of `components.schemas`, so there is no pointer for the cycle guard to seed itself with, and
`Node.parent` would expand `Node` a whole second time before anything noticed. `<openish-schema>` takes
a `pointer` property for exactly this, and `NavModelNode.pointer` already holds the right value.

**`pushState` announces nothing.** The browser fires `popstate` only for navigations *it* performed,
so code that pushes a URL has to dispatch the event itself or `LocationController` never hears about
it. `src/router/navigate.ts` and the root's click handler both do. Assigning `location.hash` needs no
such help - that one is a real navigation and fires `hashchange` on its own.

**Anchors inside shadow DOM need `composedPath()`.** `event.target` is retargeted to the shadow host,
so a click handler that reads it sees `<openish-api-reference>` for every link on the page. Read
`composedPath()` and find the first `HTMLAnchorElement`. In `hash` mode none of this runs: a fragment
link is navigation the browser performs itself.

**Three `@lit-labs/router@0.1.4` bugs used to live here** - a `Routes` constructed after connection
rendering nothing forever, `/models/*` not matching `/models`, and `goto()` throwing from an
unawaited promise without a `fallback`. They are gone with the library. Recorded because the shape is
worth remembering: all three were the cost of expressing "look this id up in a map" as a route
table.

**`@scalar/helpers`' `isObject` is realm-sensitive.** It tests
`Object.getPrototypeOf(value) === Object.prototype`, and `createMagicProxy` gates on it — so a
document object built in one realm and handed to openish in another is never proxied, and no `$ref`
resolves. Nothing errors; schemas just render as if every reference were empty. The element tests hit
this through the iframe and pass their fixture as JSON, which is what a fetched document is anyway.

**`SchemaObject` from `@scalar/openapi-types/3.1` is a discriminated union**, not a bag of keywords. Code
that probes `allOf`, then `enum`, then `items` before knowing what it holds should read a
`Record<string, unknown>` and keep `unknown` in its public signature. Narrowing at every access is noise.

**A shadow root does not inherit a page's class rules, only its custom properties.** Highlight
colours were declared in `@openish/theme/highlight.css` at M2 and coloured nothing for three
milestones: every code block openish renders is inside a shadow root, so `.hljs-keyword` in a host
stylesheet never matched. The rules are component CSS now (`highlightStyles`), the `--openish-hl-*`
hooks stayed in the theme, and that split is the general answer - tokens travel, selectors do not.

**Lit itself has four sharp edges, and this project has hit all of them.**
- **`willUpdate()` runs *before* a controller's `hostUpdate()`.** A controller that snapshots
  external state in `hostUpdate` is therefore always one update behind anything derived from it in
  `willUpdate`. `LocationController` exposes getters for that reason.
- **A `@query` field must not have an initialiser.** The decorator installs a getter on the
  prototype, and with `useDefineForClassFields: false` the field initialiser assigns through it -
  which throws in the constructor, so the element never upgrades and the page simply never appears.
- **Assigning reactive state in `updated()` schedules a second render.** With `live()` on an input,
  that second render takes back whatever the reader typed in between. Clear the field in
  `willUpdate` instead.
- **`<dialog>` fires `close` from a queued task.** Close and immediately reopen and the stale event
  arrives *after* the reopen; a handler that blindly sets `open = false` shuts the new dialog. Check
  the dialog's own state before acting on it.

**No backticks inside a `css` tagged template.** Not even in a comment: the template literal ends at
the first one, and esbuild reports it as a syntax error dozens of lines later, pointing at whatever
word followed. Three comments in this repo have been written twice for that reason, the third after
this warning was already here - so the real lesson is the second half: `npm run verify` catches it
immediately, and it is worth running before reaching for a browser to find out why a page is blank.

**The element fills its container.** `:host { height: 100% }` is load-bearing: break the height chain
anywhere above it and the reference is as tall as its content, so nothing inside scrolls on its own -
the sidebar, and on a narrow viewport the navigation disclosure, scroll off the top with the page and
there is no way back to them. The playground broke it with a plain `<div id="app">` between `body`
and the element and nobody noticed for six milestones, because `test/frame.html` had the same gap.
Both give the element a height now, the menu is `position: sticky` so it survives a host that does
not, and the README says so.

**Test harness rules** (`packages/elements/test/helpers.ts` has all of this):
- Router tests need an iframe with a **real served URL** — `about:blank` and `srcdoc` both fail, because
  `pushState` refuses an http URL on a document whose own URL is not one. Hence `test/frame.html`.
- A custom element registry belongs to its document, so `frame.html` imports the elements itself.
- Descendant selectors do not cross shadow boundaries: `openish-overview h1` matches nothing however deep
  the search. Use `shadowOf()`, `deepQuery()`, `deepQueryAll()`, `deepTextOf()`.
- Settling needs a **deep** signature across shadow roots; a shallow one reports "settled" while nested
  elements are still filling in. It also needs a **frame**, not a zero timeout: a virtualiser cannot
  render until a `ResizeObserver` has measured it, and that never lands in a microtask - a loop that
  only drained promises saw an empty list twice and concluded the tree had settled at zero rows.
- The lazy markdown and highlight pipelines are awaited once at the top of the settle loop, because
  an element that renders prose renders nothing on its first pass and fills in when the import
  resolves - a race that fails one test in twenty rather than reliably.
- The fixture crosses into the iframe as **JSON, not an object** — see the `isObject` trap above.
- Vitest's browser mode rewrites every `import()` to go through `__vitest_browser_runner__`, a global
  it installs on the tester window and not on the frame's. `frame.html` shims it, or the lazy import
  of `@scalar/snippetz` throws there and nowhere else.
- Real key events come from `userEvent` (`vitest/browser`) and do reach the frame. A synthesised
  `KeyboardEvent` cannot close a `<dialog>`, because Escape is handled by the browser rather than by
  a listener — so the search tests type for real.

---

## M3 — operation detail (done)

What shipped:

- **Primitives**: `openish-tabs` (roving tabindex, arrow keys, Home/End, one panel rendered at a
  time — its `content` is a callback so an unselected panel costs nothing), `openish-table` (a real
  `<table>`, first cell a `<th scope="row">`, its own `overflow-x` container), `openish-disclosure`.
- **Content**: `openish-parameters`, `openish-request-body`, `openish-response-list`, and
  `openish-schema-preview` — the one place the schema renderer had to land, since request bodies and
  responses both go through it.
- **Core**: the path-item/operation parameter merge moved to `@openish/core`
  (`operation/parameters.ts`) and `operation-to-har.ts` now calls it, so the table and the code
  sample cannot disagree about an override. `groupParameters` orders the `in` groups.
- **Routing**: the root's flat route table became one mount per section plus `<openish-section>`,
  which matches the rest with `Routes`. See the convention and the two traps above.

---

## M4 — the recursive schema renderer (done)

`openish-schema` renders a schema as a property tree and calls itself for every schema inside one —
properties, `oneOf` branches, array items. What is worth knowing before touching it:

- **One element, not a family.** Property rows are plain markup in its own shadow root; only the
  nested schema of a property is another `<openish-schema>`, and only when `hasBody()` says that
  schema has something to say beyond its type. A fifty-property model of plain strings creates no
  nested elements at all.
- **Cycle safety is `schemaContext`.** It consumes the state, adds its own pointer, re-provides it.
  A branch that reaches a pointer already on the path renders a link to that model instead of
  expanding — better than truncating, because the reader gets the rest of the shape on a page that
  has room for it. `pointer` seeds the path on a model page; see the trap above.
- **A closed disclosure renders nothing inside it.** That is why `<openish-disclosure>` reports
  `openish-toggle` upward: the tree grows only where the reader looks, which is what keeps a
  600-model document from rendering itself on every navigation.
- **Depth beyond the top level puts properties behind a disclosure**, except in a `oneOf` variant
  panel, where the tab the reader pressed *is* the expansion (`inline-properties`).
- `openish-schema-preview` and `openish-model` both delegate to it and keep the generated example
  alongside: the tree is the contract, the example is an instance of it.

---

## M7 — try it (done)

The reader can now call the API, which needed a third package: `@openish/client`, framework-free and
with **no dependencies at all**, holding everything about talking to an API. Reading a document is
`@openish/core`'s job, rendering one is `@openish/elements`', and neither of those is calling one.

- **One function builds the request.** `operationToHar` gained `parameterValues`, `body`,
  `credentials`, and `securityIndex`; `<openish-try-it>` calls it twice with the same inputs and only
  the credentials differing - real for the wire, placeholders for the sample. That is what makes the
  snippet beside the button trustworthy, and it is pinned by the first test in `try-it.test.ts`.
- **`securityRequirements`** reads `security` as what it is: a list of alternatives, each a set of
  schemes that apply together. `applySecurity` used to read only the first and could not be told
  which one the reader holds. A requirement naming a scheme the document never declares is reported
  rather than thrown - the document in this repo does exactly that.
- **Authentication is not a paste field.** Every scheme in the reference document is `openIdConnect`
  carrying a `.well-known` URL and nothing else, so there is no token to paste until a flow has run.
  The client does OIDC discovery, PKCE (checked against RFC 7636's own vector), and the authorization
  code grant, in a popup or as a full-page redirect.
- **Three rules the code enforces rather than documents:** a client secret is only ever sent through
  `proxyUrl`; `state` is verified and the redirect URI must be same-origin; and the verifier is
  cleared the moment it is used. Tokens live in memory for the life of the page and are never
  persisted - that decision belongs to the host, which hears `openish-auth-change`.
- **The pop-up must be opened before anything is awaited**, or the browser treats it as unsolicited
  and blocks it. `authorizeInPopup` therefore accepts a *promise* of the URL: it opens `about:blank`
  inside the click and points it at the provider when discovery comes back.
- An HTTP error is an answer, not a failure. A rejected `fetch` is the failure, and it arrives as
  `TypeError: Failed to fetch` with nothing else - so `sendRequest` names the origin and says what is
  almost certainly true about it instead.

---

## M8 — making it embeddable (done)

The milestone that removed more than it added.

- **Hash routing, and then no router.** `routing="hash"` is the default: a fragment link is
  navigation the browser performs itself, so nothing intercepts a click, and a reload asks the server
  for a URL it already serves. Adding it made the rest visible - navigation ids *are* URL paths and
  `bySlug` is a map, so resolving a URL was already a lookup and the route table was an elaborate way
  of arriving at one. `@lit-labs/router`, `urlpattern-polyfill`, `<openish-section>`, and three
  documented library bugs left together. `routing` can now change on a live element.
- **`@openish/elements` stopped depending on Jack Henry.** Nothing in `src/` imported jh-ui or
  jh-icons; the binding lives in `@openish/theme`. They are root devDependencies now, so
  `jh-ui-lit3.test.ts` still guards the Lit-3 coexistence it was written for without every consumer
  installing a component library openish does not use.
- **A theme with values of its own.** `tokens.css` is self-contained and `jh/tokens.css` re-points
  the same hooks; `index.css` and `jh.css` are the two entries. Light and dark are `light-dark()`
  keyed on `color-scheme`, so the default follows the reader with no script at all and
  `color-scheme="dark"` on the element (now reflected) scopes an override to one reference.
  `contrast.test.ts` measures **both themes in both schemes**, through a probe element, because a
  custom property's computed value is its token stream and `light-dark(a, b)` is both halves.
- **`securityIndex` was dead plumbing.** `operationToHar` had taken it since M7 and nothing passed
  one, so a document offering "OAuth **or** an API key" sent the OAuth header to a reader holding the
  key - a 401 that looked like the API's fault. `preferredSecurityIndex` decides from the credentials
  that exist, which is a question the reader already answered by signing in.
- **One event per thing that happened.** `dispatch` marks everything `composed`, so a descendant's
  request escaped to the host *and* the root re-announced the fact. The handlers stop the inbound one.

## M9 — document fidelity (done)

Extensions real documents carry, and constraints a reference has to be able to say out loud.

- `x-codeSamples` and its four other spellings, offered above the generated clients. The
  highest-priority source wins outright rather than concatenating, or a Stainless-generated document
  shows the same request three times.
- `x-internal` / `x-scalar-ignore` on operations, webhooks, tags, groups and schemas. A hidden schema
  still renders where an operation refers to it: the filter is about the type dictionary, not about
  the document.
- `x-tagGroups`, reusing `NavGroupNode`. A tag no group names is **kept**, not dropped the way Redoc
  drops it - losing a page because someone forgot a name is worse than an extra heading.
- The eight missing constraint keywords, `x-enumDescriptions` and friends, and
  `x-additionalPropertiesName`. This found a real defect: **array constraints were dropped entirely**,
  because `hasBody` and the renderer both looked only at the unwrapped item schema, so
  `minItems`/`uniqueItems` on an array of plain strings rendered nowhere and created no element to
  render into.

## M10 — scale (done)

- **The sidebar is virtualised**, with `@lit-labs/virtualizer`. Collapsing already kept the tree
  cheap, but one *expanded* section could not be. Flattening moved expansion state and keyboard
  navigation up into `<openish-sidebar>` - a virtualiser recycles rows, so state held in one follows
  whichever node scrolls into it - and made it a real ARIA `tree`: one tab stop, arrows to move,
  Right/Left to open and close, `aria-level`/`posinset`/`setsize` since the nesting is no longer in
  the markup.
- **The entry chunk went from 291 kB to 66 kB gzipped.** The markdown pipeline, the highlighter, the
  snippet generator and the YAML writer are all deferred. A code block renders as plain text and
  gains colour when colour arrives - the same fallback an unknown language always had, so there is no
  layout shift. `measure-bundle.mjs` reports entry and deferred separately now; bundling dynamic
  imports inline was measuring the wrong thing.
- **Search indexes prose and field names**, cached per store in a `WeakMap` - the store is immutable
  and replaced wholesale, so it is the right key and there is nothing to invalidate. Weighted lowest,
  because a reader typing `id` must not get every operation in the document.

## M12 — multiple documents (done)

`sources` renders several documents behind a picker. The design is Scalar's, read out of
`@scalar/api-reference@1.64.0` rather than guessed at; the README's dependency contract says where.

- **Ids are namespaced always, and the URL is a projection.** Every id begins with its document's
  slug, single-document or not, so there is one traversal to reason about. Whether that segment
  reaches the URL is decided in `router/urls.ts` alone - `stripFirstSegment` out, `applySlugPrefix`
  in - which is why `rows.ts`, `openish-sidebar-item`, the virtualiser's `keyFunction` and
  `LocationController` needed no changes at all, and why a single-`url` reference has byte-identical
  URLs. The first cut threaded a conditional prefix through the traversal instead; Scalar's split is
  better and the difference is one line in a predicate.
- **Three things that looked unrelated were the same bug.** The model link in `<openish-schema>` built
  `models/${name}` by hand, `#headingIds()` stamped full ids as fragment targets, and
  `defaultOpenFirstTag` tested `activeId === ''` for "at the overview". All three were code that knew
  what an id looked like. If something composes an id from a literal, it now has to say which
  document.
- **`redirect` works in URL space**, not id space: a host writing one is holding a list of links that
  used to work, and those are the strings from its old sitemap - not ids carrying a slug its URLs
  never showed.
- **Lazy, then idle.** A cache plus an in-flight `Map<slug, Promise>` so the reader's navigation and
  the prefetch cannot fetch the same document twice; `requestIdleCallback` with a 1500 ms timeout,
  one document at a time, cancelled on disconnect. That last part is Scalar's and worth keeping: an
  orphaned reference otherwise keeps parsing into a store nothing will render.
- **Search spans every loaded document** and groups by source, which Scalar does not do. The headings
  are `role="presentation"` and the options keep one flat gapless index, or `aria-activedescendant`
  and the arrow keys break.
- **Per-document sessions and servers.** Two documents both declaring `oauth2` are usually two
  different authorization servers. `scopedCredentialStore` namespaces a host's single store; a
  single-`url` reference is handed it untouched, so nothing already persisted stops reading back.

## M11 — host integration (done)

- **Parts and slots.** Parts on the layout, sidebar, tree, operation header, sections, code blocks and
  dialogs, with `exportparts` chains so a rule on the host page reaches four shadow roots down. The
  section slots needed slot *forwarding*: `<openish-operation>` is created inside the root's shadow
  root, so a host has no way to put a light-DOM child into it, and a `<slot>` assigned to a parent
  slot is what carries the host's markup through.
- **The remaining OAuth grants.** Client credentials, password and implicit. The secret-only-through-
  a-proxy rule extends to all of them, and the form hides the secret field entirely without one.
  Password and implicit render a line saying OAuth 2.1 removes them rather than presenting them as
  equals.
- **`credentialStore`**, so a host can implement the decision openish refuses to make for it.
  Restored grants are filtered: a stored `authorizing` is a flow a reload interrupted and a stored
  `failed` is an error from a session the reader has left.
- **Slug generators and `redirect`**, so a migration keeps its deep links. `redirect` is consulted
  only on a miss, so it cannot shadow a real page.

## M6 — hardening (done)

- **Accessibility.** axe runs over five states in both schemes (`test/a11y.test.ts`), inside the
  frame with the real theme loaded - `frame.html` now links `@openish/theme`, which also makes every
  other element test render the colours a reader sees. Contrast is measured directly
  (`test/contrast.test.ts`) because axe reports the sidebar's method chips as *incomplete*: it cannot
  resolve a background through nested shadow roots.
- **Mobile.** The sidebar was `display: none` under 48rem - hidden, still focusable, unreachable. It
  is a disclosure now, driven by `MediaQueryController` so the element renders a different thing
  rather than painting the same thing differently. `layout="classic"` is that same composition at any
  width, which is why it cost nothing to implement.
- **Bundle.** `scripts/measure-bundle.mjs`, numbers in the README - as a budget, not as a claim.
  openish is not trying to be a smaller API reference; it is trying to be one without Vue, and most
  of what it ships is Scalar's own Vue-free tooling on purpose. Of 285 kB gzipped, 176 kB is
  `@scalar/code-highlight` and 77 kB the parser, both shared with Scalar because they are the same
  code; openish's components plus Lit are under 20 kB. `@scalar/api-reference` is measured in a
  throwaway directory, because installing it here would put Vue in the graph and `guard:vue` would
  fail - correctly.
- **Docs.** `custom-elements.json` from `@custom-elements-manifest/analyzer`, and
  `packages/elements/README.md` generated from it by `scripts/docs-elements.mjs`. Writing that table
  by hand is writing a table that is wrong within a milestone.
- **Every block of code goes through `<openish-code-block>`.** Generated examples used to be a bare
  `<pre>`, so a model page and every request and response body rendered unhighlighted while the code
  sample beside them did not. There is one element for code now, and `languageForMediaType` picks
  the language - but only for an example the *author* wrote as a string, since anything openish
  generates is serialised as JSON whatever the media type claims.

**Two defects the sweep found, both invisible until measured:**
- **Dark-mode syntax colouring was 1.4–1.9:1.** `highlight.css` binds to JH *global* tokens, and a
  global does not re-point per scheme the way an alias does - the same trap the method palette had
  already been fixed for, in the same file that documents it. It restates itself under
  `.jh-theme-dark` now.
- **`@openish/theme/index.css` did not include the syntax hooks.** A host following the README got
  code blocks in body colour with nothing to suggest why. The default entry includes them now.

---

## M5 — code samples and search (done)

- **Core** gained `resolveOperationNode` (a node back to its operation and path item, read through
  the proxy) and `har/snippet.ts`. The client list is built from `@scalar/types`' `GROUPED_CLIENTS`,
  which is data, so the picker costs nothing; `generateSnippet` loads the `@scalar/snippetz` barrel
  and its forty-one plugins on demand — 28 KB gzipped, same argument as the ajv note in the README.
- **`openish-code-block`** highlights, labels, and copies. The copy button is absent where
  `navigator.clipboard` is (an insecure origin) rather than present and silently failing.
- **`openish-code-sample`** builds the request from the same reads the parameter table makes, so the
  sample and the table cannot disagree. Picking a client only dispatches `openish-client-change`;
  the root re-provides it, so every sample on the page follows and the choice survives navigation.
- **`openish-search`** is a `<dialog>` with `showModal()` — the platform already traps focus, closes
  on Escape, and renders in the top layer, and reimplementing that correctly is more code and worse.
  Added on top: the combobox pattern (focus stays in the field, `aria-activedescendant` moves), focus
  returned to whatever opened it, and `/` plus Cmd/Ctrl-K. Results are real anchors, so Enter and a
  click both go through the router's own interception.
- Matching lives in `src/search/search.ts` and is a pure function: every term must match something,
  and ties break by document order so one query always returns one list.

---

## M6 — hardening

- **Accessibility sweep.** Landmarks (`nav`, `main`), heading order, focus visible everywhere, the sidebar
  reachable and operable by keyboard, `prefers-reduced-motion` honoured (the sidebar toggle already does).
  Check both colour schemes against WCAG AA — the method palette was measured at M2 (4.8–5.2:1 light,
  5.5–5.8:1 dark) and should be re-measured if the palette moves.
- **Mobile.** The sidebar is `display: none` under 48rem today, which is a placeholder, not a design. It
  needs a real disclosure.
- **`layout="classic"`.** The property exists and currently renders as `modern`. Implement it as a
  different composition of the same primitives — single column, stacked — or drop the value if it earns
  nothing.
- **Bundle budget.** Record gzip size of `@openish/elements` + `@openish/core` and compare with
  `@scalar/api-reference`. The premise is "without the overhead", so the number belongs in the README.
- **Docs.** A published reference for every element's properties, slots, events, and CSS hooks. Consider
  emitting a `custom-elements.json` — it is what jh-ui does, and what tooling expects.

---

## The loop

At the end of every milestone:

1. `npm run verify` — guards, typecheck, tests.
2. `npm run dev -w @openish/playground`, click through the galaxy document, deep-link to a page and
   reload (that proves SPA fallback), toggle dark mode.
3. **Load the real reference document by hand** via the playground's file picker. It is the stress case —
   899 KB, 221 operations, 20 tags, 611 models — and it exists to surface what a small fixture cannot.
   Numbers to compare against, headless Chromium, `?url=`: M2 measured file → rendered page 2.7 s,
   navigation 0.5 s, 21 sidebar DOM elements for 853 navigation nodes, no console errors. M3 measured
   1.2 s to first render, 66 ms to a tag and 73 ms to an operation in-app, the same 21 sidebar
   elements, no console errors. A regression against those is a finding.
4. Anything it breaks becomes a small committed fixture, then a fix. Never encode its contents in a test.

### The panel is a client, not a section of the page

The first cut put the whole form on the page under the sample: server, seven auth schemes, every
parameter, the body, and an empty response panel, on every operation. It measured over two thousand
pixels on `createPlanet` and pushed the documented request body off the bottom of the screen.

Scalar's answer, which this now follows: the page gets **one button**, and everything a reader fills
in lives in a modal client behind it - a bar with the method, the URL and Send, the request as one
dense table of names and values, and the response beside it. The reasoning is the same in both
places: a reference is mostly read by people who are not calling the API in that minute, and a form
they are not filling in is noise with a border around it.

What that turned into here:

- **`rowStyles` in `styles/shared.ts`** - one key-and-value grammar for credentials, parameters, and
  the body, because they are the same kind of thing: a name and a value that will be on the wire.
  Borderless inputs inside a bordered table; a second border inside a cell was most of the noise.
- **One scheme at a time.** `<openish-auth-form>` picks from the alternatives rather than rendering
  all of them, which also stops a page from calling seven providers' well-known endpoints to render.
- **A cap on code blocks.** `--openish-code-max-height` (24rem), so a generated body that runs to a
  thousand lines scrolls in place instead of becoming the page.
- **The example is shown once.** With the panel present, `<openish-request-body>` documents the
  schema and leaves the example to the editor, which is the copy the reader can act on.


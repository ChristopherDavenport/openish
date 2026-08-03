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
| M13 document fidelity II | Done — named examples, per-operation security, callbacks, `externalDocs`, the rest of `info`, OAuth flows read-only, parameter serialization, `links` |
| M14 one layout | Done — `classic` removed, `layout` gone from the config and the element, samples in a column of their own on a wide page |
| M15 schema edges | Done — `contentMediaType`/`contentEncoding`, `dependentRequired`/`dependentSchemas`, `if`/`then`/`else`, and `$dynamicRef`/`$dynamicAnchor` in both the tree and the example |
| M16 design system | Done — one focus ring instead of sixteen, the six control states, semantic borders, selection as an edge, forced colors |
| M17 the continuous plane | Done — the whole document as one virtualised scroller, the URL following the reader, three columns every section shares, Copy for LLM |
| M18 the section index | Done — every section with a body uses both columns, and every header carries an index of what is inside it: operations, the events that declare its tag, the models that carry `x-tags` |
| M19 the descriptive column | Done — the introduction in two columns, `x-openish-aside` and section-level `x-codeSamples`, an `overview-aside` slot for the host, and a scroll correction that survives a page nobody is painting |
| M20 what the page says | Done — a count, an elided example and a `not` line that are true; two columns from 1103px rather than 1247px; overflow contained; per-operation `servers`, multipart `encoding`, and the rest of the Header Object |

`npm run verify` runs guards → typecheck → tests. Four guards: no Vue in the graph, no committed specs
outside the fixtures directory, no `outline: none`, and `lit-analyzer` over every template - the last
because `tsc` sees an `html` template as a string, so everything inside one was checked by nothing.
794 tests today across four projects: `core`, `client` and `elements-pure` in Node, `elements` in real
Chromium via Playwright (`npx playwright install chromium` once). `elements-pure` is
`packages/elements/test/pure/`, and the split is enforcement rather than speed - the URL and id maths,
the plane's scroll target, the convergence arithmetic and the OAuth flow precedence rules are pure
functions, and running them in Node is what keeps them that way. A `.browser.test.ts` suffix inside `packages/client/test` puts a file in the Chromium project
instead - that is where the two OAuth transports are tested, and the suffix is what keeps the rest of
that package honest about having no DOM. `npm run build` also regenerates `custom-elements.json` and
the element reference in `packages/elements/README.md`.

**What is not done, and is worth deciding on next:** localization, which touches every template, and
DPoP and PAR, which the Banno description mentions and no grant here implements. Both are big enough
to be their own milestone rather than a loose end. The obvious follow-on to M12 is `aggregate:
'merge'` — every document in one tree instead of one at a time — which namespaced ids have already
paid for, and which the plane makes more interesting: one scroller over several documents is the
same machinery with a longer section list.

M17 left two things open on purpose. The examples column no longer sticks, because sticky cannot be
made to work inside a transformed virtualiser item — recovering it means either a virtualiser that
positions with `top`, or drawing the pinning by hand. And the per-operation slots are scoped to the
active section, which is the least bad reading of a surface that assumed one operation on the page; a
render hook would be the honest replacement.

---

## Conventions, and why

**Properties down, events up.** No child mutates a parent. Cross-cutting changes are bubbling composed
`CustomEvent`s declared in `src/events.ts`, handled by `openish-api-reference`, which re-provides context.
The root re-dispatches what it handles, because some of it is the host's business — only the host can swap
the Jack Henry theme, which is declared at `:root`.

**Context carries the graph downward.** `documentContext` (the store) and `uiContext` (config, colour
scheme, selected client, base path) come from the root. `schemaContext` is the third, and the
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

**Only `--openish-*` in component CSS.** `packages/theme/css/tokens.css` gives every hook a value of
its own and `packages/theme/css/jh/tokens.css` is the single place they bind to Jack Henry alias tokens —
peers, not layers, and a consumer imports exactly one. `layout.css` is imported by both and holds the
measures openish owns outright. Two documented exceptions reach for JH *global* tokens because the alias
tier has no equivalent semantic: the HTTP method palette and the syntax-highlight palette. Both restate
themselves under `.jh-theme-dark`, because globals do not re-point per scheme — aliases do.

**Hooks name concepts, not values.** A border is `decorative`, `control`, `action` or `selected` by what
it separates; focus is `--openish-focus-ring-{color,style,width,offset}`, the parts an `outline` takes.
That is what makes the binding possible at all, and it is also the test of whether a new hook belongs:
if it can only be described by what it looks like, it is a value and does not go here.

**A state that has to survive a bad screen is not a colour.** Hover and active are a tint mixed from
`currentColor`, so one pair of values works on all three button looks in both schemes with nothing for a
binding to re-point — but a tint is a few percent of lightness, so anything that must be *read* rather
than felt carries a shape too: selection is an edge, focus is a ring, a pressed control gets both.

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

**No backticks inside a `css` or `html` tagged template.** Not even in a comment, and not inside an
HTML comment in a template either: the template literal ends at the first one, and esbuild reports it
as a syntax error dozens of lines later, pointing at whatever word followed. This has now cost eight
comments across the project, five of them in M16 alone and every one of them written *after* this
warning was already here - which is the actual lesson. It is not a thing anyone remembers while
writing prose about `--openish-*` hooks. `npm run typecheck` catches it in a second and names the
line, so run it before reaching for a browser to find out why a page is blank.

**The element fills its container.** `:host { height: 100% }` is load-bearing: break the height chain
anywhere above it and the reference is as tall as its content, so nothing inside scrolls on its own -
the sidebar, and on a narrow viewport the navigation disclosure, scroll off the top with the page and
there is no way back to them. The playground broke it with a plain `<div id="app">` between `body`
and the element and nobody noticed for six milestones, because `test/frame.html` had the same gap.
Both give the element a height now, the menu is `position: sticky` so it survives a host that does
not, and the README says so.

**A state you can only see while it is happening cannot be measured afterwards.** The first focus
sweep collected every tab stop and then asked each one whether it had a ring - and every one answered
no, correctly, because focus had moved on. Measure inside the walk. The same shape of mistake is
waiting in any test about `:hover`, `:active`, or a transition.

**`:focus-visible` is about how focus arrived.** A programmatic `.focus()` does not produce it, so a
test that focuses elements itself passes against a stylesheet with no focus rule in it at all. Drive
it with `userEvent.keyboard('{Tab}')`.

**A transparent inset `box-shadow` does not make a gap.** It reveals the shadow painted *under* it,
not the element's fill - so a ring with distance from the edge cannot be built out of insets alone.
The alternatives both cost something real: an `outline` with a negative offset competes with the focus
ring for the single outline slot, and a pseudo-element does not render on `<select>`.

**`instanceof` lies across realms.** The harness frame has its own copy of every DOM constructor, so
`rule instanceof CSSStyleRule` against a stylesheet belonging to the frame matches nothing and the
test reports an empty result rather than an error. Duck-type: `'selectorText' in rule`.

**CDP input coordinates are not in the tester's space.** Vitest runs the test file inside an iframe of
an orchestrator page, so `Input.dispatchMouseEvent` at a rect read from the tester's viewport lands
somewhere else entirely - the press appears to do nothing and the failure looks like a CSS bug.
`Emulation.*` is fine, because it is page-wide; input is not. Anything needing a real press belongs in
a Playwright script run against `npm run dev`, not in this suite.

**The design system's site runs ahead of its package.** `jackhenry.design` documented the whole border
concept tier and `@jack-henry/jh-core@1.6.1` ships none of it - no `--jh-border-{concept}-*`, and no
disabled alias either. Write every binding as `var(--jh-…, <the alias that does ship>)` and check the
installed CSS before believing a token name, however well documented it is.

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
- `cdp()` (`vitest/browser`) reaches Chromium for page-wide emulation - `forced-colors.test.ts` drives
  the mode that way, and the Playwright provider's type augmentation has to be in `types` in
  `tsconfig.test.json` or `CDPSession` has no `send`.

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
  rather than painting the same thing differently. *(Corrected at M20: still JavaScript, still a
  different tree, but it measures the element rather than the window - see below. `MediaQueryController`
  is gone.)* (`layout="classic"` was that same composition at
  any width; M14 removed it, because "the narrow composition on purpose" is a debugging affordance,
  not a design.)
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
  nothing. *(Resolved at M14: dropped.)*
- **Bundle budget.** Record gzip size of `@openish/elements` + `@openish/core` and compare with
  `@scalar/api-reference`. The premise is "without the overhead", so the number belongs in the README.
- **Docs.** A published reference for every element's properties, slots, events, and CSS hooks. Consider
  emitting a `custom-elements.json` — it is what jh-ui does, and what tooling expects.

---

## M13 — document fidelity II (done)

Everything in this milestone was already in the store and not on the page. That is the shape to look
for: the parser has been right for a long time, and the gaps are in what the renderer says out loud.

- **Named examples.** `mediaTypeExamples` in core, a picker in `<openish-schema-preview>`. The old
  reader took `Object.values(examples)[0].value` and discarded the author's names, summaries,
  descriptions and `externalValue`. An external example is **linked, not fetched** - a documentation
  page that issues a request the reader did not ask for has decided something about their network on
  their behalf.
- **Per-operation security.** `securityRequirements()` has been correct since M7 and was consumed
  only by the try-it panel. The page now says which alternatives satisfy an operation, which schemes
  go together, and which scopes each asks for - including "required, but this document never declares
  it", which the reference document in this repo needs.
- **Callbacks**, behind a disclosure, rendered by the same parameter/body/response elements the
  operation itself uses. A callback *is* an operation; only the two levels of key above it are new.
- **`externalDocs`** at all four levels, **the rest of `info`** (summary, contact, licence, terms),
  and **OAuth flows read-only** - `describeSecurityScheme` answered `oauth2` with the bare string
  `OAuth 2.0`, so the flows, endpoints and scope descriptions existed only inside the auth *form*,
  which a reader who is not signing in never opens.
- **Parameter serialization.** `style`, `explode`, `allowReserved`, `allowEmptyValue`, parameter-level
  examples, and a type for a `content`-described parameter, which used to render an empty cell.
- **`links`**, which neither Redoc nor Scalar renders. It is the only thing in OpenAPI that says how
  two operations join up, and that is probably why so few documents bother writing one.

Two things worth keeping from the sweep:

- **A hand-built `{ $ref }` does not resolve.** Inferring `oneOf` variants from `discriminator.mapping`
  needs the *schema*, and building a reference object to get one produced a branch that rendered its
  name and nothing else - `getResolvedRef` reads a property the magic proxy installs, and an object
  made here has never been through the proxy. `resolveLocalPointer` walks the document by key
  instead, which keeps every value proxied. This is the same trap as the identity one at the top of
  this file, from the other direction.
- **The settle loop needed three stable passes, not one.** Six new test files pushed the browser
  suite past what one unchanged pass could distinguish from a half-built tree: a full run failed
  twelve to twenty-four assertions, a different set every time, while every file passed alone. See
  `STABLE_PASSES` in `test/helpers.ts` for the measurements.

## M15 — the JSON Schema edges (done)

The keywords a 3.1 document may use that M13 left out. Three were pure rendering; the fourth was not.

- **`contentMediaType` / `contentEncoding`.** `{ type: 'string', contentMediaType: 'image/png',
  contentEncoding: 'base64' }` is a PNG, and rendering it as `string` tells the reader to send the
  wrong thing.
- **`dependentRequired` / `dependentSchemas`.** The first is prose - a property that becomes required
  given another one - and joins the constraint line. The second attaches a whole schema, so it needs
  the renderer.
- **`if` / `then` / `else`,** as the rule the author meant rather than three anonymous schemas. The
  condition is summarised only where it is a plain discriminant on one property, which is nearly
  every real use; anything more involved renders the `if` schema in full rather than being
  paraphrased into something that might not be true.
- **`$dynamicRef` / `$dynamicAnchor`.** Worth being precise about: **the Scalar core this project
  shares does not do this.** The parser's only mention is swapping `$dynamicRef` for `$ref` in its
  own v3.2 meta-schema for AJV; Scalar's real support lives in `@scalar/workspace-store`, which is
  Vue-tainted and therefore out of reach. So this one is ours.

  It is the one place the renderer needs the **dynamic** scope rather than the lexical one, which is
  why the anchors travel through `schemaContext` beside the `$ref` path: `PaginatedResource` declares
  `itemType` as an unbound placeholder and cannot know what it is, while `PaginatedPlanets` above it
  binds the same name to `Planet`. The outermost binding wins, so a name already in scope is kept.

Two things worth keeping:

- **Anchors compare by name, never by identity.** `sameState` is a `hasChanged` hook, and the magic
  proxy hands back a fresh wrapper for the same `$defs` entry on every read - comparing the schemas
  would report "changed" every update and put the element in a re-render loop. Same trap as the cycle
  guard, from the other end.
- **The example generator needed it too.** `schemaExample` tracks the dynamic scope the same way, or
  the tree said `Planet[]` while the example beside it said `[{}]` - two answers to one question, on
  one page. On the galaxy document it now generates the whole planet.

## M14 — one layout (done)

`layout` is gone: the property, the config key, the `Layout` type, and the `classic` value with them.

- **`classic` was never a design.** It rendered the narrow-viewport composition at full width, which
  is a debugging affordance with a config key on it. Scalar's `classic` is a Swagger-UI accordion and
  shares nothing with it but the name, so the value was also actively misleading to anyone moving
  over. Nothing consumed `uiContext.layout` - the removal was a deletion, not a refactor.
- **Three width bands, two mechanisms.** The navigation switch stays in JavaScript, because it
  changes the element *tree* - a sidebar becomes a disclosure, and a hidden tree that is still
  focusable was the M6 bug. The examples column is the same DOM in a different place, so it is a
  **container query** on the content pane, which is also the only correct thing: the pane's width
  depends on whether the sidebar is showing, and a media query cannot see that. *(M20: the first half
  was a media query until then, which had the same blind spot for the same reason - it is
  `ElementWidthController` now, and the threshold moved from 56rem to 48rem.)*
- **The seam already existed.** `<openish-schema-preview>` has taken `no-example` since M6, so the
  try-it editor could own the request body's example. `<openish-response-list>` gained the same
  property and the same threading through `renderMediaTypes`, and that is the whole of moving
  response examples out of the documentation column.

## M16 — the design system's concepts, not its components (done)

The Jack Henry binding was complete for colour, space, radius and type — the foundations that map onto
CSS values. The ones that are *rules* had never come across, and the gap showed as drift rather than as
anything missing: sixteen components each drew their own focus ring, and the copies had already diverged
before anyone read all sixteen.

`@jack-henry/jh-ui` is still not a dependency and nothing here imports it. What was adopted is the
vocabulary.

- **One focus ring, drawn as an `outline`.** It was `outline: none` plus a `box-shadow` in sixteen
  places — some adding a radius, some not, the table cells drawing a different shape entirely. Now one
  rule in `baseStyles`, reaching all 27 elements. An outline follows `border-radius` without being told
  the radius, which is why every copy had to repeat one, and it is painted in forced-colors mode, where
  a shadow is dropped and the ring simply was not there. An element that sits flush inside something
  that clips redeclares `--openish-focus-ring-offset` on itself; nothing removes the ring, and
  `npm run guard:focus` fails the build on `outline: none` anywhere in component source. **The guard is
  the point.** The values were never wrong — the sixteenth copy was.

- **The six control states, declared once.** openish had two and a half: focus everywhere, hover in
  seven files of twenty-seven, `:active` in none at all, and `[disabled]` styled in one file while
  `<openish-download>` set the attribute with no styling behind it. `controlStyles` now declares
  enabled / hover / focus / active / disabled / pending, and appearance deliberately stays with the
  component — openish has three button looks and which one a control wears is a fact about the surface
  under it, not about the state it is in.

- **Selection is an edge.** The open tab and the current sidebar row had a fill, a colour and a weight
  change; a control being pressed had a tint. All three are a few percent of lightness, which is the
  first thing to go on a dim screen or under a finger. They carry `--openish-border-selected-*` now,
  with the space reserved on the unselected siblings so selecting something moves nothing beside it.

- **Three real gaps, as opposed to drift.** The sidebar tree moved an `aria-activedescendant` cursor
  that *nothing drew* — arrowing through six hundred rows moved an invisible position. Search options
  were in the tab order, which is not the combobox pattern. Neither dialog opener declared
  `aria-haspopup`. The `<kbd>/</kbd>` in the search trigger was hard-coded while the hotkey was
  configurable.

- **Forced colors, which had no coverage at all.** The ring survives now because it is an outline;
  method chips keep a border, the current row keeps a rule, error panels keep an edge. Everything else
  on the page already carried its meaning in words — a chip says `GET`, a required field says
  "Required" — so the reader's palette simply replaces ours.

### Two decisions worth not relitigating

**The pressed ring is `currentColor`, not the selected colour.** `--openish-color-accent` and
`--openish-border-selected-color` are the same blue on purpose — one idea, two names — so a
selected-coloured ring inside the primary button, whose fill *is* that blue, was invisible. The one
control on the page whose press most needs acknowledging was the only one showing nothing. Drawing from
the control's own text colour is the same self-correcting move the tint makes, and it cannot collide
with a fill because it is the colour chosen to read against that fill.

There is no gap between the ring and the edge, and that was tested rather than assumed: `box-shadow`
cannot express one (a transparent inset reveals the shadow beneath it, not the fill), an `outline` with
a negative offset competes with the focus ring for the single outline slot when a button is activated
from the keyboard, and a pseudo-element does not render on `<select>`, so selects would silently drop
out of the state model. Flush is the only form that covers every control identically.

**`--openish-border-action-color` is neutral, and does not take the JH token.** Copy, Download,
Authorize and Close are all on an operation page at once; a dozen blue-edged buttons around a document
reads as a form. It stays a hook separate from `control` so a host who wants them to read as actions can
say so in one declaration. This is the one border concept where openish's answer is about what it is —
a reference someone reads — rather than about brand.

### What the tokens could not say

`@jack-henry/jh-core@1.6.1` ships **no `--jh-border-{concept}-{color,width,style}` and no disabled
alias**; the site's borders foundation is ahead of the package. Every binding is therefore written
`var(--jh-border-selected-color, var(--jh-color-content-brand-enabled))` — the fallback is what renders
today and the binding upgrades itself when the tokens land, with no code change. `--openish-border-error-*`
was declared and then removed: nothing in openish renders an invalid control, and a hook nothing reads is
a hook that silently does nothing when a host overrides it.

### Checked, not asserted

`focus.test.ts` tabs through three pages with real key presses and measures the ring **at each stop**,
because the ring only exists while the element has it. `selection.test.ts` measures the two persistent
selections and reads the pressed rule. `forced-colors.test.ts` drives Chromium into the mode over CDP.
`contrast.test.ts` gained the 3:1 non-text floor for the ring against every surface it can land on, and
for the borders that carry meaning — the ring was a translucent shadow before, which is the one form of
it that cannot be checked by eye.

## M17 — the continuous plane (done)

The reference rendered one node at a time, so every navigation destroyed the page and built another.
Scalar and Stripe render the whole document as one scroller and let the reader move through it. This
is that, plus the geometry that only makes sense once it is true.

`<openish-api-reference>` renders every section of the active document through `@lit-labs/virtualizer`
- which was already a dependency, carrying the sidebar. Column geometry moved out of
`<openish-operation>` into `planeColumnStyles`, imported by all four page elements, so the tracks land
in the same place on every section instead of the layout changing under the reader as they navigate.

### Four things that cost real time

**The virtualiser cached the wrong scroller.** It works out which ancestor clips it once, in
`connected()`, and the `virtualize` directive connects while the template is still committing - when
the plane has no ancestors to walk. It found none, fell back to scrolling the document, and every
deep link rendered the right section while leaving the reader at the top of the page, with no error
anywhere. `SectionsController.hostUpdated` reconnects it once the element is in the tree.

**Scrolling follows the *resolved* target, not the active id.** A deep link asks for its section
before the document has arrived, so the id in the URL is final several updates before it resolves to
anything - and watching the id alone meant the one update that could have scrolled was the one where
nothing had changed.

**`layoutComplete` only resolves when a reflow is pending.** Waiting on it worked for a deep link and
hung forever for a reader editing the fragment of a settled page. The jump still waits for it, because
a pin is only worth setting once the layout can place it; the convergence loop starts immediately and
independently and can reach any section on its own, which makes the pin an optimisation rather than
the mechanism.

**The mute lasts until the scroll stops, not until the target is first seen.** Those are different
moments - the sections passed over on the way each announce themselves - so lifting on the first match
let a later one through and the URL named the section above the one that was asked for.

### The convergence loop, and why the pin is not enough

`element(index).scrollIntoView()` hands the layout a pin, which re-anchors until the target stops
moving. Any scroll unpins it, and the first correction *is* a scroll. Worse, an estimate built from a
handful of tall operations guesses a section two thirds down to be past the end, so the scroll clamps
at the bottom and the layout settles with an empty range waiting for an event that will never come.

So the loop measures off the DOM. When the target is rendered it closes the gap directly; when it is
not, it walks towards it by what the *rendered* ids say the distance is worth - the gap in indices
times the mean section height - never by asking the same estimate again. It ends on eight quiet
frames, because a section is not finished when it stops moving the first time: its prose and
highlighting arrive on their own schedule.

The step used to be one viewport a frame, which is safe and, on a real document, too slow to arrive:
from the bottom of six hundred models back to the overview is a hundred thousand pixels and the loop
is allowed ninety frames, so the walk stopped in the middle of the document and the spy then wrote
*that* into the URL. A mean height is a poor description of any one section and a good one of a
hundred of them, and each jump measures more of the document, so the next estimate is better than the
last: the same distance now closes in a handful of frames.

### A heading is not a section, and the plane only renders sections

Headings lifted out of `info.description` are navigation entries with no section of their own - the
overview renders them and stamps their ids - so scrolling to one had always been the overview's own
job. On a plane it can only do that job while it happens to be mounted, and from anywhere further
down the document it is not: the URL changed, the sidebar moved, and the page did not, which is the
worst of the three possible outcomes because it looks like nothing was clicked.

`SectionsController.scrollTo` takes the pair instead - the section to mount, and the heading inside it
to stop at - and the convergence loop measures the heading rather than the top of the section. A
heading that has not rendered yet is the ordinary state for the first frames, since the prose arrives
with the markdown pipeline, so those frames aim at the section and are not counted as quiet ones. The
root pairs them the same way in `#scrolledId`: two headings of one section resolve to the same section
id, and keying "already been there" on that alone made the second of them a click the plane ignored.

### Sticky is not available inside a virtualised item

The examples column used to stay beside a long schema. It cannot now: the virtualiser moves each
section with a transform, and sticky is resolved from layout position against a real scroll offset,
so far down the document the browser clamps the element to the bottom of its containing block - the
sample seventeen hundred pixels below its own title.

This was spiked *before* the plane was built and the spike passed. It scrolled three hundred pixels,
and the divergence is proportional to the offset. **A spike that exercises a mechanism at a scale the
real thing will not run at is not evidence about the real thing.** The test asserts both ends now.

### Three tests were passing for the wrong reason

The plane exposed them rather than breaking them. `showOperationId` was measured from a tag's index
page, which has no operation on it, so the half asserting an absence could not fail - it governs the
navigation. A webhook test named an id the document does not mint and matched its own title in the
sidebar. The target-size test measured boxes *after* tabbing had scrolled the elements out of the
rendered range, so it was reading zeros; it measures at each stop now, which is the rule the focus
ring in the same file has always followed.

### Measured

The reference document, 899 KB, 221 operations, 20 tags, 611 models, 853 navigation nodes, headless
Chromium at 1680x1000, served through `/@fs/`:

| | M14 | M17 |
|---|---|---|
| First render | 320 ms | **388-409 ms** (warm; ~110 ms of it is the document arriving to the first section painted) |
| Navigate to a tag | 18 ms | **45 ms** |
| Navigate to Models, at the far end | 26 ms | **98 ms** |
| Deep link to Models, ten runs | n/a | **0 px from the top, ten out of ten** |
| Sections in the DOM at rest | 1 page | **1-5 of 853** |
| Sidebar elements | 21 | **21** |
| Memory after scrolling the entire document | n/a | **40 MB** |
| Console errors | none | none |

First render is about 70 ms slower and navigation is two to four times slower in absolute terms -
both are the price of a scroll that lands accurately rather than a page that is replaced. The
eviction window designed as a contingency for a plane that never unmounts is **not needed**: the
virtualiser recycles, and 40 MB after traversing the whole document is nowhere near the 1.5 GB
threshold that would have justified it.

## M18 — the section index (done)

The examples column stopped at the sections that were not operations: a model and a webhook rendered
their one instance in the documentation column, and a tag header had no right-hand column at all.
This is the other half of M17's geometry - **what describes goes left, what is an instance of it goes
right, and what a section contains goes right too** - and the first thing openish does with a fact
the document has always carried and no reference has ever shown: which tag an event belongs to.

### Every section with a body uses both columns

The columns were an operation's idea and the plane made them the document's. A model and a webhook
kept rendering their one instance in the documentation column, under the schema it is an instance of,
which was the only place for it when each was a page of its own. Stacked into one scroller it read as
a fault: the right-hand band ran down the page and then stopped dead at Webhooks and Models, which on
the reference document is six hundred and eleven sections of empty column.

Both were already on `planeColumnStyles` and neither needed a new mechanism. `<openish-model>` splits
into `.docs` and `.examples` the way `<openish-operation>` does, and a webhook's payload moves across
on `<openish-request-body examples-only>` - the mirror of the `examples-only` `<openish-response-list>`
has had since M14, through the same `noSchema` seam in `renderMediaTypes`. The split
is by kind, not by section, so it does not matter that a webhook's instance is a body it *receives*
rather than a call it sends.

One rule differs from the operation's, deliberately: the model zeroes the first child's top margin
only inside the container query. The operation's columns both start with a section that has its own
spacing above it; the model's example is a heading, and stacked it needs that margin to stay off the
tree above it. `Section.hasExample` is `true` for every `page` now, which is what it was actually
asking all along.

Moving the payload across also exposed a heading with nothing under it. `examples-only` drops the
responses that carry no body - a `204` is a complete answer in the documentation column and an empty
tab here - but the section around it was written whenever `responses` existed at all, so an operation
that answers `200 OK` and nothing else printed "Response examples" over a blank half-page. It had
been true since M14 and was invisible while every such section had a request sample above it; on a
webhook it was the only thing in the column. `hasRenderableContent` is the one predicate both the
section and the filter ask now.

### A tag can be named from outside itself

An operation belongs to a tag because it says so, and the traversal has always read that. Two other
things in a document can say the same and were being thrown away:

- **A webhook's `tags`.** A webhook entry is a Path Item and its `post` is an ordinary Operation
  Object, so this is the standard field, not an extension - `@scalar/galaxy` tags `newPlanet` with
  `Planets` and openish showed it under Webhooks and nowhere else.
- **A schema's `x-tags`.** JSON Schema has no `tags` keyword and OpenAPI adds none, so there is
  nothing standard to read; `x-tags` is Redoc's convention and the one every tool that groups models
  by tag uses. It joins the family openish already honours - `x-displayName`, `x-tagGroups`,
  `x-internal`, `x-codeSamples`.

Both are read by one function, `declaredTags`, which drops anything that is not a usable name:
`tags: [null]` and `tags: []` are a document saying nothing, and a bucket keyed on the empty string
would collect them into a tag that does not exist.

**Neither moves the node.** The tags travel with it and the node stays where the traversal put it, so
a webhook that gains a `tags:` line keeps its id, its place under Webhooks, and every link anyone
ever made to it. The index is *links*, not sections - which is also why this needed no change to the
plane, the router, or `documentSections`.

### The index is in the right-hand column, and bounded

Before the plane a tag listed its children above the fold, because that list was the only way to
reach them. M17 took it away, correctly: on a plane those children follow the header down the page,
so the list was the same links twice and, for Models, six hundred of them between the reader and the
first model.

In the examples column it is a table of contents rather than a wall - out of the reading order, level
with the prose, and the only place from which the events and models that name this tag can be reached
at all. Rows are `jh-list-item`'s anatomy through openish's hooks: the method chip in the leading
slot, the name as primary text, the route as right-aligned primary metadata, dividers between rows
rather than gaps, and the six control states from `controlStyles`. The row for the section the reader
is on wears the same fill and inside edge the sidebar row does, because it is the same fact.

**The cap is the part that matters.** Six hundred and eleven rows is a section thirty-four thousand
pixels tall, and the reader who scrolls past the Models heading scrolls all of it - M17's wall,
rebuilt one column over. So the list is bounded at `min(70vh, 40rem)` and scrolls inside itself, with
`overscroll-behavior: contain` so reaching its end does not set the whole plane moving. A tag with six
operations never reaches the cap and is six operations tall.

`no-index` is gone from `<openish-tag-section>`, and it is the one thing a host has to notice. It
existed so the plane could suppress a list that only made sense on a page of its own; there is now one
answer for both, and it is the same element in the same column either way.

### Two things the tabs made honest

`<openish-tabs>` renders a panel's content inside **its own** shadow root, so a template handed to
`content` arrives unstyled - the list had to become `<openish-section-list>` before a single rule
applied to it. That is the rule, not the exception: everything that goes through a `content` callback
is a component or it is unstyled.

And the convergence loop turned out to be running on a budget measured against short headers. A test
that measured where a jump landed came back 1,416 px out - reproducibly under a loaded suite, never
when run alone - and there were two faults behind the one number:

- The test asked *mid-flight*. A jump is corrected over several frames and `settle` waits for one
  render, so what it measured depended on how tall the sections happened to be. `settleScroll` waits
  for the scroller to hold still, before the jump as well as after: a deep link is itself a
  convergence, and asking for a second one while the first is still running leaves two loops
  correcting towards different sections.
- `CONVERGE_FRAMES` was **90**, and the walk spends one frame per step. Headers that are now seven
  hundred pixels tall spend more of them, and on a loaded machine the loop hit the cap mid-correction
  and stopped - which to a reader is the plane ignoring their click. At 300 the suite is green five
  runs out of five; at 90 it failed two out of three. The cap costs nothing when nothing is wrong,
  because the loop still ends on eight quiet frames.

## M19 — the column on a section that generates nothing for it (done)

M18 filled the examples column wherever openish could build something to put there: a request, a
payload, an instance of a schema, an index of what a section contains. What it could not do was fill
it on the sections whose authors have the most to say - the introduction, and a tag whose whole
content is prose. Three ways in, and they are complementary rather than alternatives.

### The introduction already had a tenant

Servers, authentication, contact and the download button were always facts a reader *acts* on rather
than prose about what the API is, and they were stacked under the description because there was
nowhere else to put them. Moving them into the column makes the introduction read like every other
section, and it needed no new API at all.

The column is a grid with a gap rather than a stack of margins, and that is not a preference. Its
first child is a `<slot>` - `display: contents` - so a rule about the first child lands on something
that is not there, and a margin on whatever follows collapses out through a column that has no
padding and moves the column instead. Grid items' margins do not collapse, and an unfilled slot
contributes no item, so the spacing is the same whether a host slotted anything in or not.

Condensed, the right column goes under the left in full, on every section kind. There is no ordering
rule anywhere: two children of a one-column grid are read in the order they were written, and that
order is the section described and then what to do about it.

### What the document says: `x-openish-aside`, and samples that are not an operation's

`authorSamples` never actually needed an operation - every read inside it was against a bag of keys -
so `x-codeSamples` on `info` or on a Tag Object is read by the same function, with the same seven
spellings, the same language labels and the same picker rules. An author who has written one for an
operation has already learnt this.

The prose half is `x-openish-aside`, and it is the one extension here that is namespaced. The others
openish reads - `x-codeSamples`, `x-tags`, `x-displayName`, `x-tagGroups`, `x-internal` - are
conventions several tools share, so openish honours the spelling that exists. This one has no
convention to honour, because no other reference has a column to put it in, and a plain name would be
squatting on something another tool may want.

Both are markdown-and-code rather than a widget, both are demoted to sit under the section's own
title, and both travel with **Copy for LLM** - they are the document talking, and a copy that dropped
them would be missing the part the author added by hand. `declarationFor` is what the page and the
markdown export share: two answers to "which Tag Object is this section" is one too many.

### What the host says: one slot, because there is one introduction

`overview-aside` is the only per-section slot on the plane that needs no scoping. Every other one has
the problem M17 hit - one name, many sections, one shadow root, and only the first in tree order is
assigned the host's nodes - and a document has exactly one introduction, so this one is unambiguous
by construction. It is where a host puts what the document cannot know: a signup link, a sandbox
notice, its own components. It cannot travel with Copy for LLM, and should not: openish has no way to
serialise someone else's DOM and guessing at its text would be worse than the omission.

For every *other* section the honest surface is still the render hook M17 flagged, and it is still
its own milestone, because the thing that makes it worth doing is that it also retires the four
per-operation slots.

### A correction that only lives on frames does not live in a background tab

Two real faults came out of one flaky test, and they are worth separating from the test noise around
them.

- **The pin fires after the loop has finished.** `element(index).scrollIntoView()` is queued behind
  `layoutComplete`, and on a long jump that promise settles after the convergence loop has run out of
  corrections. The plane then moves *once more* after everything watching it has stopped, and stays
  there. The loop is started again behind the pin now, with the previous run's frames cancelled first.
- **`requestAnimationFrame` is not a clock.** A page that is not being painted gets no frames, and
  every correction openish makes was scheduled on one - so a reference resolving a deep link in a tab
  the reader has not switched to yet sat wherever the estimate left it. The scheduler races a frame
  against a 32 ms timer and cancels the loser: sixty corrections a second while someone is looking,
  thirty-odd when nobody is, the same answer either way.

The test noise is worth recording too, because it cost more than the faults did. A wait that outlives
the runner's own timeout reports as **"Test timed out"**, not as the assertion it was waiting for - so
a 15-second settle inside a 15-second test looked for three runs like a plane that never arrived.

## M20 — what the page says (done)

Not a feature. A read of the rendered document against the source, asking what a reader is actually
being told, and it found three kinds of thing: places the page stated something untrue, layout that
cost a reader content, and content the parser had in hand and never drew. Print and find-in-page -
the real bill for the virtualised plane - were left out on purpose and are still their own milestone.

### Three things that were not true

Ranked first because a reader cannot tell they are being misled, which is the one class of defect
that gets worse the more the page is trusted.

- **A cap reported as a total.** `searchNodes` sliced to twenty and returned an array, so the dialog
  announced `20 results` for a query a hundred and thirty-seven nodes matched - to a screen reader as
  well, in the live region. It returns `{ results, total }` now, which is the shape the bug was made
  of: the limit is applied inside the function and a caller holding only the sliced list has no way
  to know it was sliced. **This changed a public export**, and deliberately - the old signature could
  not express the truth.
- **`null` where the walk gave up.** `schemaExample` emitted `null` at the depth cap, at a `$ref`
  cycle and at the object-identity guard, which in the JSON a reader pastes into curl is
  indistinguishable from a field that really is null - and `parent` on a self-referential `Node` is
  never null, it is another Node. It writes `"… (Node)"` and `"…"` now, carrying the name where a
  pointer knows it. The property tree had said `Recursive — see Node` at the same two places since
  M4; only the example lacked the vocabulary.
- **A line pointing at nothing.** `not` rendered `not the schema below` whenever the excluded schema
  had no one-word type label, and nothing rendered the schema below. It goes in the same `.rule`
  grammar `if`/`then`/`else` and `dependentSchemas` use. Two shapes have neither a type to name nor a
  body to draw and are said in words instead: a bare `required` list - the commonest real `not`, and
  it means the properties must not appear *together* - and `not: {}`, which excludes everything.

### The band the threshold actually fell in

The two-column arrangement is a container query at what was 56rem, and the container is the window
less the sidebar less the section's gutters: 18rem + 2 × 1.5rem + the scroller ≈ 21.9rem of overhead,
so it wanted about **1247px of viewport**. Past a browser windowed to 1200. Past a 1152px screen.
Every one of those readers got the arrangement the layout exists to avoid - the sample a screen below
the parameters it demonstrates - and the suite was equally happy either way, because `layout.test.ts`
tested 820 and 1600 and stepped straight over the cliff.

48rem, and a 1rem gutter instead of 1.5rem, puts it at about **1103px**. 1024 is still one column on
purpose: 43rem of content divided in two is two columns of twenty-one, which is narrower than either
half is worth. The test asserts all four widths, including the one that must *not* split.

**A grid max-track does not yield.** The first attempt gave the sidebar `minmax(13rem, 18rem)` on the
theory that the navigation should give way before the content does. It does not: with
`minmax(0, 1fr)` beside it the sidebar sizes to its max and the content absorbs the whole loss. The
levers that actually move this number are the threshold and the gutter.

### Where a section's second column goes is one decision

`56rem` was written in five files - `shared.ts` and then once per page element, each naming its own
right-hand column (`.examples`, `.examples`, `.facts`, `.index`) - and a container condition cannot
take a `var()`, so the literal could not be tokenised out. It is one rule in `planeColumnStyles` now,
`:is()` over the four names.

It has to be matched **through the parent**. A section's own stylesheet comes after the shared
fragment in `static styles`, so a bare `.examples` here loses to the `margin-top` the stacked
arrangement needs - equal specificity, later in the cascade - and the examples column lands 32px
below the title it is supposed to start level with. `.columns > :is(...)` is both a specificity fix
and simply true.

### Overflow had nowhere to go

`main` declared `overflow-y: auto` and nothing about x, which per spec computes `overflow-x` to
`auto` as well - so one long line anywhere in the document did not overflow its own column, it put a
horizontal scrollbar under the whole page. The property tree was the source: `margin-left` **plus**
`padding-left` per level, cumulative, uncapped, twelve levels deep - eighteen rems of a twenty-three
rem column spent on indentation before a property name was drawn.

Three changes, in the order that matters: the indent step narrows to the border after four levels,
names and types and constraints break anywhere, and only then `overflow-x: hidden` as the backstop.
Tables and code blocks keep their own scrollers and their own focus rings; this is for what should
have wrapped instead.

**A test on a clipping box cannot fail.** The first version of that assertion measured
`main.scrollWidth - main.clientWidth`, which is zero by construction once the box clips - it was
asserting that hidden means hidden. It measures `.section`, which has no overflow rule of its own.
Confirmed by putting the faults back: 372px of overflow at 380px wide.

### The switch was asking the wrong element

The navigation stacked on `(max-width: 48rem)` - the *window*. A host that puts a reference in a
600px column of a wide page had a narrow reference on a wide viewport, and got the 18rem sidebar and
whatever was left. `MediaQueryController` is replaced by `ElementWidthController`, a `ResizeObserver`
on the host: same argument as before about deciding in JavaScript so the element renders a different
*thing*, only now it measures the thing being laid out. It measures once on connect as well as
observing, or the first render is the wide arrangement and the reader watches the sidebar arrive and
leave. Rems, not pixels, so a reader who has scaled their text moves all the thresholds together.

### Servers below the document

The one item here that was not an omission but a wrong answer on the page. OpenAPI declares `servers`
at three levels and the innermost wins; openish read `operation.servers` only inside the HAR builder,
and then `options.server` - which the element layer sets on **every** call, from the document's own
list - overrode it on the next line. `pathItem.servers` was read nowhere at all. So an upload
endpoint on its own host got a curl command against the wrong origin, and try-it *sent* there.

`operationServer(pathItem, operation)` is the one answer, and it beats the reader's pick rather than
losing to it: the picker offers the document's servers, and an operation that declares its own is
saying it is not on any of them. Where it applies, the header prints it into the path - one URL,
because that is the thing being said - and the sample, the panel and the header cannot disagree.

### What the objects were already carrying

Four smaller ones, all the same shape: the parser had it and the renderer dropped it.

- **`encoding`** was read nowhere, so a `multipart/form-data` body rendered as a plain object - the
  one fact needed to build the request, that `scan` is a PNG and not a string, was the one fact
  missing. `mediaTypeEncoding` in core, a Parts table under the body. An entry that says nothing
  earns no row, because a generator that writes `encoding: { file: {} }` for every property would
  otherwise fill the table with nothing.
- **The Header Object** declared `required` and `deprecated` in the local type and rendered neither,
  and ignored its examples. "Always sent" rather than "required": on a *response* header it is a
  promise the server makes, and the parameter table two sections up uses the word for the other
  meaning. The example list moved to `render/example-list.ts` rather than being copied - a parameter
  and a response header carry examples in the same shape, which is why `mediaTypeExamples` already
  read both.
- **`additionalProperties: false`** rendered nothing, because only the object form was handled - so a
  closed object and an open one looked identical, which is often the whole contract. It is a
  constraint line, by the rule `schemaConstraints` already states: only what changes what a caller
  may send.
- **`format` on a `$ref`** was dropped by a `named === undefined` guard, which is exactly where a
  document puts it - a scalar worth naming is a scalar with a format. Kept unless the name already
  says it. And **`title`** on an inline object is used as its label, where the label would otherwise
  be the bare word `object`.

### Four traps, none of them interesting

Written down because each cost a build and none of them will announce itself the second time.

- **A backtick inside a `css` or `html` template literal ends it.** Three separate transform failures
  from CSS comments containing `` `var()` `` or a `{id}`-shaped path; the second kind fails *later*
  and worse, as `ReferenceError: institutions is not defined`, because `${...}` in the middle of a
  comment is an interpolation. No existing comment in component CSS uses backticks, which is not a
  coincidence anyone had recorded.
- **`deepTextOf(element)` does not include that element's own shadow root.** It reads `textContent`
  and then descends into the shadow roots of *descendants*, so passing a custom element returns `''`
  and every `toContain` against it passes vacuously. Pass `element.shadowRoot`.
- **Adding an operation to `SHELL_SPEC` ripples.** `pure/sections.test.ts` enumerates every section
  and `section-index.test.ts` counts a tag's operations, so a fixture gains a row in two places that
  do not mention it.
- **`updated()` may measure, and only measure.** `<openish-code-block>` sets a `@state` from a
  post-layout measurement, which the conventions above otherwise forbid - it is allowed here because
  a measurement cannot happen before layout and because what it adds (a line count in the toolbar)
  is outside the box being measured, so it cannot chase its own tail.

### Measured

794 tests, up from 707; the new ones are the search total, the `not` disclosure, the column
arrangement at 1024/1152/1200/1600, `scrollWidth` on a deep fixture at three widths, the embedded
narrow case, and the operation-`servers` URL in both core and the element. `packages/core/test/fixtures/request.yaml`
gained two operations for the server-override rules and is still under the 64 KB ceiling.

The entry chunk went from 95.2 kB gzipped to **99.0 kB** - 3.8 kB for `encoding`, the rest of the
Header Object, the `not` subschema, the server-override precedence and `ElementWidthController`. That
is the trade this project says it should make every time, and it is the first milestone in ten to
have said so out loud, because the README's budget table had drifted 21.8 kB behind reality with
nothing in the pipeline to notice. Re-measuring is step five of the loop now.

One thing left open, and it is a test rather than a fault: `schema.test.ts` failed twice under full
parallel runs, a different test each time, both of the "element not present yet" shape, and neither
reproduced in isolation or across four subsequent full runs. It predates this milestone. If it comes
back, the thing to suspect is the first test in a file racing the plane's first paint - see the note
in M19 about what a wait that outlives its own timeout reports as.

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
   elements, no console errors. M14 measured 320 ms to first render, 18 ms to a tag and 26 ms to an
   operation, the same 21 sidebar elements over the same 853 nodes, no console errors - so the
   two-pane operation page cost nothing measurable, and the earlier numbers were mostly the cold
   pipelines that are now deferred. **M17 measured 388-409 ms to first render, 45 ms to a tag, 98 ms
   to Models at the far end of the document, a deep link landing 0 px from the top ten times out of
   ten, one to five sections in the DOM out of 853, the same 21 sidebar elements, and 40 MB after
   scrolling the entire document. No console errors.** A regression against these is a finding.

   Two of those went the wrong way on purpose. The plane pays about seventy milliseconds at load and
   two to four times as long per navigation, and buys a scroll that lands accurately instead of a
   page that is replaced. What matters more is what stayed bounded: the DOM, the sidebar, and the
   heap.

   Serving it is the fiddly part: the file is gitignored at the repo root, so `?url=` needs a path
   Vite will actually serve. `/@fs/<absolute path>` works and stays same-origin; a separate static
   server does not, because it sends no CORS header and the fetch fails silently into an empty page.
4. Anything it breaks becomes a small committed fixture, then a fix. Never encode its contents in a test.
5. `node scripts/measure-bundle.mjs`, and correct the table in the README when it has moved. Nothing
   in `npm run verify` measures the bundle, so a budget nobody re-runs is a budget that drifts - the
   table was ten milestones and 26 kB gzipped out of date when M20 checked it, which is long enough
   that no single milestone could be held responsible for any of it.

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


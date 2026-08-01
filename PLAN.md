# openish — the plan, and what it cost

M0–M6 are done: the reference renders, navigates, searches, generates samples, and has been through
an accessibility, mobile, bundle, and docs pass. This file is now mostly the second half of its job -
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

`npm run verify` runs guards → typecheck → tests. 171 tests today: `core` in Node, `elements` in real
Chromium via Playwright (`npx playwright install chromium` once). `npm run build` also regenerates
`custom-elements.json` and the element reference in `packages/elements/README.md`.

**What is not done, and is worth doing next:** virtualising the sidebar for documents with thousands
of nodes (853 nodes render 21 elements today, but a flat model list does not); an `openish-try-it`
that sends the request the sample describes; and `hideModels`-style config coverage in the tests,
which is currently taken on trust.

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

**One `Router`, `Routes` everywhere else.** The root element owns the only `Router` on the page —
it is the thing that installs the global `click` and `popstate` listeners, so a second one would
double-handle every click. It mounts one route per section (`/tags*`, `/models*`, `/webhooks*`) and
`<openish-section>` matches the rest with a `Routes` controller, wired to its parent by the bubbling
`lit-routes-connected` event rather than by anything passed down. Adding a page shape inside a
section is a change to that element's route list alone.

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

**`@lit-labs/router@0.1.4` breaks if constructed after connection.** `Routes`' constructor calls
`addController` *before* assigning `routes` and `fallback`; on an already-connected host that runs
`hostConnected()` → `goto()` against an empty route list, which never sets `_currentRoute`. The outlet then
renders nothing forever, with no error. Construct the `Router` before `super.connectedCallback()`. This is
why `routing` is read once at connect time.

**Anchors inside shadow DOM work.** The router's click handler reads `composedPath()` and calls
`pushState` itself. Render real `<a href>`; only *programmatic* navigation needs the `pushState` + `goto`
pairing in `src/router/navigate.ts`.

**A nested mount needs a tail group, and `/models/*` does not match `/models`.** `URLPattern`
requires the literal slash before `*`, so the parent route for a section is `/models*` — which
matches both, and always produces a tail group for the child `Routes` to match against. Mount it as
`/models/*` and the section index silently falls through to the fallback. A child `Routes` also
needs a `fallback`: without one, `goto()` *throws* on an unmatched path, from a promise nobody
awaits, so a URL like `/models/a/b/c` surfaces as an unhandled rejection and a blank page.

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
word followed. Two comments in this repo have been written twice for that reason.

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
  elements are still filling in.
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

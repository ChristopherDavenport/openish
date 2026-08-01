# openish

Lit web components for viewing OpenAPI documents.

openish keeps the framework-agnostic half of [Scalar](https://github.com/scalar/scalar) — the parser, the
`$ref` machinery, the type definitions, the snippet generator, the markdown and highlight pipeline — and
replaces only the Vue render layer, with Lit and `@lit-labs/router`. The visual layer is the
[Jack Henry Design System](https://jackhenry.design/v2).

Reusing upstream is the point, not a shortcut: anything of Scalar's that has no Vue in its dependency
graph and makes no assumption about a component model belongs here rather than reimplemented. What
openish writes itself is the render layer and the two pieces that only exist inside Vue-tainted
entry points.

If you already ship web components, you should not have to adopt a second framework to render API docs.

> Status: feature-complete for a reader's view, and hardened. A document loads, the sidebar, search,
> and router navigate it, an operation shows a runnable code sample beside its parameters, request
> body, and responses, and every schema is an expandable property tree that self-referential types
> cannot hang. Accessibility and colour contrast are checked by the test suite in both schemes.

```html
<link rel="stylesheet" href="@openish/theme/index.css" />
<openish-api-reference url="/openapi.yaml"></openish-api-reference>
```

```ts
import '@openish/elements'
```

| Property | Default | |
|---|---|---|
| `url` | — | Fetch the document from here |
| `spec` | — | An inline document: YAML/JSON string or object (property only) |
| `config` | — | An `OpenishConfig` (property only) |
| `layout` | `modern` | `classic` stacks the navigation into a disclosure above the page |
| `base-path` | `''` | Mount under a sub-path, e.g. `/docs` |
| `routing` | `history` | `none` hands navigation to the host via `selected` + `openish-navigate` |
| `color-scheme` | `light` | |

Events (all bubbling and composed): `openish-navigate`, `openish-color-scheme-change`,
`openish-client-change`. The scheme event is re-dispatched rather than acted on, because only the host
can swap the Jack Henry theme, which is declared at `:root`. Readers open search with `/` or
Cmd/Ctrl-K; `config.hideSearch` turns it off, and `config.hiddenClients` trims the sample picker.

Note that `routing` is read once, when the element connects — see the `@lit-labs/router` note below.

Below 48rem the navigation stacks into the same disclosure `layout="classic"` uses, rather than being
hidden by a media query: a sidebar that CSS has hidden is still in the tab order and still read out,
and there was no way to reach it at all.

**Give it a height.** The element fills its container and does not decide how tall it is, so the
chain has to reach it — every ancestor from `html` down needs a height, or the reference is as tall
as its content and nothing inside it scrolls on its own. When that happens the sidebar and the
navigation disclosure scroll off the top of the page with everything else:

```css
html, body, #app { height: 100% }
openish-api-reference { display: block; height: 100% }
```

The disclosure is `position: sticky` so it survives a host that gets this wrong, but the sidebar
cannot be.

`packages/elements/README.md` is the per-element reference — every property, attribute, and event —
and it is generated from `custom-elements.json`, which ships with the package.

## Packages

| Package | What it is |
|---|---|
| `@openish/core` | The document store, navigation traversal, HAR generation, example generation. No DOM. |
| `@openish/elements` | The `openish-*` custom elements. |
| `@openish/theme` | The `--openish-*` style-hook layer, bound to Jack Henry alias tokens. |
| `apps/playground` | Dev harness. Not published. |

## Using the core

```ts
import { createDocumentStore, operationToHar, schemaExample } from '@openish/core'

const store = await createDocumentStore(yamlOrJsonOrObject, { config: { hideModels: true } })

store.document          // upgraded to 3.1, $refs resolve lazily on access
store.navigation        // the nav tree: text / tag / operation / group / model / webhook nodes
store.bySlug.get('tags/accounts/listAccounts')   // a URL path resolves to a node in one lookup
```

The store is immutable and has no subscription API. When the document changes you build a new store
and hand it down; components re-render because the context value changed.

Two behaviours worth knowing:

- **`$ref`s are not expanded.** `store.document` is a magic proxy, so `paths['/x'].get` may still be
  `{ $ref: … }`. Read through `getResolvedRef()`, which also applies OpenAPI 3.1 sibling-key
  overrides. This is what makes a 900 KB document cheap and recursive schemas representable at all.
- **Ids are URL slugs.** `operationId` and schema names keep their case (`models/PaymentIntent`),
  because they are identifiers the author chose; summaries, tag titles, and headings are slugified
  (`tags/accounts/list-all-accounts`). Collisions get a `-2`, `-3` suffix in document order.

## Design rules

**Properties down, events up.** No two-way binding; children never mutate parent state. Every cross-cutting
change is a bubbling `CustomEvent` handled at the root element, which re-provides context.

**Declarative components.** Every element describes its shadow tree from the state it holds and does
nothing else on the side: no `addEventListener` calls, no `querySelector` after rendering, and no
reads of `window.location` while rendering. External state arrives as a reactive input through a
`ReactiveController` (`LocationController` for the URL, `HotkeyController` for `/` and Cmd-K).
Derived values are getters, so there is no second copy to keep in step - the two `willUpdate`s left
in the project both exist because a context provider pushes its value rather than being asked for
it. The few genuinely imperative DOM calls a document browser needs - `showModal()`, `focus()`,
`scrollIntoView()` - happen in `updated()` in response to a property changing, in one place each.

**Context for downward traversal.** `@lit/context` carries the document, the presentation config, and the
schema traversal down the tree. The recursive schema renderer is what the third one is for: it consumes
`schemaContext`, adds its own `$ref` pointer to the path, and re-provides it to everything it renders, so
a branch that arrives back where it started links to that model instead of expanding forever. Pointers,
not object identity — the magic proxy hands back a fresh wrapper every time a reference resolves.

**One `Router`, `Routes` everywhere else.** `<openish-api-reference>` owns the page's only `Router`,
because a `Router` is what installs the global `click` and `popstate` listeners. It mounts one route
per section — `/tags*`, `/models*`, `/webhooks*` — and `<openish-section>` matches everything below
that prefix with a `Routes` controller, which finds its parent by dispatching a bubbling
`lit-routes-connected` event on connect. Nothing about the routing is passed down as a property.

**No signals.** Not one, today. The two candidates for genuine globals — colour scheme and the selected
snippet client — are both answered by root-level context plus a bubbling event. `@lit-labs/signals` is
deliberately absent from the dependency list; it gets added only if a real cross-root need shows up.

**No Vue.** See below.

## The dependency contract

The Scalar packages split cleanly in two, and openish uses as much of the Vue-free half as it can.
That is the design, not a compromise: the OpenAPI semantics are hard and Scalar has them right, so
the goal is to replace the render layer and reuse everything underneath it.

**Used:** `@scalar/openapi-parser`, `@scalar/json-magic` (`/bundle`, `/magic-proxy`), `@scalar/openapi-types`,
`@scalar/types`, `@scalar/helpers`, `@scalar/snippetz`, `@scalar/code-highlight` (both the markdown
pipeline and the syntax highlighter — no Vue in either, and nothing about them assumes a component
model, so they drop straight into a declarative Lit element).

**Not used, because `vue` is in the graph:** `@scalar/workspace-store`, `@scalar/sidebar`,
`@scalar/components`, `@scalar/oas-utils`, `@scalar/icons`, `@scalar/openapi-to-markdown`,
`@scalar/api-reference`, `@scalar/api-client`.

Two of those are worth re-checking whenever they release, because they are the only reason openish
hand-writes anything. Checked against `@scalar/workspace-store@0.56.0` and `@scalar/oas-utils@0.19.9`
by bundling each entry point and looking for `vue` in the module graph:

| Entry | Verdict |
|---|---|
| `@scalar/workspace-store/navigation` | Reaches `vue` through `helpers/unpack-proxy.js`, so the navigation traversal stays ported. |
| `@scalar/workspace-store/mutators` | Reaches `vue`. This is where a HAR builder now lives; ours stays. |
| `@scalar/workspace-store/helpers/*` | Vue-free. |
| `@scalar/oas-utils/helpers` | Vue-free now — but it is JSON/YAML parsing and plugin hooks, nothing openish needs. |

Note the second column is about the *graph*, not about tree-shaking: `@scalar/oas-utils` still
declares `vue` as a dependency, so adopting it would put Vue in any consumer's `node_modules` even
though the code openish would import never touches it. `npm run guard:vue` fails on exactly that, on
purpose — the promise is "installing openish does not install Vue", and a promise that depends on a
bundler's tree-shaking is not one.

## Two integration notes

**Lit versions.** `@jack-henry/jh-ui@1.15.5` declares `lit: 2.1.1` as a hard dependency, not a peer, so an
untreated install ships two copies of Lit. The root `overrides: { "lit": "^3.3.3" }` forces it onto Lit 3.
That is verified rather than assumed — `packages/elements/test/jh-ui-lit3.test.ts` mounts four jh components
in real Chromium and asserts they upgrade, render shadow content, and reflect property changes. If that test
ever fails, drop the override and accept two Lit copies; custom elements are independent, and the only cost
is bundle size plus a dev-mode warning.

**Parser weight.** `@scalar/openapi-parser`'s barrel re-exports `validate`, which pulls in `ajv` (~120 KB).
Validation stays behind a lazy `import()` so it never lands in the default chunk. `@scalar/snippetz`
is the same shape of problem — its barrel imports all forty-one client plugins, 28 KB gzipped — so
`generateSnippet` loads it on demand. The client *picker* is built from `@scalar/types`, which is
data, so a page that never renders a sample never pays for one.

**Syntax colours have to be component CSS.** Every code block openish renders lives in a shadow root,
and a `.hljs-keyword` rule in a stylesheet the host loads does not cross that boundary — custom
properties do. So `@openish/theme/highlight.css` declares the `--openish-hl-*` hooks and
`@openish/elements` owns the rules that read them. Anything else styling highlighted code has the
same constraint.

**A `@lit-labs/router@0.1.4` bug.** `Routes`' constructor calls `host.addController(this)` *before*
assigning `this.routes` and `this.fallback`. When the host is already connected, `addController` invokes
`hostConnected()` straight away, which calls `goto()` against an empty route list — and `goto` then takes
its "controller with no routes" branch and never sets `_currentRoute`. The outlet renders nothing, for the
rest of the element's life, with no error anywhere. `openish-api-reference` therefore constructs its
`Router` *before* `super.connectedCallback()`, and that is why `routing` cannot be changed on a live
element. A child `Routes` is safe from this by construction, since a class field runs before the host
is connected. The library is pre-1.0 Labs; this is worth an upstream issue.

Two smaller ones from the same version: a section is mounted at `/models*`, not `/models/*`, because
`URLPattern` requires the literal slash and `/models` is a real page — and the trailing-wildcard form
always yields a tail group, which is the only thing a child `Routes` can match against. And a child
`Routes` is given a `fallback`, because without one `goto()` *throws* on an unmatched path from a
promise nobody awaits: an unhandled rejection and a blank page rather than a "not found".

## OpenAPI documents in this repo

Committed API documents live in exactly one place: `packages/core/test/fixtures/`, capped at 64 KB each,
one behaviour per fixture. `npm run guard:specs` enforces it.

Real documents are loaded by hand — drop one at the repo root (gitignored), then open it in the playground
via the file picker or `?url=`. They are for surfacing what a small fixture cannot: deep `$ref` chains,
large navigation trees, first-render cost at a few hundred operations. Anything one of them breaks gets
reproduced as a small committed fixture first, then fixed.

## What it weighs

Not a competitive number — openish is not trying to be a smaller API reference, it is trying to be
one that does not bring Vue. Most of what it ships is Scalar's own Vue-free tooling, on purpose. The
budget is here so a regression is visible, and so nobody has to guess.

Measured with `node scripts/measure-bundle.mjs` (add `--with-scalar` to install and measure Scalar in
a throwaway directory — installing it here would put Vue in the graph and fail `guard:vue`):

| Bundle | Raw | gzip |
|---|---|---|
| `@openish/elements`, everything | 957.8 kB | **285.5 kB** |
| `@openish/core` alone | 244.2 kB | 77.1 kB |
| `@scalar/snippetz`, loaded on demand | 92.8 kB | 27.6 kB |
| `@scalar/api-reference` 1.64.0, for reference | 1226.8 kB | 334.4 kB |

Where openish's 285 kB goes: 176 kB is `@scalar/code-highlight` — the markdown pipeline and
highlight.js — and 77 kB is the parser and `$ref` machinery. Both are shared with Scalar, because
they are the same code. openish's own components, Lit, the router, and `@lit/context` together are
under 20 kB gzipped, which is the part that replaced a Vue application.

(The 48 highlight.js languages cost 0.6 kB on top of markdown, because the markdown pipeline already
pulls them in. That is why they are not loaded lazily; there is nothing to save.)

## Accessibility

Checked, not asserted. `packages/elements/test/a11y.test.ts` runs axe over the overview, an
operation, a model with its schema tree expanded, the open search dialog, and the stacked navigation,
in both colour schemes — inside the frame, with the real theme loaded, so contrast rules measure this
palette rather than the browser's defaults.

`packages/elements/test/contrast.test.ts` measures WCAG contrast for the palette directly, which axe
cannot do through nested shadow roots. Current numbers, both schemes AA or better:

| | Light | Dark |
|---|---|---|
| Body text on the page | 11.8:1 | 13.8:1 |
| Muted text on the page | 5.0:1 | 7.5:1 |
| Links | 4.8:1 | 7.5:1 |
| HTTP method chips | 5.7–6.2:1 | 4.7–5.0:1 |
| Syntax colours on the code surface | 4.8–6.4:1 | 4.9–6.9:1 |

## Development

```bash
npm install
npm run dev        # playground at http://localhost:5173
npm run verify     # guards + typecheck + tests
npm run build      # all packages
```

`npm test` runs two projects: `core` in Node, and `elements` in real Chromium via Playwright. The browser is
not optional — jh-ui calls `attachInternals()` and the router needs real `URLPattern` and history, so a
simulated DOM would only test the shim. Run `npx playwright install chromium` once.

## Prior art

Scalar does this well; openish exists because it does it in Vue. Anything openish gets right about OpenAPI
semantics, it got from reading their source.

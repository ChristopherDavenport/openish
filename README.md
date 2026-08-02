# openish

Lit web components for viewing OpenAPI documents.

openish keeps the framework-agnostic half of [Scalar](https://github.com/scalar/scalar) — the parser, the
`$ref` machinery, the type definitions, the snippet generator, the markdown and highlight pipeline — and
replaces only the Vue render layer, with Lit.

Reusing upstream is the point, not a shortcut: anything of Scalar's that has no Vue in its dependency
graph and makes no assumption about a component model belongs here rather than reimplemented. What
openish writes itself is the render layer and the two pieces that only exist inside Vue-tainted
entry points.

If you already ship web components, you should not have to adopt a second framework to render API docs.

> Status: a reader can read it and call it. A document loads, the sidebar, search, and the URL
> navigate it, every schema is an expandable property tree that self-referential types cannot hang,
> and an operation page will send the request its code sample describes — including obtaining an
> OAuth token first, because most real documents declare nothing else to authenticate with.
> Accessibility and colour contrast are checked by the test suite, in both schemes and both themes.

```html
<link rel="stylesheet" href="@openish/theme/index.css" />
<openish-api-reference url="/openapi.yaml"></openish-api-reference>
```

```ts
import '@openish/elements'
```

No bundler? One script tag, with the stylesheet already inside it:

```html
<script type="module" src="https://unpkg.com/@openish/elements/dist/standalone.js"></script>
<openish-api-reference url="/openapi.yaml"></openish-api-reference>
```

| Property | Default | |
|---|---|---|
| `url` | — | Fetch the document from here |
| `spec` | — | An inline document: YAML/JSON string or object (property only) |
| `sources` | — | Several documents, with a picker (property only). See below |
| `config` | — | An `OpenishConfig` (property only) |
| `routing` | `hash` | `history` for real paths, `none` to hand navigation to the host |
| `base-path` | `''` | Mount under a sub-path, e.g. `/docs`. Only `routing="history"` reads it |
| `color-scheme` | `auto` | `light` or `dark` to decide it; `auto` follows the reader |

Events (all bubbling and composed): `openish-navigate`, `openish-color-scheme-change`,
`openish-client-change`, `openish-server-change`, `openish-source-change`, `openish-auth-change`. Readers open search with `/`
or Cmd/Ctrl-K; `config.hideSearch` turns it off, and `config.hiddenClients` trims the sample picker.

## Routing

Navigation ids are URL paths (`tags/accounts/listAccounts`) and `store.bySlug` resolves one to a node
in a single lookup, so there is no route table and no router library — reading the id out of the URL
is the whole of it, and it differs by mode in about three lines.

**`hash` is the default** because it is the only mode that works with no cooperation from anything.
`…/docs#/tags/accounts` asks the server for `…/docs`, which it already serves, so a static host with
no rewrite rule deep-links correctly; a fragment link is navigation the browser performs by itself,
so nothing has to intercept a click; and it works from `file://`.

`history` gives real paths, at the cost of a server that serves the application for every one of
them. It is the mode `base-path` exists for. `none` hands navigation over entirely: the host sets
`selected` and listens for `openish-navigate`, which is now dispatched when a link is clicked rather
than only after the fact.

Unlike earlier versions, `routing` can be changed on a live element — nothing is installed at connect
time any more.

### The URL follows the reader

The document is one continuous page, so a URL names a position rather than choosing a page. Two
consequences a host should know about:

- **Scrolling rewrites the URL**, with `replaceState` and after about 120 ms of quiet. Never
  `pushState`: every section the reader passed would be a history entry, and Back would walk them
  back up the document instead of leaving. `openish-navigate` fires with it, so a host syncing its
  own chrome now hears from scrolling as well as from clicks.
- **A URL that names nothing is left exactly as the reader typed it.** The banner says which id
  failed and the document is on screen behind it. Nothing rewrites it to the front page, because a
  bookmark that has outlived its operation should still be able to say so after a reload.

### What a continuous page costs

Only a window of sections is in the DOM at a time — that is what makes a 221-operation document open
in under half a second — and the two things that follow from it are worth stating plainly:

- **Find-in-page only finds what is on screen.** Neither Scalar nor Stripe virtualises its content,
  so this is a real divergence and not a shared trade. The search dialog is the answer: it indexes
  titles, descriptions, parameter names, body fields, response descriptions and model fields, so it
  finds *more* than the browser would, including sections that have never been rendered. **Copy for
  LLM** is the other half — it hands over a whole section, or a whole tag, as Markdown built from the
  document rather than from the page.
- **A try-it panel does not survive scrolling out of range.** Typed values and a displayed response
  go when the section is recycled. Credentials do not: the auth session lives on the root.

Per-operation slots (`request-start` and the rest) are forwarded into the section the URL names, and
move as the reader scrolls. With every operation on the page there is one slot per operation in a
single shadow root and only the first in tree order would receive anything, so scoping them to the
active section is the only well-defined reading left. `content-start` and `content-end` now bracket
the whole document rather than a page.

## Multiple documents

```js
reference.sources = [
  { slug: 'consumer', title: 'Consumer API', url: '/consumer.yaml' },
  { slug: 'admin', title: 'Admin API', url: '/admin.yaml', default: true },
]
```

`slug` and `title` are both optional — a title becomes a slug, and a source with neither is `api-2` /
`API #2`. `content` takes an inline document instead of a `url`, `default` picks the one shown when
the URL names none, and `config` overrides the reference-level `OpenishConfig` for that document
alone. The picker appears only when there is more than one document. `?api=<slug>` selects one from
outside and rewrites itself out of the URL, for a link that knows the document but not the id scheme.

Two things a host has to know:

**`sources` namespaces every URL.** An operation is at `#/consumer/tags/accounts/listAccounts`, not
`#/tags/accounts/listAccounts`. The slug is what decides which document the rest of the id is about,
so it has to be in the URL before the rest of it means anything. A reference configured with `url`
or `spec` keeps exactly the URLs it always had — internally its ids are namespaced too, and the slug
is dropped at the URL boundary — so this is a change only for a host adopting `sources`, and
`config.redirect` is the seam for keeping the old links working. `redirect` sees and returns URLs the
way the URL bar has them, prefix and all.

**Authentication and servers are per document.** Each gets its own session and its own selected
server, so two documents that both declare `oauth2` — usually two different authorization servers —
cannot send each other's tokens. A `credentialStore` is namespaced per document for the same reason;
with a single `url` or `spec` it is passed through untouched, so anything already persisted still
reads back.

Documents load lazily. The one being shown is fetched and parsed first, and the rest are warmed while
the browser is idle, one at a time — so first render does not scale with how many documents are
configured, and search spans every one that has landed rather than only the one on screen. Results
are grouped under the document they are in.

## Colour scheme

Light and dark are chosen in CSS, not in script. Every colour is declared once as
`light-dark(light, dark)` and the browser picks according to the used value of `color-scheme`, so:

- **Do nothing** and the reference follows the reader's `prefers-color-scheme` — no class, no script,
  no flash of the wrong scheme before script runs, and it follows a reader who changes their mind
  mid-session.
- `<openish-api-reference color-scheme="dark">` decides it for one reference. The attribute is
  reflected, so setting the property works too, and the override is scoped to that element's subtree.
- `<html class="openish-dark">` decides it for the whole page, including your own chrome.

`openish-color-scheme-change` is still re-dispatched, so a host can persist the choice and match its
own UI — but the reference no longer needs anything done for it.

There is one layout, and it answers the viewport rather than a config value. Below 48rem the
navigation stacks into a disclosure rather than being hidden by a media query: a sidebar that CSS has
hidden is still in the tab order and still read out, and there was no way to reach it at all. Above
that it is a column beside the page, and on a wide enough page the code samples move into a column of
their own — see [Reading layout](#reading-layout).

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

## Theming

`@openish/theme` is one tier: the `--openish-*` style hooks, which is everything the components read.
It ships two peers, and you import exactly one — `index.css`, which gives every hook a value of its
own and depends on nothing, or `jh.css`, which re-points the same hooks at Jack Henry alias tokens for
a page that already has that design system on it. `layout.css` is imported by both and is the small
set openish owns outright: the measures, the sidebar width, the target-size floor. No design system
has an opinion about how wide a paragraph should be in an API reference, because none of them knows it
is one.

The hooks are named for concepts rather than for values, which is what makes the binding possible:

- **Borders** by what they separate — `--openish-border-decorative-color` for a hairline, then
  `-control-` (a field's edge), `-action-` (a button's), and `-selected-` (the open tab, the current
  page, and a control for as long as it is pressed). All but the hairline are measured for 3:1
  against the surface behind them. `--openish-color-border` and `-border-strong` remain as the
  decorative and control pair. The action edge is neutral rather than brand-coloured on purpose, and
  is a separate hook so that a host who wants buttons to read as actions can say so in one line.
- **Focus** decomposed into the parts an outline takes — `--openish-focus-ring-color`, `-style`,
  `-width`, `-offset`. Negate the offset on an element that sits flush inside something that clips;
  that is the supported way to move the ring, and there is no way to remove it.
- **States** as a tint rather than a palette — `--openish-state-hover-tint` and `-active-tint` mix
  from `currentColor`, so one pair of values is correct on a white chip, a blue button and a
  transparent toggle, in both schemes, with nothing for a binding to re-point.

The Jack Henry binding asks for the design system's own token first and falls back to the alias that
ships today: `var(--jh-border-focus-color, var(--jh-color-interactive-focus-outer))`. The border
concepts are documented on the site ahead of `@jack-henry/jh-core@1.6.1`, so the fallbacks are what
render right now and the bindings upgrade themselves when the tokens land.

## Packages

| Package | What it is |
|---|---|
| `@openish/core` | The document: store, navigation traversal, HAR building, snippets, examples. No DOM. |
| `@openish/client` | The API: sending a request, OIDC discovery, PKCE, tokens. No framework, no dependencies. |
| `@openish/elements` | The `openish-*` custom elements. The only package that knows about Lit. |
| `@openish/theme` | The `--openish-*` style-hook layer: a self-contained palette, plus a Jack Henry binding. |
| `apps/playground` | Dev harness. Not published. |

`@openish/client` is separate because calling an API is not reading a document and is not rendering
one. It takes a HAR request and a security scheme, it holds no opinion about OpenAPI or about
components, and it declares no dependencies — so a docs-only build never pays for it, and something
that is not a documentation page can still use it.

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
change is a bubbling `CustomEvent` handled at the root element, which re-provides context. What travels
down is **data**, never a live object: the reader's credentials arrive as `grants`, a frozen snapshot the
session replaces wholesale, so "has this changed" is an identity comparison and "may I change it" is a
type error rather than a comment asking nicely.

**The root is thin, and its controllers are where the work is.** `<openish-api-reference>` owns the four
`@provide`d contexts and nothing else: the documents and their cache are `SourcesController`, the URL is
`RoutingController`, the sessions are `AuthController`, the per-document server choice is
`ServerChoiceController`. Each reads its inputs through thunks rather than snapshots, because `@lit/task`
reads `args()` from `hostUpdate` and the element derives from the same values in `willUpdate` - a snapshot
taken in either place is read by the other one update late. The element calls `requestUpdate()` nowhere.

**Declarative components.** Every element describes its shadow tree from the state it holds and does
nothing else on the side: no `addEventListener` calls, no `querySelector` after rendering, and no
reads of `window.location` while rendering. External state arrives as a reactive input through a
`ReactiveController` (`LocationController` for the URL, `HotkeyController` for `/` and Cmd-K, `LazyModuleController` for the
markdown and highlight pipelines that arrive after first paint).
Derived values are getters, so there is no second copy to keep in step - the two `willUpdate`s left
in the project both exist because a context provider pushes its value rather than being asked for
it. The few genuinely imperative DOM calls a document browser needs - `showModal()`, `focus()`,
`scrollIntoView()` - happen in `updated()` in response to a property changing, in one place each. On the
plane, scrolling to a heading inside `info.description` has exactly one owner: `SectionsController`, which
can mount the section first and keep correcting while the document settles around it. `<openish-overview>`
scrolls itself only when a host renders it alone through `renderNodeById`, where nothing else could.

**Component anatomy.** Every component is put together the same way, so a reader of one has read all
of them and a new one is not a new set of decisions.

- *Interactive things are real elements.* A `<button>`, an `<a>`, or a native control — never a div
  with a click handler bolted on. Where the platform has no element for the pattern (a tree, a
  tablist, a combobox) it is built to the WAI-ARIA Authoring Practices, with the roles and the
  keyboard behaviour the pattern specifies, not an approximation of them.
- *Every control declares all six states* — enabled, hover, focus, active, disabled, pending — from
  `controlStyles` in `styles/shared.ts`. A component may override one; it may not skip one or invent
  a seventh. "Pending" is `aria-busy` on the control plus a live region beside it, in every case.
- *Selection is an edge, not a fill.* The open tab and the page the sidebar is on wear
  `--openish-border-selected-color`; a control being pressed wears the same edge at the same width,
  in `currentColor`. A fill on its own is a few percent of lightness and is the first thing to go on
  a dim screen, so it is the supporting signal and never the only one. Space for the edge is reserved
  on the unselected siblings too, or selecting something shifts what is next to it.
- *An anchor that is a control says so.* A sidebar row and a download link are links because they go
  somewhere and controls because a reader presses them; they take the six states by carrying
  `pressable`. A bare `a` in the shared rule would have caught every link in a paragraph of
  documentation, and a word of prose should not grow a ring when it is clicked.
- *The focus ring is never removed, only relocated.* It is one rule, in `baseStyles`, drawn as an
  `outline`. An element that sits flush inside something that clips redeclares
  `--openish-focus-ring-offset` on itself rather than starting over. `npm run guard:focus` fails the
  build on `outline: none` anywhere in component source, because the failure this pass fixed was not
  a missing ring — it was sixteen slightly different ones.
- *Parts are named for what a thing is, not where it sits* — `code`, `code-toolbar`, `copy`,
  `dialog`, `dialog-toolbar`. A part is a public API, so a name that describes a position stops being
  true the moment the layout changes.
- *Appearance stays with the component; behaviour is shared.* openish has three button looks —
  bordered, accent, plain — and which one a control wears depends on the surface under it. The states
  it moves through do not, so they are declared once and tinted over whatever the component chose.

**Context for downward traversal.** `@lit/context` carries the document, the presentation config, and the
schema traversal down the tree. The recursive schema renderer is what the third one is for: it consumes
`schemaContext`, adds its own `$ref` pointer to the path, and re-provides it to everything it renders, so
a branch that arrives back where it started links to that model instead of expanding forever. Pointers,
not object identity — the magic proxy hands back a fresh wrapper every time a reference resolves.

**The URL is an input, not a subsystem.** `LocationController` makes `window.location` reactive;
`<openish-api-reference>` reads the active id out of it in `willUpdate` and provides it as context.
Everything else consumes an id. There is no route table, because ids already are paths and
`store.bySlug` is the lookup — see [Routing](#routing).

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

The multi-document design is ported rather than invented: `@scalar/api-reference@1.64.0`'s
`helpers/id-routing.ts`, `helpers/normalize-configurations.ts` and `ApiReference.vue` are where the
slug-in-the-id / slug-out-of-the-URL split, the slug defaulting, the in-flight load map, and the idle
prefetch come from. None of it could be imported — that package pulls in Vue — but the shapes are
theirs, and the one deliberate divergence is search, which openish runs across every loaded document
where Scalar scopes it to the active one.

Note the second column is about the *graph*, not about tree-shaking: `@scalar/oas-utils` still
declares `vue` as a dependency, so adopting it would put Vue in any consumer's `node_modules` even
though the code openish would import never touches it. `npm run guard:vue` fails on exactly that, on
purpose — the promise is "installing openish does not install Vue", and a promise that depends on a
bundler's tree-shaking is not one.

## Integration notes

**Lit versions, if you also ship jh-ui.** `@jack-henry/jh-ui@1.15.5` declares `lit: 2.1.1` as a hard
dependency, not a peer, so an untreated install ships two copies of Lit. openish does not depend on
jh-ui — nothing in `@openish/elements` imports it, and the Jack Henry connection is a token binding in
`@openish/theme` — so this is a fact about *your* application, not about installing openish. This repo
keeps the root `overrides: { "lit": "^3.3.3" }` and a tripwire for it anyway:
`packages/elements/test/jh-ui-lit3.test.ts` mounts four jh components in real Chromium and asserts
they upgrade, render shadow content, and reflect property changes. If that ever fails, drop the
override and accept two copies; custom elements are independent, and the cost is bundle size plus a
dev-mode warning.

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

**Sticky columns and the virtualised plane.** The examples column used to stay beside whichever part
of a long schema the reader had scrolled to. It cannot on the plane: the virtualiser positions each
section absolutely and moves it with a `transform`, and `position: sticky` is resolved from *layout*
position against a real scroll offset — so seven thousand pixels down, the browser decides the
element is far above the scrollport and clamps it to the bottom of its containing block. The sample
ended up below the documentation it belonged beside. `packages/elements/test/sticky-in-virtualizer.test.ts`
demonstrates it at six thousand pixels and its absence at three hundred, which is also why the spike
that preceded the plane said it was fine. Anything else putting a sticky element inside a section has
the same constraint.

**Why there is no router.** There was one — `@lit-labs/router`, plus `urlpattern-polyfill` for the
browsers without `URLPattern`, plus an `<openish-section>` element per section to match the tail of
each route, plus three documented workarounds for pre-1.0 bugs in it. All of it resolved a URL to a
navigation id. But ids *are* URL paths and `store.bySlug` is a map, so the id was already the answer;
the route table was an elaborate way of arriving at a lookup that `renderNodeById` then performed
anyway. Removing it took two dependencies, one element, and the workarounds with them, and made
`routing` changeable on a live element.

## OpenAPI documents in this repo

Committed API documents live in exactly one place: `packages/core/test/fixtures/`, capped at 64 KB each,
one behaviour per fixture. `npm run guard:specs` enforces it.

Real documents are loaded by hand — drop one at the repo root (gitignored), then open it in the playground
via the file picker or `?url=`. They are for surfacing what a small fixture cannot: deep `$ref` chains,
large navigation trees, first-render cost at a few hundred operations. Anything one of them breaks gets
reproduced as a small committed fixture first, then fixed.

## Trying it

An operation page sends the request its sample describes. One function builds that request and both
consume it, so the snippet above the button is the request the button sends — with one deliberate
difference: the credential is real on the wire and a placeholder in the sample, because a
documentation page should not be the thing that puts a production token into a shell history.
`revealCredentialsInSamples` opts out of that.

Authentication is not a paste field. Most real documents — including the one this project is tested
against — declare `openIdConnect` with nothing but a `.well-known` URL, so there is no token to paste
until someone has completed a flow. openish reads the provider's metadata, offers its scopes, and
runs **authorization code with PKCE**, in a popup by default or as a full-page redirect where popups
do not work. Other grants are not implemented; any scheme still accepts a token you already have.

```ts
reference.config = {
  proxyUrl: 'https://your-proxy.example.com/forward', // for APIs that refuse this origin
  oauthRedirectUri: '/oauth-callback',                // must be same-origin and registered
  oauthRedirectMode: 'popup',                         // or 'redirect'
  oauth: { consumer: { clientId: 'docs-playground' } },
}
reference.credentials = { apiKey: 'from your own login' } // property only, never an attribute
```

Tokens live in memory for the life of the page and are never persisted: how long a credential should
survive is a decision with a threat model attached, so it belongs to the host, which hears every
change as `openish-auth-change`. `hideTryIt` removes the panel entirely.

The proxy contract, the rule that a client secret is only ever sent through it, and the reason a
cross-origin failure is explained rather than repeated are all in
[`packages/client/README.md`](packages/client/README.md).

## What it weighs

Not a competitive number — openish is not trying to be a smaller API reference, it is trying to be
one that does not bring Vue. Most of what it ships is Scalar's own Vue-free tooling, on purpose. The
budget is here so a regression is visible, and so nobody has to guess.

Measured with `node scripts/measure-bundle.mjs` (add `--with-scalar` to install and measure Scalar in
a throwaway directory — installing it here would put Vue in the graph and fail `guard:vue`):

| Bundle | Raw | gzip |
|---|---|---|
| **Entry chunk — what arrives before first paint** | 269.7 kB | **73.4 kB** |
| Deferred chunks, fetched when first needed | 803.3 kB | 242.3 kB |
| `@openish/elements`, everything | 1081.0 kB | 313.9 kB |
| `@openish/core` alone | 255.7 kB | 81.3 kB |
| `@openish/client` alone | 10.3 kB | 3.8 kB |
| `@scalar/api-reference` 1.64.0, for reference | 1226.8 kB | 334.4 kB |

The entry chunk was 65.6 kB before the document-fidelity pass that added named examples, callbacks,
per-operation security, `externalDocs`, the rest of the `info` object, the OAuth flow detail, the
parameter serialization keywords and `links`. That is 7.8 kB gzipped for the things the reference was
parsing and not saying, which is the trade this project should make every time.

The number that matters is the first row. Three things are deferred, because none of them is needed
for the page to exist:

- **the markdown pipeline and highlight.js** (`@scalar/code-highlight`, ~176 kB gzip) — the shell,
  the sidebar, the parameter tables and the schema tree need none of it. Prose fills in a beat later;
  a code block renders as plain text first and gains colour when colour arrives, which is the same
  fallback an unknown language has always had, so there is no layout shift either way.
- **the snippet generator** (`@scalar/snippetz`, 27.6 kB gzip) — forty-one client plugins, loaded
  when a sample is first rendered. The client *picker* is built from `@scalar/types`, which is data.
- **the YAML writer**, for the download button, and `ajv`, for validation.

What is left in the entry chunk is mostly the parser and the `$ref` machinery, which is shared with
Scalar because it is the same code. openish's own components, Lit, `@lit/context` and the virtualiser
together are under 40 kB gzipped — the part that replaced a Vue application.

The runtime dependency list is six entries: `lit`, `@lit/context`, `@lit/task`,
`@lit-labs/virtualizer`, `@scalar/code-highlight`, and openish's own packages.

## Accessibility

Checked, not asserted. `packages/elements/test/a11y.test.ts` runs axe over the overview, an
operation, a model with its schema tree expanded, the open search dialog, and the stacked navigation,
in both colour schemes — inside the frame, with the real theme loaded, so contrast rules measure this
palette rather than the browser's defaults.

`packages/elements/test/contrast.test.ts` measures WCAG contrast for the palette directly, which axe
cannot do through nested shadow roots. It runs over **both themes in both schemes** — twelve
combinations — reading each colour through a probe element so `light-dark()` resolves the way it
will when painting. Current numbers for the default theme, AA or better throughout:

| | Light | Dark |
|---|---|---|
| Body text on the page | 17.9:1 | 15.7:1 |
| Muted text on the page | 5.9:1 | 7.6:1 |
| Links | 6.4:1 | 8.4:1 |
| HTTP method chips | 5.5–6.9:1 | 9.1–14.2:1 |
| Syntax colours on the code surface | 4.7–6.2:1 | 7.3–12.3:1 |
| Focus ring, on every surface it lands on¹ | 5.6–6.4:1 | 5.9–8.4:1 |
| Control and action borders¹ | 3.8–4.1:1 | 5.3–6.2:1 |

¹ Non-text, so the floor is 3:1 rather than 4.5:1 — WCAG 1.4.11.

**Focus.** One ring, declared once, drawn as an `outline` so that it follows each element's own
`border-radius` and survives a forced-colors mode. `packages/elements/test/focus.test.ts` tabs
through the overview, an operation, and the request client with real key presses, measuring the ring
at each stop — so a control that stops showing one fails the build, including a control nobody has
written yet. It also covers the two places a ring is not enough on its own: the sidebar tree, which
moves an `aria-activedescendant` cursor the browser's focus never follows and which now marks the row
it is on, and the search dialog, whose result list is navigated with the arrow keys and is therefore
kept out of the tab order.

**Forced colors.** `packages/elements/test/forced-colors.test.ts` drives Chromium into the mode and
checks the three things it takes away: the focus ring, the fill that made a method chip a chip, and
the fill that marked the page a reader is on. Everything else on the page carries its meaning in
words already — a chip says `GET`, a required field says "Required" — so colour was never the only
carrier, and the palette the reader chose simply replaces ours.

## Development

```bash
npm install
npm run dev        # playground at http://localhost:5173
npm run verify     # guards + typecheck + tests
npm run build      # all packages
```

`npm test` runs four projects. `core`, `client` and `elements-pure` run in Node; `elements` runs in real
Chromium via Playwright. The browser is not optional for that last one — the reference needs real
`history`, real `hashchange`, and a `light-dark()` that resolves, so a simulated DOM would only test the
shim. Run `npx playwright install chromium` once.

`elements-pure` is `packages/elements/test/pure/`, and the split is enforcement rather than speed: the URL
and id maths, the plane's scroll target, the virtualiser convergence arithmetic and the OAuth flow
precedence rules are pure functions, and running them in Node is what keeps them that way. Every one of
them was arrived at through a failure rather than derived, and each is now something a test can state a
case about without mounting anything.

## Prior art

Scalar does this well; openish exists because it does it in Vue. Anything openish gets right about OpenAPI
semantics, it got from reading their source.

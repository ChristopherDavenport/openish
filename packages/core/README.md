# @openish/core

The parts of openish that have nothing to do with the DOM.

No Lit, no browser, no rendering. Every export here is a function of its arguments, which is what
makes it testable in Node and what lets a host reuse the hard parts without taking the elements —
`@openish/elements` is one consumer of this package, not the other way round.

```ts
import { createDocumentStore, operationToHar, generateSnippet } from '@openish/core'

const store = await createDocumentStore({ content: document })
const har = operationToHar({ operation, method, path, server })
const sample = generateSnippet(har, 'shell')
```

## What is in here

**Reading a document.** `createDocumentStore` parses and resolves an OpenAPI document — JSON or
YAML, 3.0 or 3.1 — and hands back the resolved tree everything else reads from. `$ref` resolution
comes from Scalar's magic proxy, which has a trap worth knowing about before you recurse over
anything: see "Traps already paid for" in the repository's `PLAN.md`.

**Navigation.** `traverse-document`, `traverse-info` and `traverse-description` build the tree a
reference renders as its sidebar: tags, operations, models, webhooks, and the headings inside a
description. `SlugRegistry` and `joinId` decide the ids those entries carry, which are also the ids
that end up in the URL — so they have to be stable across documents and unique within a page, and
`joinId` is what namespaces them when more than one document is loaded.

**Requests and samples.** `operationToHar` turns an operation into a HAR request: the shape
`@openish/client` sends, and the shape `generateSnippet` renders as a code sample in any of the
clients `snippetClients` lists. Server resolution, parameter serialisation, and `encoding` for
multipart bodies all live here, because all three are decisions about the document rather than about
the page.

**Schemas.** `schemaExample` builds an example value from a schema, cycle-safe; `serializeExample`
renders it as JSON, YAML or XML; `typeLabel` says what a schema is in one line. These are the parts
that took the most failures to get right, and the cycle guard tracks `$ref` pointers rather than
object identity for a reason the `PLAN.md` traps section explains.

**Markdown.** `nodeToMarkdown` renders a navigation node back out as Markdown, which is what "Copy
for LLM" copies.

## Types

`SchemaObject` from `@scalar/openapi-types/3.1` is a discriminated union rather than a bag of
keywords. Code that probes `allOf`, then `enum`, then `items` before knowing what it holds should
read a `Record<string, unknown>` and keep `unknown` in its public signature; narrowing at every
access is noise.

## Licence

MIT.

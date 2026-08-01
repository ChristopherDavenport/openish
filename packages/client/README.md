# @openish/client

Sends the request an OpenAPI document describes, and obtains the token it needs.

No framework, and **no dependencies** — it takes a HAR request, the shape `@openish/core` builds with
`operationToHar`, and a security scheme. It knows nothing about OpenAPI documents, Lit, or the DOM
except in the two OAuth transports, which need a browser by definition.

```ts
import { sendRequest } from '@openish/client'

const result = await sendRequest(har, { proxyUrl })

if (result.ok) {
  console.log(result.status, result.durationMs, result.body)
} else {
  console.log(result.message) // says what happened, not "Failed to fetch"
}
```

Every function that reaches the network takes its `fetch`, which is what makes this testable in Node
and lets a host bring its own transport, proxy, or instrumentation.

## Sending

`sendRequest` returns a result rather than throwing. An HTTP error is **not** a failure — a 404 is an
answer, and a reference that hides it behind an error state hides the thing the reader was testing
for. What is a failure is the browser refusing to make the request at all, which arrives as
`TypeError: Failed to fetch` with no detail whatsoever; the message you get instead names the origin
and the two things that are actually true about it.

Cookie parameters are reported by `unsendableCookies` rather than dropped quietly: script cannot set
`Cookie` on a `fetch`, and pretending otherwise produces a request that silently is not the one the
documentation describes.

## The proxy contract

A host may run a forwarder for APIs that do not allow their origin. openish neither ships nor hosts
one: a proxy sees every credential that passes through it, so it has to be the reader's own
infrastructure. Point `proxyUrl` at it and the contract is one line — the request arrives as

```
POST https://your-proxy.example.com/forward?target=https%3A%2F%2Fapi.example.com%2Fv1%2Faccounts
```

with its method, headers, and body intact. Return whatever the target answers.

## Authentication

Authorization code with PKCE, and OpenID Connect discovery. Other grants are not implemented; a
scheme of any type still accepts a token someone already has, through `AuthSession.setPasted`.

```ts
const { configuration } = await discoverOidc(scheme.openIdConnectUrl)
const pkce = await createPkce()
const state = createState()

const outcome = await authorizeInPopup(
  authorizeUrl({ ...configuration, clientId, redirectUri, scopes, state, challenge: pkce.challenge }),
  state,
)

if (outcome.ok) {
  const token = await exchangeCode({ ...configuration, code: outcome.code, verifier: pkce.verifier, clientId, redirectUri })
}
```

Two rules the code enforces rather than documents:

- **A client secret is only ever sent through `proxyUrl`.** A secret in a page is not a secret.
  Providers that require one for a browser client are misconfigured for that use, and the honest
  answer is to refuse and say so rather than to leak it and work.
- **`state` is verified and the redirect URI must be same-origin.** A code that arrives under a state
  we did not issue was not issued for us, and a redirect URI we do not control is one we cannot read
  the code from anyway.

`AuthSession` holds what the reader has, in memory, for the life of the page and nowhere else.
Persisting a token is a decision with a threat model attached, so it belongs to the host — which is
why `@openish/elements` re-dispatches every change as an event instead of writing to storage.
`session.credentials()` returns exactly the shape `operationToHar`'s `credentials` option takes: that
is the seam between holding a credential and putting one on a request, and it is deliberately the
only way across.

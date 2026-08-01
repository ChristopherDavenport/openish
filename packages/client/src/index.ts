/**
 * The half of an API reference that talks to the API.
 *
 * Everything here is framework-free and dependency-free. It takes a HAR request - the shape
 * `@openish/core` builds from a document - and a security scheme, and knows nothing about OpenAPI
 * documents, Lit, or the DOM beyond the two OAuth transports, which need a browser by definition.
 *
 * Every function that reaches the network takes its `fetch`, which is what makes this testable in
 * Node and lets a host bring its own transport, proxy, or instrumentation.
 */
export type { HarHeader, HarRequest } from './har.js'
export {
  requestUrl,
  sendRequest,
  unsendableCookies,
  type FetchLike,
  type SendFailure,
  type SendFailureReason,
  type SendOptions,
  type SendResult,
  type SendSuccess,
} from './send.js'

export { codeChallenge, createPkce, createState, type Pkce } from './auth/pkce.js'
export {
  clearDiscoveryCache,
  discoverOidc,
  type DiscoveryResult,
  type OidcConfiguration,
} from './auth/discovery.js'
export { authorizeUrl, tokenFromFragment, type AuthorizeRequest } from './auth/authorize-url.js'
export {
  exchangeCode,
  refreshAccessToken,
  requestClientCredentials,
  requestPasswordToken,
  type ClientCredentialsRequest,
  type ExchangeRequest,
  type PasswordRequest,
  type RefreshRequest,
  type TokenOptions,
  type TokenResult,
  type TokenSet,
} from './auth/token.js'
export { AuthSession, type CredentialStore, type Grant, type GrantStatus } from './auth/session.js'
export {
  authorizeInPopup,
  beginRedirect,
  clearPendingRedirect,
  isSameOrigin,
  resumeRedirect,
  type AuthorizationOutcome,
  type AuthorizationRequest,
  type PendingFlow,
  type PopupOptions,
  type RedirectOptions,
  type ResumedFlow,
} from './auth/transport.js'

/**
 * Proof Key for Code Exchange (RFC 7636).
 *
 * A docs page is a public client: it has no secret it can keep, so the authorization code alone is
 * not enough to prove the token request came from whoever started the flow. PKCE closes that by
 * sending a hash up front and the original value at exchange time.
 *
 * WebCrypto only, so this is the same code in a browser and in Node 18+, which is why it can be
 * tested against the RFC's own vector rather than against itself.
 */
export type Pkce = {
  verifier: string
  challenge: string
  method: 'S256'
}

const base64url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const randomBase64url = (bytes: number): string =>
  base64url(crypto.getRandomValues(new Uint8Array(bytes)))

/** The S256 challenge for a verifier: base64url of its SHA-256, with no padding. */
export const codeChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/** 32 random bytes, which base64url-encodes to 43 characters - the shortest length RFC 7636 allows. */
export const createPkce = async (): Promise<Pkce> => {
  const verifier = randomBase64url(32)
  return { verifier, challenge: await codeChallenge(verifier), method: 'S256' }
}

/**
 * An unguessable `state`, which is what ties a callback to the flow that started it.
 *
 * Without it, anything that can reach the redirect URI can hand us a code of its choosing.
 */
export const createState = (): string => randomBase64url(16)

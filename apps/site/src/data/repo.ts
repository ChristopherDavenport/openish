/** The repository the site is about. */
export const REPO_URL = 'https://github.com/ChristopherDavenport/openish'

/**
 * A link to a file in the repository.
 *
 * Every number on the receipts page carries one of these. A claim with no way to check it is a
 * slogan, and the whole argument of that page is that these are checked rather than asserted - so
 * the check has to be one click away, not a filename a reader is trusted to go and find.
 */
export const repoFile = (path: string): string => `${REPO_URL}/blob/main/${path}`

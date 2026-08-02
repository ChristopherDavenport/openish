/**
 * The first match in a subtree, shadow roots included.
 *
 * A selector cannot cross a shadow boundary, and a heading lifted out of `info.description` is
 * stamped inside `<openish-markdown>`'s shadow root - two boundaries below the section that owns it.
 * So finding one is a walk rather than a query.
 *
 * Deliberately not a general-purpose tool. It is only ever run for a navigation that named a
 * heading, and only over the one section that heading is in; running it over a document is a walk of
 * every element in it. The alternative - a parent calling a method on the child that owns the
 * heading - is the shape this exists to avoid, because it makes the child's imperative surface part
 * of its API and the parent's knowledge of the tree part of its own.
 */
export const deepQuery = (root: ParentNode, selector: string): Element | null => {
  const direct = root.querySelector(selector)
  if (direct) {
    return direct
  }

  for (const child of root.querySelectorAll('*')) {
    const found = child.shadowRoot ? deepQuery(child.shadowRoot, selector) : null
    if (found) {
      return found
    }
  }
  return null
}

/**
 * Whether the document asks for something to be left out of the reference.
 *
 * Two spellings, because two ecosystems arrived at this independently and real documents carry
 * either: `x-internal` is the older and more widespread convention, `x-scalar-ignore` is Scalar's.
 * A document that uses both means the same thing by both.
 *
 * This is a *presentation* filter, not a security control. The operation is still in the document
 * the reader can download, and openish says so in the README - anything genuinely private has to be
 * removed before the document is published, not hidden by a viewer that agreed to hide it.
 */
const FLAGS = ['x-internal', 'x-scalar-ignore'] as const

export const isHidden = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  return FLAGS.some((flag) => record[flag] === true)
}

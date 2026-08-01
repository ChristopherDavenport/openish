import type { OperationObject } from '@scalar/openapi-types/3.1'

/**
 * A short label an operation carries beside its path.
 *
 * `tone` is the *semantic* the reference renders with, not a colour: the same badge should look the
 * same as the `Deprecated` badge that has been there since M3, and that one reads its colour from
 * `--openish-color-danger`. Anything unrecognised is neutral rather than guessed at.
 */
export type OperationBadge = {
  label: string
  tone: 'neutral' | 'info' | 'success' | 'danger'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * How `x-scalar-stability` maps onto a tone.
 *
 * `deprecated` is the only one that gets `danger`, and it agrees with the `deprecated: true` badge -
 * a document that says both should not produce two differently coloured badges saying the same
 * thing.
 */
const STABILITY: Record<string, OperationBadge> = {
  stable: { label: 'Stable', tone: 'success' },
  experimental: { label: 'Experimental', tone: 'info' },
  deprecated: { label: 'Deprecated', tone: 'danger' },
}

/** `x-badges` entries name their own colour; only the ones openish has a token for are honoured. */
const TONES = new Set(['neutral', 'info', 'success', 'danger'])

const toneOf = (value: unknown): OperationBadge['tone'] =>
  typeof value === 'string' && TONES.has(value) ? (value as OperationBadge['tone']) : 'neutral'

/**
 * The badges an operation declares, in the order they should be shown.
 *
 * Stability first, because it qualifies the whole operation, then whatever `x-badges` adds. A
 * document that marks an operation `deprecated: true` *and* gives it a `deprecated` stability gets
 * one badge, not two - the caller passes `deprecated` so this function can drop the duplicate rather
 * than leaving the element to notice.
 */
export const operationBadges = (
  operation: OperationObject | undefined,
  { deprecated = false }: { deprecated?: boolean } = {},
): OperationBadge[] => {
  if (!operation) {
    return []
  }

  const record = operation as unknown as Record<string, unknown>
  const badges: OperationBadge[] = []

  const stability = record['x-scalar-stability']
  if (typeof stability === 'string') {
    const known = STABILITY[stability.toLowerCase()]
    if (known && !(deprecated && known.tone === 'danger')) {
      badges.push(known)
    }
  }

  const declared = record['x-badges']
  if (Array.isArray(declared)) {
    for (const entry of declared) {
      if (typeof entry === 'string' && entry.trim() !== '') {
        badges.push({ label: entry.trim(), tone: 'neutral' })
        continue
      }
      if (!isRecord(entry)) {
        continue
      }
      const label = entry['name'] ?? entry['label'] ?? entry['value']
      if (typeof label === 'string' && label.trim() !== '') {
        badges.push({ label: label.trim(), tone: toneOf(entry['color'] ?? entry['tone']) })
      }
    }
  }

  return badges
}

import type { DocumentStore, NavNode } from '@openish/core'

/**
 * What a section *is* on the plane.
 *
 * - `overview` is the one section that is not a node. Every other page is something the traversal
 *   minted; the front of the document is `info`, which has no entry of its own.
 * - `header` is a tag, a tag group, Webhooks or Models: prose and a heading, with the things it
 *   contains following it down the page rather than being listed inside it.
 * - `page` is an operation, a webhook or a model - a section with a body.
 */
export type SectionKind = 'overview' | 'header' | 'page'

/**
 * One section of the document, as the plane wants it.
 *
 * Deliberately not a `NavNode` with extras bolted on: the three fields beside the node are all
 * answers to questions the *renderer* asks - what shape is this, how deep is its heading, does it
 * put anything in the right-hand column - and none of them is a fact about the document. That is
 * also why this lives here and not in `@openish/core`, which has no opinion about columns.
 */
export type Section = {
  /** The id in full, document slug included. `store.source.slug` for the overview. */
  readonly id: string
  /** The node this renders. Absent only for the overview. */
  readonly node: NavNode | undefined
  readonly kind: SectionKind
  /** The heading level this section's own title takes, so the plane has no skipped levels. */
  readonly level: number
  /** Whether the right-hand column has anything in it. */
  readonly hasExample: boolean
}

type Plane = {
  readonly sections: readonly Section[]
  readonly anchors: ReadonlySet<string>
}

const childrenOf = (node: NavNode): readonly NavNode[] =>
  'children' in node && node.children ? node.children : []

/** The deepest heading HTML has. A document nested past this stops getting deeper, not broken. */
const MAX_LEVEL = 6

const NO_SECTIONS: readonly Section[] = Object.freeze([])
const NO_ANCHORS: ReadonlySet<string> = Object.freeze(new Set<string>()) as ReadonlySet<string>

/*
 * Memoised on the store, which is the right key rather than a convenient one: a store is frozen at
 * construction and replaced wholesale when the document changes, so there is no state here that can
 * go stale. That is what lets the root expose the plane as a plain getter - the "a derived value is a
 * getter" rule - without walking six hundred nodes on every render.
 */
const planes = new WeakMap<DocumentStore, Plane>()
const indices = new WeakMap<readonly Section[], ReadonlyMap<string, number>>()

/**
 * The whole document as an ordered list of sections, and the ids that are anchors within one.
 *
 * Both come out of a single pre-order walk, in the reading order `traverseDocument` already puts the
 * tree in: prose, the API surface, webhooks, then the type dictionary.
 *
 * `store.bySlug` is *also* a document-order flattening - `indexNavigation` is the same pre-order walk
 * and a `Map` keeps its insertion order - and filtering it would produce this same sequence today.
 * It is not used, for two reasons. It is the router's index, so reading it as "the document in order"
 * would couple the plane to how a URL resolves; and every section carries `kind`, `level` and
 * `hasExample`, so a filter would have to become a map, at which point it is this walk with an extra
 * step in front of it.
 */
const build = (store: DocumentStore): Plane => {
  const sections: Section[] = [
    { id: store.source.slug, node: undefined, kind: 'overview', level: 1, hasExample: false },
  ]
  const anchors = new Set<string>()

  const walk = (nodes: readonly NavNode[], depth: number): void => {
    for (const node of nodes) {
      /*
       * Heading depth from tree depth, rather than a constant per node type.
       *
       * With `x-tagGroups` the tree is genuinely three deep - group, tag, operation - and a fixed
       * "tags are h2, operations are h3" would give the group and the tag the same level while the
       * document says one contains the other. Counting the walk says what the document says.
       */
      const level = Math.min(depth + 2, MAX_LEVEL)

      switch (node.type) {
        case 'text':
          /*
           * A heading lifted out of `info.description` is a scroll target, not a section.
           *
           * `<openish-overview>` already renders these headings and already stamps them with the very
           * ids the URL uses, so giving them sections of their own would put the same prose on the
           * page twice. They are collected instead, so the plane can recognise an id that means "the
           * overview, scrolled here" and hand it to the overview to find.
           *
           * The recursion is into `childrenOf`, because description headings nest by markdown level
           * and only the roots are reachable from here.
           */
          anchors.add(node.id)
          walk(childrenOf(node), depth)
          break

        case 'tag':
        case 'group':
          sections.push({ id: node.id, node, kind: 'header', level, hasExample: false })
          walk(childrenOf(node), depth + 1)
          break

        default:
          /*
           * A model documents a type; it has no request to show and no response to have got back, so
           * its right-hand column stays empty. An operation and a webhook both have one - a webhook
           * has no request sample, because nobody calls it, but it does have response examples.
           */
          sections.push({ id: node.id, node, kind: 'page', level, hasExample: node.type !== 'model' })
      }
    }
  }

  walk(store.navigation, 0)

  return { sections: Object.freeze(sections), anchors }
}

const planeFor = (store: DocumentStore): Plane => {
  const cached = planes.get(store)
  if (cached) {
    return cached
  }

  const built = build(store)
  planes.set(store, built)
  return built
}

/** Every section of the document, in reading order. */
export const documentSections = (store: DocumentStore | undefined): readonly Section[] =>
  store ? planeFor(store).sections : NO_SECTIONS

/** The ids that name a heading inside the overview rather than a section of their own. */
export const overviewAnchors = (store: DocumentStore | undefined): ReadonlySet<string> =>
  store ? planeFor(store).anchors : NO_ANCHORS

/**
 * Where each section sits, so an id can become an index without a scan.
 *
 * Every navigation is an id and the virtualiser speaks indices, so this conversion happens on each
 * one. Memoised on the list rather than on the store, because the list is what it describes - and
 * the list is itself memoised per store, so its identity is stable enough to be a key.
 */
export const sectionIndex = (sections: readonly Section[]): ReadonlyMap<string, number> => {
  const cached = indices.get(sections)
  if (cached) {
    return cached
  }

  const index = new Map<string, number>()
  sections.forEach((section, position) => index.set(section.id, position))
  indices.set(sections, index)
  return index
}

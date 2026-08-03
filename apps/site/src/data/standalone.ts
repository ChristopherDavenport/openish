import type { SiteExampleSpec } from './example.js'

/**
 * The elements that stand up on their own, and the markup that stands them up.
 *
 * The claim these exist to support is the one the README opens with: openish is a set of web
 * components, not an application with a component-shaped wrapper. An element that only works inside
 * `<openish-api-reference>` is really a private part of it, and the honest way to find out which are
 * which was to try.
 *
 * Not every element is here, and the gaps are the interesting part. `<openish-operation>`,
 * `<openish-parameters>` and the rest of the section elements read a `DocumentStore` through
 * context, so standing one up alone means building most of a reference first - they are pieces of
 * the page rather than components in their own right, and listing them here with a contrived store
 * would be claiming something untrue.
 *
 * Every entry is a `SiteExampleSpec`, so `apps/site/test/examples.test.ts` checks each one against
 * `custom-elements.json` in Node: an element whose API moved takes its demo down with it, in
 * milliseconds, rather than rendering wrong on a deployed page.
 */
export const STANDALONE_EXAMPLES: Readonly<Record<string, SiteExampleSpec>> = {
  'openish-code-block': {
    markup: `<openish-code-block language="json"></openish-code-block>`,
    props: {
      code: JSON.stringify({ id: 'plt_01H8X', name: 'Kepler-22b', discovered: 2011 }, null, 2),
    },
    height: 'auto',
  },

  /*
   * `content` is a callback rather than a value, and it is not optional: only the selected panel is
   * rendered, so a tab set with fifteen responses generates one schema example rather than fifteen.
   * The first version of this example left it out and the element threw on first render - which is
   * how the browser smoke test in `standalone.browser.test.ts` came to exist.
   */
  'openish-tabs': {
    markup: `<openish-tabs label="Response status codes"></openish-tabs>`,
    props: {
      selected: 'ok',
      tabs: [
        { id: 'ok', label: '200', hint: 'The planet', tone: 'success', content: () => 'The planet you asked for.' },
        { id: 'missing', label: '404', hint: 'No such planet', tone: 'danger', content: () => 'No planet by that id.' },
      ],
    },
    height: 'auto',
  },

  'openish-table': {
    markup: `<openish-table caption="Query parameters"></openish-table>`,
    props: {
      columns: ['Name', 'In', 'Type'],
      rows: [
        { cells: ['limit', 'query', 'integer'] },
        { cells: ['cursor', 'query', 'string'] },
      ],
    },
    height: 'auto',
  },

  'openish-disclosure': {
    markup: `<openish-disclosure summary="What a disclosure is for"></openish-disclosure>`,
    height: 'auto',
  },

  'openish-markdown': {
    markup: `<openish-markdown></openish-markdown>`,
    props: {
      markdown:
        '### Rendered here\n\nThe markdown pipeline is one of the three chunks openish defers, so this block arrived a beat after the page did — `code`, **bold**, and a [link](https://example.com).',
    },
    height: 'auto',
  },

  /*
   * `source` is a callback rather than a string, so that what lands on the clipboard is worked out
   * when the button is pressed rather than when it was rendered. The listing prints the function's
   * own source - which is the case `printExample` handles specially, because `JSON.stringify` turns
   * a function into `undefined` and would have quietly dropped the only interesting line here.
   */
  'openish-copy-button': {
    markup: `<openish-copy-button label="the planet id"></openish-copy-button>`,
    props: { source: () => 'plt_01H8X' },
    height: 'auto',
  },

  /**
   * The recursive, cycle-safe property tree, on a schema that references itself.
   *
   * `$defs` and a local `$ref` mean the cycle is real rather than illustrated: the tree expands a
   * level at a time and a self-referential type cannot hang it, which is the behaviour a document
   * full of linked resources depends on.
   */
  'openish-schema-preview': {
    markup: `<openish-schema-preview label="application/json"></openish-schema-preview>`,
    props: {
      schema: {
        type: 'object',
        title: 'Comment',
        required: ['id', 'body'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          body: { type: 'string', description: 'What was said.' },
          author: {
            type: 'object',
            properties: { name: { type: 'string' }, handle: { type: 'string' } },
          },
          replies: {
            type: 'array',
            description: 'Comments on this comment. Self-referential, and safe.',
            items: { $ref: '#' },
          },
        },
      },
    },
    height: 'auto',
  },
}

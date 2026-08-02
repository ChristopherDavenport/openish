import { render } from 'lit'
import { describe, expect, it } from 'vitest'

import { heading } from '../src/render/heading.js'

const rendered = (level: number, classes: Record<string, boolean> = {}): Element => {
  const host = document.createElement('div')
  render(heading(level, 'Accounts', classes), host)
  return host.firstElementChild!
}

describe('a heading', () => {
  it('takes the level it is given', () => {
    expect([1, 2, 3, 4, 5, 6].map((level) => rendered(level).tagName)).toEqual([
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
    ])
  })

  it('clamps rather than producing a tag that does not exist', () => {
    expect(rendered(0).tagName).toBe('H1')
    expect(rendered(-3).tagName).toBe('H1')
    /* h6 is the floor, the same one the markdown pipeline clamps demoted prose headings to. */
    expect(rendered(7).tagName).toBe('H6')
    expect(rendered(99).tagName).toBe('H6')
  })

  it('carries its content and its classes, so weight does not come from the tag', () => {
    const element = rendered(4, { title: true, deprecated: false })

    expect(element.textContent).toBe('Accounts')
    expect(element.classList.contains('title')).toBe(true)
    expect(element.classList.contains('deprecated')).toBe(false)
  })
})

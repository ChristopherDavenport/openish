import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { createRef, ref } from 'lit/directives/ref.js'
import { repeat } from 'lit/directives/repeat.js'

import '../components/site-demo-scope.js'
import { ElementsLoader } from '../controllers/elements-loader.js'
import { SCALE_STEPS, makeLargeDocument, operationCount } from '../data/large-document.js'
import { repoFile } from '../data/repo.js'
import { siteControlStyles, siteProseStyles, siteStyles } from '../styles/shared.js'

type Measurement = {
  readonly operations: number
  /** Milliseconds from handing the document over to the first section being on the page. */
  readonly toFirstPaint: number
  /** Elements in the reference's shadow trees once it has settled. */
  readonly nodes: number
}

/**
 * How long a large document takes to open, measured here rather than claimed.
 *
 * The document is generated in the browser when the reader asks for it — see `large-document.ts` —
 * so the number is theirs, on their machine, and nothing was fetched to produce it. A page that
 * asserts "221 operations in under half a second" and shows a screenshot is asking to be believed;
 * this one is just a stopwatch.
 *
 * The node count is the other half, and the more surprising one. A thousand operations is a
 * thousand sections, and only the handful in view are in the DOM — which is what a virtualised
 * plane means, stated as a number instead of an adjective. It is also the cost side of the trade:
 * find-in-page can only find what is on the page, which is why the search dialog exists.
 */
@customElement('site-page-scale')
export class SitePageScale extends LitElement {
  static override styles = [
    siteStyles,
    siteControlStyles,
    siteProseStyles,
    css`
      :host {
        display: block;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--openish-space-xs);
        margin-bottom: var(--openish-space-md);
      }

      table {
        border-collapse: collapse;
        margin-bottom: var(--openish-space-md);
        font: var(--openish-font-small);
      }

      th,
      td {
        text-align: start;
        padding: var(--openish-space-2xs) var(--openish-space-sm);
        border-bottom: 1px solid var(--openish-color-border);
      }

      td.figure {
        text-align: end;
        font: var(--openish-font-code-small);
      }

      thead th {
        font: var(--openish-font-small-bold);
        color: var(--openish-color-text-muted);
      }

      .status {
        font: var(--openish-font-small);
        color: var(--openish-color-text-muted);
      }
    `,
  ]

  readonly #elements = new ElementsLoader(this)
  readonly #host = createRef<HTMLDivElement>()

  @state()
  private measurements: readonly Measurement[] = []

  @state()
  private busy = false

  /**
   * Times one document, from handing it over to the first section existing.
   *
   * The reference is rebuilt for each run rather than re-fed, because opening a document is the
   * thing being measured and an element that already has one would be measuring something else.
   *
   * "First paint" is the first rendered section, found by polling on animation frames. There is no
   * event for it — the reference is not ours to instrument — and a frame-granularity answer is the
   * right resolution anyway: nothing below one frame is visible to a reader.
   */
  async #run(operations: number, tags: number): Promise<void> {
    const host = this.#host.value
    if (!host || this.busy) {
      return
    }

    this.busy = true
    const document_ = makeLargeDocument(operations, tags)
    const actual = operationCount(document_)

    host.replaceChildren()
    const reference = window.document.createElement('openish-api-reference')
    reference.setAttribute('routing', 'none')
    reference.style.blockSize = '100%'
    reference.style.display = 'block'

    const started = performance.now()
    Object.assign(reference, { spec: document_ })
    host.append(reference)

    const toFirstPaint = await waitForFirstSection(reference, started)
    /* Let the virtualiser settle before counting, or the count is of a half-built page. */
    await new Promise((resolve) => setTimeout(resolve, 400))

    this.measurements = [
      ...this.measurements.filter((entry) => entry.operations !== actual),
      { operations: actual, toFirstPaint, nodes: countElements(reference) },
    ].sort((a, b) => a.operations - b.operations)
    this.busy = false
  }

  override render(): TemplateResult {
    return html`
      <h1>What a large document costs</h1>
      <p class="lede">
        Generate one, here, now, and time it. Nothing is fetched and nothing is committed — the
        document is built in this tab by
        <a href=${repoFile('apps/site/src/data/large-document.ts')} rel="external"
          ><code>large-document.ts</code></a
        >, which is a generator rather than a file.
      </p>

      <div class="actions">
        ${repeat(
          SCALE_STEPS,
          (step) => step.operations,
          (step) => html`
            <button type="button" ?disabled=${this.busy} @click=${() => void this.#run(step.operations, step.tags)}>
              ${step.operations} operations
            </button>
          `,
        )}
        <span class="status">
          ${this.busy
            ? 'Generating and opening…'
            : this.#elements.ready
              ? 'Pick a size.'
              : 'Loading the reference…'}
        </span>
      </div>

      ${this.measurements.length > 0
        ? html`
            <table>
              <thead>
                <tr>
                  <th scope="col">Operations</th>
                  <th scope="col">To first section</th>
                  <th scope="col">Elements in the DOM</th>
                </tr>
              </thead>
              <tbody>
                ${repeat(
                  this.measurements,
                  (entry) => entry.operations,
                  (entry) => html`
                    <tr>
                      <td class="figure">${entry.operations}</td>
                      <td class="figure">${Math.round(entry.toFirstPaint)} ms</td>
                      <td class="figure">${entry.nodes}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `
        : ''}

      <site-demo-scope .height=${'min(70vh, 34rem)'}>
        <div ${ref(this.#host)} style="block-size: 100%"></div>
      </site-demo-scope>

      <h2>What the second column means</h2>
      <p>
        The element count barely moves between fifty operations and a thousand, because only a window
        of sections is ever in the DOM. That is what makes the first column flat, and it is the whole
        of the trade — the cost is that find-in-page can only find what is on the page.
      </p>
      <p>
        The search dialog is the answer to that, and it finds <em>more</em> than the browser would:
        it indexes titles, descriptions, parameter names, body fields, response descriptions and
        model fields, including sections that have never been rendered. Copy-for-LLM is the other
        half — a whole section, or a whole tag, as Markdown built from the document rather than from
        the page.
      </p>
    `
  }
}

/**
 * Elements in an element's shadow tree, and every shadow tree below it.
 *
 * Counted across shadow roots because that is where a web component's DOM actually is - a count of
 * the light DOM would be one element, always, which would make the point far too well.
 */
const countElements = (host: Element): number => {
  let total = 0
  const walk = (node: ParentNode): void => {
    for (const element of node.querySelectorAll('*')) {
      total += 1
      if (element.shadowRoot) {
        walk(element.shadowRoot)
      }
    }
  }
  if (host.shadowRoot) {
    walk(host.shadowRoot)
  }
  return total
}

/**
 * Resolves when the reference has put a section on the page.
 *
 * Polled on animation frames rather than awaited on an event, because there is no event: openish
 * announces navigation, not "I have painted". A frame is the right granularity regardless — a
 * difference smaller than one is a difference no reader can see. The ceiling is there so that a
 * document that never renders reports a number instead of hanging the page.
 */
const waitForFirstSection = (reference: Element, started: number): Promise<number> =>
  new Promise((resolve) => {
    const deadline = started + 20_000
    const look = (): void => {
      const found = reference.shadowRoot?.querySelector('openish-section-list, openish-operation, openish-overview')
      if (found ?? performance.now() > deadline) {
        resolve(performance.now() - started)
        return
      }
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  })

declare global {
  interface HTMLElementTagNameMap {
    'site-page-scale': SitePageScale
  }
}

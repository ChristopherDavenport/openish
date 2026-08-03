import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

import { siteProseStyles, siteStyles } from '../styles/shared.js'
import { CONTRAST, GUARANTEES, GUARDS } from '../data/receipts.js'
import { BUNDLE, DEFERRED, MEASURED_ON, MEASURE_COMMAND, RUNTIME_DEPENDENCIES } from '../data/sizes.js'
import { repoFile } from '../data/repo.js'

const kb = (value: number): string => `${value.toFixed(1)} kB`

/**
 * The receipts.
 *
 * This is the one page on the site that is mostly prose, and it is the page the rest of it is
 * standing on. Every number here carries a link to the file that produced it, because the whole
 * claim being made is "checked, not asserted" - and a table of numbers with nothing behind it makes
 * exactly the opposite case while looking identical.
 *
 * The bundle table is carried by hand, which is a liability the page states rather than hides. The
 * README's own copy drifted for ten milestones before anyone re-measured it, and there is no reason
 * to believe a second copy will behave better. Rendering the date and the command is the honest
 * interim; generating the file in CI is the fix.
 */
@customElement('site-page-why')
export class SitePageWhy extends LitElement {
  static override styles = [
    siteStyles,
    siteProseStyles,
    css`
      :host {
        display: block;
      }

      .scroller {
        overflow-x: auto;
        margin-bottom: var(--openish-space-md);
      }

      table {
        border-collapse: collapse;
        width: 100%;
        min-width: 30rem;
        font: var(--openish-font-small);
      }

      caption {
        text-align: start;
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
        padding-bottom: var(--openish-space-2xs);
      }

      th,
      td {
        text-align: start;
        padding: var(--openish-space-2xs) var(--openish-space-sm);
        border-bottom: 1px solid var(--openish-color-border);
      }

      thead th {
        font: var(--openish-font-small-bold);
        color: var(--openish-color-text-muted);
      }

      td.figure,
      th.figure {
        text-align: end;
        font: var(--openish-font-code-small);
      }

      tr.emphasis td {
        font: var(--openish-font-small-bold);
        background: var(--openish-color-surface-selected);
      }

      tr.emphasis td.figure {
        font: var(--openish-font-code-small);
        font-weight: 700;
      }

      .footnote {
        font: var(--openish-font-micro);
        color: var(--openish-color-text-muted);
        max-width: 68ch;
      }

      dl {
        max-width: 68ch;
        margin: 0 0 var(--openish-space-md);
      }

      dt {
        font: var(--openish-font-body-bold);
        margin-top: var(--openish-space-sm);
      }

      dd {
        margin: var(--openish-space-3xs) 0 0;
        color: var(--openish-color-text-muted);
      }

      dd .cost {
        color: var(--openish-color-text);
        font: var(--openish-font-code-small);
      }

      .deps {
        display: flex;
        flex-wrap: wrap;
        gap: var(--openish-space-2xs);
        padding: 0;
        margin: 0 0 var(--openish-space-md);
        list-style: none;
        max-width: none;
      }

      .deps li {
        margin: 0;
        padding: var(--openish-space-3xs) var(--openish-space-xs);
        font: var(--openish-font-code-small);
        background: var(--openish-color-surface-muted);
        border-radius: var(--openish-radius-pill);
      }
    `,
  ]

  #bundleTable(): TemplateResult {
    return html`
      <div class="scroller">
        <table>
          <caption>
            Measured ${MEASURED_ON} with <code>${MEASURE_COMMAND}</code>. Bundled as an application
            would bundle it: one ESM entry, minified, tree-shaken, split at its dynamic imports.
          </caption>
          <thead>
            <tr>
              <th scope="col">Bundle</th>
              <th scope="col" class="figure">Raw</th>
              <th scope="col" class="figure">gzip</th>
            </tr>
          </thead>
          <tbody>
            ${repeat(
              BUNDLE,
              (row) => row.label,
              (row) => html`
                <tr class=${row.emphasis ? 'emphasis' : ''}>
                  <td>${row.label}</td>
                  <td class="figure">${kb(row.raw)}</td>
                  <td class="figure">${kb(row.gzip)}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `
  }

  #contrastTable(): TemplateResult {
    return html`
      <div class="scroller">
        <table>
          <caption>
            The default theme, in both schemes. AA or better throughout.
          </caption>
          <thead>
            <tr>
              <th scope="col">Measured</th>
              <th scope="col" class="figure">Light</th>
              <th scope="col" class="figure">Dark</th>
            </tr>
          </thead>
          <tbody>
            ${repeat(
              CONTRAST,
              (row) => row.label,
              (row) => html`
                <tr>
                  <td>${row.label}${row.nonText ? html`<sup>†</sup>` : ''}</td>
                  <td class="figure">${row.light}</td>
                  <td class="figure">${row.dark}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
      <p class="footnote">
        † Non-text, so the floor is 3:1 rather than 4.5:1 — WCAG 1.4.11.
      </p>
    `
  }

  override render(): TemplateResult {
    return html`
      <h1>Why you can believe any of this</h1>
      <p class="lede">
        Every number on this page has a file behind it, and every one of those links to the file.
        A claim with nothing to check it against is a slogan, and a table of figures that nothing
        produces reads like measurement while being exactly that.
      </p>

      <h2>What it weighs</h2>
      <p>
        Not a competitive number. openish is not trying to be a smaller API reference — it is trying
        to be one that does not bring Vue, and most of what it ships is Scalar’s own Vue-free tooling
        on purpose. The budget is here so a regression is visible.
      </p>
      ${this.#bundleTable()}
      <p>
        <strong>The first row is the one that matters.</strong> A total is not what a reader waits
        for. Three things are deferred, because none of them is needed for the page to exist:
      </p>
      <dl>
        ${repeat(
          DEFERRED,
          (item) => item.what,
          (item) => html`
            <dt>${item.what} <span class="cost">— ${item.cost}</span></dt>
            <dd>${item.why}</dd>
          `,
        )}
      </dl>
      <p class="footnote">
        This table is carried by hand, and the copy of it in the README drifted for ten milestones
        before anyone re-measured. That is why the date and the command are printed above it: run
        <code>${MEASURE_COMMAND}</code> and you will get your own numbers rather than these.
      </p>

      <h2>What it depends on</h2>
      <p>Six entries, at runtime, in a consumer’s graph:</p>
      <ul class="deps">
        ${repeat(RUNTIME_DEPENDENCIES, (dep) => dep, (dep) => html`<li>${dep}</li>`)}
      </ul>
      <p>
        What is left in the entry chunk is mostly the parser and the <code>$ref</code> machinery,
        which is shared with Scalar because it <em>is</em> the same code. openish’s own components,
        Lit, <code>@lit/context</code> and the virtualiser together are under 40 kB gzipped — that is
        the part which replaced a Vue application.
      </p>

      <h2>Accessibility</h2>
      <p>
        Checked, not asserted — and checked inside a real frame with the real theme loaded, so
        contrast rules measure this palette rather than the browser’s defaults.
      </p>
      ${this.#contrastTable()}
      <dl>
        ${repeat(
          GUARANTEES,
          (item) => item.test,
          (item) => html`
            <dt>${item.title}</dt>
            <dd>
              ${item.detail}
              <br />
              <a href=${repoFile(item.test)} rel="external"><code>${item.test}</code></a>
            </dd>
          `,
        )}
      </dl>

      <h2>What the build refuses</h2>
      <p>
        ${GUARDS.length} guards run before the type checker and the tests. Each one exists because
        the thing it forbids had already happened at least once — the newest of them four times.
      </p>
      <dl>
        ${repeat(
          GUARDS,
          (guard) => guard.name,
          (guard) => html`
            <dt><code>${guard.name}</code></dt>
            <dd>
              ${guard.what}
              <br />
              <a href=${repoFile(guard.script)} rel="external"><code>${guard.script}</code></a>
            </dd>
          `,
        )}
      </dl>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'site-page-why': SitePageWhy
  }
}

import '@openish/elements'
import './playground.css'

import type { ColorScheme } from '@openish/core'
import type { OpenishApiReference } from '@openish/elements'

import { applyColorScheme, initialColorScheme } from './theme.js'
import { loadInitialSpec, loadSpecFromFiles, type PlaygroundSources } from './spec-source.js'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('#app is missing from index.html')
}

app.innerHTML = `
  <header class="bar">
    <strong>openish</strong>
    <span id="source" class="file"></span>
    <span class="spacer"></span>
    <label class="file">
      Load documents
      <input id="file" type="file" accept=".yaml,.yml,.json" multiple />
    </label>
    <button id="scheme" type="button"></button>
  </header>
  <openish-api-reference id="reference"></openish-api-reference>
`

const reference = app.querySelector<OpenishApiReference>('#reference')!
const sourceLabel = app.querySelector<HTMLElement>('#source')!
const schemeButton = app.querySelector<HTMLButtonElement>('#scheme')!
const fileInput = app.querySelector<HTMLInputElement>('#file')!

let colorScheme: ColorScheme = initialColorScheme()

const applyScheme = (scheme: ColorScheme) => {
  colorScheme = scheme
  applyColorScheme(scheme)
  reference.colorScheme = scheme
  schemeButton.textContent = scheme === 'dark' ? 'Light' : 'Dark'
}

schemeButton.addEventListener('click', () => {
  applyScheme(colorScheme === 'dark' ? 'light' : 'dark')
})

/*
 * The reference applies a scheme to itself - `color-scheme` is reflected and the theme matches the
 * attribute - and re-dispatches so the host can do the parts only it can: style its own chrome, and
 * remember the choice. This is that host doing its half.
 *
 * `auto` is skipped rather than mapped to a concrete scheme: the point of it is that nobody decides,
 * so the toolbar has nothing to store and the page falls back to `prefers-color-scheme` like the
 * reference does.
 */
reference.addEventListener('openish-color-scheme-change', (event) => {
  if (event.detail !== 'auto' && event.detail !== colorScheme) {
    applyScheme(event.detail)
  }
})

fileInput.addEventListener('change', () => {
  const files = [...(fileInput.files ?? [])]
  if (files.length > 0) {
    void loadSpecFromFiles(files).then(show)
  }
})

const sizeOf = (text: string) => `${(text.length / 1024).toFixed(0)} KB`

/*
 * One document goes to `spec` and several to `sources`, because that is the difference the
 * playground exists to be able to see: `spec` keeps today's URLs and shows no picker, `sources`
 * namespaces every URL and shows one.
 */
const show = (loaded: PlaygroundSources) => {
  if (loaded.kind === 'single') {
    sourceLabel.textContent = `${loaded.source.label} · ${sizeOf(loaded.source.text)}`
    reference.sources = undefined
    reference.spec = loaded.source.text
    return
  }

  sourceLabel.textContent = loaded.sources
    .map((source) => `${source.label} · ${sizeOf(source.text)}`)
    .join(' + ')
  reference.spec = undefined
  reference.sources = loaded.sources.map((source) => ({
    ...(source.name ? { slug: source.name } : {}),
    content: source.text,
  }))
}

applyScheme(colorScheme)
show(await loadInitialSpec())

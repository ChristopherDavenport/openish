import '@openish/elements'
import './playground.css'

import type { ColorScheme } from '@openish/core'
import type { OpenishApiReference } from '@openish/elements'

import { applyColorScheme, initialColorScheme } from './theme.js'
import { loadInitialSpec, loadSpecFromFile, type SpecSource } from './spec-source.js'

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
      Load a document
      <input id="file" type="file" accept=".yaml,.yml,.json" />
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
 * The reference re-dispatches scheme changes rather than applying them: only the host can swap the
 * Jack Henry theme, which is declared at `:root`. This is that host doing its half.
 */
reference.addEventListener('openish-color-scheme-change', (event) => {
  if (event.detail !== colorScheme) {
    applyScheme(event.detail)
  }
})

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) {
    void loadSpecFromFile(file).then(show)
  }
})

const show = (source: SpecSource) => {
  sourceLabel.textContent = `${source.label} · ${(source.text.length / 1024).toFixed(0)} KB`
  reference.spec = source.text
}

applyScheme(colorScheme)
show(await loadInitialSpec())

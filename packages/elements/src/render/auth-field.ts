import { html, type TemplateResult } from 'lit'

/** A labelled input row, since the two direct grants need three of the same shape. */
export const renderAuthField = (input: {
  /** Scoped to the scheme, because several schemes' forms can be built in one document. */
  readonly scheme: string
  readonly id: string
  readonly label: string
  readonly type: 'text' | 'password'
  readonly value: string
  readonly onInput: (value: string) => void
}): TemplateResult => html`
  <div class="row">
    <label class="key" for="${input.id}-${input.scheme}">${input.label}</label>
    <div class="value">
      <input
        id="${input.id}-${input.scheme}"
        type=${input.type}
        autocomplete="off"
        spellcheck="false"
        .value=${input.value}
        @input=${(event: Event) => input.onInput((event.target as HTMLInputElement).value)}
      />
    </div>
  </div>
`

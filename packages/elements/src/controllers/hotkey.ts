import type { ReactiveController, ReactiveControllerHost } from 'lit'

export type Hotkey = {
  /** `event.key`, compared case-insensitively. */
  key: string
  /** Require Cmd or Ctrl. `false` means the bare key. */
  modifier?: boolean
}

/**
 * Whether a keystroke belongs to whatever the reader is typing in.
 *
 * `event.target` is retargeted at a shadow boundary, so it reports the host element rather than the
 * field inside it - `composedPath()[0]` is the only way to see what actually has focus.
 */
const isTyping = (event: KeyboardEvent): boolean => {
  const target = event.composedPath()[0]
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement)
  )
}

/**
 * Page-level keyboard shortcuts, bound to the host's connected lifetime.
 *
 * There is no template binding for a listener on `window`, so this is where a `ReactiveController`
 * earns its place: the subscription is attached and released by the host's own lifecycle instead of
 * by a pair of `connectedCallback`/`disconnectedCallback` overrides that have to be kept in step.
 *
 * A bare key is never taken from a field someone is using - `/` is a character before it is a
 * shortcut - while a modified one is, because Cmd-K types nothing.
 */
export class HotkeyController implements ReactiveController {
  readonly #keys: readonly Hotkey[]
  readonly #run: (event: KeyboardEvent) => void

  constructor(host: ReactiveControllerHost, keys: readonly Hotkey[], run: (event: KeyboardEvent) => void) {
    this.#keys = keys
    this.#run = run
    host.addController(this)
  }

  hostConnected(): void {
    window.addEventListener('keydown', this.#onKeydown)
  }

  hostDisconnected(): void {
    window.removeEventListener('keydown', this.#onKeydown)
  }

  readonly #onKeydown = (event: KeyboardEvent): void => {
    const modified = event.metaKey || event.ctrlKey

    for (const hotkey of this.#keys) {
      if (event.key.toLowerCase() !== hotkey.key.toLowerCase()) {
        continue
      }
      if (Boolean(hotkey.modifier) !== modified) {
        continue
      }
      if (!hotkey.modifier && isTyping(event)) {
        return
      }

      event.preventDefault()
      this.#run(event)
      return
    }
  }
}

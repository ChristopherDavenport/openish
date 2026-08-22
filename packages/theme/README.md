# @openish/theme

Every colour, font and spacing value openish resolves, as `--openish-*` custom properties.

One stylesheet is the whole styling requirement:

```html
<link rel="stylesheet" href="@openish/theme/index.css" />
```

Nothing is fetched. Fonts are the platform's own stacks, so there is no font host to allow and
nothing to self-host.

## Why a package rather than component CSS

A shadow root inherits a page's **custom properties** but not its **class rules**. That split is the
whole design: tokens travel into every shadow root openish renders, selectors do not. It is also a
trap paid for once already — the syntax-highlight colours lived here for three milestones and
coloured nothing, because `.hljs-keyword` in a host stylesheet never matches inside a shadow root.
The rules are component CSS now and the `--openish-hl-*` hooks stayed here.

For the same reason `index.css` includes the highlight hooks rather than leaving them to a second
import: a host that followed the README got body-coloured code blocks and nothing to suggest why.

## Choosing a scheme

Dark follows the reader's system preference by default. To decide it yourself, put a class on
`<html>` — either beats the media query, so either one is final:

```js
document.documentElement.classList.toggle('openish-dark', scheme === 'dark')
document.documentElement.classList.add('openish-light')  // never dark, whatever the OS says
```

## Jack Henry

For a page that already has the Jack Henry Design System on it, import `@openish/theme/jh.css`
instead — the same hooks, bound to JH alias tokens, so openish inherits that page's palette rather
than sitting next to it in its own. `@jack-henry/jh-core` is a peer dependency of that entry only;
the default entry has no dependencies at all.

## Entries

| Import | What it is |
|---|---|
| `@openish/theme` / `/index.css` | The default: layout, tokens and highlight hooks, self-contained |
| `/jh.css` | The same hooks bound to Jack Henry alias tokens |
| `/tokens.css`, `/layout.css`, `/highlight.css` | The three halves of the default entry, separately |
| `/light.css`, `/dark.css` | One scheme only, for a page that has already decided |
| `/fonts.css` | Opt-in font declarations |

## Licence

MIT.

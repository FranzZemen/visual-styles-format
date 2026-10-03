# @franzzemen/visual-styles-format

The file format behind Broken Stock's Visual Styles panel
(`broken-stock/doc/prd/visual-styles.prd.md`, epic E2): the shape of `visual-styles.json`, its strict
validation, and the generators that turn it into `visual-styles.css` and a Tailwind `@theme` block.

Pure TypeScript — no Angular, no DOM, no Node APIs — so the panel (browser), the local save server
(`visualstyles-app`) and broken-stock's agreement test all run the same code.

| Doc | |
|---|---|
| [doc/intent/visual-styles-format.intent.md](doc/intent/visual-styles-format.intent.md) | Why it exists, the rules that must not be broken |
| [doc/usage/visual-styles-format.usage.md](doc/usage/visual-styles-format.usage.md) | Calling it, with real output |

## Usage

```ts
import {
  parseVisualStyles, validateVisualStyles, generateCss, generateTailwindTheme,
  resolveEntry, followersOf, diffVisualStyles, contentHash, formatVisualStyles
} from '@franzzemen/visual-styles-format';

const {file, errors} = parseVisualStyles(text);   // errors: every reason it is refused
if (file) {
  const css = generateCss(file);                  // visual-styles.css
  const theme = generateTailwindTheme(file);      // the @theme inline block
}
```

`generateCss` / `generateTailwindTheme` throw `VisualStylesInvalidError` (carrying every error) when
handed an invalid file. Validation never repairs anything.

## File shape

```json
{
  "formatVersion": 1,
  "entries": [
    {"name": "profit.text", "kind": "colour", "group": "Meaning", "description": "Profit text",
     "value": "#1b5e20", "legacyName": "--color-profit", "tailwind": true},
    {"name": "since.unrealized-zero", "kind": "colour", "group": "Since chart",
     "description": "Unrealized zero line", "follow": {"target": "since.unrealized", "opacity": 40},
     "chart": [{"scope": ".bs-chart-since", "selector": ".bs-zero-unrealized", "property": "stroke"}]},
    {"name": "chart.line.width", "kind": "number", "group": "Chart look",
     "description": "Default line width", "value": 1.5, "unit": "px"}
  ]
}
```

| Field | Rule |
|---|---|
| `name` | `[a-z0-9.-]`, starts with a letter, no empty segment; unique, and unique after `.`→`-` |
| `kind` | `colour` or `number` |
| `group`, `description` | non-empty text for the panel; never written into CSS |
| `value` | exactly one of `value` / `follow`. Colour: string in the colour grammar. Number: a JSON number |
| `unit` | numbers with a `value` only, required: `px`, `rem`, `em`, `%`, `none` (unitless) |
| `follow` | `{target, opacity?}` — target exists, same kind, no loops; `opacity` 0–100, colours only |
| `background` | colours only; an existing colour entry; absent means `surface` (contrast check) |
| `chart` | array of `{scope, selector, property}`; no two entries drive the same triple |
| `legacyName` | an existing custom property taken over, e.g. `--color-profit`; never `--vs-…`; unique |
| `tailwind` | colours only; also emit into the Tailwind `@theme inline` block |

Unknown fields are refused at every level.

## Grammar (refused, never cleaned)

- **Colour:** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`; `rgb()`/`rgba()` with 3 channels (0–255 or
  0–100%) and optional alpha (0–1 or 0–100%); `hsl()`/`hsla()` with hue (number, optional `deg`),
  saturation and lightness in %. Comma or space syntax (`rgb(1 2 3 / 50%)`). No keywords — write
  `#0000`, not `transparent`.
- **Number:** finite, not exponent form, plus a unit from the list above.
- **Chart scope:** one class (`.bs-chart-since`). **Selector:** class compounds joined by single
  spaces (`.bs-s-ema9 .highcharts-graph`, `.highcharts-point.highcharts-point-up`). No elements,
  ids, attributes, pseudo-classes or other combinators. **Property:** colour entries `fill`, `stroke`,
  `color`, `background-color`, `border-color`, `outline-color`, `stop-color`; number entries
  `stroke-width`, `font-size`, `font-weight`, `line-height`, `border-width`, `opacity`,
  `fill-opacity`, `stroke-opacity`.
- Any CSS-bound string containing `url(`, `;`, `{`, `}`, `\`, `/*`, `*/`, quotes, `<`, `>` or a
  control character is refused outright.

## Name mapping

| | Example |
|---|---|
| entry name | `profit.text` |
| CSS variable (always) | `--vs-profit-text` (dots become dashes) |
| legacy alias (with `legacyName`) | `--color-profit: var(--vs-profit-text);` |
| Tailwind theme name | `legacyName` if it starts with `--color-`, else `--color-` + CSS name without `--vs-` |

Generated CSS: a stamp line naming this package's version, then `:root` variables (sorted by CSS
name), then the legacy aliases (sorted), then chart rules
`.scope .selector { property: var(--vs-…); }` (sorted by scope, selector, property). A follow is
`var(--vs-target)`; an opacity follow is
`color-mix(in srgb, var(--vs-target) 40%, transparent)`. Output does not depend on entry or field
order. `readGeneratorStamp(css)` reads the stamp back.

## Tailwind block — why `@theme inline`

```css
@theme inline {
  --color-profit: var(--vs-profit-text);
}
```

With `inline` (tailwindcss 4.3.3), utilities are written with the variable itself
(`.text-profit { color: var(--vs-profit-text) }`, `text-profit/50` becomes a `color-mix` of it), so
a live edit of `--vs-profit-text` repaints utilities, `var(--color-profit)` users and charts alike.

Tailwind still writes its own copy of each name inside `@layer theme` (`--color-profit:
var(--vs-profit-text)`, measured in broken-stock's real build). It has the same value, and the
generated legacy alias sits outside any layer and so always wins. That is why the panel edits only
`--vs-*` names, never `--color-*`.

## Helpers

`resolveEntry` (effective value through the follow chain, opacities multiplied), `followersOf`
(direct or transitive), `diffVisualStyles` (added / removed / changed, with old → new text),
`canonicalJson` and `contentHash` (sha256 of canonical JSON, async, Web Crypto), `formatVisualStyles`
(the exact text to write: fixed field order, 2-space indent, trailing newline), `parseColour`,
`backgroundOf`, `describeValue`.

## Releasing

The npm `version` script (`scripts/stamp-version.mjs`) rewrites `src/project/version.ts` from
`package.json` during `bs.patch`/`bs.minor`/`bs.major` and rebuilds, so the published stamp is the
published version. A test fails if the const and `package.json` ever disagree.

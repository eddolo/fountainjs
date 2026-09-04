# Text styles

FountainJS includes foreground colour, background colour, font family, font
size, and line height as validated document marks. They work in `CoreExtension`
and `StarterKit`; the isolated `fountainjs-editor/text-style` entry exposes the
same schema specs, normalizers, queries, and commands to custom kits.

```ts
import { CoreExtension, composeExtensions, createEditor } from 'fountainjs-editor'
import {
  getActiveTextStyle,
  setBackgroundColor,
  setFontFamily,
  setFontSize,
  setLineHeight,
  setTextColor,
} from 'fountainjs-editor/text-style'

const kit = composeExtensions([CoreExtension])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })

setFontFamily(editor, 'Atkinson Hyperlegible, sans-serif')
setFontSize(editor, '18px')
setLineHeight(editor, 1.7)
setTextColor(editor, '#17231e')
setBackgroundColor(editor, '#dff8eb')

console.log(getActiveTextStyle(editor))
```

## Document model

Each property has an independent mark so applications can replace or remove one
value without reconstructing an unrelated style object:

| Mark | Attribute | Example |
| --- | --- | --- |
| `text_color` | `color` | `#17231e` |
| `highlight` | `color` | `#dff8eb` |
| `font_family` | `family` | `Atkinson Hyperlegible, sans-serif` |
| `font_size` | `size` | `18px` |
| `line_height` | `lineHeight` | `1.7` |

Marks apply to ordinary inline text across a single paragraph, several
paragraphs, a node selection, selected table cells, or the whole document.
Collapsed selections update stored marks for the next inserted text. Every
command respects `editor.editable`, preserves the logical selection when marked
leaves split, and participates in normal Fountain history and collaboration.

## Validation and canonical values

Style values enter the document only after normalization:

- colours accept opaque three/six-digit hex or opaque `rgb()`/`rgba()` and are
  stored as lowercase six-digit hex;
- font-family lists accept up to eight Unicode family names or CSS generic
  families; quoted names are stored without quotes and safely quoted when
  rendered;
- font size accepts bounded `px`, `pt`, `em`, `rem`, or `%` values;
- line height accepts a bounded unitless ratio or `px`, `em`, `rem`, or `%`;
- declarations, CSS functions, control characters, braces, backslashes, and
  out-of-range measurements are rejected.

The exported `normalizeTextStyleColor`, `normalizeFontFamily`,
`normalizeFontSize`, and `normalizeLineHeight` functions let a non-React host
validate controls before calling a command. These checks protect the document
model and generated inline CSS; they do not download or license a font. The host
remains responsible for making selected font files available and for its
Content Security Policy.

## Commands and inspection

| Operation | Commands |
| --- | --- |
| Foreground | `setTextColor`, `unsetTextColor` |
| Background | `setBackgroundColor`, `unsetBackgroundColor` |
| Family | `setFontFamily`, `unsetFontFamily` |
| Size | `setFontSize`, `unsetFontSize` |
| Line height | `setLineHeight`, `unsetLineHeight` |
| Read selection | `getActiveTextStyle` |

`getActiveTextStyle()` reports only values common to every selected text
segment. A property that differs across the selection is omitted from the value
fields and named in `mixed`; this prevents a toolbar from pretending that the
first leaf represents the whole selection.

`TextStyleExtension` contains the five mark specs and named commands for a
custom schema assembled without `CoreExtension`. Do not compose it beside
`CoreExtension`, because the core already includes those same mark names and the
default conflict policy correctly rejects duplicate schema contributions.

## React and every other framework

The supplied React toolbar exposes one `Text styles` action. Its accessible,
responsive panel accepts custom or suggested font families, unit-aware size and
line-height values, and independent foreground/background colour controls. The
stable action id is `text-style`, so products may reorder, hide, relabel, or
replace it through normal toolbar props.

Vue, Svelte, Angular, Web Components, and plain JavaScript use the same commands
directly. No React state or DOM reference appears in the text-style module.

## Interchange

- FountainJSON stores every mark and attribute without loss.
- Safe HTML uses bounded inline CSS on `<span>` or `<mark>` elements and imports
  equivalent browser-normalized inline styles.
- Markdown uses ordinary `==highlight==` for the default highlight. Values that
  Markdown cannot represent use a deterministic
  `<span data-fountain-text-style="true">` inline-HTML form, so Fountain can
  round-trip them without silently discarding presentation.
- Plain text intentionally projects only readable characters.
- The generic Yjs adapter synchronizes these marks like every other document
  mark; no style-specific collaboration provider is required.

HTML and Markdown import still pass reconstructed values through the schema
validators. Invalid or hostile declarations are ignored rather than persisted.

# Text integrity, invisibles, and verbatim input

FountainJS separates three operations that editors often blur together:

1. inspection reports what text actually contains without changing it;
2. view decorations make selected invisible characters visible without storing markers;
3. sanitization changes text only after the application supplies an explicit policy and reviews a preview.

The headless APIs are in `fountainjs-editor/integrity`. They run in Node.js
without `document`, `window`, `TextEncoder`, jsdom, or another fake DOM.

```ts
import { inspectTextIntegrity, previewTextSanitization } from 'fountainjs-editor/integrity'

const report = inspectTextIntegrity('wallet\u200b-id')
console.log(report.invisibleCharacters[0])
// ZERO WIDTH SPACE, U+200B, UTF-16 offset 6

const preview = previewTextSanitization(report.text, { zeroWidthSpace: 'remove' })
if (confirmDiff(preview.source, preview.result, preview.edits)) save(preview.result)
```

## What inspection reports

`scanInvisibleCharacters()` recognizes ordinary and non-breaking spaces, tabs,
LF/CR/CRLF, zero-width space/non-joiner/joiner, word joiner, BOM, bidi controls,
soft hyphen, combining grapheme joiner, C0/DEL controls, and isolated UTF-16
surrogates. Every finding includes its exact UTF-16 offset, length, code-point
label, readable name, marker, and informational/warning severity.

`inspectTextIntegrity()` additionally returns every inspected code point with
its UTF-8 bytes, a complete UTF-8 hexadecimal view, line-ending counts,
normalization-form facts, bounded/truncated state, and a screen-reader-friendly
summary. Limits reject unexpectedly large input instead of allocating without
bounds.

This is a text-integrity API, not a byte-provenance claim. Once an operating
system, decoder, clipboard, or browser has converted bytes to a JavaScript
string, the original byte sequence cannot be reconstructed. Products that
validate signatures, hashes, keys, or exact files should retain and hash the
original bytes at their import boundary, then use this module to inspect the
decoded text.

## Show invisibles without changing the document

Compose the DOM extension directly after the core so its optional literal-input
handler runs before rewriting input extensions:

```ts
import { CoreExtension, composeExtensions } from 'fountainjs-editor'
import {
  createInvisibleCharacterExtension,
  setShowInvisibles,
  setVerbatimMode,
} from 'fountainjs-editor/integrity/dom'

const integrity = createInvisibleCharacterExtension({
  scan: { spaces: true, zeroWidth: true, bidiControls: true },
})
const kit = composeExtensions([CoreExtension, integrity, typography])

setShowInvisibles(editor, true)
setVerbatimMode(editor, true)
```

The extension renders inline markers plus hard-break and paragraph markers as
decorations. They never enter JSON, Markdown, HTML, text export, clipboard
payloads, history, or collaboration. Decoration count is bounded. The CSS in
`fountainjs-editor/styles.css` is a replaceable reference presentation.

Verbatim mode is requested globally but becomes active only when the current
single-text selection is in a code block or a block carrying `verbatim: true`.
While active, typed text and plain-text paste are inserted literally before
typography-style input handlers can rewrite them. A custom schema can supply
`isVerbatimEligible`. This does not bypass a parser selected by the host, alter
already-decoded bytes, or make rich clipboard HTML byte-exact.

## Preview-first selection cleanup

`previewSelectionSanitization(editor, policy)` accepts only a non-collapsed
selection inside one text node. Its preview stores the path, offsets, exact
source, result, before/after reports, and every edit. The policy may separately
remove zero-width categories, BOM, bidi controls, soft hyphens, controls, or
combining joiners; replace NBSP/tabs/invalid surrogates; normalize line endings;
and apply an explicit Unicode normalization form.

`applySelectionSanitization(editor, preview)` fails closed unless the current
selection, path, offsets, and source text still match the preview. An accepted
cleanup is one ordinary transaction and can be undone. FountainJS never enables
a sanitizer category automatically.

React applications may import the optional reference inspector from
`fountainjs-editor/react/integrity`. `FountainIntegrityInspector` shows raw
facts, controls view/verbatim state, offers category checkboxes, and requires a
separate preview and apply action. It is not required: any framework can render
the same public state and commands, and every part of its UI and CSS may be
replaced.

## Security boundary

- Do not automatically remove bidi or joining controls; many are legitimate in
  international text.
- Do not normalize cryptographic identifiers unless that format explicitly
  defines normalization.
- Treat reports as untrusted user content when logging or rendering them.
- Keep original bytes when byte identity matters.
- Use bounded options for untrusted bulk input.

The repository tests non-mutation, exact offsets and UTF-8 replacement behavior,
category-specific cleanup, stale-preview refusal, decoration-only display,
literal input ordering, package imports, and the public browser workflow.
The complete 612-test package gate and 353-pass Chromium/Firefox/WebKit/mobile
[CI run for `734f151`](https://github.com/eddolo/fountainjs/actions/runs/34039546987),
successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34039547002),
and live rendered inspection certify the delivered contract.

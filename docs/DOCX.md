# Word DOCX interchange

`fountainjs-editor/docx` is an optional, platform-neutral OOXML boundary. It
reads and writes `.docx` bytes in browsers, Node.js, Bun, Deno, and worker-like
runtimes without Microsoft Word, `window`, `document`, `DOMParser`, jsdom, or a
conversion service.

```ts
import { Schema } from 'fountainjs-editor/core'
import { CoreSchemaSpec } from 'fountainjs-editor'
import { exportDOCX, importDOCX } from 'fountainjs-editor/docx'

const schema = new Schema(CoreSchemaSpec)
const imported = importDOCX(uploadedBytes, schema)

const generated = exportDOCX(imported.document, {
  title: 'Project brief',
  creator: 'Example product',
  page: 'a4',
})
```

Both calls return an immutable `report`. `fidelity: "bounded"` means every
encountered feature was represented by the documented subset. `"lossy"` means
one or more warnings explain the exact fallback. DOCX is not Fountain's exact
persistence format; keep validated Fountain JSON as the source of truth.

## Supported import

- paragraphs, six heading levels, left/centre/right/justified alignment;
- bold, italic, underline, strike, code character style, text colour, named
  Word highlights, safe external hyperlinks, tabs, and hard line breaks;
- adjacent and nested numbered or bullet lists, including numbering starts and
  Word's built-in `List Bullet` / `List Number` styles;
- Quote/Intense Quote and Code paragraph styles;
- tables, header rows, horizontal merges, and valid vertical merges;
- tracked insertions as accepted content, with an informational report entry;
- tracked deletions omitted from the current document, with a warning;
- drawings and embedded objects as readable alternative text, with a warning.

Unknown blocks are omitted only with a path-bearing warning. Invalid schema
content, unsafe link attributes, malformed XML, and missing package parts fail
closed.

## Supported export

- paragraphs, headings, alignment, quotes, and code blocks;
- bold, italic, underline, strike, code, text colour, highlight, safe links,
  tabs, and hard breaks;
- nested numbered and bullet lists;
- tables, required Word table grids, header rows, horizontal spans, and vertical
  spans;
- horizontal rules, core properties, and A4 or Letter section geometry.

Unsupported inline atoms, media, custom blocks, and custom marks are converted
to readable text and named in the report. Non-default ordered-list starts are
currently normalized to 1 and reported. Images are not silently fetched or
embedded: a future host-controlled relationship/media adapter can add that
without giving the document converter network access.

## Resource and trust boundaries

DOCX is a ZIP container carrying XML and may be hostile. Import therefore:

- accepts only `Uint8Array` or `ArrayBuffer` supplied by the caller;
- extracts only `word/document.xml`, numbering, and document relationships;
- caps compressed archive bytes, selected expanded bytes, document XML bytes,
  XML node count, and XML depth;
- never resolves external relationships, macros, templates, OLE objects,
  linked images, or remote content;
- sends the complete result through the receiving Fountain schema.

The defaults are conservative and can be narrowed per call with
`DOCXImportOptions`. A host should additionally enforce upload size, MIME
sniffing, malware scanning, authorization, rate limits, and storage policy.

## PDF, ODT, and EPUB

Print/PDF is the browser layout boundary rather than a DOCX side effect.
`fountainjs-editor/pages`, `/pages/dom`, and `/pages/preview` produce measured
A4/Letter/custom sheets, headers, footers, page fields, footnotes, manual
breaks, legal table/list/paragraph continuation, and sanitized print output.
The browser gate inspects generated Chromium PDF bytes for page count,
MediaBoxes, page-local content, and duplicate text; Firefox and WebKit verify
the underlying print projection.

ODT and EPUB are not claimed yet. They should use separate optional adapters
with the same validated-document and explicit-report contract rather than
expanding the DOCX entry or becoming dependencies of the editor core.

## Verification

The release gate covers source and declaration DOM-independence, direct source
fixtures, generated-package inspection, semantic export/import round trips,
tracked-change policy, archive/XML limits, packed ESM and CommonJS consumers,
and a real browser upload/download journey. The public Node conversion demo is
the human-facing executable companion to this guide. An independent
`python-docx` 1.2.0 smoke check opens Fountain's generated file and Fountain
imports a separately generated heading/marks/list/table document; this guards
against relying only on self-round trips.

The first bounded batch passed 665 behavioral tests, the real Lean 4.30
integration gate, and 379 browser checks across Chromium, Firefox, WebKit, and
mobile emulation (with 14 deliberate capability skips) in
[CI run `bb078bb`](https://github.com/eddolo/fountainjs/actions/runs/34061065186).
The corresponding
[public playground deployment](https://github.com/eddolo/fountainjs/actions/runs/34061065270)
also passed.

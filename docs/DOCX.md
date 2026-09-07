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
const imported = importDOCX(uploadedBytes, schema, {
  // Optional: persist trusted embedded bytes and return your own safe URL.
  // Omit this callback to receive bounded raster data URLs.
  createImageSource: image => mediaStore.put(image.bytes, image.contentType),
})

const generated = exportDOCX(imported.document, {
  title: 'Project brief',
  creator: 'Example product',
  page: 'a4',
  // Fountain never fetches URLs. Resolve already-authorized image bytes here.
  resolveImage: source => authorizedMedia.read(source),
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
- embedded PNG, JPEG, GIF, and WebP drawings as `image_super` or
  `inline_image`, including alternative text, title, pixel dimensions, and a
  following Word Caption paragraph for block-image captions;
- linked external images, unsupported image encodings, OLE objects, and other
  drawings as readable alternative text with a path-bearing warning.

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
- verified PNG, JPEG, GIF, and WebP block/inline images, alternative text,
  title, dimensions, captions, package relationships, and content types;
- horizontal rules, core properties, and A4 or Letter section geometry.

Unsupported inline atoms, non-raster media, custom blocks, and custom marks are
converted to readable text and named in the report. Non-default ordered-list
starts are currently normalized to 1 and reported. Raster data URLs embed
directly. Other image sources require the synchronous, host-controlled
`resolveImage` callback to return bytes already authorized and available to the
host; Fountain never performs a network request. Magic bytes are checked and a
declared content-type mismatch fails to readable fallback rather than being
trusted.

## Resource and trust boundaries

DOCX is a ZIP container carrying XML and may be hostile. Import therefore:

- accepts only `Uint8Array` or `ArrayBuffer` supplied by the caller;
- extracts only `word/document.xml`, numbering, document relationships, and
  single-file entries under `word/media/`;
- caps compressed archive bytes, selected expanded bytes, document XML bytes,
  embedded media bytes/file count, XML node count, and XML depth;
- never resolves external relationships, macros, templates, OLE objects,
  linked images, or remote content;
- sends the complete result through the receiving Fountain schema.

The defaults are conservative and can be narrowed per call with
`DOCXImportOptions`; export separately accepts `maxMediaBytes` and
`maxMediaFiles`. The default import result uses a safe bounded data URL. A host
that persists images can instead use `createImageSource`, which receives a copy
of the bytes plus verified type, original package filename, relationship ID,
text alternatives, and dimensions. Its returned URL is validated before it
enters the schema. A host should additionally enforce upload size, MIME
sniffing, malware scanning, authorization, rate limits, and storage policy.

## PDF, ODT, and EPUB

Print/PDF is the browser layout boundary rather than a DOCX side effect.
`fountainjs-editor/pages`, `/pages/dom`, and `/pages/preview` produce measured
A4/Letter/custom sheets, headers, footers, page fields, footnotes, manual
breaks, legal table/list/paragraph continuation, and sanitized print output.
The browser gate inspects generated Chromium PDF bytes for page count,
MediaBoxes, page-local content, and duplicate text; Firefox and WebKit verify
the underlying print projection. The recorded human audit also writes a real
two-page A4 PDF, rasterizes every page with an independent Poppler renderer,
and compares those page images with Fountain's on-screen page preview. This is
the visual gate for clipping, spacing, borders, repeated furniture, and manual
page-break placement; byte and extracted-text checks remain separate gates.

ODT and EPUB are not claimed yet. They should use separate optional adapters
with the same validated-document and explicit-report contract rather than
expanding the DOCX entry or becoming dependencies of the editor core.

Comparative quality claims also require a neutral export corpus. The planned
gate will send identical representative documents through Fountain and other
conversion stacks, independently render the resulting DOCX/PDF files, and score
semantic survival, visible layout, declared loss, local execution, and
extension/custom-node behavior. A single attractive fixture is evidence for
that fixture, not proof of general superiority.

## Verification

The release gate covers source and declaration DOM-independence, direct source
fixtures, generated-package inspection, semantic export/import round trips,
tracked-change policy, archive/XML limits, packed ESM and CommonJS consumers,
and a real browser upload/download journey. The public Node conversion demo is
the human-facing executable companion to this guide. An independent
`python-docx` 1.2.0 smoke check opens Fountain's generated file and Fountain
imports a separately generated heading/marks/list/table document; this guards
against relying only on self-round trips. A second independent browser renderer
opens the generated DOCX beside the same read-only Fountain document. The
recorded comparison checks the visible heading hierarchy, marked prose,
embedded image size and alignment, caption, quote, and table rather than
accepting matching XML or extracted text as proof of layout fidelity.

The first bounded batch passed 665 behavioral tests, the real Lean 4.30
integration gate, and 379 browser checks across Chromium, Firefox, WebKit, and
mobile emulation (with 14 deliberate capability skips) in
[CI run `bb078bb`](https://github.com/eddolo/fountainjs/actions/runs/34061065186).
The corresponding
[public playground deployment](https://github.com/eddolo/fountainjs/actions/runs/34061065270)
also passed.

The embedded-media and independent visual-render batch then passed 669
behavioral tests, 382 browser checks across Chromium, Firefox, WebKit, and
mobile emulation (with 14 deliberate capability skips), and seven recorded
human-use/export audits in
[CI run `69091cf`](https://github.com/eddolo/fountainjs/actions/runs/34067541278).
Its matching
[public playground deployment](https://github.com/eddolo/fountainjs/actions/runs/34067541261)
also passed.

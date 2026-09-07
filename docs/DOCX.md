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
- nested numbered and bullet lists, with independent instances and decimal
  starts from 0 through 2147483647;
- tables, required Word table grids, header rows, horizontal spans, and vertical
  spans;
- verified PNG, JPEG, GIF, and WebP block/inline images, alternative text,
  title, dimensions, captions, package relationships, and content types;
- horizontal rules, core properties, and A4 or Letter section geometry.

Unsupported inline atoms, non-raster media, custom blocks, and custom marks are
converted to readable text and named in the report. Ordered-list starts outside
the supported range are normalized to 1 and reported. Raster data URLs embed
directly. Other image sources require the synchronous, host-controlled
`resolveImage` callback to return bytes already authorized and available to the
host; Fountain never performs a network request. Magic bytes are checked and a
declared content-type mismatch fails to readable fallback rather than being
trusted.

## List numbering and restarts

Each exported list receives an independent numbering instance and base level
definition. The base start and `w:startOverride` agree, so a reader that supports
base numbering but ignores overrides can still render the intended values.
Explicit indentation reflects the nested level. Adjacent lists, nested lists
and lists in separate table cells do not accidentally share a running counter.
Import recognizes instance identity and level overrides; `startOverride` takes
precedence over an overridden level's own start, as specified by the
[OOXML numbering contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.startoverridenumberingvalue?view=openxml-3.0.1).

The recorded release-procedure fixture compares editor output with the
independent browser DOCX viewer and reimports exact list structure. The first
visual inspection exposed that viewer's ignored overrides; explicit base
definitions corrected the displayed 0, 7, 1 and nested 4 starts. This is bounded
numbering evidence, not pixel-identical editor/Word layout or native Word
certification. Native Word/LibreOffice rendering remains pending: the packaged
render command could not find a bundled Windows LibreOffice executable.
Arbitrary Word restart rules, counters resumed after intervening prose, custom
number formats and negative numbering are not certified by this fixture.

## Experimental native Word equations

`resolveMath(node, path)` optionally supplies a `DOCXMathExpression` for an
`inline_math` or `math_block`. Fountain validates that semantic tree and writes
Office Math Markup Language (OMML), not an image or raw host-supplied XML.
This API is experimental: independent Word/LibreOffice rendering and editing
are not yet verified. It does not parse TeX automatically.

```ts
const generated = exportDOCX(document, {
  resolveMath(node) {
    // A deliberately exact example; use a tested converter for general TeX.
    if (node.attrs.latex !== String.raw`\frac{x}{y}`) return undefined
    return {
      type: 'fraction',
      numerator: { type: 'text', value: 'x', style: 'italic' },
      denominator: { type: 'text', value: 'y', style: 'italic' },
    }
  },
})
```

The supported tree contains text, rows, fractions, radicals, sub/superscripts,
delimiters, rectangular matrices, large operators with limits, and combining
accents. Host converters own source interpretation and must decline unsupported
syntax instead of guessing. Invalid, throwing or declining conversions retain
the readable TeX fallback and loss report. Equations inside list items, quotes
and table cells reach the same converter with their original model paths.

Successful projections also remain `lossy` with `native-math-experimental`:
the package contains exact TeX and emitted OMML pairs in
`customXml/fountainMath.xml`, but this is not a round-trip restoration contract.
Outer Fountain marks are not applied to OMML; `native-math-marks-omitted` reports
that omission. Supply mathematical styling in the expression itself.

Default import replaces Office equations with an explicit unsupported-equation
placeholder and `unsupported-office-math`, rather than flattening a fraction or
script into misleading text. Opt-in matching-source restoration is described
below. Keep the original DOCX: general OMML conversion, reconciliation of
externally edited equations, and live Word numbering/references remain open.
Consumers must not describe this boundary as complete LaTeX-to-Word conversion.

Each expression is capped at 10,000 nodes, depth 64 and 100,000 text characters;
matrices have at most 100 rows and 100 columns. Export packages at most 128 native
equations, with at most 100,000 source characters each and 1,000,000 source plus
OMML/accessibility-label characters in total. Unsupported fields, invalid XML characters, malformed
trees and exceeded limits fail to a reported source fallback. There is no
network access or new parser/runtime dependency.

The independent browser viewer used for ordinary DOCX regression checks is not
a native-math oracle. A recorded eight-equation comparison found that
`docx-preview` 0.4.0 drops combined scripts/accents and ignores barless-fraction,
limit-position and display-mode semantics that are present in the exported XML.
The [reference audit](REFERENCE_DOCUMENT_AUDIT.md#independent-browser-math-viewer-findings)
records those visible disagreements and the edit/fallback/undo workflow.
Opening a file successfully, or counting rendered equation elements, does not
prove equation fidelity. Word/LibreOffice checks remain pending.

### Optional TeX converter example

The host example [`mathjax-docx.ts`](../examples/react-app/src/mathjax-docx.ts)
now parses actual expressions with MathJax 4.1.3 base/AMS and projects its
presentation tree to `DOCXMathExpression`. It is a repository example, **not an
exported npm module or an automatically enabled converter**. MathJax remains
outside Fountain's library runtime graph. To use the example in a host which
explicitly supplies that dependency:

```ts
import { exportDOCX } from 'fountainjs-editor/docx'
import { compileTeXForDOCX } from './mathjax-docx'

const result = exportDOCX(document, {
  resolveMath: node => compileTeXForDOCX(
    String(node.attrs.latex), node.type.name === 'math_block',
  ),
})
// Check result.report; a successful projection still carries an experimental warning.
```

Supported constructs include plain/italic/bold tokens, rows, fractions (including
barless), roots, scripts, paired delimiters, rectangular standard matrices,
selected non-stretching accents and large operators with limits. Large operators
require exactly one following parsed atom or braced group; ambiguous ungrouped
multi-term bodies are declined rather than assigned an invented scope. Matrix
geometry uses Word defaults, not a promise of matching TeX spacing.

Explicit spacing, custom layout, unsupported font variants, stretching accents,
numbered/labelled equations and references currently fall back with a reason.
There is no package autoloading, custom macro package or full `.tex` document
compilation. Source restoration is an importer operation, not provided by the
TeX converter. Each formula gets a fresh parser and private
MathJax lightweight tree adaptor: Node execution requires no `document`, `window`
or jsdom, and performs no font loading or network requests. Limits are 20,000
source characters, 10,000 parsed nodes (including wrappers), depth 64 and 100
rows/columns. These are input/tree bounds, not a hard execution-time sandbox;
hosts processing untrusted batches should also isolate work and enforce time
and aggregate resource limits.

The recorded browser diagnostic uses this converter on original and newly edited
equations, saves the actual files at each stage, exposes conversion reasons and
checks undo/stale-preview clearing. Unsupported source is intentionally visible
in this diagnostic; it is not a publication-ready rendered math fallback.
All the native Word/LibreOffice and round-trip qualifications above still apply.

### Opt in to restoring unchanged Fountain equations

```ts
const reopened = importDOCX(bytes, schema, { restoreMathSource: true })
// Inspect reopened.report before replacing an editor document.
```

The default is off. This option reads **untrusted package metadata**, not a
signature or proof of source accuracy. An application should enable it only
when accepting source-bearing documents is appropriate; its math renderer must
retain its own safety limits. Fountain does not compile or execute the restored
source during import.

Current exports write v2 records to `customXml/fountainMath.xml`: per-equation
bookmark name, original model path, inline/display kind, exact source,
accessibility label and emitted OMML. Standard Word bookmarks enclose each
projection; their name/ID pairing follows Microsoft's
[bookmark contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.bookmarkstart?view=openxml-3.0.1).
The model path is diagnostic information, not the binding: inserted paragraphs
and reordered equations need not invalidate an otherwise unchanged equation.

Restoration requires one internal relationship to the expected metadata part,
a valid versioned record, a unique bookmark name and paired ID, and exactly
one matching equation within that range. Complete namespace-resolved XML trees
are compared. Prefix spelling, attribute order and indentation outside math
tokens may differ; token text, mathematical structures and properties may not.
This deliberately declines edits it cannot prove unchanged, including benign
rewrites an Office application might make. No native Word edit/save workflow is
certified yet. Equal flattened text or a matching equation elsewhere in the
document is not sufficient.

Successful restores emit `math-source-restored-experimental` and remain lossy.
Changed or ambiguous bindings emit `math-source-not-restored`; invalid metadata
emits `invalid-math-source-metadata`. Unrestored equations retain the existing
explicit placeholder/warning, **not** an invented TeX reconstruction. Old v1
inspection-only records have no bindings and are not automatically restored.
Marks, arbitrary extension attributes, document identity, layout and review
metadata are not covered by this source-restoration contract.

Metadata extraction is opt-in and capped at 8,000,000 expanded bytes, within the
ordinary aggregate ZIP limits. At most 128 records and 1,000,000 source/OMML/label
characters are accepted; XML node/depth bounds and active-schema validation still
apply. Duplicate selected ZIP entries are rejected. Equations in mixed Word
paragraphs become ordered prose/display blocks, rather than placing a block
inside an inline paragraph. This is document-model recovery, not page-layout
fidelity or a complete DOCX round-trip guarantee.

## Resource and trust boundaries

DOCX is a ZIP container carrying XML and may be hostile. Import therefore:

- accepts only `Uint8Array` or `ArrayBuffer` supplied by the caller;
- extracts only `word/document.xml`, numbering, document relationships, optional
  explicitly requested Fountain math metadata, and
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

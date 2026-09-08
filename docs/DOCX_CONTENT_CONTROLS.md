# Word content control import audit

Unreleased, 2026-09-08. `importDOCX` now retains the supported visible content of
block and inline Word content controls. Previously, a block-level `w:sdt` was
omitted from the document body; the table-cell reader silently filtered it out.
The generic inline traversal could also read run-like data from control properties.

## Representation and implementation

Word separates a control's properties (`w:sdtPr`) from its displayed content
(`w:sdtContent`). Block content can include paragraphs, tables and nested controls.
See Microsoft's [SdtBlock reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtblock)
and [SdtContentBlock reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtcontentblock).

`src/docx/index.ts` now shares `parseBlocks` between the document body, table cells
and nested block controls. Supported paragraphs, marks, list numbering, tables,
images and captions use the existing import paths. Control boundaries do not
reset a continuous numbering stream. Cell blocks that are still unsupported now
produce the same path-bearing omission warning as body blocks.

The shared `contentControlContents` helper reads only direct `w:sdtContent`
children in the WordprocessingML namespace. Equivalent prefix spellings work;
foreign control/content lookalikes do not acquire Word semantics. Inline controls
use the same boundary. Properties, end properties, locks and data bindings are
not traversed as visible document content. No binding is fetched or evaluated.
Existing ZIP/XML size, node and depth limits remain active.

Every removed control reports `content-control-unwrapped`, explaining that
identity, form behavior, locks and bindings are not retained. Missing or duplicate
content containers also report `invalid-content-control`; available content
containers are read in order. This deliberately does not call the result lossless.
Keep the original DOCX when those control semantics matter. Word locks are not
converted into Fountain permissions or security guarantees.

## User workflow

In the [server conversion demo](https://eddolo.github.io/fountainjs/demos/node-markdown.html),
choose **Word DOCX** and **Import a Word document**. The page now displays distinct
Word conversion messages, not just their count. Duplicate messages are grouped
for readability; the API report retains individual issues and paths.

Imported values become normal editable Fountain content. Re-exporting creates
ordinary supported Word paragraphs/tables, not the original form controls.
Row-level and cell-level controls around `w:tr`/`w:tc`, control widgets, live data
binding, permissions, arbitrary Word layout and full form round trips remain
outside this contract. The subsequent [typed glossary handoff](DOCX_GLOSSARIES.md)
adds validated structural controls; it does not add complete form behavior or
certify native Word layout.

## Evidence and limitations

- `tests/docx-content-controls.test.ts`: 12 cases covering nested body/cell
  controls, rich runs, numbering continuity, inline properties, cached values,
  malformed containers, namespace aliases/lookalikes and depth limits.
- `scripts/check-docx-interoperability.mjs`: an independent `python-docx`
  producer wraps body and table-cell paragraphs; compiled Fountain import must
  retain both contents and report exactly two removed controls.
- `tests/browser/docx-controls-journey.ts`: compares the original archive in
  `docx-preview` with editable Fountain content, edits a cell, undoes/redoes,
  downloads a Word document and reopens it through the public conversion UI.
  The original fixture stays unchanged; the viewer's omissions are not patched.

The comparison reproduced a limitation in `docx-preview` 0.4.0: it omits control
content inside table cells. The audit panel explicitly names the missing values,
and the test retains this observation separately from the Fountain assertions.
An independent viewer is not a Word conformance oracle.

The documents skill's packaged `render_docx.py` was attempted, but this Windows
runtime has no bundled LibreOffice executable. Native page rendering remains
unverified; no DOCX/PDF print-fidelity claim follows from this import fix. The
diagnostic is retained in `artifacts/docx-controls-native-render.log`.

Final local verification: full `pnpm check` passes 1,661 tests / 128 files,
compiled runtime and headless/API/package checks, independent Word production,
framework types, performance and size gates. Six browser checks pass across
Chromium, Firefox and WebKit (new control handoff plus existing DOCX list starts).
The separately recorded control journey passes; the recording overview, original
viewer/Fountain comparison and public warning-page screenshot were visually
inspected. The site build passes with the existing optional math chunk warning.

Evidence: `artifacts/docx-controls-final-check.log`,
`artifacts/docx-controls-independent.log`, `artifacts/docx-controls-regressions.log`,
`artifacts/docx-controls-recorded/overview.png`, and
`artifacts/docx-controls-site-build.log`. Initial viewer omissions and missing
public message display remain recorded in the earlier browser failure logs.
No runtime dependencies or public signatures changed. The DOCX entry measures
71.2 KiB ESM / 57.0 KiB CJS (+about 0.5 each); reviewed caps are 72/58 KiB.
Aggregate runtime totals are 1394.8/1159.2 KiB. Only the aggregate CJS ceiling
increases to 1160 KiB; ESM, stylesheet and performance ceilings are unchanged.
CommonMark's separate 563/579/580 profiles are unchanged. These are source/site
changes, not a new npm release over `0.4.0-beta.1`.

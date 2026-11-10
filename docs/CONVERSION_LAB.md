# Local document conversion lab

Open [the lab](https://eddolo.github.io/fountainjs/conversion-lab.html) from the
demo gallery. This is a first working debugging surface, not universal import
or original-format visual-fidelity certification.

Development direction: [Faithful document format bridge](FORMAT_BRIDGE_PLAN.md)
defines incremental 1:1 support, the first open DOCX fixes, and mandatory visual
and real-use acceptance. The [independent DOCX audit](CONVERSION_REAL_DOCUMENT_AUDIT.md)
records current failures; successful draft round trips do not resolve those losses.

## Workflow

### Page preview and browser PDF

After importing a file, choose **Build page preview** below the editor. This
lays out the current draft locally in a read-only preview. The preview uses
supported paper size and margins from the document. It states when it uses
Letter with 1-inch margins instead. Header and footer templates use the
supported edge distances and only take body space when their measured height
extends past the corresponding margin. Layout warnings are listed beneath the
page count, and a preview is limited to 150 pages.

Use **Print / Save PDF** to open the browser's print dialog for that snapshot.
Edits clear the snapshot and disable printing until it is rebuilt. Switching
files clears the preview and keeps each draft and its undo history. On narrow
screens, scroll inside the page preview to inspect the full-width sheets.

The preview uses Fountain’s page layout and may differ from the source
application. Open the untouched DOCX in Word or LibreOffice to compare the
original. Use **Export and reopen** separately to check the selected document
format.

The local browser journey uploads a DOCX with linked paragraphs, edits its body,
rebuilds the preview and switches to a separate Markdown draft. The Chromium
PDF contains only the two updated draft pages at the imported paper size.
Firefox and WebKit checks cover the same preview workflow and print-media
isolation. This verifies the tested draft, with original-file comparison still
separate.

The scientific-report journey uses a separately authored DOCX with embedded
charts, two equations, a merged table, a repeated header and footer, and a
footnote. It caught site footer styling leaking into the draft and the editor's
automatic typing paragraph producing a blank final sheet. The projection uses
the document footer's own styling and skips that generated paragraph. Authored
blank paragraphs still contribute to layout. The Chromium PDF went from four
Letter pages to two, matching LibreOffice's page count for the untouched file.
Both PDF pages and the browser preview were visually inspected. A subsequent
comparison moved the two figure captions from 93.6 and 86.4 pt to 57.6 pt from
the page's left edge. LibreOffice placed both at 57.7 pt. In the editor, resizing
the raster does not resize its independent caption column. Some vertical spacing
and equation styling still differ.

For display equations that carry paragraph layout, the preview uses the
retained spacing without the default display padding and KaTeX margins. In
the scientific report this moved “Recorded temperatures” from 299.0 to
242.8 pt down page two. LibreOffice placed the heading at 238.6 pt. Both
equations, the two-page layout, and the document edit remained visible in
the regenerated PDF.

The inline table now uses the document's surrounding paragraph spacing without
the editor's default table margins. In the same report, the first table header
moved from 282.5 to 267.5 pt down page two. LibreOffice placed it at 266.8 pt.
The rows in this fixture are about 23.8 pt apart in the browser PDF and 25 pt
apart in LibreOffice. The accumulated difference still shifts the caption
beneath the table.

A separate tall-row fixture verifies Word's top, center and bottom cell
alignment in the editor and paged preview. The lab omits its untouched
automatic typing paragraph from DOCX downloads. LibreOffice moved the table
6.35 pt to the right when that paragraph was present. With the fix, the source
and downloaded DOCX produced identical label coordinates and page rasters in
LibreOffice for that fixture. Authored blank paragraphs remain in the download.

A three-row fixture checks a 60 pt minimum, an 18 pt exact row, and a row
without a declared height. All three desktop browser engines retain the
declarations through preview and DOCX download. LibreOffice produced the
same label positions and page raster for the original and the downloaded
DOCX. The exact row clips text in the native render. The browser preview grows
that row so every line can be read, and may position text differently where
the source leaves cell alignment implicit.

The DOCX importer follows internal Word image relationships to raster assets
outside the usual `word/media` folder. A referenced image stays at its drawing
position. Unused parts outside that folder stay in the original archive.
Recorded Chromium, Firefox and WebKit journeys placed the chart between the
same text runs after editing, exporting and reopening the file. The downloaded
DOCX contained the exact image bytes and rendered the chart in the independent
`docx-preview` viewer. That viewer failed to resolve the original file's
percent-encoded image path, so the comparison does not verify native Word
layout for the original.

### Recover a packaged image missed by DOCX import

If the import reports unrepresented media, look under **Original source**.
Select a package part and choose **Preview source image**. The lab reads the
selected part locally from the untouched DOCX and recognizes PNG, JPEG, GIF and
WebP by their bytes. The file and each recovered image are limited to 4 MiB.
**Download source image** saves the original bytes. If the browser can display
the image, give it a description and choose **Append image to draft**. Undo
removes the appended image. DOCX export embeds it from the draft.
The draft uses the decoded pixel dimensions and scales larger images down
proportionally to fit within 640 × 640 pixels.

The source package inventory still describes the initial import. The recovery
step leaves the original intact and cannot determine where a missing image
belonged in Word. External resources, vector images and other unsupported
parts remain outside this recovery workflow.

Recorded Chromium, Firefox, and WebKit journeys rejected an SVG disguised as
a PNG, recovered an omitted chart, and checked undo and redo. The downloaded
DOCX contained the original raster bytes and a drawing sized to the chart's
300 × 120 pixels. Visual review covered the narrow recovery panel, the reopened
editor and the actual download rendered by the independent browser viewer
docx-preview. Native Word and LibreOffice layout were outside this run.

Select **Use CommonMark source review for Markdown, HTML and Fountain JSON**
before choosing a Markdown file. The mode combines CommonMark delimiter and bare-address
rules with source capture. It retains supported HTML declarations, unfinished
end tags, and `script`, `style`, and `textarea` text as inert data. Blocked
autolinks keep their destinations as data. Each draft keeps its import mode.
Enable the same option before reopening the draft's downloaded HTML or
Fountain JSON. JSON restores the saved model, including the source-review
nodes. Keep Markdown for its original syntax and line endings.

Download **Markdown** to retain original syntax wherever the source proof
applies. Edits to independently mapped blocks keep the surrounding source,
including its original line endings. The export report flags a fallback to
rewritten Markdown. The download can contain the author's original HTML. Choose
**HTML** for a standalone reader that uses inactive carriers and blocks
external resource loads. Editor-only Markdown caret paragraphs are omitted
by default in that reader. The import report identifies other HTML that the
lab could only retain as literal text or project with losses.

Chromium, Firefox and WebKit reopen the downloaded JSON and HTML through the
file picker. Re-exported JSON matches the saved model exactly. The HTML
reopens with inert script text, blocked destinations, and the unfinished tag
visible in the editor. The original Chromium run rejected the downloaded
JSON because its import schema lacked `html_inert_raw_text`.

With **Preserve supported HTML structure** enabled, select **Preserve blocked
Markdown autolinks as inactive data** before uploading. The document retains
the original destination and editable label. The reader and safe HTML download
show it as non-clickable text. Export and reopen use the file's saved schema.
[Inactive URI policy and corpus evidence](MARKDOWN_SOURCE.md).

For a Markdown file, select **HTML** as the export format to reveal **Omit
Markdown’s editor-only caret paragraphs in HTML**. This keeps an untouched
empty quote or list item empty in the download while you can still type into
it in the editor. Authored blank paragraphs and edited text are retained.
[HTML export policy and evidence](MARKDOWN_SOURCE.md).

Select **Use CommonMark rules for delimiters and bare addresses** before
uploading a Markdown file to edit a leading delimiter pair as document
content. Bare URLs and email addresses remain text, and explicit links keep
their normal behavior. Each file retains its setting when you edit, download
or check a round trip. Upload the same file with both settings to compare.
[Markdown source policies and evidence](MARKDOWN_SOURCE.md).

Located findings follow-up (2026-11-03, Unreleased): Markdown export findings
keep the affected schema type and document path, so `mark · em` and
`mark · highlight` are distinguishable instead of repeated anonymous warnings.
Word export findings retain their document/package locations too. Import and
round-trip panels display the same fields; an empty path is labelled `root`.
Downloaded diagnostic reports retain types and numeric document paths. Package
source paths in both sections require the existing explicit content opt-in.
Warning messages may still contain private fragments; the report is not
automatically anonymized. This improves diagnosis, not adapter fidelity.
Verification: 20 focused adapter tests, eight recorded browser journeys across
three desktop engines and two mobile emulations, framework type checks and the
website build pass. Five actual diagnostic JSON downloads retain the expected
formatting identity/path without opt-in document content. Five changed report
captures were visually inspected; videos were recorded, not manually watched.
No library implementation, public API, conversion policy or size limit changes.

Preformatted formatting follow-up (2026-11-03, Unreleased): ordinary HTML
imports now retain supported text marks in code buffers. Safe HTML export keeps
those marks and typed font/layout context. **Check round trip** shows export
findings under **Round-trip result**, separately from the original **Import
report**. Ordinary Markdown fences keep literal code but report omitted text
formatting/layout. Use the file tabs to return to the original draft after
opening an export; its document and undo history remain separate. This is not
arbitrary HTML/CSS or pixel-fidelity certification.
[Supported boundary and evidence](SERVER_HTML.md#supported-preformatted-text-formatting-2026-11-03-unreleased).

HTML structure follow-up (2026-11-02, Unreleased): select **Preserve supported
HTML structure** under **Options for the next files**, then choose an HTML or
Markdown file. The lab installs the optional section, comment, anonymous-flow
and non-link bookmark adapters. HTML embedded in Markdown is explicitly
converted in this mode. Scripts and arbitrary styling are not activated, and
unsupported structure/attributes still produce conversion findings. Standard
import remains the default.

Each file keeps its own schema and import policy. Changing the checkbox applies
only to later uploads; existing drafts and their undo history remain mounted.
Export/reopen checks and reader previews use that file's schema. The diagnostic
download records `importOptions` and a distinct `policy`; it still omits content
unless requested. Import the same original again with another setting to compare
both results without replacing either draft.

Non-link bookmarks inherit ordinary text styling. HTML comment badges are
visible in the editable source surface and hidden in the reopened reader
preview; their data remains in the document and round-trip comparison.

The lab now keeps the imported live schema/document through editor creation and
export. JSON copying had erased the private provenance of an automatically added
caret paragraph, causing untouched Markdown to be rewritten. Only the existing
live automatic-repair contract permits exact-source reuse; authored, serialized
or modified empty paragraphs remain actual content. An untouched source export
can omit that editor-only caret block, so exact reopened JSON can still differ
from the live editor. The lab's comparison does not normalize away that difference.

Combining these adapters also exposed a server-import crash for comments nested
inside configured sections. Speculative child projections now inherit comment
origin and literal-source context while isolating their diagnostic/visit lists.
The regression checks both retained and genuinely discarded identical comments;
retention must not suppress a legitimate loss report.

Verification for this checkpoint: 3,018 tests across 225 files pass, as do six
recorded public-page journeys (HTML and Markdown in Chromium, Firefox and WebKit).
The journeys upload files, edit with the keyboard, undo/redo, switch files and
settings, download untouched Markdown, reopen three export formats and inspect
the private-by-default diagnostic download. They also check bookmark styling and
the author/reader comment distinction. Reader screenshots for both input formats
were inspected across all three engines, along with Markdown author screenshots
and the Chromium import-options screenshot. Videos/traces were recorded; this
checkpoint does not claim a frame-by-frame video review or native Word comparison.

API, headless boundary, packed ESM/CommonJS, TypeScript, size budgets and the
production site build pass. The existing optional math chunk-size warning remains.
The CommonMark whole-document profiles are unchanged: 563 default, 601 optional
containers and 613 optional comments/flow/bookmarks out of 652; source-retention
checks remain separate. Evidence is bound to source and reviewed artifacts in
`artifacts/lab-html-policy-verification-20261102.json`. No npm version changes.

Local table-text follow-up (2026-10-05, Unreleased): supported inherited/conditional
font, emphasis, colour, size, spacing and alignment now become editable text and
paragraph declarations. The actual upload/edit/history/download/reopen workflow
is recorded across three desktop engines. Word Normal/default interactions still
warn; the lab is not a native Word renderer or original-style-library editor.
See [the text boundary](DOCX.md#inherited-and-conditional-table-appearance) and
[the recorded checkpoint](DOCX_FIDELITY_CHECKPOINT.md#table-owned-text-formatting-2026-10-05).

Local table-style follow-up (2026-10-05, Unreleased): supported inherited and
conditional table appearance now survives upload, editing/history and native
DOCX export/reopening. First/last rows, columns, corners and band colors become
editable per-cell appearance; they are not live Word rules after conversion.
Unsupported text/layout properties and distinct merged-continuation appearance
remain explicit report items. The original source preview is still text/byte
inspection, not a Word rendering. See [the style contract](DOCX.md#inherited-and-conditional-table-appearance)
and [recorded evidence](DOCX_FIDELITY_CHECKPOINT.md#inherited-and-conditional-table-appearance-2026-10-05).

Local row-repetition follow-up (2026-10-05, Unreleased): the editor now includes
the contextual table menu. Click a cell, open **Table options**, then use
**Repeat row on pages** independently of semantic header-cell actions. Explicit
native Word repeat flags survive editing/history and DOCX reopening without
inventing coloured/bold header cells. This continuous lab is not a paginated Word
preview; the button stores intent for the pages module/native export.
See [the repeat and header-role contract](DOCX.md#row-repetition-and-semantic-header-cells).

Local HTML page-settings follow-up (2026-10-05): standalone HTML downloads now
carry the supported physical settings as inert body metadata, restored by both
browser and server document importers. The lab no longer labels those settings
as lost. This does not reproduce native page layout or certify all metadata.
Clipboard fragments deliberately omit document settings. See [HTML import
boundaries](SERVER_HTML.md) and the latest fidelity checkpoint for verification.

Unreleased 2026-09-12 follow-up: DOCX now exposes a separate source ZIP inventory
with adapter-input, imported-image, unrepresented-media and not-interpreted
entries. The report locates omitted story parts and body note references. Current
draft equality keeps original-import findings visible and does not imply that
lost source content was recovered. See [scope and evidence](DOCX_FIDELITY_CHECKPOINT.md).
Diagnostic report version 2 omits package paths unless content inclusion is checked;
handling/counts remain available by default. This checkpoint is local, not yet a
claim about the deployed website or published npm package.

Local 2026-10-05 follow-up: imported tables now retain supported direct border,
padding and preferred-width data through editing and DOCX/Fountain HTML export.
Physical, percentage and intrinsic sizing remain distinct from column widths.
Omitted native widths now import as automatic, while fresh Fountain defaults
export as full width or a complete fixed-grid physical sum. The export report
identifies default-width materialization rather than silently changing policy.
The lab is a continuous editor, not a native Word page: a percentage uses the
editor content width and can differ in pixels from the source page. Typography,
row heights, style inheritance and native rendering remain open. Reports retain
unsupported declarations instead of treating a successful draft round trip as
proof of original fidelity. This increment is not yet deployed or published.

The local Shift+Enter follow-up now preserves formatted breaks through DOCX
import, real editing and HTML/DOCX reopening in all three tested desktop engines.
WebKit's paragraph-insertion event is normalized using keyboard intent, not a
browser sniff. Unknown paragraph-font substitution is explicitly reported;
strict geometry failures and native application certification remain open. See
the current [checkpoint](DOCX_FIDELITY_CHECKPOINT.md), not earlier green draft
round trips, for verification limits.

Choose or drop files (up to eight). Markdown, HTML, DOCX and Fountain document
JSON use existing adapters with the supplied StarterKit + Pages schema. Unsupported
formats, invalid inputs and oversized files remain visible as failed imports;
other files in the batch still work. Switch between files without discarding
their editing state. Remove a file or clear the session with confirmation.

Inspect original text above the full-width editable import. DOCX has no original-page
viewer here: compare its untouched original in Word or LibreOffice yourself.
Generate JSON, Markdown, HTML or DOCX, reimport the generated bytes, and inspect
the separate read-only preview plus combined export/reimport warnings. Download
the export to reopen manually as another input. The check never replaces the draft.

The local footnote follow-up adds native DOCX notes to the same import, editor and
preview schema. Footnote controls below the editor insert a reference at the body
cursor, focus a definition for direct editing, or remove the note and references
together; ordinary undo restores them. Notes remain editable blocks after the body.
DOCX export uses a native note part, not a simulated footer. Note position within
the Fountain block order can change on reopening and is explicitly reported.
This does not reproduce original Word styles, page placement or custom numbering.
The [DOCX footnote contract](DOCX.md#native-footnotes) lists limits and evidence.
This follow-up is not yet deployed or published.

The subsequent local header/footer follow-up reads supported single-section
templates, including their own raster image/link relationships and simple page
fields. Use the header/footer edit buttons to focus their text; the templates
remain editable blocks rather than repeated page furniture in this lab. The
independent fixture now recovers all three raster images, including its header
logo. Export writes native template parts. Dynamic field display/recalculation,
multi-section templates and original style/page-layout fidelity remain open.
See [the native template contract](DOCX.md#headers-footers-and-page-fields).

Exact Fountain node equality is a narrow structural check, not semantic or
pixel equality against an independent renderer. Changing the draft or selected
format marks the previous check outdated. Zero reported warnings does not prove
zero loss. Markdown imports explicitly report incomplete dialect/loss coverage;
HTML and Word expose their actual adapter messages. JSON is schema-dependent,
not arbitrary extension or project-package support.

## Privacy and safety

The image inventory shows image nodes actually recovered by the importer.
Supported packaged DOCX raster bytes (PNG/JPEG/GIF/WebP) become embedded image
nodes, with thumbnails and individual byte-preserving downloads. Linked URLs
are distinguished from local image data; they are not fetched. This is not an
exhaustive ZIP asset extractor: images in unsupported multi-section headers/drawings/objects
and unsupported encodings may remain outside the imported model. Keep the source.

All input processing stays in this browser. No upload, analytics integration,
automatic storage, bug submission or automatic source attachment is added.
The original File remains unchanged and downloadable. Reloading/leaving loses
the workspace. The page's CSP blocks external images/media, all embedded frames,
objects and form submissions. Original text is escaped React text, never injected
as HTML. Navigation via an explicitly followed link is separate. Downloaded HTML
may reference remote assets: this page's CSP does not follow files into other apps.

Limits: 1 MiB per text/JSON file, 4 MiB per DOCX, 16 MiB/session; JSON depth 64 and
20,000 visited entries; DOCX expanded content capped at 24 MiB alongside its other
existing parser limits. Import is synchronous after reading each file and can
briefly occupy the UI. Worker isolation/cancellation and large-file intake remain
future work. Text input currently requires UTF-8; encoding/BOM/source-byte fidelity
is not implied by rendered Markdown preservation. Original bytes stay in the File.

Diagnostic report downloads include format, size, library version, explicit lab
policy, adapter warnings and current round-trip status. Filename, note and document
content are excluded unless checked. Warnings can themselves contain private source
fragments: inspect the downloaded report before sharing. Opting into content does
not attach original binary DOCX; attach a permitted/redacted reproduction separately.
The GitHub link opens a blank issue and sends no report or document.

## Implementation and regression entry points

- `examples/react-app/src/conversion-lab.ts`: adapter selection and bounded I/O;
  no new engine import API or runtime dependency.
- `ConversionLab.tsx`: separate file editors, reports, downloads and reopened view.
- `conversion-lab.html`: dedicated restrictive page CSP.
- `tests/conversion-lab.test.ts`: format, source, export, invalid and limit contracts.
- `tests/browser/conversion-lab-journey.ts`: discovery, multiple formats, editing,
  invalid inputs, blocked external media, downloads, report privacy and reopening.
- `tests/manual/conversion-lab-audit.spec.ts`: recorded desktop and phone-width flow.

### Manual page breaks — 2026-09-12 local follow-up

The lab now imports explicit Word page breaks as Pages nodes, with dashed
separators in the continuous editor. “Insert page break after current block”
and numbered “Select page break” controls expose the existing commands. Delete
or Backspace removes a selected break; Undo restores it. These controls do not
turn the lab into an original-layout preview. Native DOCX break export/reopening
and those real keyboard operations pass in three recorded browser engines;
see [the fidelity checkpoint](DOCX_FIDELITY_CHECKPOINT.md). Paper settings,
automatic reflow and original typography are still open.

### Paragraph layout — 2026-09-12 local follow-up

Imported DOCX paragraphs, headings and code blocks now render their supported
effective spacing, line rules, indents, keep/page-break settings, RGB shading and
solid borders from portable Fountain data. The value survives editing, HTML and
DOCX reopening; Markdown reports that it cannot retain this presentation. This
does not turn the continuous editor into Word's layout engine.

The independent cooling-report journey passes in Chromium, Firefox and WebKit and
visually compares the original viewer pages, live editor, downloaded DOCX pages
and reopened editor. The review caught page-title letter spacing leaking into
document headings; lab CSS is now isolated from that editor typography. The
later table-geometry and bounded native-equation bridges retain the scientific
fixture's columns and two editable equations through DOCX export/reopen. Rich
captions, native character-pitch appearance, broader Office Math, multi-section layout and native
application certification remain visibly/reportably open.

The current signed character-spacing bridge retains supported physical pitch
and zero resets as editable marks. `Text styles` exposes **Character spacing**,
Apply spacing and Remove spacing. Relative values remain available in the web
model but receive a native DOCX loss report; physical rounding is also reported.
This is not font kerning or native Word appearance certification.

Future: independent original-format previews, reviewed/redacted repro bundles,
worker execution, deeper attribute-level diffs and separately verified adapters.
PDF, TeX, ODT, EPUB, spreadsheets and folders remain outside the lab's import
formats. Saving the current preview as PDF uses the browser's print dialog.

## Page settings — 2026-09-12

The collapsible Page settings form exposes physical width/height, margins,
header/footer edge distances, gutter and orientation. Apply changes the document
through a normal transaction; toolbar Undo/Redo restores settings. Blank fields
remain unspecified and export reports any defaults it adds. Orientation does
not automatically swap explicit dimensions. This is not a paginated Word preview.

The independently authored cooling report retains Letter size and custom margins
through export/reopen. Recorded Chromium, Firefox and WebKit journeys change its
top margin to 60 pt, undo/redo, download and inspect that changed value, then
restore the original settings and verify the reopened form. Independent browser
DOCX views retain the same declared paper size and padding, but typography and
automatic page flow still differ. See `DOCX_FIDELITY_CHECKPOINT.md`.

## Verification — 2026-09-08

Ten adapter contracts pass, including source preservation across independent
editor schemas, root validation, limits and byte-preserving embedded Word images.
The final file-edit-report-download-reopen journey passes in Chromium, Firefox
and WebKit. Two separate recorded journeys pass at desktop and 390px phone width;
screenshots and the recording overview were visually inspected. The source section
is above the full-width editor, not presented as an original-render comparison.
Image decoding and downloaded PNG byte equality are explicitly checked in-browser.
TypeScript and the production website build pass. No library runtime was changed
and no new npm package is required for this website-only lab.

The audit caught and corrected a false comparison caused by independent schema
instances, source-snapshot matching across those instances, and a phone-width
file-picker overflow. Reports now compare canonical Fountain JSON structures,
not NodeType object identity. Evidence stays locally under
`artifacts/conversion-lab-recorded/`, `conversion-lab-final-crossbrowser/` and
the corresponding unit/types/site-build logs. Physical-device testing is separate.

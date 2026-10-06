# Local document conversion lab

Open [the lab](https://eddolo.github.io/fountainjs/conversion-lab.html) from the
demo gallery. This is a first working debugging surface, not universal import
or original-format visual-fidelity certification.

Development direction: [Faithful document format bridge](FORMAT_BRIDGE_PLAN.md)
defines incremental 1:1 support, the first open DOCX fixes, and mandatory visual
and real-use acceptance. The [independent DOCX audit](CONVERSION_REAL_DOCUMENT_AUDIT.md)
records current failures; successful draft round trips do not resolve those losses.

## Workflow

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
PDF, TeX, ODT, EPUB, spreadsheets and folders are not supported by this first page.

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

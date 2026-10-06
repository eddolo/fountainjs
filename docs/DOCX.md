# Word DOCX interchange

## Source-owned quote appearance

Unreleased: `blockquote.appearance: "explicit"` preserves a semantic quotation
while leaving its visible styling to the child paragraphs. The built-in quote
container has no additional border, padding or margin in this mode. Ordinary
quotes omit the attribute and retain their existing editor/export defaults.

Native Word quote import selects this mode when supported paragraph appearance
is materialized. Native export uses the neutral `FountainExplicitQuote` style,
so the original paragraph border/indent is not doubled and a borderless quote
does not acquire the built-in Word Quote decoration. A host quote schema that
does not declare the attribute receives `quote-appearance-not-imported` rather
than a silent visual-equivalence claim. The content remains available.

Browser and server HTML preserve the strict
`data-fountain-quote-appearance="explicit"` marker. Ordinary Markdown cannot
retain this container styling and includes an attribute loss in its report.
This does not promise preservation of arbitrary Word style bindings.

Caption retention is checked separately: a legacy string caption can become
editable rich image content with native Caption/Normal font and paragraph
defaults. That expected native materialization is not caption loss. Actual
caption typing, Undo/Redo, re-export and complete native reopening are covered.

The independent browser DOCX viewer is **not a native Word oracle**: the current
fixture exposes missing table-header labels in that viewer even though the
untouched archive and Fountain reopen retain them. The comparison displays the
disagreement rather than repairing the reference. See
[the checkpoint and retained evidence](DOCX_FIDELITY_CHECKPOINT.md#source-owned-quote-appearance-and-desktop-audit-2026-10-05).

## Inherited and conditional table appearance

Unreleased table-text follow-up: supported base and selected-region run/paragraph
declarations now use the existing strict text decoders. Named/theme font slots,
absolute sizes, colour, supported emphasis and character pitch become run marks;
alignment, supported spacing/indentation/physical borders and pagination intent
become paragraph data. Document defaults precede table text, followed by paragraph
and character styles, then direct formatting. Individual properties/attributes
retain explicit zero/off resets rather than replacing whole formatting groups.

[Word table toggles are absolute resets](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/14452bbe-be4d-4dbb-90e6-3d23ae9361bc),
not paragraph/character-style toggles. Region text uses the same geometric
membership and Office precedence as cell appearance. Nested tables replace the
containing table's text context; outside paragraphs do not inherit it. The
reserved [TableNormal style's child declarations are ignored](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/bb6afca9-88a7-4b34-911f-7110e8062bb1).

This does **not** close Word text fidelity: when table text encounters a `Normal`
paragraph ancestry, `table-normal-style-precedence-unverified` keeps the native
Normal/document-default equivalence boundary visible. No equality-based heuristic
is silently guessed. Unsupported run/paragraph properties, script-dependent fonts,
theme colours, missing receiving marks and unresolved native behaviour still warn.
The recorded independent fixture uses an explicit non-Normal cell paragraph style;
it is not evidence that the warned Normal case has been solved. See
[the table-text checkpoint](DOCX_FIDELITY_CHECKPOINT.md#table-owned-text-formatting-2026-10-05).

Unreleased, 2026-10-05: the relationship-owned style sheet now resolves the
declared table style (or its actual default) through a bounded `basedOn` chain.
Supported base borders, physical margins, fill, preferred width and layout are
materialized as portable table/cell declarations. Child/direct border and margin
groups override only the physical edges they declare. Explicit zero padding,
nil/none borders and clear/auto fill remain different from missing declarations.
Missing parents, wrong style kinds, cycles, depth limits and unsupported used
properties produce diagnostics; ambiguous identities/property roots fail closed.

Conditional cell fill, borders and physical margins are resolved for row/column
bands, first/last rows and columns, and the four corners. `tblLook` mask/named
flags control application, including explicit off values and row exceptions.
Region precedence follows [Office's documented order](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/2ac331d4-cf1e-4fa0-8bca-6da74411e284),
not XML declaration order. Style ancestry is resolved within each region before
regions are combined. The physical grid, including horizontal spans, determines
column membership; cached `cnfStyle` annotations do not replace current geometry.

This is a Word-targeted bridge: absent `tblLook` uses Office's `04A0` default;
an absent row-band size uses Word's zero/no-banding behavior. Explicit band sizes
are bounded to 0–3. These differ from generic OOXML defaults and are described in
[the Office look notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/14b3f20d-4017-43c8-909c-d70620034b95)
and [row-band notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/77519f5b-08b3-4547-9f5d-0c4d87854220).
Conditional margins apply to the entire affected row, even when selected by a
column/corner rule, following [Word's cell-property rule](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/348cf5dd-492c-4e2b-9fe3-c4996f8c52e5).
Direct cell declarations still override inherited cell choices. Conditional
appearance does not invent semantic header roles or repeat-on-page flags.

Export writes effective direct declarations, **not live conditional rules**.
After importing a banded table, adding/moving rows does not automatically
reapply the original Word style. Native export does not preserve the style
library, `tblLook` provenance or original style XML. The import report explicitly
identifies materialization; retain the untouched source separately when needed.

Broader table text and Normal/default interactions, row heights, conditional
table-level properties, native border-conflict/layout behavior and RTL table
projection remain open. Rows with omitted leading/trailing grid positions are
not assigned guessed conditional appearance. Distinct border/margin/fill on a
vertical-merge continuation cannot be represented independently by one logical
cell; the origin remains and the difference is reported. Unsupported/unknown
regions also warn; `wholeTable` overrides are not applied because
[Word ignores them](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/3359ff85-c423-4b9d-be78-d1cf96f79486).
This is not complete Word style or page-fidelity certification.

Verification uses pure-Node fixtures, an independent python-docx producer, real
public-lab upload/edit/history/download/reopen in three desktop engines, complete
JSON comparison and separately inspected independent browser previews. That
viewer fails to apply the independent source's conditional rules and substitutes
fonts; it is not a native-render oracle. See [the current checkpoint](DOCX_FIDELITY_CHECKPOINT.md#inherited-and-conditional-table-appearance-2026-10-05)
for exact runs and unresolved native verification.

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

Both calls return an immutable `report`. `fidelity: "bounded"` means the adapter
emitted no warning/error within its detection scope, not that every source feature
was represented or that original layout is certified. `"lossy"` means one or more
warnings/errors were detected; it does not imply all losses were found. DOCX is not Fountain's exact
persistence format; keep validated Fountain JSON as the source of truth.

Import also returns immutable `packageParts`: ZIP entry paths, declared expanded
sizes and handling (`adapter-input`, `imported-image`, `unrepresented-media`,
`not-interpreted`). Entries are inventoried before conversion; skipped bytes are
not expanded or parsed for this inventory. `adapter-input` does not mean complete
feature retention. Only successfully created image nodes mark media as imported.
Unrepresented media can be unused, unsupported or belong to omitted content.
Parts are not automatically embedded as fallback attachments in the output.

Omitted header/footer/note/comment relationships and conventional story parts
produce warnings with `sourcePart`; body note-reference warnings also have a
document `path`. A package location is not a Fountain node path. This identifies
omissions without claiming they were recovered. Native footnotes are now handled
when the receiving schema includes Pages, as described below; other story types
remain reported omissions unless covered by the header/footer contract below.
Package names may be sensitive.
`maxArchiveEntries` defaults to 10,000, counting skipped entries too; selected
expanded-byte/media limits still apply. Duplicate selected parts remain invalid;
unused duplicate metadata remains uninterpreted but appears in the inventory.

## Supported import

- validated Fountain glossary controls restoring term/description roles from
  visible Word content; see the [experimental contract](DOCX_GLOSSARIES.md);
- supported visible block/inline content inside Word content controls, including
  nested controls in table cells, with explicit loss reports for the control
  identity, form behavior, locks and bindings; see the
  [content-control audit and limitations](DOCX_CONTENT_CONTROLS.md);
- paragraphs, six heading levels, left/centre/right/justified alignment, plus
  effective paragraph spacing, line-height rules, start/end and first-line/
  hanging indents, keep-with-next, keep-lines, page-break-before, explicit RGB
  shading and supported single-line borders resolved through paragraph style
  ancestry and document defaults;
- bold, italic, underline, strike, code character style, text colour, named
  Word highlights, safe external hyperlinks, tabs, and hard line breaks;
- adjacent and nested numbered or bullet lists, including numbering starts and
  Word's built-in `List Bullet` / `List Number` styles;
- Quote/Intense Quote and Code paragraph styles;
- tables, independent row-repeat intent and Fountain-authored semantic header
  roles, horizontal merges, valid vertical merges, native table-grid
  and preferred cell widths as whole-pixel `colwidth` values, and explicit RGB
  cell fills (cell over direct row/table shading, including explicit `nil`);
- native footnote references and editable definitions when both Pages node types
  are present, including supported rich text, links and embedded raster images;
- single-section native headers/footers as Pages templates, their supported raster
  images and links, and simple PAGE/NUMPAGES fields;
- tracked insertions as accepted content, with an informational report entry;
- tracked deletions omitted from the current document, with a warning;
- embedded PNG, JPEG, GIF, and WebP drawings as `image_super` or
  `inline_image`, including alternative text, title, pixel dimensions, and a
  following Word Caption paragraph for block-image captions. Supported caption
  runs, marks and safe hyperlinks remain attached as editable image content.
  Independent caption alignment and supported paragraph geometry are retained
  in `captionAlign` and `captionLayout`; export uses a neutral Caption style;
- linked external images, unsupported image encodings, OLE objects, and other
  drawings as readable alternative text with a path-bearing warning.

Unknown blocks are omitted only with a path-bearing warning. Invalid schema
content, unsafe link attributes, malformed XML, and missing package parts fail
closed.

## Supported export

- glossary terms/descriptions as versioned Word content controls with explicit
  experimental and metadata-loss reports; [scope and limits](DOCX_GLOSSARIES.md);
- paragraphs, headings, alignment, quotes, and code blocks, including portable
  paragraph layout values written as native spacing, indentation, keep/page-break,
  shading and supported border properties;
- bold, italic, underline, strike, code, text colour, highlight, safe links,
  tabs, and hard breaks;
- explicit single named font faces and absolute point/pixel font sizes, with
  reported half-point rounding and unit normalization;
- nested numbered and bullet lists, with independent instances and decimal
  starts from 0 through 2147483647;
- tables, required Word table grids, preferred cell widths, explicit row-repeat
  intent and versioned Fountain semantic header roles,
  horizontal and vertical spans, and explicit RGB cell backgrounds, including
  correctly sized vertical-merge continuations;
- verified PNG, JPEG, GIF, and WebP block/inline images, alternative text,
  title, dimensions, plain or supported rich captions, safe caption links,
  package relationships, and content types;
- horizontal rules, core properties, and A4 or Letter section geometry;
- linked Pages footnotes as native Word note parts, reference runs, separators,
  relationships and content types (see the bounded contract below);
- page templates as separate native header/footer parts and active first/even
  variants, with explicit field-recalculation and projection reports.

Unsupported inline atoms, non-raster media, custom blocks, and custom marks are
converted to readable text and named in the report. Ordered-list starts outside
the supported range are normalized to 1 and reported. Raster data URLs embed
directly. Other image sources require the synchronous, host-controlled
`resolveImage` callback to return bytes already authorized and available to the
host; Fountain never performs a network request. Magic bytes are checked and a
declared content-type mismatch fails to readable fallback rather than being
trusted.

## Paragraph layout

Unreleased 2026-09-12: `ParagraphLayout` is Fountain-owned document state rather
than Word XML or browser CSS. Physical lengths use points; line height explicitly
records unit and rule. The same typed value drives editable DOM projection,
server/browser HTML interchange and native DOCX output. Markdown cannot represent
this presentation and emits a conversion issue instead of claiming exact retention.

Word import resolves supported paragraph properties in this order: document
defaults, bounded `basedOn` ancestry, then direct paragraph formatting. Supported
properties are spacing before/after, automatic/exact/at-least line height,
logical start/end indentation, first-line or hanging indentation, keep-with-next,
keep-lines, page-break-before, explicit RGB shading, and solid RGB borders.
Unsupported border styles and unsupported paragraph declarations remain reported.
After this cascade, never-declared before/after spacing becomes explicit zero;
never-declared line spacing becomes the portable single-line multiple. This
prevents importing browser paragraph margins and then acquiring the generated
Word stylesheet's different spacing on export/reopen. The exporter writes the
effective values explicitly, not the original XML omission. Source automatic
or line-unit before/after spacing remains unsupported and reported. Numeric CSS
line-height is a projection, not Word's font-dependent single-line calculation;
exact native typography still requires independent rendering verification.
Never-declared keep-with-next, keep-lines and page-break-before resolve to false
and export explicitly, so an imported heading does not acquire the generated
stylesheet's keep flags on reopening.

Unreleased 2026-10-05: paragraph `layout.fontFamily` and physical `fontSize`
retain the supported font context separately from text-run marks. Document and
paragraph-style defaults are resolved before paragraph-mark run properties;
character/direct text-run fonts remain authoritative for actual text. Empty
paragraphs retain their resolved font instead of taking the host editor's font.
The importer does not guess a paragraph default from its first text run.
Paragraph-mark-only font properties cannot safely become CSS inheritance when
text-run fonts are unknown; these cases receive a located
`paragraph-font-context-not-imported` warning rather than silently recoloring or
resizing the text. Script-specific font selection and live theme/style bindings
remain outside this bounded profile.

Text-wrapping `br` and `cr` breaks retain the containing Word run's marks,
including fonts and emphasis. The same active marks apply to a break inserted
with Shift+Enter; explicitly switched-off marks stay off. Paragraph-mark font
projection is declined when a break's run font is unresolved, just as for text.
The DOM input adapter normalizes WebKit's Shift+Enter `insertParagraph` event
using keyboard intent; ordinary Enter still splits paragraphs, code blocks keep
literal newlines, and plugins retain input interception priority. The recorded
three-engine edit/export/reopen journey verifies this supported break path,
not full native line-layout equivalence.

Native export writes one paragraph-mark run-property group and writes paragraph
font defaults on unmarked text/break/field runs, because paragraph-mark formatting
alone does not format their text. Inline overrides remain separate. Plain/rich
image captions follow the same rule. Named fonts are not embedded or fetched.
When a portable paragraph layout has unresolved family or size, export emits
the located `paragraph-font-defaulted` warning. Generated Word style defaults
fill those gaps without guessing from the first text run. Existing inline
fonts remain, but line geometry may change; this makes the report `lossy` and
is not a verified preservation of the source baseline.

CSS generic/fallback families are reported and font sizes round to half-points
with a report. Neither font presence in XML nor browser font fallback certifies
native Word metrics. Default heading colours, at-least spacing, per-line
paragraph-mark metrics and empty-paragraph preview behaviour still need work.
The live DOM stores the typed JSON in `data-fountain-paragraph-layout`; CSS is a
view projection only. Legacy and modern break properties are emitted because
Firefox and Chromium/WebKit expose equivalent keep behaviour with different CSSOM
spellings. Browser CSS is never used as the authoritative document value.

Changing block type or splitting a text block retains the layout through normal
transactions, history and collaboration. DOCX exporter style defaults can become
explicit layout values after reopening; that is effective-appearance
materialization, not byte identity or retention of a live Word style binding.

Verified boundaries: 1,983 unit tests / 155 files and the earlier 16 recorded import/edit/
undo/export/reopen journeys across Chromium, Firefox and WebKit. The unchanged
scientific fixture's title border, spacing, heading spacing/keep flags, indented
lists and manual page break are visible in the live editor and survive native
DOCX reopening. Original and exported pages plus editor/reopened views were
visually inspected. The audit also caught and fixed demo typography leaking
negative letter spacing into imported headings.

Still outside this contract: arbitrary Word border styles, contextual spacing,
widow/orphan controls, tabs, text direction, kerning, conditional
table styles, section-scoped paragraph rules, multi-section geometry, font
embedding, and pixel/native Word/LibreOffice layout certification. Table row
height, inherited table layout, caption block content/fields and broader OMML coverage
remain separate open bridge work.
See [the evidence checkpoint](DOCX_FIDELITY_CHECKPOINT.md).

### Signed character spacing

Word run `w:spacing` adjusts character pitch, independently from paragraph
`w:spacing` and font kerning. The adapter resolves supported document defaults,
paragraph and character style ancestry, then direct run declarations into the
`letter_spacing` mark. Values use signed twentieth-points natively and physical
points in Fountain; direct zero overrides an inherited nonzero value.
This follows the [WordprocessingML character-spacing contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.spacing?view=openxml-3.0.1).

Invalid/out-of-range declarations and a receiving schema without the mark retain
visible text with located warnings. The supported range is -384 to 384 points.
Native export writes signed physical pitch, reports twentieth-point rounding
and 96-px-per-inch normalization, and warns instead of guessing absolute values
for relative CSS `em`/`rem` marks. Direct paragraph-mark spacing and inherited
spacing on empty paragraphs produce located `paragraph-mark-spacing-not-imported`
warnings; neither is silently applied to unformatted text. Kerning (`w:kern`),
paragraph-mark-only caret pitch, glyph scaling, complex-script typography and native Word line metrics are
not covered by this increment. HTML and Fountain's bounded Markdown inline-HTML
projection preserve pitch; Markdown still reports paragraph-layout loss.

## Table column geometry

Unreleased 2026-09-12: DOCX import reads native `tblGrid` columns and compatible
`tcW` preferred widths into the existing platform-neutral cell `colwidth` array.
DOCX export uses `TableMap` to materialize a coherent grid and writes matching
`gridCol` and `tcW` values for normal cells, spans and vertical continuations.
The conversion is 15 Word twips per CSS pixel; non-integral source pixels are
rounded and reported as an informational normalization.

The first valid width in document order wins when cells disagree about a logical
column, and the export report identifies the conflicting cell. A spanning `tcW`
without a table grid is not divided by guesswork. Missing columns receive the
existing 160 px export default. Word auto-fit can redistribute a few rendered
pixels based on content, so the visual gate requires stable overall table width
and bounds each column to 0.5% of the source table width.

Unreleased 2026-10-05: the table's optional `layout: 'fixed' | 'auto'` retains
explicit Word `tblLayout` choices in Fountain JSON and browser/server HTML.
Fixed tables project the logical grid into HTML columns and use its complete
width when available; long cell text wraps without stretching those columns.
Resizing updates the same model widths and remains undoable. DOCX export writes
the native `fixed` declaration and, when no explicit preference exists, total
grid width as its preferred width; `auto` writes `autofit`.
An absent setting retains the existing automatic-layout default. Pipe Markdown
reports its layout loss; HTML table projection retains the setting.

The recorded public-lab journey passes in Chromium, Firefox and WebKit through
typing long unbroken content, Undo/Redo, actual DOCX download and reopen. Editor
and reopened screenshots were inspected: widths are stable, but typography
defaults materialized on export still change line wrapping for a source that
does not declare font defaults. The source also has no borders; the existing
exporter adds default borders and cell margins. These unresolved appearance
differences are retained in the evidence, not counted as full visual fidelity.

Independent `docx-preview` rendering exposes a separate known defect:
`valueOfTblLayout` reads `w:val`, while OOXML uses `w:type`. The unchanged preview
therefore expands the long-content export despite correct native fixed-layout
XML. Raw screenshots and a `fixed-table-native-verification-pending.json` record
retain this discrepancy. Native Word/LibreOffice verification is still pending;
the local renderer cannot run because LibreOffice is unavailable. A row-level
layout exception or a host schema without the layout attribute produces a
located warning. A missing/incomplete fixed column grid produces
`fixed-table-grid-incomplete` on import; columns requiring the 160 px export
default produce `fixed-table-column-width-defaulted`, rather than silent geometry
replacement. Inherited/conditional table-style layout remains outside this
direct-property profile. Row heights, table alignment, conditional table styles,
implicit cell margins and full border fidelity are not claimed by this slice.

Unreleased preferred-width follow-up: the table's independent `preferredWidth`
retains supported `tblW` declarations as points, percent, automatic or zero
(`nil`) data. Native `dxa` lengths divide by 20; integer `pct` lengths divide by
50. Explicit percentage-string syntax also maps to the same percentage value.
Export writes the preference rather than substituting `auto` or the grid sum,
and reports rounding to twips/fiftieths of a percent. Invalid/out-of-bounds units
and lengths, row-specific exceptions and schemas without the attribute receive
located reports. Ambiguous duplicate declarations/expanded attributes are
rejected, not resolved by guessing a winner.

This is a preference, not a hard final width. Native layout can override it for
content/grid constraints. Percentages in Word refer to page text extents; the
continuous browser editor uses its containing content surface. The same 60%
preference therefore has a different pixel width in differently sized surfaces.
Use a matching page content surface before claiming paginated equivalence.
Supported appearance/preference cells use border-box sizing so padding/borders
are not added twice to native grid widths. Fixed column preferences and whole
table preferences remain independent, including during column resizing.

Twenty-seven new regressions in `tests/table-preferred-width.test.ts` and
`tests/docx-preferred-table-width.test.ts` cover validation, JSON/browser/server
HTML, live transactions/history, native units, rounding, grid independence,
schema/row boundaries and Markdown loss. The recorded physical-width and
percentage-width workflows pass in Chromium, Firefox and WebKit, retaining
actual typed edits through downloads/reopening. All 24 source/edited/reopened/
exported captures were visually inspected. Evidence lives under
`artifacts/docx-preferred-width-20261005/`; native Word certification is still
pending because the canonical renderer cannot find `soffice.exe`.
Independent previews preserve overall width, but row heights, wrapping,
paragraph defaults and dotted-border rendering still differ from the editor.
The reference contract is [Microsoft's preferred table width documentation](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tablewidth?view=openxml-3.0.1).

Default-width boundary: omitted native `tblW` imports as the effective automatic
preference, including when layout is fixed. Re-export writes explicit automatic
width rather than silently replacing it with a physical grid sum. A new Fountain
table without a preference has a different default: the standard host view uses
full width, or a complete fixed grid's sum. Export writes 100% page-text width
for the full-width case, or a physical sum for the complete fixed-grid case.
Incomplete fixed grids do not establish a physical whole-table preference.
The located informational `table-width-defaulted` report describes the projection
and warns that host CSS overrides are not represented. The original Fountain
document is not mutated. This preserves the supported effective default policy,
not original XML omission, arbitrary CSS, or the entire native layout algorithm.
Shared fixed-table projection includes outer borders inside grid-following
widths. Stored columns remain physical model data; the DOM uses their ratios
when the whole width equals their sum, including a matching physical preference
after reopening. Other explicit preferences retain independent absolute columns.
Eight additional regressions and 12 recorded default-width journeys verify this
boundary; all 42 captures were inspected. Spacing, corner styling and native
Word rendering remain unverified or visibly different, not certified as 1:1.

### Row repetition and semantic header cells

Unreleased 2026-10-05: native `tblHeader` now populates the boolean
`table_row.attrs.repeatHeader`, independently of cell type, colour and emphasis.
An ordinary Word cell stays `table_cell` even in a repeating row; repetition
alone no longer invents Fountain's purple header fill or bold text. Absent and
explicitly disabled declarations import as `false`; enabled declarations import
as `true`. Only Word-namespace declarations/attributes are trusted; duplicates
are rejected and invalid values report `invalid-table-header` at the row path.
Import and export warn with `nonleading-table-repeat` when a retained on flag
follows an off row: Word only repeats consecutive leading rows. A host row schema
without this attribute receives `table-row-repeat-not-imported` for enabled intent.

Native export writes explicit on/off declarations. For older Fountain rows with
the attribute unspecified, the existing all-header-cell default supplies the
value and `table-row-repeat-defaulted` reports its materialization on reimport.
The source model is not mutated. HTML retains explicit intent using
`data-fountain-repeat-header="true|false"`; Markdown pipe tables report its loss,
while HTML-table projection retains it. The contextual table menu exposes
**Repeat row on pages**, separately from Make/unmake header row.

Fountain `table_header` scopes (`col`, `row`, `colgroup`, `rowgroup`) use a separate
strict, versioned, behavior-free Word content control around the cell's actual
visible blocks: `urn:fountainjs:docx:table-header:<scope>:v1`. No hidden JSON,
binding or locking behavior supplies content. Recognized controls restore the
role; malformed/foreign controls keep readable content and explicit warnings.
Export reports `table-header-role-extension`. Native Word editing/saving and
retention of these role controls through third-party applications remain
uncertified. This bridge does not resolve inherited/conditional table styles,
native page layout or arbitrary multi-page behavior. The native repeat role is
documented by
[Microsoft's TableHeader reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tableheader?view=openxml-3.0.1).

An explicitly empty Fountain text leaf now exports an actual empty `w:t` in its
formatted run. Import retains that leaf and supported run marks, separately
from a childless paragraph or a property-only run. Empty deleted text and field
instructions do not invent caret leaves. This fixes the save/reopen loss exposed
by the recorded table journey; it is not a guarantee that Word will keep empty
run boundaries after its own editing/saving. JSON remains the complete model
backup; native export still reports and materializes its documented defaults.

Unreleased direct table appearance: `appearance` retains table `tblBorders` and
`tblCellMar`, and direct cell `tcBorders`/`tcMar`. Supported physical sides,
single/double/dotted/dashed RGB lines, `none`/`nil` and non-negative `dxa` margins
are portable model data. Explicit zero is preserved. A table with no declarations
gets `{ unit: 'pt' }`, so export does not invent Fountain's default borders or
padding. Existing newly authored tables still get the legacy application defaults.
Border/margin output is emitted in native property order alongside shading.

Unknown lines, non-RGB colours, theme/effect/space declarations, logical or
diagonal edges, invalid margins and precision rounding receive located reports.
Identical repeated appearance groups are coalesced with
`duplicate-table-appearance-declaration`; conflicting groups/edges produce
`ambiguous-table-appearance-declaration` and omit only that appearance property,
not unrelated content. Full native interpretation of conflicting declarations
is not claimed. Malformed XML and ambiguous expanded attributes remain rejected.
Associated table styles, row-level exceptions and nonzero cell spacing remain
unresolved. Distinct appearance on native vertical-merge continuation fragments
is reported rather than silently claimed as retained; export reports its
whole-cell-to-fragment projection. Receiving schemas without the attributes get
located warnings. The direct browser profile uses collapsed borders and zero
for undeclared padding; implicit native margins and Word's full border-conflict
algorithm are not certified. Preferred width, conditional styling and paragraph
defaults still affect source/output appearance independently of these properties.

Evidence: `tests/table-appearance.test.ts` verifies validation, logical spans,
JSON/HTML retention, parent-only refresh, history and table commands;
`tests/docx-table-appearance.test.ts` verifies independent native declarations,
resets, ordering, rounding, namespace rejection, schema gaps and merge reports
without a fake DOM. Recorded browser journeys are retained under
`artifacts/docx-table-appearance-20261005/`. Original and exported independent
previews remain unmodified. They differ from the live editor and do not certify
native Word rendering; the canonical renderer still cannot find `soffice.exe`.

Evidence: `tests/docx-table-widths.test.ts` exercises import, export, spans,
conflicts, rounding and the fixed-layout boundary without a DOM. The recorded
scientific-document journey verifies model attributes, package XML, editable and
reopened tables, and independently rendered source/export geometry in Chromium,
Firefox and WebKit.

## Native footnotes

Unreleased 2026-09-12: compose the optional Pages extension into the receiving
schema. The adapter itself does not import Pages or require browser APIs.

```ts
import { Schema, StarterKit, composeExtensions } from 'fountainjs-editor'
import { PagesExtension } from 'fountainjs-editor/pages'
import { importDOCX, exportDOCX } from 'fountainjs-editor/docx'

const kit = composeExtensions([...StarterKit.extensions, PagesExtension])
const schema = new Schema(kit.schema)
const imported = importDOCX(bytes, schema)
const exported = exportDOCX(imported.document)
```

References become `footnote_reference` nodes and definitions become editable
top-level `footnote_definition` blocks after the body. Their IDs remain linked;
screen labels use first-reference order, not the raw Word ID. Word's own marker
is regenerated rather than injected into editable note text. Notes use their
own package relationships for hyperlinks and raster assets, under the same
bounded, no-fetch policy. Custom part paths and encoded filenames are tested.

Export writes real `word/footnotes.xml`, not ordinary body paragraphs disguised
as footnotes. Non-native IDs are deterministically mapped to available positive
integers with a warning. Missing, duplicate, nested or unreferenced definitions
prevent export rather than silently dropping content. Imported orphan definitions
remain editable with a warning; unresolved references become visible placeholders.
Schema opt-out still reports omission and does not interpret the note part.

Limits and remaining work:

- Custom numbering/restart/placement and separator content are reported, not
  reproduced. Recognizable reserved separator markers missing their explicit
  type are recovered with a warning; malformed normal note IDs remain invalid.
- Repeated references to one definition have an explicit export warning because
  repeated-marker numbering across Word consumers is not certified.
- DOCX stores notes separately. Their position among Fountain body blocks is not
  retained, and export reports this when definitions precede remaining body blocks.
  Use Fountain JSON for exact node order and non-native IDs.
- Original footnote styles and native Word page placement are not certified.
  Endnotes, comments and header/footer stories are not covered by this bridge.
- Image dimensions follow the existing DOCX image contract: absent/automatic
  dimensions currently acquire fixed export defaults. The rich-note image test
  uses explicit dimensions; this is not an automatic-size fidelity guarantee.
- The same bounded OMML subset can be projected where the receiving schema permits
  math; broader Office Math coverage and native note-layout fidelity remain open.

Evidence: `tests/docx-footnotes.test.ts` runs without a DOM; lab tests verify
DOCX/HTML/JSON note round trips. The recorded independent-source journey edits,
adds, removes, undoes, exports and reopens notes in Chromium, Firefox and WebKit.
See [the checkpoint](DOCX_FIDELITY_CHECKPOINT.md) for visual evidence and limits.

## Headers footers and page fields

Unreleased 2026-09-12: with the Pages schema above, single-section DOCX files
import their active header/footer relationships into `page_header` and
`page_footer` nodes. Templates are editable blocks after the body, before notes;
the lab identifies them and provides buttons to focus their text. This is an
authoring surface, not a repeated-page preview. Supported text, raster images,
links and tables reuse the existing content adapters with each part's own
relationships. The independent fixture's header-logo bytes now survive export.

Import reads default/first/even references and the `titlePg`/`evenAndOddHeaders`
switches. Inactive variants remain in the original with warnings rather than
being activated. Enabled but missing first/even references become blank templates
to preserve the first-section blank behaviour. Missing, ambiguous or invalid
internal references and invalid story roots fail closed; external stories are
reported and never fetched. Extra XML parts count against the same expansion
limits. Multi-section headers are explicitly reported as unrepresented because
the current Pages templates are global, not section-scoped; this remains open
work, not a reason to consider multi-section fidelity complete.

Export writes native header/footer XML, part relationships, content types and
section references. First/even selection switches are emitted as needed. Fountain
odd/default fallbacks can require duplicated native templates and renamed
variants; that is reported rather than claimed as exact identity retention.
Native templates can move relative to ordinary Fountain blocks after reopening.
Original style inheritance, distances from page edges, section layout and exact
template positions are not preserved by this change.

Simple native `PAGE`/`NUMPAGES` fields, optionally with `MERGEFORMAT`, map to
`page_field` nodes and export as dynamic fields. Their cached export value is a
placeholder and requires the receiving application to recalculate it. The
independent browser viewer leaves the fixture's page-number field blank: **field
structure is verified, displayed page-number fidelity is not**. Complex or other
field instructions are not executed; only cached visible content is imported
with a warning. Arbitrary formatting switches and field evaluation remain open.

The [Microsoft header-reference documentation](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-replace-the-header-in-a-word-processing-document)
describes the section/variant selection rules used here. Regression evidence:
`tests/docx-page-templates.test.ts` (pure Node), plus the three-browser recorded
independent-file journey and [checkpoint](DOCX_FIDELITY_CHECKPOINT.md).

## Table shading limitations

Theme references, style-based shading and patterns are not fully resolved;
detected theme/pattern shading reports its RGB fallback. This is not full
table-format preservation. See the [fidelity checkpoint](DOCX_FIDELITY_CHECKPOINT.md)
for independent source-file, editor and export evidence.

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

Fountain owns a platform-neutral `MathExpression` tree for supported semantic
math. DOCX import maps a bounded native Office Math (OMML) subset to that tree
and creates a real `inline_math` or `math_block` with generated, editable TeX.
DOCX export writes a retained tree directly back to OMML—without a browser,
MathJax, image substitution or a second TeX parse. `DOCXMathExpression` remains
an alias for compatibility. This boundary is experimental: independent native
Word/LibreOffice rendering and editing are not yet verified.

For Fountain-authored TeX, `resolveMath(node, path)` may still supply the same
semantic tree. Fountain never guesses arbitrary TeX itself:

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
delimiters, rectangular matrices, large operators with limits, combining accents,
function application, upper/lower limits, and equation arrays. Host converters
own source interpretation and must decline unsupported syntax instead of guessing.
Invalid, throwing or declining conversions retain the readable TeX fallback and
loss report. Equations inside list items, quotes and table cells reach the same
converter with their original model paths.

The native importer currently accepts the corresponding bounded OMML run/style,
row, fraction, radical, script, delimiter, n-ary, rectangular-matrix and accent
structures, plus function application, upper/lower limits and equation arrays.
Unknown or foreign structures fail closed. It never concatenates the visible
runs of an unsupported construct into misleading prose.

Successful projections remain `lossy` with `native-math-experimental`: the
semantic equation survives, but native application layout and arbitrary source
syntax/style equivalence are not certified. The package contains exact TeX and
emitted OMML pairs in `customXml/fountainMath.xml`; opt-in exact-source
restoration is the separate contract below.
Outer Fountain marks are not applied to OMML; `native-math-marks-omitted` reports
that omission. Supply mathematical styling in the expression itself.

Default import turns supported Office equations into typed, editable Fountain
math and reports `office-math-imported-experimental`. Only a structure outside
the bounded subset becomes an explicit `[Word equation: unsupported structure]`
placeholder with `unsupported-office-math`; a schema without the math extension
gets the distinct `math extension unavailable` fallback. Keep the original DOCX:
complete OMML coverage, exact original OMML style/source, reconciliation of all
external edits, and live Word numbering/references remain open.
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
The extended-equation source/export comparison reproduces the same missing
upper-limit display in that viewer for both the original and Fountain export,
while Fountain's imported and reopened editors render it and both packages carry
`m:limUpp`. This isolates that screenshot disagreement without certifying Word.
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
emits `invalid-math-source-metadata`. Unrestored equations are independently
parsed through the bounded semantic OMML bridge. Supported structures receive
generated TeX; unsupported structures get the explicit placeholder/warning,
never an invented flattened reconstruction. Old v1
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

## Explicit page breaks

With `PagesExtension` in the import schema, explicit Word run breaks
(`w:br` with `w:type="page"`) map to `page_break` blocks and export back to native
Word breaks. Ordinary line breaks stay `hard_break` nodes. Standalone and repeated
breaks retain their count without adding empty paragraphs. A break inside prose
splits that paragraph into blocks, preserving order and marks but reporting
`page-break-paragraph-split`; shared paragraph identity/spacing is not certified.
Without the node, import shows `[Page break]` and a `missing-page-break-node`
warning rather than pretending a normal line break is equivalent.

Nested breaks are written natively but export warns that enclosing list/quote
identity and table/story layout are not certified. Column and float-clearing
behaviour is not implemented. Direct `pageBreakBefore` is separately reported as
unimplemented; style inheritance and Word compatibility flags remain open.
Cached `lastRenderedPageBreak` markers are not promoted to manual breaks.
See Microsoft's [break model](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.break?view=openxml-3.0.1)
and [paragraph-mark compatibility rule](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.splitpagebreakandparagraphmark?view=openxml-3.0.1).

Eleven pure-Node tests cover these distinctions. Three recorded browser journeys
exercise actual insertion, selection, Delete/Backspace, undo/redo, download and
reopening. The independent viewer shows the fixture's explicit second-page
boundary again, not a certification of automatic pagination or original styles.
Paper size and margins still require the pending document-layout bridge.

## Explicit run fonts

Direct `w:rFonts` Latin face names map to the existing `font_family` mark;
direct `w:sz` half-point sizes map to `font_size` in physical points. Font names
pass the shared safe-font validator and sizes use its 1–384 pt range. The adapter
reports invalid values or missing receiving-schema marks while retaining text.
Equivalent namespace prefixes work; duplicate properties are rejected.

Export writes a single explicit face to `w:ascii` and `w:hAnsi`, and an absolute
size to `w:sz`. Pixel sizes use 96 px per inch and reimport as points; this emits
`font-size-unit-normalized`. Sub-half-point sizes emit `font-size-rounded`.
CSS-relative sizes, fallback stacks and generic family names have no equivalent
single Word face/size here and produce an `unsupported-mark` report. Fonts are
not embedded or downloaded; actual font availability remains a renderer concern.

Direct `asciiTheme`/`hAnsiTheme` references can now resolve the embedded theme's
major/minor Latin regional defaults. Theme and settings parts are located through
their package relationships and use the existing ZIP/XML limits; external data
is never fetched. `theme-font-materialized` reports that the resolved named font
is retained, not a live Word theme binding. Theme fonts take precedence over
same-slot explicit fallbacks. Invalid names still fail the shared font validator.

The direct-font path is also used after document defaults and paragraph/character
style inheritance are resolved. It does not resolve script-specific face selection. Language-dependent supplemental
theme fonts, absent/unknown themes and script-specific choices emit warnings;
any explicit Latin fallback remains only a fallback. Separate complex-script
sizes are reported when they differ. Paragraph properties and independent native
layout verification remain necessary; font support alone does not complete that work.

## Inherited run formatting

The importer reads the relationship-owned styles part through its bounded ZIP/XML
loader, including custom part names. It resolves document run defaults, paragraph
ancestry, character ancestry and direct overrides in that order. Supported
effective fonts, sizes, colours and emphasis become ordinary editable marks;
normal block emphasis is explicit. Theme references use the same safe font
projection. A same-declaration named fallback remains available when its theme
cannot be resolved; an obsolete ancestor's font is not revived.

This materializes appearance, not the live Word style library. Reimport can add
font/size/colour marks that were implicit in an exported Word style. Exact source
JSON equality is therefore not guaranteed, even when the effective run appearance
is preserved. Reports retain that distinction. Unsupported properties in used
styles are reported at affected content; unused style definitions are not counted
as lost document content. Missing, ambiguous and external parts are rejected or
reported without fetching external data.

The supported paragraph-layout subset is described above. Conditional table/
numbering formatting, script-specific runs, theme colours, native pitch rendering and
Word's default-true toggle variation are not certified. The
unresolved toggle combination emits a warning rather than claiming equivalent
bold/italic behaviour. Styles are not a general native Word layout engine.

## Explicit emphasis for editable style projection

Paragraph and heading nodes may set `attrs.emphasis` to `'explicit'`. Their block
rendering then uses normal weight/style; the existing `strong` and `em` marks
alone control bold and italic text. This can represent a normal-weight heading
or upright text in a quotation without negative marks or special toolbar logic.
Omitting the attribute preserves ordinary heading/quote rendering. Unset optional
attributes are absent from portable JSON, not stored as `undefined` values.

The mode is retained by the supplied DOM renderer, HTML exporter, browser/server
HTML importers, block-type changes and heading-to-paragraph splits. DOCX export
writes absolute `w:b`/`w:i` values on text runs and normal emphasis on the paragraph
mark. Import recovers the mode when all relevant runs have explicit declarations
and the paragraph mark declares both resets. When a styles part is present,
partial direct overrides are resolved against its run-style cascade instead.
Ordinary Markdown reports that this appearance constraint is not retained.

The mixed font/colour/emphasis audit also exposes existing mark-order
normalization: DOCX reimport can reorder these non-conflicting mark arrays.
The lab continues to report failed **exact** Fountain JSON equality for that case.
Full-tree comparison with only those known mark orders normalized and independent
visual inspection are separate evidence, not an exact-retention claim.

This boundary supplies the editable reset semantics used by inherited-style
projection. The separate paragraph-layout contract fixes its listed subset; this
emphasis boundary does not fix remaining layout, theme colours or native equations.

## Physical page settings

Single-section DOCX import retains explicit `pgSz` and `pgMar` values in
`doc.attrs.pageSettings`: `unit: 'pt'`, width, height, optional orientation, four
margins, header/footer distances and gutter. Missing values remain unspecified;
they are not silently changed to zero. Values are plain data and work through
the DOM-free core, ordinary root-attribute transactions and history.

```ts
import { readDocumentPageSettings } from 'fountainjs-editor/core';
import { setDocumentPageSettings } from 'fountainjs-editor/pages';

const settings = readDocumentPageSettings(editor.state.doc);
if (settings) setDocumentPageSettings(editor, { ...settings, marginTop: 60 });
```

DOCX export uses stored settings. An explicit export `page` option overrides
paper dimensions (reported as `page-size-overridden`) while retaining margins.
Unspecified lengths use the existing A4/one-inch defaults, or the requested
Letter size, and emit `page-settings-defaulted`. Reimport makes those defaults
explicit; this can change JSON equality without losing content. Sub-twip values
are rounded with `page-setting-rounded`. Invalid/range-overflow values and
margins leaving no body area are rejected rather than silently clamped.

The Conversion Lab has a **Page settings** form with Apply, Undo and Redo. It
does not turn the continuous editor into a Word page preview. JSON and DOCX
retain the data; lab HTML and Markdown exports report that it is not represented.

Header/footer distances mean distance from the page edge, not reserved content
height. The optional `pageSettingsGeometry` bridge to measured Pages layout
requires complete size/margins and rejects nonzero header/footer distances,
gutters and negative margins until that renderer supports their semantics.
Negative top/bottom margins can still be retained and exported as source data.
Multiple sections are not flattened into a misleading global setting; their
omission, columns, mirrored margins and other recognized unimplemented layout
modes are reported. Styles, automatic reflow and native Word layout equivalence
remain separate open work.

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

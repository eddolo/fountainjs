# Faithful document format bridge — development plan

Recorded from the user's clarification on 2026-09-08.
Latest source-quote/desktop increment (2026-10-05, Unreleased): actual visual
inspection found and fixed doubled imported quote borders and indentation.
Source-owned paragraph appearance now has a neutral semantic container and
native Word style, including explicit borderless quotes. Caption typing,
history, native re-export and complete reopening are checked. The independent
preview's missing table-header labels remain an exposed discrepancy, not a
patched reference. FB-04 stays in progress; native Word layout and broader
format fidelity remain open. See
[the checkpoint](DOCX_FIDELITY_CHECKPOINT.md#source-owned-quote-appearance-and-desktop-audit-2026-10-05).

Latest table-text increment (2026-10-05, Unreleased): supported base/conditional
text declarations now use the existing run/paragraph cascade with Word absolute
table toggles, property-wise spacing and isolated nested-table context. Six
recorded desktop workflows pass and all 30 new images were inspected. The native
Normal/default exception is explicitly warned, not guessed; native rendering
remains unavailable. FB-04 stays in progress with live bindings, row/section/RTL
layout and native typography still open. See
[the checkpoint](DOCX_FIDELITY_CHECKPOINT.md#table-owned-text-formatting-2026-10-05).

Latest inherited/conditional table increment (2026-10-05, Unreleased): supported
base appearance and region-specific cell fill/borders/margins now resolve through
bounded style ancestry and become editable direct declarations. Six recorded
import/edit/history/export/reopen journeys pass across Chromium/Firefox/WebKit;
all 30 images were inspected. Table text/row geometry, RTL and native page
fidelity remain open. Live rule/source-library retention is not implemented, and
the independent browser viewer skips the source's conditional rules. FB-04 stays
in progress; no whole-format or parity percentage promotion. See
[the checkpoint](DOCX_FIDELITY_CHECKPOINT.md#inherited-and-conditional-table-appearance-2026-10-05).

Latest 2026-10-05 increment: row repetition and semantic header-cell roles now
remain separate through the supported DOCX/HTML bridge. Actual editing/export
also found and fixed explicit empty text/run-mark loss. This advances FB-04
without certifying native pages or closing conditional/inherited table styles.
See [the recorded checkpoint](DOCX_FIDELITY_CHECKPOINT.md#row-repetition-and-empty-run-retention-2026-10-05).

Status as of 2026-09-12: **implementation resumed; FB-01, FB-02, FB-03 and FB-06 in progress**.
The original 2026-09-08 entry recorded future work while the programme was paused.
The active goal has since resumed. This does not change completion percentages
or authorize a release. See [the latest checkpoint](DOCX_FIDELITY_CHECKPOINT.md)
for table-readability, intake/reporting, footnote/header/footer and explicit
page-break evidence and remaining gaps. FB-04 is also in progress: manual breaks,
single-section physical page settings and the supported paragraph-layout slice now
survive import/edit/export. Multi-section layout, table geometry, character
native pitch/kerning appearance, conditional styles and native layout certification remain open. Retained
paper dimensions and paragraph properties are not a claim of automatic page-layout
equivalence.
The explicit run-font bridge now maps named Latin faces and absolute sizes to
existing Fountain marks and back to native DOCX; it is a prerequisite, not a
replacement for inherited style resolution.
The direct theme-font boundary now reads relationship-owned embedded themes and
resolves major/minor Latin regional defaults into the same font mark. It reports
that the live theme binding becomes a named font. Language-dependent supplemental
font selection remains explicitly unresolved; no fonts or external themes are
fetched. The XML reader and cascade now feed public DOCX import through
relationship-owned style parts. Supported effective run formatting becomes
editable marks. Supported paragraph layout becomes portable block data; full
style provenance and the remaining layout surface stay open.

## Next style-resolution requirements

Latest 2026-10-05 follow-up: standalone HTML now retains supported physical page
settings as validated body metadata, restored by both document importers. The
recorded character-spacing journey compares complete HTML AND DOCX reopened
documents without a root-attribute exception. Fragment/clipboard boundaries
still omit document settings; HTML metadata does not imply native page layout.
Direct paragraph-mark and inherited empty-line pitch now have located warnings,
not automatic text formatting. Full gate: 2,145 tests / 163 files; three recorded
journeys and 24 reviewed captures. See the [checkpoint](DOCX_FIDELITY_CHECKPOINT.md)
for earlier failed-run evidence, runtime checks and remaining limitations.

2026-10-05 signed-character-spacing increment: the portable six-mark text-style
module now retains supported native pitch through style ancestry and direct zero
resets. Physical export and web apply/remove controls are implemented and tested;
relative export, rounding and receiving-schema omissions are reported. A Markdown
round-trip regression caught and fixed a dropped property. The complete serial
gate passes 2,113 tests / 161 files; three strengthened recorded browser workflows
verify full native-reopened JSON and strict widths/heights. HTML still reports and
drops physical page settings, even though these character styles survive.
The independent preview does not render run pitch, so its screenshots cannot
adjudicate native typography. The packaged native renderer remains unavailable.
Next require native font/line evidence for unresolved baselines, kerning and
mixed-font paragraph metrics; retain the four strict geometry failures rather
than changing fixtures or lab CSS. Full format/layout parity remains open.

2026-10-05 paragraph-default increment: never-declared Word spacing now becomes
effective zero before/after and single-line spacing only after resolving the
supported hierarchy. Six recorded editor/HTML/DOCX workflows verify retention,
including real Enter/Backspace. Original omissions become explicit native
properties; this is not byte identity. The 36 inspected source/editor/export
views still show line-metric differences: the current CSS multiple is not
Word's font-dependent single-line calculation. Next distinguish that rendering
baseline, parent-font struts and mixed-size content, using native evidence rather
than copying an independent viewer's styling. Native certification is still
unavailable; unsupported automatic/line-unit spacing remains reported.

2026-10-05 direct table-layout increment: `table.layout` now retains `fixed` or
`auto` through JSON, HTML and DOCX. The fixed view derives columns from cell
geometry; typing and resize/Undo do not discard the mode. Browser journeys pass
for editor/export/reopen. Native visual verification remains open because the
independent preview reads the wrong OOXML layout attribute and the available
Windows environment has no LibreOffice renderer. Source/export screenshots are
retained, including the distorted preview; no full fidelity claim is promoted.
Inherited table styles, row-level exceptions, width policies and full table
appearance remain separate requirements. See the current checkpoint.

Direct repeated-header off values are now interpreted correctly instead of
creating header cells. The next table-header boundary must distinguish semantic
cell roles from row repeat-on-print intent, preserve explicit on/off state,
account for native contiguous leading-header rules and inherited table styles,
and avoid inventing fill/font styling. Verify that distinction through the editor,
HTML, pagination/print and actual native DOCX output. The current on/off regression
does not close that larger requirement.

Direct table-appearance implementation (2026-10-05, Unreleased): distinguish
omitted source properties, explicit no-border/no-padding choices and application
defaults in the portable model. The fixed-table source has no borders; the old
exporter added its generated border/margin defaults. Optional validated appearance
now preserves supported native border/margin declarations (including resets and
zero) through real editing, HTML and DOCX. The same unchanged source now remains
borderless. Twenty-five regressions and six recorded desktop-browser workflows
verify this increment, including an independent appearance fixture. Source/editor/
export screenshots were inspected; native certification, inherited/conditional
styles, row exceptions, border conflicts and preferred widths remain open.
Do not change the source fixture, add lab-only CSS or treat correct widths as
proof of complete table appearance. Font-default materialization remains a
separate typography problem.

Preferred-width follow-up (2026-10-05, Unreleased): supported direct `tblW`
physical/percentage/auto/nil choices now have an independent portable table
attribute. JSON, HTML and DOCX retain them; native export no longer silently
replaces them with auto or a fixed-grid sum. Recorded physical/percentage
workflows verify real typing, history, native bytes and reopening across three
engines. Browser cell boxes now include borders/padding inside their grid width.
This closes direct-preference retention, not width policy/native layout: row
exceptions, inherited widths, intrinsic constraints, page-relative percentage
projection and Word's full layout algorithm still need evidence. Preserve the
source/editor/export differences, including row height and wrapping, as open
fidelity work. See the current checkpoint for exact verification.
The subsequent default-policy increment separates omitted Word automatic width
from fresh Fountain host defaults. It exports the supported effective full-width
or complete-fixed-grid preference with a materialization report. Recorded
source/edit/export/reopen checks exposed and fixed border/grid double-counting
in shared DOM/HTML projection. This advances default-policy retention, not full
native appearance or original XML preservation. Continue with paragraph defaults,
typography, inherited table styles and native layout rather than demo-only fixes.
Before changing the cooling report's heading colours, adjudicate the viewer
against the source: paragraph styles specify black Arial, while linked character
styles and the independent preview supply blue. Native rendering is still
unavailable; suspected preview-rule precedence is not an engine-fidelity target.

Paragraph font-context follow-up (2026-10-05, Unreleased): paragraph layout now
retains resolved family and physical point size separately from inline fonts,
including empty paragraphs. JSON, shared DOM projection, browser/server HTML,
image captions and native DOCX use that same boundary. Word paragraph-mark-only
formatting is not blindly applied to unresolved text runs; unrepresentable cases
receive located warnings. Export writes font defaults on unmarked runs as well
as on the paragraph mark. The recorded mixed-font/empty-line workflow also
exposed generated heading keep flags overwriting source omission; supported
resolved off values now remain explicit. This is not native line-metric or
whole-document fidelity certification. Continue with natural line metrics,
per-line paragraph-mark layout, generated colour defaults, at-least spacing,
table styles and native rendering. Keep unchanged independent sources and
reference-viewer disagreements as evidence. See the latest checkpoint for gates.

The recorded line-break follow-up found two separate omissions: Word import
dropped the containing run's marks on `br`/`cr`, and Shift+Enter created an
unmarked break while retaining marks only for subsequent typing. Both paths
now retain marks. A third defect was WebKit reporting real Shift+Enter as a
paragraph insertion; the DOM adapter now carries keyboard intent into native
input while retaining plugin interception and code-block literal newlines.
The three-engine recorded edit/export/reopen journey passes, with inspected
captures and independent checks on actual native downloads. Do not equate this
with resolving an unknown paragraph font:
export explicitly warns `paragraph-font-defaulted` when generated Word styles
supply missing paragraph fonts. Preserve strict geometry failures and their
original inputs until a verified font/line-layout boundary resolves them.

Keep the unchanged cooling report as the visual regression source. Its title was
lost because the adapter interpreted selected style IDs as block roles without
reading their actual formatting. The run-style integration now retains the
source's 25 pt title and 16 pt headings. The paragraph integration below retains
the supported spacing, line, indentation, keep, page-break-before, shading and
solid-border subset; this is still not complete Word layout equivalence.
Do not fix remaining differences by changing the fixture or applying demo-only CSS.

The next style resolver must handle document defaults, the paragraph style and
its `basedOn` chain, character styles and direct run overrides with bounded
traversal and cycle/missing-reference reports. Boolean style toggles and explicit
off values need correct precedence; a shallow object merge is insufficient.
Font references need per-attribute merging and theme resolution, not merely
copying `rFonts` as a whole. Keep actual supported formatting in portable model
attributes/marks, with rendering/export driven from the same data. Preserve
style provenance separately if needed; retaining XML alone is not editable
typography support. Paragraph spacing, indents, line rules, title roles, borders,
table styles and complex-script choices each need explicit representation and
visual evidence. The direct font bridge does not close these requirements.

### Internal cascade groundwork — 2026-09-12

`src/docx/style-cascade.ts` now resolves normalized run declarations in pure
Node: document defaults, bounded paragraph ancestry, bounded character ancestry,
then direct formatting. It preserves explicit false/reset values, merges font
slots independently, detects invalid ancestry and owns immutable snapshots.
`tests/docx-style-cascade.test.ts` exercises these rules. At this internal
checkpoint it was not connected to import. The later integration below connects
it without adding a public style API. Unit tests alone are not visual evidence.

### XML decoding checkpoint — 2026-09-12

`src/docx/style-reader.ts` decodes Word document run defaults and paragraph/character
style declarations using the shared `src/docx/xml-parser.ts`. It resolves expanded
namespace names, rejects duplicate identities/properties/attributes, keeps source
half-points and font declarations, and reports unsupported run/paragraph properties
and style kinds. Unsupported paragraph layout is not silently labelled preserved.
The existing importer's XML parsing algorithm was moved, not replaced with a DOM.

`tests/docx-style-reader.test.ts` covers actual XML declarations, direct false versus
style toggles, resets, script slots, invalid values, namespace aliases, bounded
ancestry, cycles and immutable ownership. The read-only
`scripts/audit-word-style-source.mjs` also decoded the unchanged cooling report:
63 paragraph/character styles, `Normal -> Title`, 50 half-points (25 pt), and
`majorHAnsi` references overriding same-slot named fonts. Its source checksum
remains `52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495`.
The diagnostic counts unsupported declarations across the entire style library,
including unused styles; these counts are **not document content-loss counts**.

This checkpoint was internal decoding evidence, not a visible import fix.
Package integration and effective-format projection are recorded below.
The subsequent explicit-emphasis boundary provides `emphasis: 'explicit'` on
paragraphs/headings, with existing strong/em toolbar marks, HTML interchange and
absolute native Word run resets. It is a prerequisite, not a substitute for loading
the actual styles and projecting all resolved runs. Mixed non-conflicting mark
arrays can still reorder through DOCX; exact JSON equality remains a distinct claim.

The style-resolution programme must:

1. Connect the tested `styles.xml` reader through relationship-owned package parts
   and the existing bounded XML/ZIP boundary (including custom targets and external
   or missing parts). Preserve its namespace and ambiguity checks; map relevant
   declarations outside the supported projection into located import reports.
   Resolve theme references; the cascade deliberately retains references rather
   than guessing a face or fetching a font. Paragraph properties and conditional
   table/numbering styling still need their own representation and rules.
2. Resolve Word's documented default-true toggle variation using independent
   native fixtures. The current internal result explicitly says `unresolved` for
   that combination unless direct formatting supplies an absolute value. Do not
   turn unresolved or explicit false into an absent mark and call it equivalent.
3. Project the supported effective formatting into portable, editable model
   state. Use the explicit-emphasis boundary for resolved normal-weight/upright
   text while retaining positive strong/em marks, and verify its combination with
   inherited styles, toolbar toggles, selections, HTML, export and Undo/Redo. Keeping the
   source XML alone or adding CSS only to the demo does not meet this requirement.
4. Account for Word defaults materialized on reimport. Do not disable inheritance
   just to preserve old JSON-equality tests; update the conversion contract and
   test expectations where explicit normalization is genuinely appropriate.
5. Repeat the unchanged cooling-report journey and original/editor/export/reopen
   visual comparison. Native layout gaps remain unverified until native evidence
   exists; internal cascade equality cannot certify them.

### Public run-style integration — 2026-09-12

Items 1, 3 and 4 now have bounded implementation and regression evidence:
`style-projection.ts` lowers resolved declarations into the same absolute
run-property projection used for direct formatting. The original package is not
rewritten. Custom style-part targets and external/missing/ambiguous relationships
are checked; used unsupported declarations are reported at their document path.
Same-declaration font fallbacks remain available after failed theme resolution.

All 1,923 tests and 12 recorded browser journeys pass. Every exported page was
visually inspected. The unchanged scientific fixture now has the intended title
and heading sizes in the editor and export. Old exact-JSON expectations now
explicitly include materialized exporter style defaults; actual output is never
stripped to make an equality check pass. The public lab still reports differences.

This does not close item 2 or native evidence in item 5. Table widths/row geometry,
a bounded native-OMML subset and attached rich image-caption runs now have
implementation evidence; character spacing, block/field caption content and
broader native layout remain open. Full original Word styling, layout and source
retention remain unproven. See the current checkpoint for reproducible evidence
paths.

### Public paragraph-layout integration — 2026-09-12

`src/core/paragraph-layout.ts` adds a validated, platform-neutral layout value to
paragraphs, headings and code blocks. DOCX style decoding/cascade now resolves the
supported paragraph declarations, `src/docx/paragraph-style.ts` projects them into
Fountain data, and export writes them back as native paragraph properties. HTML
retains the typed value with a CSS projection; Markdown reports loss. Block-type
changes and splits preserve it rather than dropping it.

The unchanged cooling report is still the source oracle. The recorded lab journey
checks exact model values and computed presentation, edits the document, exercises
Undo/Redo, downloads a DOCX, reopens it and compares the materialized full tree.
All 1,931 tests / 151 files and all 12 Chromium/Firefox/WebKit recorded journeys
pass. Original/exported pages and imported/reopened editor views were visually
inspected. Visual review exposed page CSS applying negative letter spacing inside
the editor; the page selector is now scoped and default editor headings no longer
distort imported typography.

This closes only the listed paragraph subset. Table widths/row geometry, rich
captions, character spacing/kerning, conditional styles, multi-section layout,
native OMML ingestion and native Word/LibreOffice certification remain open.
The fixture still reports unsupported equations and the independent viewer is not
a native Office oracle. No release or parity percentage changes at this checkpoint.

Primary references used for the internal rules:
[style ancestry and type restrictions](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.basedon?view=openxml-3.0.1),
[run-style hierarchy](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.runstyle?view=openxml-3.0.1),
[Word font precedence notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/aef3c9a6-5d6c-434b-90b7-85e761fd8e62),
and [Word toggle variations](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/f7130225-2368-48f3-acae-a9d278d0fb25).

## Product objective and user intent

Build an extensible bridge between file formats and Fountain's document engine.
For the formats and features we deliberately implement, the target is faithful
**1:1 import, editing, rendering and export**: structure, appearance, data and
supported behaviour, not merely a readable approximation.

Expand the supported feature set and add formats incrementally. The user is not
asking for every arbitrary file to work immediately. Do not repeatedly answer
this goal as an impossible universal-format guarantee. Conversely, do not use
“unsupported” to excuse failures inside a claimed supported feature set.

Supporting tables, for example, cannot mean silently dropping a supported dark
background while retaining white text. A known defect remains an open defect;
changing the label does not complete the work.

## Architecture direction

- **Shared document concepts:** represent supported text, structure, assets,
  equations, notes, references, page settings and structured attributes in
  Fountain's own model. Do not force its AST to match an external parser's AST.
- **Per-format adapters:** parse source concepts into that model and serialize
  them to the destination. Publish import and export capabilities separately;
  reading a feature does not prove we can write it faithfully.
- **Specialised modules:** implement the actual behaviour where required, such
  as equation rendering, numbering, field updates or pagination. Copying a
  displayed field value alone is not support for its dynamic behaviour.
- **Source and provenance:** retain original bytes, assets and relevant source
  fragments, with mappings to represented content. Track whether edits invalidate
  reuse of a fragment; never blindly splice stale references back into an export.
- **Reader/editor/layout boundaries:** reuse supported semantics across editable,
  read-only and export surfaces. Keep browser rendering and optional format-native
  renderers outside a platform-neutral engine where practical.

Start by extending existing adapters and modules. Do not rewrite the core, freeze
an enormous union schema, or add a mandatory conversion service to implement this
plan. Identify the smallest missing boundary for each tested feature first.

Keeping the original as an attachment is valuable preservation, **not proof of
editable conversion**. A screenshot/PDF preview is likewise not proof of editable
structure or behaviour. Report these capabilities separately.

## Support contract and acceptance

Maintain a versioned matrix per format and direction. Each entry must identify:

- The feature and supported combinations (for example merged, shaded table cells
  containing images), tested source producers, and required fonts/rendering setup.
- Import, editing, reader rendering and export/reopen status independently.
- Preserved structure/data, visual layout, behaviour and source-byte retention.
- Known defects, intentional conversion policies and explicitly excluded cases.
- Reproduction fixtures, recorded journeys, visual evidence and last tested build.

Use statuses such as planned, partial, verified within profile, and regressed.
Do not advertise a whole format as faithful because a small fixture passes.
A regression reopens the affected acceptance claim; it is not quietly reclassified
as an unsupported feature. Scope changes must be explicit and justified.

Before promoting a feature/profile to verified:

1. Import independently produced files, not just Fountain's own exports. Include
   ordinary representative documents and interacting features, not only isolated
   microfixtures. User files require permission/redaction before becoming fixtures.
2. Compare source structure, metadata, referenced assets and supported behaviour
   against the imported model. Check asset hashes where unchanged bytes are promised.
3. Use the public UI: inspect, edit prose and affected feature attributes, insert
   and delete relevant content, undo/redo, save/export and reopen the actual bytes.
4. Render original and output independently, inspect every page and the actual
   editor/reader view, and retain screenshots and a recording. Check clipping,
   contrast, fonts, images, equations, notes, tables, numbering and page boundaries.
5. Run automated semantic, layout and interaction regressions across relevant
   browser engines and target-format tools. Pin renderer/font versions for visual
   comparisons. Any tolerance must be explicit (for example antialiasing noise),
   not permission for missing text, changed pagination or invisible labels.
6. Verify every known conversion loss is accurately located and explained. Missing
   native renderer evidence stays **unverified**, not assumed equivalent because
   a browser preview or internal equality test passes.

Byte-identical retention, semantic equality, visual fidelity and behaviour are
different checks. Packaging timestamps or equivalent XML encodings need not match
unless byte identity is explicitly promised. Intentional edits should change their
dependent content/layout correctly without corrupting unrelated content.

## Execution sequence

### Phase 1 — close the reproduced DOCX gaps

Baseline: [independent document visual audit](CONVERSION_REAL_DOCUMENT_AUDIT.md).
The source contains body images, a header logo, OMML equations, a footnote,
merged/shaded tables, styles and an explicit page break. The workflow passes but
original-document fidelity does not. Historical DOCX milestones are not proof
that these original-file features currently survive.

Track the following as **open** until implementation and the acceptance checks
above demonstrate otherwise:

- **FB-01 — table readability:** preserve supported cell shading with text colour,
  borders and spans; inspect labels in editor, reader and exported document.
- **FB-02 — complete intake inventory/report:** account for source parts and assets
  before conversion, distinguish recovered/unrepresented items, and report omissions
  such as header images and footnotes. Reporting a loss does not fix the loss.
- **FB-03 — notes and header/footer content:** represent and round-trip supported
  references, text and assets, including their relationships and numbering behaviour.
  Native footnote import/edit/export is now locally exercised with the independent
  source in three browsers, as are single-section header/footer text and raster
  assets; see the checkpoint. General note styling/numbering, endnotes,
  multi-section templates, complex fields and evaluated page-number fidelity remain open.
- **FB-04 — layout and styles:** preserve supported explicit page breaks, page size,
  margins and Word style semantics/appearance rather than silently substituting
  default paper geometry or losing the document title's presentation.
- **FB-05 — native Word math:** import supported OMML as correct editable equations,
  render and export them faithfully; test fractions, scripts and combinations.
  Fountain-authored TeX-source restoration is not evidence of arbitrary OMML import.
- **FB-06 — honest lab status:** separate source-import coverage/loss, current-draft
  export/reimport equality, and independent visual/behaviour verification. Keep
  original-import failures visible even when current-draft equality succeeds.

Start with FB-01 and FB-02/FB-06; then expand notes/assets, layout/styles and math
in bounded tested slices. Preserve working body-image extraction while doing so.

### Phase 2 — make the conversion lab the permanent workbench

Keep original source above the full-width editable import. Label text inspection
and independent previews accurately. Provide representative downloadable fixtures,
clear feature/loss inventories and separate verification statuses. Retain original
downloads, actual exported files, privacy-aware diagnostics and reproducible tests.

Add reference previews only when they genuinely help compare the original; do not
present a Fountain re-render of the imported model as the original document.
Use this same surface for development, regression diagnosis and public experiments.

### Phase 3 — widen existing profiles, then add formats

Continue fidelity work for current DOCX, Markdown, HTML and Fountain JSON routes;
this does not supersede unfinished CommonMark work. For each new format, define
a bounded profile and independent corpus before promising support. Candidate
future adapters include TeX documents, ODT and EPUB, chosen according to actual
use cases rather than started simultaneously.

Distinguish full TeX documents from equation blocks, PDF export from PDF structural
import, and stored chart images from editable chart objects. Source and destination
capabilities differ: never imply a destination acquired a behaviour it cannot
represent. Make the supported conversion policy and any fallback explicit.

All new intake must retain resource limits, local/private processing by default,
safe asset handling and inert untrusted content. No automatic macro/code execution,
remote fetching, font downloads or extension installation to make a file “work.”

## Definition of completion

A bounded format profile is complete only when its advertised combinations pass
the structural, visual, editing, behavioural and export/reopen checks, with no
known unaddressed defects inside that claim. A feature count or self-round-trip
success alone does not establish completion. The broader bridge grows through
successive verified profiles; new formats are not required to finish the first one.

When resuming: read this plan and the latest audit, select the first open FB item,
reproduce it, implement the smallest coherent fix, repeat the real-use comparison,
and update the matrix/evidence. Do not forget this plan behind general parity work.

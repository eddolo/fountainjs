# Independent native DOCX audit

## Consecutive keep-with-next settings 2026 11 10

The earlier pairwise preview left a heading on page one while moving its
linked caption and following body paragraph to page two. The paginator now
reserves the full chain through a legal opening of its last block, including
each shared footnote once. Forced page boundaries stop the chain. A chain
that cannot fit on a blank page warns and uses adjacent-pair fallback.

In the paired DOCX fixture, disabling the heading's link left it on page one.
Enabling both links moved the heading, caption and body to page two in the
three desktop browser previews, Chromium print PDF and LibreOffice 24.2.7.2.
The native control, browser preview and both PDF renders were visually
inspected. The check covers top-level blocks. A separate 10,000-item model
check retained every item in order with both a fitting and an oversized chain.

## Keep with next 2026 11 10

The browser used to leave a two-line caption on page one while moving the
following paragraph to page two, even with `w:keepNext` enabled. The preview
now reads the imported setting and measures the entire caption with a legal
opening of its successor. It tries a shorter legal split before moving the
successor away. An explicit disabled setting on a heading overrides the
Fountain heading default. Explicit page breaks still take priority.

The paired DOCX fixture splits the caption and body with the setting off.
With it enabled, Chromium, Firefox, WebKit, Chromium print PDF and LibreOffice
24.2.7.2 agree that both blocks start on page two. The preview, both PDF pages
and the native control were visually inspected. Unit coverage includes a
three-line successor that cannot legally split and a four-line successor that
can. Longer keep chains and nested layout are outside this audit.

## Keep lines together 2026 11 10

The DOCX importer retained `w:keepLines`, but the preview split the same
four-line paragraph with the setting both on and off. The preview now moves
all measured lines of a top-level text block to the next sheet when they fit
there. A longer paragraph can still split with a warning. Nested structural
fragments and host continuation adapters retain their own split rules.

In the paired browser-generated DOCX fixtures, LibreOffice 24.2.7.2 split
the control two lines per sheet and moved all four lines of the enabled
paragraph to sheet two. Chromium, Firefox and WebKit agreed with these sheet
assignments. Chromium print PDF and the independent native PDF agreed on
the text on both pages. The preview and both PDF renders were visually
checked. The layout check covers this top-level case and one oversized
fallback. All 71 focused source tests and nine recorded browser checks passed
alongside the build, existing size limits, package and API checks.

## Paragraph break before 2026 11 10

DOCX import and export already retained `w:pageBreakBefore`. The Fountain
page measurement adapter ignored that attribute, so a three-paragraph DOCX
fixture appeared on one preview sheet even though LibreOffice placed the last
two paragraphs on a second sheet. The adapter now forwards the break for
top-level text blocks. An explicit break takes priority over the preceding
heading's keep-with-next preference. A break on an empty sheet adds no sheet.

Recorded Chromium, Firefox and WebKit checks verify two preview sheets and
an unchanged source model. The Chromium PDF and a LibreOffice 24.2.7.2 render
of the same generated DOCX both place the same paragraphs on each page.
Both PDF page images and the preview were visually inspected. This fixture
checks page assignment. Paper size, native Word output and nested layout are
outside this check. The build passes the existing size limits.

## Footnote separator recovery 2026 11 07

The checked-in scientific source has an ordinary note and its body reference.
Its reserved separator entries have native marker elements but omit their Word
note types. LibreOffice 24.2.7.2 shows the body marker and omits the note text.
A control that changes only the two separator type declarations restores the
text. Changing only whitespace or explicitly labelling the ordinary note has
no effect. Removing those types from a prior Fountain download hides the note
again. The checked-in source and its hash are unchanged.
[Word footnote type reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.footnoteendnotetype.type?view=openxml-3.0.1).

Fountain already recognizes the reserved markers and writes explicit types.
The importer now resolves Word-qualified note attributes and rejects an
ambiguous numeric ID shared by a separator and an ordinary note. The audit
checks an actual edit, undo, redo, DOCX reopen and HTML reader, then verifies
that the downloaded Word file renders one visible note with the edited text.
The unchanged source and typed control are rendered independently. The source
may show the note in a renderer that recovers the omitted types. This evidence
covers the fixture and LibreOffice, with Microsoft Word and broader note layout
still open.

All 603 focused DOCX tests, the package and interoperability checks, and three
recorded Chromium, Firefox and WebKit journeys passed. Visual inspection of
the editor and independently rendered page 2 confirmed that the control and
export show the note below the separator, and that the export includes the
edit. The ESM aggregate passes. Aggregate CommonJS is 148.5 KiB over budget
and the DOCX CommonJS entry is 2.3 KiB over budget.

## Whole-table placement 2026 11 07

The source declares center placement in `w:tblPr/w:jc`. The earlier Fountain
download kept the same column widths and omitted that declaration. A controlled
copy changes only the table alignment in `word/document.xml`. LibreOffice then
restores the source's table position. Before repair the merged header fill
started at 57.90 pt rather than 57.60 pt, and the header text started 0.25 pt
farther right. [Word table alignment values](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tablerowalignmentvalues?view=openxml-3.0.1).

The table's optional `placement` attribute records left, center or right.
Direct Word properties override inherited table styles. The editor and safe
HTML project placement as horizontal margins. Pipe Markdown reports the loss
and HTML table output retains it. Row-specific alignment still produces a
located warning. Table indentation, floating layout and native RTL table flow
remain separate work.

All 714 focused tests passed. In three recorded Chromium, Firefox and WebKit
journeys, an author edits the merged header, undoes the edit, downloads the
DOCX, and reopens both DOCX and HTML. LibreOffice renders each actual download
with the source's painted header rectangle and text position. The Poppler
gate includes the retained 0.25 pt text-shift control. The WebKit editor and
the Chromium source and export page containing the table were visually checked.
Package and python-docx checks passed. Aggregate CommonJS remains 148.2 KiB over
budget and the DOCX CommonJS entry is 2.0 KiB over budget.

## Inline drawing distances 2026 11 07

Fountain was adding four explicit zero distances to drawings even when Word's
source omitted those declarations. A controlled copy of the previous browser
export changes only `word/header1.xml` and only those four attributes. In
LibreOffice 24.2.7.2 this restores the original horizontal positions on both
pages. The old export placed the logo 9.05 pt and the header text 18.1 pt too
far left. The original report is unchanged. [Inline drawing contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.wordprocessing.inline?view=openxml-3.0.1).

Import retains the optional `distT`, `distB`, `distL` and `distR` values in
native EMUs. It distinguishes an omitted side from a zero. Four explicit
zeros use the existing authored-image default, so older Fountain JSON remains
valid. The safe HTML carrier retains the declarations without using them as
browser margins. Ordinary Markdown reports their loss. Invalid values and
receiving schemas without the attribute produce warnings while the image
remains available.

The original and all three actual browser downloads were rendered in isolated
LibreOffice under Ubuntu WSL. The permanent Poppler gate checks both pages and
rejects the saved pre-repair PDF. The logo rectangles match in all three
exports. The existing native paragraph-position gate still passes. Both
Chromium source and export pages and the reopened WebKit editor were visually
checked. The footnote remains a separate discrepancy in the source render.
The 698 focused tests, three recorded Chromium/Firefox/WebKit workflows,
package loading, TypeScript and python-docx interoperability passed.

The aggregate CommonJS output exceeds its current limit by 146.8 KiB. The
DOCX CommonJS entry exceeds its own limit by 1.5 KiB. No threshold changed.

## Font repair within existing capacity (2026-11-03)

The optimized implementation passes all 438 focused DOCX tests and the full
3,413-test / 241-file suite. API (415 declarations), headless (114 modules),
packed ESM/CommonJS, real workerd, independent python-docx interoperability,
framework types, website and every unchanged size limit pass.

Three fresh recorded Chromium/Firefox/WebKit journeys import the unchanged
scientific source, type, undo/redo, download a real DOCX file and reopen it.
All six top/reopened captures were inspected. The existing list-indent drift
remains visible on reopen and remains an open fidelity defect.

The three downloaded packages have the same 18 parts as the independently
rendered export from native run `41720509194`. Every uncompressed XML/asset part
is byte-identical except `docProps/core.xml`, whose only differences are the
two export timestamps. Source/reopened model JSON also matches the preceding
font audit. Original files are untouched. This carries forward that fixture's
native-render observations; it is not a new native-render run or a broader
layout certification. See
[`docx-theme-size-output-comparison-20261103.json`](../artifacts/docx-theme-size-output-comparison-20261103.json).

## Declared theme-language repair (2026-11-03, Unreleased)

The first native comparison exposed a concrete font-selection error: a valid
`en-US` theme language prevented the embedded Calibri font from being resolved,
so the editable document and export used the named Arial fallback. The source
declarations, theme bytes and font environment remain the reference.

`src/docx/theme-fonts.ts` now resolves BCP-47 scripts with the runtime's explicit
`Intl.Locale` likely-subtag operation. A matching embedded DrawingML supplemental
font wins; otherwise the regional theme default is used. The DrawingML `Hang`
tag is used for Korean's composite `Kore` script. The three theme-language roles
and major/minor groups remain independent. Invalid, indeterminate or unavailable
language resolution produces the existing located fallback warning. Empty
matching faces are reported as missing; duplicate script declarations are
rejected. Foreign namespace/attribute lookalikes do not select a font.

This follows the [Word theme-language mapping contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.themefontlanguages?view=openxml-3.0.1)
and uses [ECMA-402 likely subtags](https://tc39.es/ecma402/2024/#sec-Intl.Locale.prototype.maximize).
No implicit host locale, external font lookup, font download, DOM or new runtime
dependency participates. Runtime ICU data can affect likely-script resolution;
this does not implement Word's per-character script/font selection, layout
engine or embedded-font activation.

Twenty of 25 new contracts fail on the preceding implementation. The repaired
focused set passes 48 tests, and the full suite passes 3,413 / 241 files. Both
native paragraph font context and text marks retain Calibri in the unchanged
scientific fixture and its DOCX reopen. Only the optional DOCX ESM/CommonJS
bundles differ; 166 other runtime files are byte-identical. Three recorded real
Chromium/Firefox/WebKit import/edit/history/download/reopen journeys pass; six
top/reopened captures were inspected. Packed ESM/CommonJS, 415 declarations,
113 headless modules, independent DOCX interoperability, framework types and
the website pass. Real workerd also imports, exports and reopens the title's
Calibri context/mark without DOM or Node built-ins.

[Native run 41720509194](https://github.com/eddolo/fountainjs/actions/runs/41720509194)
passes on audit commit `73ad110`. All four page PNGs were inspected. Source and
actual downloaded export now both use Carlito Regular at 25 pt for the title
and Carlito Bold at 16 pt for the setup heading. Both retain two Letter pages,
the body figures, equations and table. The title's final word begins 0.6 pt
later in the export; matching the face/size does not certify glyph-position
equality. List geometry/spacing, header placement and the source-footnote
renderer discrepancy remain open. Both source page PNGs are byte-identical to
the first native audit. The downloaded artifact ZIP was independently hashed
and matches GitHub's published SHA-256.

The first audit build added 739 ESM / 599 CJS bytes and exceeded the existing
limits. Its proposed capacity patch remains historical and unapplied. A later
internal consolidation shares the strict expanded-name reader across document,
style and theme decoding, and the qualified Word attribute reader across table
appearance and preferred widths. It retains namespace alias handling, foreign
lookalike exclusion and ambiguity rejection. The font repair now fits every
existing limit: DOCX measures 188,544 bytes ESM / 152,355 bytes CJS, respectively
68 / 108 bytes smaller than the preceding master build. No additional capacity
approval is needed. CSS, runtime/heap, reference fixtures and oracle thresholds
remain untouched; no npm or parity promotion follows from this checkpoint.
The historical result below still records the earlier mismatch.

This development workflow renders the same scientific source before import and
after a real edit/download in Fountain's public conversion lab. It establishes
independent LibreOffice evidence; it does not certify identical Microsoft Word
output, complete DOCX support or pixel equality.

The unchanged, independently produced `cooling-report.docx` is checked in under
`tests/fixtures/native-docx/` with its SHA-256 and provenance. Its three raster
assets, two native equations, merged/shaded table, footnote, header/footer and
manual page break exercise an actual technical document. The numbers are model
data, not experimental measurements. The original source must not be rewritten
to hide a conversion difference.

## What the workflow checks

`scripts/native-docx-audit.mjs prepare` verifies the source hash and imports it
through the production DOM-free adapter. It checks image byte hashes, equations,
table, footnote, manual break and expected readable content.

`playwright.native-docx-audit.config.ts` runs one headless Chromium journey on a
private local port. The journey uses the actual file picker, scrolls through
figures/equations/table, types at the final paragraph, verifies Undo/Redo, saves
the actual DOCX download and diagnostic report, then reopens that file. It does
not insert an editor document through a private API. Screenshots and recordings
are retained. The unpaginated author surface exposes headers/footers as separate
templates; it is not an original-page preview.

The `inspect` phase reimports the actual download and verifies those structural
contracts again, including the authored text. A successful round trip is still
independent of original-format layout. Complete JSON equality remains reported
honestly, including known note/template position normalization.

`scripts/render-docx-native-audit.py` runs only in an isolated Linux test job.
Both files use the same LibreOffice binary, font environment and separate clean
profiles. Poppler independently reads each PDF, checks required visible prose
and table text, enumerates drawn image objects and rasterizes every page. It
requires actual nonempty PDFs/page images, not merely a zero process exit.
Renderer versions and font substitutions are recorded. Page counts and the two
sets of page images remain separate for visual review; rendering successfully
does not turn differences into fidelity passes.

The commands follow the official [LibreOffice command-line contract](https://help.libreoffice.org/latest/en-GB/text/shared/guide/start_parameters.html).
Installing the native renderer is confined to the [GitHub-hosted test runner](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/customize-runners).
The Windows document skill's bundled-renderer dependency is still unavailable;
this project CI job does not select or install the user's desktop LibreOffice.
Fountain consumers acquire no Office dependency.

## Run the audit

After building the library, use a fresh output directory:

```sh
node scripts/native-docx-audit.mjs prepare artifacts/docx-native-audit
pnpm exec playwright test --config playwright.native-docx-audit.config.ts
node scripts/native-docx-audit.mjs inspect artifacts/docx-native-audit
# Isolated Linux job only, with LibreOffice/Poppler/fontconfig installed:
python scripts/render-docx-native-audit.py artifacts/docx-native-audit --soffice /usr/bin/soffice
```

Preparation and rendering refuse to reuse their output directories, avoiding
stale PDFs being mistaken for current output. The workflow uploads source and
actual exported files, editor captures, native PDFs/page PNGs, conversion reports,
toolchain details and browser traces even when a later check fails.

## Current checkpoint 2026 11 03

The first attempted import of this retained source crashed on identical repeated
Word cell-shading declarations. The existing border/margin appearance reader
already coalesced identical declarations and reported conflicts. Shading now
uses that same namespace-aware selector across its existing precedence layers.
The first declared layer owns the property: a conflict is reported and omitted,
without choosing an arbitrary value or falling through to a lower-priority fill.
Style-reference ambiguity checks elsewhere stay intact.

Seven regression cases failed before the repair. The focused table set passes
74 tests after it; the actual scientific-document Chromium journey and downloaded
file checks pass. All nine editor captures were inspected. The reopened numbered
list has a different text indent, which remains a visible discrepancy; the native
pair must adjudicate layout rather than normalizing the reference.
The full suite passes 3,388 tests / 240 files.
The existing code/CSS limits pass without a capacity change. No native/pixel fidelity
or parity-percentage promotion is claimed from the local browser evidence.
API (415 declarations), headless (113 modules), packed package loading,
independent python-docx interoperability, framework types and website checks
also pass. The implementation adds 54 bytes ESM / 19 CJS in aggregate by reusing
the existing appearance selector; no dependency or numerical limit changes.

## First independent native result 2026 11 03

[Native audit run 41713938393](https://github.com/eddolo/fountainjs/actions/runs/41713938393)
passes on source commit `7101338`. LibreOffice 24.2.7.2 renders both the original
and actual browser-downloaded export to two Letter pages (612 × 792 pt). All
four 120-DPI page images were inspected. Required visible prose/table anchors
and drawn-image-object checks pass; these are bounded checks, not exhaustive
semantic or pixel equivalence. The original and exported files remain unchanged.

| Area | Observed native result |
| --- | --- |
| Figures and table | Both body figures, captions, numeric table rows and merged dark header remain visible and readable. The header logo is present on both pages in both files. |
| Equations | Both expressions render with subscripts/exponents and a stacked fraction. This is LibreOffice evidence for this fixture, not general Office Math or Word certification. |
| Typography | The source title uses Carlito at 25 pt; the export uses Liberation Sans at 25 pt. Source headings also switch face. The font environment substitutes Carlito for Calibri and Liberation Sans for Arial; the face selection, rather than title size, changes. |
| Lists and spacing | The first instruction begins at 75.7 pt in the source and 93.7 pt in the export, an 18 pt shift. Item spacing also differs and pushes the following figure down. |
| Header placement | Header logo/text repeat in both documents, with different horizontal positions. This is placement drift, not a missing second-page header. |
| Footnote | The source XML contains the full note, but this LibreOffice source PDF shows only its marker. The exported PDF displays the full note. Source reserved separator notes omit their `type`; export writes explicit types. This is an unresolved reference/renderer discrepancy, not established Fountain content loss. |
| Authored change | The final paragraph retains `Checked in Fountain.` in the downloaded Word file and native PDF. |

The title's source font declaration contains both named and themed Latin slots.
The current resolver already gives the same-declaration theme precedence and
keeps font slots separate across inheritance. The concrete fallback is earlier:
`src/docx/theme-fonts.ts` rejects every explicit theme language, including this
source's related `w:themeFontLang w:val="en-US"`. The import report records
`language-dependent-theme-font` and the named Arial fallback. The next repair
must resolve supported regional defaults without guessing unimplemented
language/script-specific selection or changing the original fixture. Keep
same-declaration selection separate from style-hierarchy overrides, as explained by
[Microsoft's run-font implementation notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/aef3c9a6-5d6c-434b-90b7-85e761fd8e62).
Native font choice, list geometry/spacing and header placement remain concrete
work items. Source footnote validity/renderer behavior needs independent
adjudication; the retained source must not be patched to manufacture agreement.

The missing independent-rendering environment is now resolved through CI.
FB-04 and FORMAT-05 remain partial. No pixel-parity, complete native Word,
physical-device, assistive-technology or parity-percentage claim follows.

## Unmerged list-position repair 2026 11 03

[Run 41740050920](https://github.com/eddolo/fountainjs/actions/runs/41740050920)
verifies feature commit `d8e6f3d`. The source bytes and both source page images
match the prior reference. The three exported instructions now start at the same
75.7 pt as the source, rather than 93.7 pt. Both documents still render to two
Letter pages; figures, native equations, table and the actual authored change
remain visible. Source and export title/heading font faces now agree after the
separate theme-language repair on master.

Vertical instruction tops still differ (source 244.471/258.971/273.471 pt;
export 251.471/272.971/294.471 pt). Header placement and footnote/renderer
discrepancies remain. The exported second page is byte-identical to the earlier
master result. This is a verified horizontal-position repair for the retained
fixture, not a complete list-layout or format-fidelity verdict. The branch is
unmerged and exceeds existing size caps; see [the list-layout work](DOCX_LIST_LAYOUT.md).

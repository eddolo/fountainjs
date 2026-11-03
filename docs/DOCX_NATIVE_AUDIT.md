# Independent native DOCX audit

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

The build adds 739 ESM / 599 CJS bytes in the optional DOCX entry. Existing
DOCX and aggregate code limits reject that growth. A prepared, unapplied patch
proposes DOCX limits of 185 / 149.5 KiB and aggregate limits of 1,652.5 /
1,375.5 KiB. Additional capacity approval is pending. CSS, runtime/heap,
reference fixtures and oracle thresholds remain untouched; no npm release or
parity promotion follows from this branch audit. The historical result below
still records the earlier mismatch.

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

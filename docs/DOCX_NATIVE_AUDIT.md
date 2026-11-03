# Independent native DOCX audit

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
The full suite passes 3,388 tests / 240 files. Native CI rendering is pending.
The existing code/CSS limits pass without a capacity change. No native/pixel fidelity
or parity-percentage promotion is claimed from the local browser evidence.
API (415 declarations), headless (113 modules), packed package loading,
independent python-docx interoperability, framework types and website checks
also pass. The implementation adds 54 bytes ESM / 19 CJS in aggregate by reusing
the existing appearance selector; no dependency or numerical limit changes.

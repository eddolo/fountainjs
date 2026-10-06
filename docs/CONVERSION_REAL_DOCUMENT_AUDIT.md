# Conversion lab: independent document visual audit

Date: 2026-09-08. Public lab reported Fountain **0.4.0-beta.2**.

**Verdict: the import/edit/export workflow completes, but complex DOCX fidelity fails.**
This is an audit finding, not a completed fix or a new parity milestone.

Later local increments are recorded in the [current fidelity checkpoint](DOCX_FIDELITY_CHECKPOINT.md).
The historical findings below must not be interpreted as the latest completion
status or as proof that all native-format omissions have been repaired.

## Reproduce the focused input audit

The rebuilt line-break journey records all three desktop engines, native input
events, screenshots, original/export bytes, videos and traces:

```powershell
pnpm exec playwright test -c playwright.conversion-audit.config.ts --grep 'line-break run' --output artifacts/docx-break-cross-browser
```

The related editor regressions have a separate server on port 4194 and record
videos/traces without touching the user's demo server on port 4173:

```powershell
pnpm exec playwright test -c playwright.input-audit.config.ts --grep 'renders repeated empty paragraphs|commits cross-browser composition|highlights editable code|unwraps and exits an inserted quote|keeps rich and multiline paste|types, deletes, and undoes inside imported empty' --output artifacts/shift-enter-editor-regression
```

These are focused reliability checks. They do not certify native Word layout or
replace the complete conversion audit and its unresolved strict geometry cases.

The signed-character-spacing journey is also recorded across all three desktop
engines. Run it separately from any `pnpm check` or other build: these commands
share `dist`, and concurrent builds can invalidate package imports.

```powershell
pnpm exec playwright test -c playwright.conversion-audit.config.ts --grep 'character spacing survives' --output artifacts/docx-character-spacing-audit --global-timeout 300000
```

It compares complete JSON from actual HTML/native exports, browser/server HTML
importers, public editor reopens and strict text/paragraph geometry, not just the
presence of spacing marks. Both must retain physical page settings; no actual
attributes are removed from the expected document to conceal a difference.
The independent browser viewer ignores run pitch; visual agreement with that
viewer is not a requirement to erase correct native/model character spacing.
Native Word appearance remains uncertified. See the latest checkpoint for the
21 reviewed captures, independent file checks and earlier failed-run evidence.

## What was actually tested

An independently authored python-docx document, not a Fountain-generated round-trip
fixture, containing two body images (JPEG apparatus diagram and PNG numeric plot),
a separate header logo, two native Word/OMML equations (subscripts, exponent and
stacked fraction), a merged and shaded table, numbered instructions, captions,
bold/italic text, a footnote, footer field, and an explicit page break.

The recorded Chromium journey used the public conversion page's file picker,
scrolled through the editor and images, downloaded recovered image files, typed
a reviewer paragraph, verified undo and redo, exported DOCX, downloaded the
diagnostic report, and reopened the actual exported file. It did not inject the
Fountain document through a private API.

Original and exported bytes were also rendered through a separate docx-preview
viewer. Every resulting viewer page screenshot and the relevant editor images,
equations and table were visually inspected. Package XML and image SHA-256 hashes
provide independent structural evidence.

**Native Word/LibreOffice rendering is unavailable in this environment.** The
required document renderer was attempted and failed because soffice was missing.
The browser viewer is not native Word: it also has its own layout/field limitations.
Its two original sections versus one long exported section are not a certified
Word page-count comparison. This audit does not certify print fidelity.

## Findings

| Area | Observed result | Evidence / owning code |
| --- | --- | --- |
| Body images | Both displayed at their original pixel dimensions; downloaded bytes match the originals exactly; identical bytes remain in the exported DOCX. Alt text and figure captions survive. | `image-inventory.png`, `imported-body-image-*.png`, `structure-check.json` |
| Header logo / header / footer | Header logo and text and footer text do not reach the imported document. Export has no header part and omits the logo asset. | `src/docx/index.ts:932` selects document/numbering/body relationships and media, not header/footer document parts and their relationships. |
| Native Word equations | **Superseded 2026-09-12:** both source equations now import as typed editable math, render through KaTeX, export as native OMML without reparsing generated TeX, and reopen as typed math. A second four-equation fixture covers function application, upper/lower limits and equation arrays in all three engines. Its original and exported independent-viewer screenshots share the same missing upper-limit arrangement even though both packages contain `m:limUpp`; Fountain renders it before and after round-trip. Broader OMML and native Word/LibreOffice remain uncertified. | `src/docx/math-parser.ts`, `tests/docx-math-import.test.ts`, `tests/manual/conversion-real-document-audit.spec.ts`, `extended-equations-imported.png`, `extended-equations-reopened.png` |
| Footnote | Reference and footnote text disappear; exported package has neither footnote reference nor footnotes part. No item-specific warning appears in this run. | `src/docx/index.ts:932`, `original-page-2.png`, `structure-check.json` |
| Table readability | Merged first row, numeric values and label text survive structurally. White label text survives but dark cell shading does not: labels are white on white in the editor **and exported viewer**. This is a readability failure, not missing label strings. | `src/docx/index.ts:722`, imported first-cell `background: ""` with `text_color: "#ffffff"`; `imported-table.png` |
| Typography | Word Title becomes a normal paragraph; Heading 1 retains heading semantics but adopts Fountain's much larger styling. Original appearance is not preserved. | `src/docx/index.ts:521` maps selected style names rather than resolving the Word stylesheet; `original-page-1.png`, `imported-top.png`, `exported-page-1.png` |
| Page setup / breaks | Explicit page break becomes an ordinary line break. Export changes Letter to default A4 and margins to 1 inch. This is confirmed from XML, independently of viewer pagination. | `src/docx/index.ts:450` handles `br` without page type; `src/docx/index.ts:1317` writes export page defaults; `structure-check.json` |
| Editing workflow | Adding a reviewer paragraph, undoing, redoing, exporting and reopening retained that edit. Prose, the numbered list, direct bold/italic formatting and body images survived this tested path. | Recorded test and `observations.json` |
| Loss report | Only two `unsupported-office-math` warnings were returned. Header/footer, footnote, shading, title styling and page-setup losses were not individually reported. | `lab-report.json` |

## Why the equality check still passed

2026-09-12 follow-up: the historical findings above describe the original audit.
Explicit RGB table readability, native column-grid retention, bounded native
equations, page templates and footnotes are now corrected, and source-package
reporting and the lab's equality explanation have improved. See
[the implementation checkpoint](DOCX_FIDELITY_CHECKPOINT.md). The remaining
original-file fidelity defects are not closed by these changes.

The lab reported `exactFountainJSONEquality: true` and no export issues.
That means **the already-imported Fountain draft equals its export reimport**.
It does not mean the original Word document was preserved. For this fixture,
missing source content never entered the draft being compared.

The lab currently explains that boundary in surrounding text, but a prominent
success result is still too easy to misread. Source-ingestion coverage, current
draft round-trip equality, and independent visual fidelity need separate statuses.
In particular, an equality success must not imply that original-import losses have
been resolved.

## Recommended correction order (not implemented by this audit)

1. Preserve table backgrounds with text colors, and regression-test actual visible
   labels. Never silently turn formerly readable content into white-on-white text.
2. Inventory omitted package parts and assets and return located loss warnings.
   A body-image count must not be presented as a count of every original image.
3. Preserve/recover header and footer assets and footnotes, with source fallbacks
   wherever a native editable representation is not yet supported.
4. Preserve explicit page-break semantics and imported page setup. Resolve common
   Word styles or report their supported conversion policy explicitly.
5. **Implemented for the documented bounded subset:** native OMML imports to a
   retained semantic tree; unsupported structures remain explicit. Continue
   expanding structures only with import/export and visual evidence.
6. Repeat the visual fixture in more browsers and native Word/LibreOffice before
   claiming original-format fidelity. Extend to the user's actual failing file
   when supplied; this fixture does not identify that file's particular image type.

## Local evidence and reproduction

All paths below are relative to the repository; artifacts are local, not published.

- Fixture builder: `scripts/create-conversion-stress-fixture.py`
- Actual source: `artifacts/conversion-real-use/source/cooling-report.docx`
- Source SHA-256: `52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495`
- Image/source manifest: `artifacts/conversion-real-use/source/manifest.json`
- Browser journey: `tests/manual/conversion-real-document-audit.spec.ts`
- Local audit configuration: `artifacts/conversion-real-use/audit.config.ts`
- Evidence directory: `artifacts/conversion-real-use/results/conversion-real-document-a-7af3f-ific-DOCX-in-the-public-lab/`
- Evidence includes `video.webm`, `trace.zip`, original/exported viewer PNGs,
  editor screenshots, actual exported DOCX, downloaded images, diagnostic report,
  observations and `structure-check.json`.

The builder creates `cooling-report-base.docx`; this audit then used the document
skill's `insert_note.py` to replace `[[FN]]` with a real footnote in
`cooling-report.docx`. Footnote text: “These values are generated from the stated
model for conversion testing; they are not measured experimental data.”

With that fixture present, the local Vite server at port 4189 running, and
docx-preview prebundled by Vite, rerun:

```powershell
pnpm exec playwright test -c artifacts/conversion-real-use/audit.config.ts
node scripts/inspect-conversion-stress-result.mjs
```

The recorded journey passes its **workflow assertions**, not fidelity assertions.
The findings above remain open. No product implementation, deployment, npm
publication or broader roadmap work was performed in this audit.

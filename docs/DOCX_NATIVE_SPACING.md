# Native paragraph spacing bridge (2026-11-04, unmerged)

Later checkpoints repair the retained paper's figure/caption offsets and
cumulative equation drift. See [image paragraph layout](IMAGE_PARAGRAPH_LAYOUT.md)
and [display-equation paragraph context](MATH_PARAGRAPH_LAYOUT.md) for the current
3,609-test verification and 11-position native profile. The sections below retain
their original checkpoint measurements rather than rewriting the audit history.

## Native document-default initialization

The remaining common 7 pt offset is now repaired. The exporter previously wrote
`word/settings.xml` only for even-page templates. LibreOffice applies Word's
paragraph-spacing defaults when it reads that part; without it, this export
retained additive Writer spacing. The same 7 pt after-space and 24 pt before-space
therefore accumulated instead of using their maximum.

Every generated DOCX now has an internal settings relationship, content-type
registration and a settings root. It stays empty unless even-page templates
require their existing flag. Original paragraph declarations, styles, document
model and source fixture remain unchanged. This initializes generated Word
defaults; it does not copy unrelated source settings or certify legacy
compatibility-mode retention. See LibreOffice's pinned
[settings dispatch](https://github.com/LibreOffice/core/blob/libreoffice-24.2.7.2/writerfilter/source/dmapper/DomainMapper.cxx)
and [settings application](https://github.com/LibreOffice/core/blob/libreoffice-24.2.7.2/writerfilter/source/dmapper/DomainMapper_Impl.cxx).

Implementation commit `0255f600ff3704f610e80ad3ee62acc38e96ceb0` adds five
contracts; four fail on the preceding implementation and the even-page case
already passes. The complete suite passes **3,582 tests / 252 files**. Build,
framework types, packed ESM/CommonJS consumers, independent DOCX interoperability,
the 119-module headless boundary, 419-declaration API surface and real workerd
pass. The actual tarball SHA-256 is
`9a64e32912c357cb1e46405371c2f6555020edb754b70d3877580cfa67618f9f`.
Only the two DOCX bundles differ from the preceding package: **+7 ESM / +5 CJS
bytes**. The other 167 runtime/CSS files are byte-identical. Seven size ceilings
and the prior HTML timing failure remain unresolved; no limit changed.

Three recorded one-worker headless browser journeys pass. All imported,
reopened and standalone-reader captures are byte-identical to the previously
inspected captures. Complete edited models and downloaded reader HTML also
match the preceding audit. Native package differences are only the new settings
part, its relationship/content-type registration and export timestamps;
`word/document.xml` and `word/styles.xml` are byte-identical.

[Native audit 41763890327](https://github.com/eddolo/fountainjs/actions/runs/41763890327)
passes on verification commit `9e15472c9cdde46cd8b0bcb9a031df0dedd1e807`.
Its archive SHA-256 matches GitHub's digest:
`8770a0c7f0d656779692212ee01d750eddf656751a7aa8648104a700a9d0c4df`.
All four final native page images equal the four inspected images from the first
post-fix run. Source page images also equal the preceding audit. Both documents
retain two Letter pages and four drawn image objects.

Source and export now put the setup heading at **187.938 pt** vertically and
the three instruction texts at **244.471 / 258.971 / 273.471 pt**. Instruction
text remains at **75.7 pt** horizontally. Both the initial offset and accumulating
list-gap errors are repaired for this unchanged fixture.

The standard native workflow now independently extracts first-page PDF text
coordinates with Poppler and requires these four paragraphs to match within
**0.01 pt**. A retained, actual pre-fix PDF is the negative control: it must show
the known **7 pt** offset and fail the current-position profile. Both controls
pass. This is a bounded native regression check, not full pixel/Word certification.

Other differences remain measured: figure-caption tops differ by **−3.2 / −6.4
pt**, and the page-two recorded-temperatures heading differs by **+2 pt**.
Header positioning, the original-footnote renderer discrepancy, richer flows
and standalone HTML math/page-template rendering remain separate work. Source
settings that explicitly request legacy/additive spacing still need a portable
contract or dedicated import diagnostics before claiming that profile.

Evidence: [verification](../artifacts/docx-settings-verification-20261104.json),
[native review](../artifacts/docx-settings-native-review-20261104.json),
[independent coordinate gate](../artifacts/docx-settings-gate-evidence-20261104/unpacked/paragraph-position-report.json),
and [actual native export](../artifacts/docx-settings-gate-evidence-20261104/unpacked/native/exported/exported.pdf).

## Earlier bridge checkpoint

The DOCX adapter now writes a shared native paragraph style for each portable
spacing group and direct `w:contextualSpacing` on/off declarations. Original
before/after values remain declarations; the adapter never substitutes the
currently computed gap. Omitted spacing in an owned group becomes explicit
zero, avoiding generated Normal-style spacing on reopen.

Groups are independent of paragraph kind. A paragraph, heading and code block
can share the same native style identity. Heading roles use native outline
levels; direct paragraph/run properties retain their generated appearance.
Explicit font, size, emphasis and colour overrides remain authoritative.
CodeChar keeps its own face and inherits paragraph size, matching the generated
legacy styles. Code LF characters become native line breaks and reopen as LF.
CR/CRLF conversion is explicitly reported; this is not byte-preserving code
storage.

## Ownership and platform boundary

`src/docx/paragraph-bridge.ts` owns the mapping. A bounded, internal,
relationship-owned `customXml/fountainParagraphs.xml` part contains only:

- Native paragraph-style IDs paired with opaque portable group identities.
- Code/caption roles bound to a native paragraph ID and its actual document
  part/style. Code roles also retain language and line-number intent.

There are no stored document, formatting, computed-gap or source snapshots to
restore over external edits. Native paragraph declarations and outline levels
remain authoritative. Generated-looking style names alone confer no metadata
ownership. Removing the optional metadata leaves Word's style-based spacing
and native heading outline semantics intact; original opaque group names and
non-native code/caption roles then need their documented fallbacks.

Paragraph IDs are unique within their document part. Ambiguous IDs, changed
native styles or a native heading outline prevent code/caption restoration.
Invalid metadata produces a located warning and falls back to native content.
An orphaned part is not expanded. External/ambiguous/missing relationships do
not restore aliases or roles. Existing ZIP/XML expansion limits still apply;
metadata expansion failures propagate rather than being swallowed as warnings.
The bridge caps native group definitions at 4,000, metadata at 8,000,000 expanded
bytes and role records at the existing 500,000-node bound. It performs no network
access, extension loading or execution.

This is a private DOM-free format boundary. Portable paragraph layout and the
document engine acquire no Word style, namespace or paragraph-ID concepts.

## Verified source checkpoint

The new Node contracts cover all four on/off combinations, distinct/case-sensitive
identities, omitted intent, native declaration edits, metadata removal, native
heading precedence, shared heading/code/caption identity, multiline code,
inline font overrides, per-part body/header/footnote bindings, namespace aliases,
foreign lookalikes, duplicate identities/IDs/roles, invalid languages/roles,
relationship failures and size limits. The retained scientific paper is imported,
exported and reopened with its original 7 pt declarations and zero internal list
gaps. These checks are structural evidence, not independent native-layout proof.

Source commit `b2d04c6f9e1f625b38baf90d83f7a21dd6dbc7ef` passes the full
**3,577-test / 251-file** suite, including 45 new contracts. An initial full run
exposed a legacy rich-code fallback regression; conversion is now restricted to
explicitly bound code roles and the unchanged explicit-alignment regression
passes. Reused native header parts, omitted code groups and early metadata-byte
limits have additional regression coverage.

Build, framework types, packed ESM/CommonJS root/core consumers, independent
python-docx interoperability, the 119-module headless boundary and unchanged
419-declaration API surface pass. Real workerd imports native bytes, applies a
transaction and exports/reopens the 2 pt spacing profile without a browser DOM.
The actual packed tarball SHA-256 is
`8d2ad82acb2f458d7e4dc94471017d49afda27b8dca52f8033d484f5e44f7a4e`.

Three recorded headless, one-worker Chromium/Firefox/WebKit public-lab journeys
import the unchanged scientific source, exercise Enter/Undo/Redo/Backspace,
download JSON/HTML/DOCX and reopen the actual files. Imported and native-reopened
editor captures are byte-identical within each engine; all six were inspected.
The complete edited models equal the preceding audit's models. Declared 7 pt
after-spacing and same-group intent remain data; both imported and reopened
internal list gaps meet the unchanged <0.05 CSS-pixel check. Raw subpixel readings
are retained. All three standalone HTML captures were also inspected. Their
HTML bytes remain unchanged; raw equations and linear page-template/page-field
fallbacks remain visible limitations, not repaired reader fidelity.

Only `dist/docx.js` and `dist/docx.cjs` change from the retained prior package;
the other **167 runtime/CSS files** are byte-identical. The optional adapter adds
11,269 ESM / 9,319 CJS bytes in this checkpoint; no dependency, public entry,
core/view code or acceptance limit changes.

## Earlier independent native result (before document-default initialization)

[Native audit 41761593707](https://github.com/eddolo/fountainjs/actions/runs/41761593707)
passes on that source commit. The downloaded archive SHA-256 matches GitHub's
published digest:
`cd9a9b69fbf1e71edbda227fac637fdaff6be0e09184de8616bf60c262b9cf70`.
LibreOffice 24.2.7.2 independently renders source and actual browser-downloaded,
edited export to two 612 × 792 pt pages each, with four drawn image objects.
All four page images were inspected. Both source page images are byte-identical
to the earlier native audit; the original DOCX SHA-256 remains
`52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495`.

The three instruction texts remain at **75.7 pt horizontally** in both files.
Source tops are **244.471 / 258.971 / 273.471 pt**; exported tops are now
**251.471 / 265.971 / 280.471 pt**. Both files therefore have **14.5 pt** steps.
The earlier 7/14/21 pt cumulative drift becomes a common **7/7/7 pt offset**:
the extra per-item gap is repaired, while the list's initial vertical position
is still wrong. Header horizontal placement, figure/table positioning and the
source-footnote renderer discrepancy remain visible. This is bounded native
LibreOffice evidence, not Microsoft Word or whole-document pixel certification.

Evidence: [native review](../artifacts/docx-native-spacing-native-review-20261104.json),
[package/browser verification](../artifacts/docx-native-spacing-verification-20261104.json),
and [actual exported native PDF](../artifacts/docx-native-spacing-native-evidence-20261104/unpacked/native/exported/exported.pdf).

## Remaining scope

Quote containers and custom blocks still need a verified native flow mapping.
Image/caption spacing identities can round-trip, but the portable view does not
yet project their adjacency as paragraph flow; the mismatch stays reported.
Multi-paragraph list-item ownership, broader marker/tab behaviour, header
positioning and the source-footnote renderer discrepancy remain separate work.
Seven unchanged size ceilings still fail: core ESM/CommonJS, DOCX ESM/CommonJS,
CSS and both runtime aggregates. The DOCX entries measure 208.9 / 169.2 KiB;
runtime aggregates measure 1687.6 / 1405.4 KiB. The prior HTML timing failure is
unresolved; this DOCX-only change does not rerun it into a passing claim. The
older theme-font capacity proposal is historical and is not reused as capacity
for this feature. No limits changed, no merge/npm publication and no parity
percentage promotion.

The native rules are documented by Microsoft:
[contextual spacing](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.contextualspacing?view=openxml-3.0.1),
[outline levels](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.outlinelevel?view=openxml-3.0.1),
and [part-scoped paragraph IDs](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-docx/a0e7d2e2-2246-44c6-96e8-1cf009823615).

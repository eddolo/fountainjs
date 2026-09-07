# Real-document reproduction benchmark

Status: **open; equation/table structure and original table values now pass the
preflight, but rendering, layout and whole-document reproduction remain incomplete**.
Added from the user's 2026-09-07 requirement. This strengthens DOC-09, DOC-10,
FORMAT-03, and FORMAT-05 acceptance; it is not another delivered capability.

The benchmark is an editable reconstruction of real documents made with established
domain software, not a screenshot/PDF embedded in Fountain. A successful equation
render, preserved source string, or green unit suite is not whole-document parity.

## First academic reference

[Tiago Sequeira (2022), NeuralFieldEq.jl, JOSS 7(75), 3974](https://doi.org/10.21105/joss.03974)
is released under [CC BY 4.0 on the publisher's page](https://joss.theoj.org/papers/10.21105/joss.03974).
Retain author, title, DOI, license, and modification notices in any derived fixture
or public demo; an unofficial reproduction must not imply publisher endorsement.

- [Published PDF](https://www.theoj.org/joss-papers/joss.03974/10.21105.joss.03974.pdf):
  SHA-256 `af6c56ccda78793424114cf1b2d8af75cb85a22815c9c40c25f2a0cc3988cc5c`.
- [Pinned paper source](https://github.com/tiagoseq/NeuralFieldEq.jl/blob/e68d061e4d91e336b326076cb9ffd61bcbeb41b9/JOSS/paper.md):
  SHA-256 `ea86c661c312b286331afb8eb8d6bac23c741a6d0df37e6c0045a9672e0c584c`.
- The source combines Markdown, TeX environments, and bibliography metadata;
  it is not a plain CommonMark document. Publication-source/template consistency
  still needs checking before treating a rebuilt PDF as the original oracle.
- The downloaded PDF identifies LaTeX/LuaHBTeX (TeX Live 2021), four A4 pages.
  All four pages were rendered with Poppler and visually inspected on 2026-09-07.
  The reference includes numbered display equations, inline mathematics, a title
  and metadata sidebar, footnote, nested instructions, code, a captioned plot,
  numerical table, linked bibliography, and repeated citation/page-number footer.

Run after `pnpm build`:

```sh
node scripts/audit-academic-reference.mjs
```

This opt-in networked diagnostic verifies the pinned source checksum. It is
deliberately **not** a full-reproduction release gate; it exits nonzero for missing
required structures or values. Its structural checks now pass, but the report
explicitly identifies unverified reproduction requirements. It never executes
the paper's Julia examples or accepts a changed reference automatically.

Observed first preflight, 2026-09-07:

| Requirement | Observed result |
| --- | --- |
| Preserve untouched input string | Pass |
| Recognize inline math | 35 inline math nodes; individual formula fidelity not yet audited |
| Two displayed equation environments | **Fail: zero math blocks** |
| LaTeX table | **Fail: zero table nodes** |
| Recognizable code/image content | One code block and one image node; asset/render fidelity untested |
| Full source-to-editor-to-export visual reproduction | **Not run** |

Do not hide the display-equation/table failures by manually replacing the source
with simpler syntax and calling import compatible. Manual authoring and automatic
import are separate workflows; any adapter or translation must be explicit and
preserve/report source semantics, labels, citations, and losses.

### Editing prerequisite discovered during follow-through

The math node view and demo toolbar previously used single-line inputs, which
cannot display multiline TeX faithfully. Merely inspecting source could strip
line endings and clear a stored accessibility description. They now use
textareas, preserve unchanged source/labels, and keep native control focus while
transactions update the selected node. Display Enter adds lines; Ctrl/Command+Enter
finishes. A recorded source-editing journey exercises backward replacement,
undo/redo and Markdown reimport. This is an editing prerequisite only: the two
paper import failures above remain open, as do typeset visual reproduction,
numbering, cross-references, bibliography, and full export fidelity.

Verification on 2026-09-07: `pnpm check` passed 901 tests in 83 files, along
with API, package, pure-runtime, conformance, build-budget and performance gates.
Six native math contracts passed across Chromium, Firefox and WebKit under
`artifacts/browser-multiline-math-20260907c/results/`, and twelve related
focus/custom-node/widget regressions passed under
`artifacts/browser-control-focus-regression-20260907a/results/`.
All four recorded capability journeys passed under
`artifacts/manual-multiline-math-20260907c/results/`; the multiline before/after
screenshots were visually inspected. That review found and fixed collapsed
line breaks in the source-only preview as well. Runtime code measures 1320.8 KiB
ESM / 1102.3 KiB CJS; only the aggregate CJS ceiling increased by 1 KiB to 1103.
No dependency, public API, individual-entry, or performance-ceiling change.
This evidence does not certify physical-device IME or typeset-paper parity.

## Real renderer follow-through

The [public math renderer lab](https://eddolo.github.io/fountainjs/math-renderer.html)
uses a real, host-owned KaTeX 0.18.6 installation and local fonts. Its
[source](../examples/react-app/src/math-renderer-main.tsx) is a complete plain
Editor/EditorView integration with a React control shell, source editing,
undo/redo, JSON inspection, Markdown output, and visible render diagnostics.
The gallery and developer guide link to it. The added development dependency
does not enter Fountain's runtime dependency graph or bundles; the package
smoke check inspects every runtime source map to enforce that boundary.

The two equation fixtures were compared exactly with the pinned paper source.
Both retain `\label` and both currently fail this renderer. The lab deliberately
does not erase labels or substitute a simplified equation and call that a match.
Loading a published fixture now uses the explicit TeX-environment Markdown
import described below, **not** a full TeX-document compiler. The aligned example
is still directly authored as a math node; it and the recovery integral are separate
editor-authored examples, not representations of the paper.

Actual renderer testing found that KaTeX's error-colored output could bypass
Fountain's `onRenderError` fallback. The adapter now requests throwing syntax
errors by default and detects denied trust commands with an always-denying
callback. The host cannot enable trusted commands through options. Both paths
retain exact editable TeX and report the failure. A caller can still explicitly
select KaTeX's non-throwing syntax-error policy; that is the host's choice, not
the default. See [KaTeX options](https://katex.org/docs/options.html) and its
[supported functions](https://katex.org/docs/supported.html).

Verification on 2026-09-07: `pnpm check` passed 903 tests in 83 files and all
package, pure-runtime, API, CommonMark, interoperability, budget and performance
gates. Real-renderer browser checks passed in Chromium, Firefox and WebKit
(`artifacts/browser-real-katex-20260907b/results/`), including no external
network requests, exact source fallback and recovery. The recorded editing
journey passed (`artifacts/manual-real-katex-20260907b/results/`); aligned math,
published-source failure, recovered integral and the 390px-wide layout were
visually inspected. The production site build also passed. Runtime bundles
measure 1320.9 KiB ESM / 1102.4 KiB CJS, within unchanged ceilings. These checks
establish the renderer boundary, not full-paper or native Lean parity.

## Explicit TeX environment import

`MarkdownImporter.parseWithSource(source, schema, { texMathEnvironments: true })`
now recognizes complete equation/align/gather/multline/displaymath environments
when the schema provides math blocks. It does not strip labels, interpret macros,
or expand package definitions. The default dialect remains unchanged.

The full pinned JOSS source now produces **two editable math blocks**, each
exactly equal to its original equation environment including its label. This was
checked against the downloaded checksum-verified paper, not only the two isolated
fixtures. The source places equations immediately after prose without blank
lines, which is also covered. Original tabs/comments remain opaque to reference
and footnote discovery. Model line endings normalize to LF; the untouched source
snapshot still returns the exact complete input.

At this intermediate stage the audit still exited nonzero: the LaTeX table produced
**zero table nodes**. There are now 36 inline math nodes (not all visually audited).
KaTeX still rejects both equations' labels. Numbering, cross-references,
bibliography, figures and all-page PDF/DOCX reproduction remain open. The lab
now exercises import followed by rendering/fallback and editing; no simplified
substitute is counted as the published equation.

Verification: 24 new TeX import cases pass, including the published samples,
prose interruption, all supported environment names, nested matrix source,
comments/escaped delimiters, reference and footnote isolation, source snapshots,
containers and code/HTML exclusions. `pnpm check` passed 927 tests in 84 files
and all existing gates; default CommonMark classification remains 563/72/17.
The import-to-render browser journey passed in Chromium, Firefox and WebKit
(`artifacts/browser-tex-environments-20260907a/results/`). The recorded workflow
also passed (`artifacts/manual-tex-environments-20260907a/results/`); the published
source fallback and narrow-screen recovered formula were visually inspected.
The production site build passed. Runtime code measures 1323.3 KiB ESM /
1104.1 KiB CJS; aggregate ceilings increased to 1324 / 1105 KiB for this parser
capability, with no new dependency or individual-entry/performance cap increase.

## Table structure and visible loss follow-through

The later `texTables: true` opt-in now imports the paper's complete
`table`/`tabular` environment. The fixture is compared exactly against the pinned
source; the full-source preflight checks seven rows, three columns, all 21
original values (including the inline mathematical N), and all three reported
layout losses. It returns `structural-preflight-passed`, alongside an explicit
incomplete-reproduction status. No Julia or TeX command is executed.

The public lab's **Published performance table** sample exposes those differences:
float placement `[H]`, vertical rules and horizontal rules are not represented
in the model. Column alignment and editable values are preserved; all cells remain
ordinary cells, since `\hline` alone does not establish semantic header roles.
The implementation accepts a bounded l/c/r tabular grammar. Captions, labels,
width specifications, spans, row-spacing syntax and unknown commands retain the
complete literal source with an unsupported-syntax diagnostic. The original
source snapshot is exact before edits; canonical Markdown is not a TeX round trip.

Visual reference: page 3 of the original PDF places a compact table beneath the
performance paragraph, with two internal vertical dividers and one horizontal
rule beneath its first row. It has no surrounding grid or row-by-row rules.
The current editor uses the host's table layout and does **not** reproduce that
compact published geometry. Full PDF/DOCX page and rule fidelity remains open.

Verification on 2026-09-07: 16 new table tests and all 943 tests in 85 files
passed under `pnpm check`, including API/package/pure-runtime, CommonMark,
interoperability, build-budget and performance gates. The six real table/math
browser cases passed across Chromium, Firefox and WebKit
(`artifacts/browser-tex-table-20260907a/results/`). Both recorded workflows passed
(`artifacts/manual-tex-table-20260907a/results/`); the original table, edited mobile
table and published PDF page 3 were visually compared. Editing 8.6e-6 to 8.7e-6,
undo, redo and Markdown value export were exercised via native user controls.
The table workflow was recorded again with the initial whole-table selection
cleared for visual inspection (`artifacts/manual-tex-table-20260907b/results/`),
and its final original-value view was inspected. The production site build passed.
Runtime code measures 1326.8 KiB ESM / 1106.8 KiB CJS; aggregate caps increased
to 1327 / 1107 KiB for this bounded parser/diagnostic capability. No new dependency,
consumer-entry or performance cap increase.

## Equation-label reference semantics and integration boundary

`pnpm test:math-reference` runs the development-only MathJax 4.1.3 semantic
oracle in `scripts/audit-math-labels.mjs`. It pins the original equation strings
by SHA-256; the networked academic preflight also compares both fixtures against
the complete checksum-verified paper source. It does not change those equations,
their labels, Fountain's AST, or its renderer. MathJax is Apache-2.0 licensed
and remains a development dependency. Its own LiteDOM adapter is isolated in
this reference script; this is not a claim that MathJax is DOM-free or that
Fountain's pure-Node engine requires a DOM shim. Runtime package/map checks
exclude MathJax and KaTeX from Fountain dependencies and bundles.

Verified expected behavior:

- The first equation has tag `(1)` and target `eq:dNFE`.
- The second retains its label on the first, `\nonumber` row, but its tag `(2)`
  and target `eq:dSNFE` belong to the second row. A naive per-line label counter
  would implement the wrong semantics.
- Forward and backward references resolve; reordering the original equations
  changes the displayed numbers without changing the label identities.
- Repeated fresh document snapshots produce identical results. Deleted targets
  remain `(???)`; duplicate labels are errors, not “last one wins.”
- Starred environments do not advance numbering. An explicit `\tag{A}` can
  resolve through a label without consuming the next automatic number.
- Only explicitly loaded base/AMS syntax is used. External-file, dynamic-package
  and HTML-link commands are rejected, as are malformed formulas.

These expectations agree with the official
[MathJax numbering documentation](https://docs.mathjax.org/en/latest/input/tex/eqnumbers.html).
The batch compilation step, unlike separate `convert()` calls, includes the
forward-reference recompile pass. See the official
[direct-linking API](https://docs.mathjax.org/en/latest/server/direct.html).
This is a semantic oracle only: no pixel/layout comparison or Fountain-renderer
parity is certified by its passing assertions.

The initial investigation identified two integration boundaries (now addressed
by the document-context API described below):

1. `src/extensions/math.ts` previously called a renderer with one TeX string,
   display mode and browser document, without a complete Fountain document or
   stable per-node lookup. Keep this lightweight mode, but add an opt-in
   document-aware compilation path with labels/diagnostics and snapshot identity.
2. `src/view/dom-renderer.ts` reuses equal NodeViews without calling `update`.
   Changing another equation can therefore leave an unchanged reference view
   stale unless the integration explicitly invalidates its dependants. Do not
   solve this by replacing the editor or disrupting the source textarea's caret.

Use the same derived math snapshot for author, reader and export surfaces;
namespace rendered anchors per view so two editors cannot link into one another.
Deletion, undo/redo, reorder, forward references, duplicate/missing labels and
stale asynchronous results must be exercised in real user workflows. Numbering
must not be inferred by stripping `\label`, and this reference check must not
be counted as a delivered Fountain document-reference implementation.

Verification on 2026-09-07: the eleven named oracle contracts and all existing
`pnpm check` gates passed, including 943 tests in 85 files. The networked pinned
paper preflight also passed all eight structural/source checks. No runtime API,
browser behavior, bundle ceiling or performance threshold changed in this step.
The preceding table-import commit's GitHub CI and Playground deployment were
both confirmed successful before this reference-only increment.

### Document-context boundary implemented; visual label adapter still pending

`createMathExtension({ documentRenderer })` now exposes the immutable complete
model document, exact current node, frozen path, display mode, owner DOM document
and per-view scope. The existing lightweight renderer remains supported and no
MathJax code is added to the runtime. Custom NodeViews can opt into
`updateDocument`, called after DOM/path reconciliation even when their own node
is unchanged. Failed hooks report errors without disconnecting mutation
observation or preventing the remaining views from refreshing.

The actual MathJax compiler is exercised through this boundary in
`tests/math-document-context.test.ts`: original source, forward references,
move/undo/redo renumbering, deleted targets, independent editor scopes,
error/recovery, one compile per snapshot, no selection-only compile, and active
multiline textarea/caret preservation. Its DOM output is deliberately a semantic
test projection, **not a typesetting or visual-fidelity implementation**.

That regression exposed and fixed a broader reuse bug: DOM reconciliation follows
immutable block identity, while NodeView reuse could follow delete/insert position
mapping and associate a moved DOM block with another block's `getPath` closure.
`src/view/view.ts` now prioritizes the same immutable identity matching as the DOM
reconciler, including deletion and virtualization. Five generic NodeView tests
cover identity, source targeting, notification failures and observation recovery.

The public KaTeX lab now includes a two-equation reorder/edit sample and visible
block controls. The recorded user journey moves `y=2` before `x=1`, edits only the
moved equation to `y=3`, undoes/redoes both operations and checks Markdown source
order. Visual inspection caught mobile controls overlapping the source field;
the lab now reserves a gutter, with an explicit non-overlap assertion. Final
Chromium recording/screenshots/trace are under
`artifacts/manual-math-context-20260907c/results/`; screenshots of the desktop
move, export and corrected narrow editor were inspected.

`pnpm check` passed all 954 tests in 87 files and existing non-browser gates.
Measured runtime size is 1328.7 KiB ESM / 1108.2 KiB CJS, approximately +1.9 / +1.4
KiB for document-context refresh and identity-consistent reuse. Aggregate caps
are 1329 / 1109 KiB; individual entries, CSS and performance caps remain fixed.

The focused browser suite passed 12/12 serially across Chromium, Firefox and
WebKit: moved math source, nested block reordering, native math insertion and
published table editing. Evidence is in
`artifacts/browser-math-context-20260907c/results/`. An earlier run had a Chromium
navigation timeout before opening the lab; that case passed separately and the
complete 12-case run then passed without retries. Production site build and
TypeScript checking also passed.

**Pending at this increment (superseded by the next section):** a real document-aware visual renderer with namespaced anchors,
visible missing/duplicate-label diagnostics and recorded cross-reference edits;
shared reader/export rendering; asynchronous-resource policy and whole-paper
PDF/DOCX comparison. The public KaTeX lab still rejects the original equation
labels. Passing context/semantic tests must not be promoted to full reference or
paper parity.

### Document-aware SVG equation lab

The separate `math-references.html` lab now renders the two original labelled
equations using `examples/react-app/src/mathjax-document-renderer.ts`. Both
forward references resolve; the stochastic equation's number stays on its
numbered second row. Author and read-only reader share the host renderer with
independent anchor namespaces. Reordering renumbers both surfaces; deleting a
target exposes `(???)` and a diagnostic; duplicate labels replace all stale SVG
with exact source until corrected. This does not change the KaTeX lab's syntax.

The adapter has a private browser handler and local MathJax TeX SVG font data,
base/AMS packages only, source/macro/count bounds, no global loader or external
requests. A snapshot cache uses occurrence paths, not node object identity.
System-font fallback is reported instead of claiming self-contained glyph
fidelity. The optional website chunk is approximately 1.80 MB / 684 KB gzip;
the unused default NewCM font is excluded by the website build alias. Engine
dependencies, public exports and runtime size ceilings are unchanged. Code and
font licensing are distinguished in `public/mathjax-notices.txt` (Apache-2.0
code; SIL OFL-1.1 glyph data).

Twelve integration tests cover real SVG/anchors, source preservation, scope
isolation, reorder/delete/history, duplicate errors and recovery, prohibited
commands, local font families, resource bounds, repeated node occurrences and
glyph fallback. The full `pnpm check` passed 966 tests in 88 files and its other
package, API, headless, format, size and performance gates on 2026-09-07.

The final recorded Chromium workflow is under
`artifacts/manual-math-references-20260907e/results/`; it edits the moved original
equation using native keyboard selection, undoes, deletes/restores a referenced
equation, deliberately creates duplicate labels, recovers, adds/removes an
equation and checks Markdown source. Screenshots were compared with the pinned
paper's first page: formula structure and number placement are represented,
but font metrics and page layout are not a 1:1 reproduction. Reader-region
geometry and narrow-screen horizontal scrolling were checked; the final pan
shows the equation number remains reachable without document overflow. The
updated journey passed 3/3 serially across Chromium, Firefox and WebKit under
`artifacts/browser-math-references-20260907b/results/`, including actual reader
link navigation, attempted reader typing and the locally served license notice.
Chromium duplicate-source fallback, Firefox full reader and WebKit's narrow
horizontal-pan screenshots were visually inspected. The site production build
also passed, retaining the visible optional-chunk size warning.

**Still pending:** asynchronous-resource lifecycle, incremental performance,
accessible math/navigation audit, persistence/reopen and shared PDF/DOCX math
projection; complete paper citations, bibliography, figures, table layout and
all-page export comparison. The lab's 128-formula bound and fixed 960px measure
must not be advertised as large-document or professional publication parity.

The repeated-node test also exposed a transaction bug unrelated to MathJax:
removing all text leaves threw before a caller could set its final selection.
`mapping.ts` now recovers a structural gap, or an all-document selection for an
empty intermediate snapshot, without adding content. The MathJax test no longer
appends a synthetic empty-text paragraph to avoid this defect. Nine separate
selection regressions cover text, gap, node and cell selections, nested gaps,
history, and continued typing. A native browser journey passed 3/3 across
Chromium/Firefox/WebKit in `artifacts/browser-textless-replacement-20260907a/`;
the recorded Chromium repeat is in `artifacts/manual-textless-replacement-20260907a/`.
Both typed/separate-line and Backspace-joined screenshots were inspected.
Measured runtime growth is approximately 0.5 KiB ESM / 0.4 KiB CJS, bringing
totals to 1329.2 / 1108.6 KiB. Only the aggregate ESM ceiling rises to 1330 KiB;
individual entries, CJS, CSS and performance ceilings stay unchanged.
The final `pnpm check` passed 975 tests in 89 files plus its package, API,
headless/server, format, size and performance checks after this repair.
A combined final run passed both journeys in all three browser engines (6/6),
without retries, under `artifacts/browser-math-and-textless-20260907final/results/`.

### Portable equation file round trip

The lab now downloads `.fountain.json` and Markdown, and opens local JSON after
schema validation, byte/depth/object bounds and discarded-field checks. Empty
canonical fields/defaults are accepted; unknown data is rejected, not silently
dropped. Failed or superseded loads do not replace the live document. Imported
media URLs retain the ordinary host/network boundary; this is not an offline
asset package or a standalone `.fjs` reader.

The recorded Chromium journey saves a reordered three-equation document,
reloads the page, opens the downloaded file, verifies exact JSON and rebuilt
reader references, and tests undo/redo of opening. It then repeats with nested
root metadata, saves/reloads again, adds a collision-free fourth label, rejects
an invalid file without losing the document/history, and downloads Markdown
with the original TeX. Evidence:
`artifacts/manual-math-files-20260907b/results/`; the reopened reader screenshot
was visually inspected. The final combined file, reference-editing and textless
replacement journeys passed 9/9 in Chromium, Firefox and WebKit without retries:
`artifacts/browser-math-files-20260907final/results/`.

This exposed a core retention defect: content-only document replacement kept
the old root metadata, including on undo and remote/version restoration.
`ReplaceDocumentStep` / `transaction.replaceDocument` now validate and replace
the complete same-schema root. Root-only metadata edits keep an empty position
map. History, version restoration and remote document snapshots use that
boundary; tests cover exact metadata removal/restoration, local undo/redo,
cross-peer version restore, rejected foreign/invalid roots and unchanged caret
positions. Runtime totals are 1329.8 KiB ESM / 1109.2 KiB CJS, approximately
+0.6 KiB each. The aggregate CJS cap is 1110 KiB; ESM, individual-entry, CSS and
performance caps are unchanged. This API addition has an updated declaration
snapshot, not a new runtime dependency.
The final `pnpm check` passed all 987 tests in 91 files and the existing package,
API, headless/server, format, runtime-size and performance checks.

### Paged SVG reference boundary (2026-09-07)

The dedicated regression reproduced cross-block links pointing to live-source
IDs rather than the cloned equation. The preview now resolves references after
all visual placements exist, independently of its accessible copy. It isolates
IDs per render, preserves clone-local SVG resources and ID references, supports
percent-encoded HTML/SVG links and `xlink:href`, and disables missing fragment
links rather than silently navigating outside the preview. Four new regression
cases cover cross-page links with/without the accessible copy, repeated SVG
resources and label/ARIA targets, and a target omitted by host print projection.

The public equation lab's **Build page preview** measures a separate reader
copy, shows landscape Letter sheets at the renderer's 960px body width, and
marks the snapshot stale after an author edit. This is deliberately not the
original paper's geometry. The recorded journey opens a document containing
the two original equations and twenty added research-note paragraphs, follows
native SVG links to later pages, edits, rebuilds and checks narrow-screen
containment. All three pages of the final recorded snapshot were visually
inspected; both formulas and their numbers are visible. Inspection caught and
removed editor-style borders leaking into the projection.

Evidence: `artifacts/manual-math-pages-20260907final/results/` (video, trace,
three page screenshots); final Chromium/Firefox/WebKit journey 3/3 without
retries at `artifacts/browser-math-pages-20260907final/results/`. The earlier
combined equation-file/reference and footnote/layout regression selection
passed 21/21 across those engines at
`artifacts/browser-math-pages-20260907c/results/`. Full `pnpm check`: 991 tests
in 91 files, plus package/API/headless/server/format/size/performance checks.
The optional preview entry measures 13.2 KiB ESM / 11.2 KiB CJS; total runtime
1331.5 / 1110.4 KiB (approximately +1.7 / +1.2 KiB). Only this optional entry
and aggregate runtime limits changed; no dependency, CSS or performance-cap
increase.

**Still pending at this boundary:** independently rendered academic PDF/DOCX
output and original paper layout comparison. The PDF increment below separately
tests the exported destinations; DOM references alone do not prove them.
Targets inside arbitrary clipped custom fragments need visible-fragment host
projections; stylesheet ID selectors/URL text are not rewritten. This is not
a universal SVG export sanitizer or complete paper reproduction.

### Actual browser PDF output (2026-09-07)

The lab's **Print / Save PDF** invokes the native browser print workflow. Host
print CSS exposes only the paged snapshot; a missing or stale snapshot displays
a notice instead. The recorded Chromium journey clicks that real button and
observes `beforeprint`, then captures the same print projection through the
browser PDF API. It does not automate operating-system print-dialog settings.
PDF.js independently checks three 792 × 612 pt pages, twenty unique research
notes without repeated author/reader content, two internal link annotations,
their named destinations and the expected destination page indices. No remote
URL substitutes for either equation destination.

Recorded evidence: `artifacts/manual-math-pdf-20260907a/results/` (video, trace,
screen-page PNGs and actual PDF); final sample:
`output/pdf/fountain-equation-reference-audit-20260907.pdf`. All three pages were
rendered through Poppler at 96 dpi and visually inspected against the screen
captures. Formulas, suppressed first-row numbering, equation numbers and page
breaks are intact. PDF renders are 1056 × 816 pixels; screen element captures
are 1056 × 817 due to fractional screenshot boundaries. Dark-content bounding
boxes differ by at most two pixels in this comparison; glyph antialiasing is
visibly different. This is supporting geometry evidence, not pixel identity or
a semantic proof for arbitrary equations.

The final targeted browser selection passed 10 tests, with 2 explicit non-Chromium
PDF skips, at `artifacts/browser-math-pdf-20260907final/results/`. Firefox/WebKit
verify screen/print layout and stale-state behaviour, not native PDF output.
An older host-projection test's obsolete generated-ID suffix expectation was
updated to the isolated-ID contract and rerun on all three engines.
Full `pnpm check` passed 992 tests in 91 files and the existing package, API,
headless/server, format, runtime-size and performance gates.

**Remaining:** the original paper's full layout, independent native Firefox/
Safari PDF evidence, tagged/accessible PDF math and DOCX fidelity. This PDF has
vector equation artwork, not editable Word equations. The DOCX probe and
`tests/docx.test.ts` explicitly show TeX retained as lossy text fallback; reimport
produces paragraphs, not math nodes. No OMML, automatic Word equation numbering
or live Word equation references are claimed. No new runtime dependency or
runtime budget change was needed for this host printing increment.

## Experimental native Word math projection

The optional DOCX exporter now accepts host-supplied `DOCXMathExpression`
values through `resolveMath(node, path)`. It emits OMML for explicit semantic
fractions, radicals, scripts, delimiters, matrices, combining accents and large
operators. This is not a general TeX converter. No raw host XML, parser
dependency, network request or image substitution is involved.

Tests reproduced and fixed a traversal defect: math blocks inside quotes and
list items never reached the projection callback, and list-contained tables
were flattened. An aligned quote also produced two `w:pPr` elements and lost
nested heading semantics. Traversal now keeps blocks and original callback
paths, emits one paragraph-properties element, and does not create another list
marker for every continuation paragraph.

`scripts/audit-docx-math.mjs` generates a structural fixture through the actual
public package, with explicitly authored source/expression pairs. The current
ten-equation sample includes inline/display math, quote/list nesting and a
table-cell equation. Python's independent ElementTree/ZIP reader verified ten
OMML equations, their exact source/path records, one list marker, a preserved
table and at most one paragraph-properties element per paragraph. These checks
establish package structure only, not visual or mathematical equivalence to TeX.

The required `render_docx.py` attempt failed because this host's bundled runtime
does not provide `soffice.exe`. There are no rendered pages to inspect, so this
sample is **not a visually verified Word deliverable**. The existing browser
DOCX comparison covers ordinary prose/media/tables, not this native math path.

Every successful math projection still reports `native-math-experimental` and
`lossy`. Invalid trees, resource-limit failures and declined conversions retain
the source fallback. Original TeX and exact emitted OMML are saved together in
`customXml/fountainMath.xml`; source restoration is not implemented, and stale
metadata must not overwrite a user's later Word edits. Imports now use an
explicit unsupported-equation placeholder/warning instead of concatenating
fraction/script text into a misleading string.

**Still required:** independent Word and LibreOffice visual/editing checks;
a tested source-to-semantic converter; accepted subset and unsupported-syntax
diagnostics; unchanged versus externally edited equation restoration; live
numbering/references; and whole-paper export comparison. FORMAT-05 remains
partial. This does not close native academic DOCX parity.

Validation for this increment: full `pnpm check` passed 1,012 tests in 92 files,
including 31 focused DOCX/math tests plus packed-package, headless/server,
interoperability, API, size and performance checks. Five browser regressions
passed: the existing independent prose/media/table DOCX comparison on Chromium,
Firefox and WebKit, and phone export/re-import on mobile Chrome/Safari emulation.
These are regression checks, not native-math visual approval. The optional DOCX
entry measures 62.6 KiB ESM / 49.9 KiB CJS; only its and the aggregate size caps
were adjusted for the measured semantic serializer/validation cost. Main/core,
other optional-entry, CSS and performance limits are unchanged.

## Independent browser math viewer findings

The recorded `tests/manual/docx-math-audit.spec.ts` workflow compares an editable
Fountain/MathJax document with the actual downloaded DOCX rendered by
`docx-preview` 0.4.0. The same journey runs on Chromium, Firefox and WebKit in
`tests/browser/docx-math-journey.ts`. Eight exact source/expression pairs exercise
fractions, roots, combined scripts, a matrix, accents and two operator-limit
placements. This test-only fixture is not a general TeX adapter or a Word reader.

Visual inspection found that counting eight `math` elements falsely suggests
success: two of them are empty. The viewer drops combined sub/superscripts and
accents, renders the barless fraction with a bar, ignores side-limit placement,
and fails to mark display equations as block MathML. Its font metrics and
paragraph layout also differ from Fountain. The fixture now visibly reports
these disagreements rather than describing the preview as passing fidelity.

The downloaded XML contains `sSubSup`, `acc`, `noBar` and `limLoc="subSup"`.
Inspection of the installed viewer's `mmlTagMap` and rendering functions confirms
that the first two tags are unsupported, fraction properties are discarded,
and the n-ary renderer always chooses under/over when limits are present.
Microsoft documents the combined-script structure and the corresponding MathML
mapping in [SubSuperscript](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.math.subsuperscript?view=openxml-3.0.1)
and [OfficeMath](https://devblogs.microsoft.com/math-in-office/officemath/).
Do not change valid exporter structures to mimic this viewer's omissions, or
treat this diagnosis as proof that Word will render every structure correctly.

All three browser journeys reproduced the viewer limitations. The recorded
Chromium run is under `artifacts/manual-docx-math-20260907b/` with video, trace,
the actual DOCX, screenshots before/after undo, and `viewer-observations.json`.
The screenshots were opened and compared: this is observed visual disagreement,
not an XML-only conclusion. Editing through the native math textarea clears
stale output; an unrecognized source exports as visible TeX fallback; undo
restores the original source and native projection. The comparison disables
physical page sizing so it cannot certify Word pagination.

The automated result means **the diagnostic workflow behaves as expected**, not
that the eight equations passed visual parity. Word/LibreOffice verification
remains required and no Word document from this audit is a finished deliverable.
The full check remained green at 1,012 tests in 92 files, and the final three
browser journeys passed with an explicit original-source assertion after undo.
CI retains the generated diagnostic screenshots, XML-viewer observations and
test DOCX even when the journey passes. No library-runtime code, dependency,
API or size ceiling changed in this diagnostic increment. A read-only registry
check also found no registered Microsoft Word COM automation on this host;
the missing bundled LibreOffice remains a separate native-rendering blocker.

## Lean reference track

Use a complete, nontrivial proof sequence from the official
[Theorem Proving in Lean 4](https://github.com/leanprover/theorem_proving_in_lean4/tree/4e28129fdd58037f8f5857548d5e99fe4fb0cc57),
initially its `book/TPiL/InductionAndRecursion.lean` chapter. The repository
[license is Apache-2.0](https://github.com/leanprover/theorem_proving_in_lean4/blob/4e28129fdd58037f8f5857548d5e99fe4fb0cc57/LICENSE).
Selection of the exact complete proof sequence, dependency/toolchain pinning,
and the recorded comparison are **pending**. The chapter is a Verso document
with imports; it must not be submitted as an isolated theorem without its context.

Compare the same source, imports, toolchain and project in native Lean and
Fountain's real provider. Record intermediate goals/diagnostic positions,
Unicode editing, deliberate invalidation, correction, undo/redo, and exported
source rechecking. Include warning/axiom inspection: `sorry`, admitted results,
or a source-only/disconnected provider must never count as completed proof.
One-shot compilation does not certify interactive LSP/InfoView parity.

## Acceptance for each reference

1. Pin provenance, permission, source/assets, fonts, toolchain and reference output.
2. Rebuild the document as editable Fountain content through documented public
   controls/APIs. Record authoring/import separately from reading and export.
3. Check all content: formulas, labels/references, citations, figures/captions,
   table values, code/proofs, footnotes, and exact technical source where promised.
4. Edit representative elements as a user, including insertion, replacement,
   backward selection, deletion, copy/paste, undo/redo, save/reopen, and re-export.
5. Inspect **every page** of original, editor/print view, and independently rendered
   PDF/DOCX exports side by side. Record page breaks, alignment, font metrics,
   equation spacing/numbering, and measured differences. Pixel differences may
   identify mismatches; antialiasing alone must not conceal content/layout loss.
6. Keep unsupported features and dependencies visible in an issue ledger. No
   full-paper “1:1” badge until the agreed content, behavior and layout checks pass.
7. Pair the public comparison demo with the developer recipe and reproducible
   evidence. Extend the corpus to a two-column paper, a thesis/report, and other
   document workflows; this first short paper cannot certify those layouts.

Browser math rendering is not a full TeX document compiler. Native Lean remains
the proof checker, not Fountain. These boundaries must stay clear while the
reproduction work identifies and closes genuine editor capabilities gaps.

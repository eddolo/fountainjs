# FountainJS opportunity roadmap

This roadmap preserves product opportunities that arise from user feedback,
upstream issue boards, editor-community discussions, and FountainJS's own parity
audit. It is not a shipped-feature list and it is not permission to replace
current release gates with a larger pile of unfinished modules.

Literal text line-ending repair (2026-09-07, Unreleased): LF/CR in text no longer
become spaces or Markdown block syntax through canonical save/reopen. Nineteen
unit cases cover text/marks, code, headings, quotes, lists, tables, ruby and
source-mapped edits; twelve independent reference-parser checks compare exact
characters. Full `pnpm check` passes 1,303 tests / 109 files and 385 declarations,
including package/runtime/headless/type/performance gates. The issue workflow
passes Chromium/Firefox/WebKit, with visual editor/reader/mobile screenshots and
recording inspected under `artifacts/newline-export-20260907-recorded-v2/`;
cross-browser results are under `artifacts/newline-export-20260907-browser-v2/`.
Only the aggregate ESM ceiling increases by 1 KiB (1369.1 KiB measured, 1370 cap);
CJS measures 1138.2 KiB within 1139. Public APIs and other gates are unchanged.
CommonMark remains 563 default / 578 opt-in HTML matches out of 652. This is not
full conformance and is not included in the published 0.4.0-beta.1 snapshot.

Literal Markdown export repair (2026-09-07, Unreleased): canonical output no
longer turns plain delimiter/address text into strike/highlight marks, math atoms,
or links when reopened. Thirteen of fifteen new unit cases reproduced the old
corruption. The repair also covers regenerated source-mapped blocks while keeping
actual links/code/math structured. Full `pnpm check`: 1,284 tests / 108 files,
385 declarations and runtime/headless/interop/type/performance checks pass.
Three-engine visual edit/history/save/reopen/reader checks pass; recorded source,
reader and video evidence was inspected under
`artifacts/literal-export-20260907-recorded/` (cross-browser output:
`artifacts/literal-export-20260907-browser/`). ESM measures 1369.0 KiB within its
existing cap; CJS measures 1138.1 KiB, with only its aggregate cap increased from
1138 to 1139 KiB for the correction. No semantic or performance gates were
relaxed. Full CommonMark and arbitrary extension fidelity remain open, and the
published 0.4.0-beta.1 package does not include this repair.

Literal-address import policy (2026-09-07, Unreleased): hosts can set
`autolinkLiterals: false` to leave bare web/email addresses as text. Explicit
Markdown/reference links, safe angle autolinks, and the default GFM-style dialect
remain unchanged. Fifteen new unit cases cover nested content, canonical/source
round trips, definition-prefix provenance and HTML adapter fallback. The reference
gate checks this option against the existing 563 matching examples plus 608,
611 and 612 (566 separate policy contracts, not a new default score). Three-engine
contact-directory journeys verify keyboard toggling, unchanged source, DOCX
download/reopen and explicit-link retention. Recorded desktop/mobile developer
inspection: `artifacts/autolink-policy-20260907-recorded/`; cross-browser evidence:
`artifacts/autolink-policy-20260907-browser-v2/`. The first run's link assertion
omitted existing safe-link attributes and was corrected without changing runtime
behavior. This does not certify native Word appearance or alter typing/paste
rules; hosts must retain the import policy when reopening Markdown. See
[the contract](MARKDOWN_SOURCE.md). This is not in published 0.4.0-beta.1.
Full `pnpm check` passes 1,269 tests / 107 files, 385 reviewed declarations and
the package/headless/runtime/interop/type gates. Runtime size remains inside the
unchanged limits (1368.8 KiB ESM / 1137.9 KiB CJS). Performance and memory gates
also pass; no ceilings or semantic baseline classifications were relaxed.

Reference-source retention increment (2026-09-07, Unreleased): root Markdown
reference definitions, standalone or directly before a paragraph/heading, now
survive unrelated visual edits and block moves/deletions. Eighteen focused tests
cover compact definition prefixes, line endings, duplicate precedence,
Unicode/escaped labels, multiline/image references, literal-bracket safety,
frontmatter, rejected URLs, ambiguous fallback and 200 blocks sharing 1,000
definitions. Full `pnpm check`: 1,253 tests / 106 files, 385 declarations and
unchanged runtime/headless/conformance/performance gates pass. Runtime size is
1368.7 KiB ESM / 1137.8 KiB CJS, within the existing 1369 / 1138 ceilings.
Nine issue-workflow checks pass across Chromium, Firefox and WebKit, including
rendered link destinations/titles before editing, in the reader, and after reopen.
The recorded real-keyboard edit/undo/redo/source/reader/download/reopen/task
workflow and its desktop/mobile screenshots were visually inspected:
`artifacts/reference-prefix-20260907-recorded-v2/`; cross-browser evidence:
`artifacts/reference-prefix-20260907-browser-v3/`. Screenshot capture waits for
fonts/layout and retries instant scroll-to-top: reader mounting could apply
scroll anchoring after the initial scroll, so polling alone could leave a
displaced fixed header. The first failed capture is retained separately.
This is not physical-mobile
certification or full CommonMark conformance (still 563/652 default, 578/652
opt-in HTML). Container definition provenance remains open. The published
0.4.0-beta.1 tarball does not include this increment; see Unreleased.

Selection/alignment human-use audit (2026-09-07): formatting previously affected
only the first text block and rejected all-document/cell selections. Alignment
now visits the selected paragraphs/headings (including nested/empty blocks),
preserves unrelated content, and applies one validated, undoable transaction.
Selection-end boundary, read-only, no-op, custom-schema rejection and Yjs tests
cover the model. The first recorded real-keyboard run exposed a second bug:
Chrome placed its anchor on a paragraph element, which the DOM bridge ignored,
so the toolbar used a stale caret and centered the wrong paragraph. The bridge
now resolves inline-content block boundaries while leaving structural cell,
node, gap and all-document selections under their own handling. The recording
and cross-browser workflow include backwards selection, formatting, replacing
the selected text, undo/redo, whole-document formatting and HTML reader output.
Explicit RTL direction/locales are still open; alignment is not that feature.

Verification: `pnpm check` passes 1,218 tests in 105 files, the 385-declaration
compatibility snapshot, package/Node/workerd/headless/type/conformance checks,
and unchanged performance limits. Runtime totals are 1366.5 KiB ESM / 1136.0
KiB CJS; the aggregate ceilings increase to 1367 / 1137, with all individual
entry ceilings unchanged. Thirty-nine focused desktop browser checks pass
across Chromium, Firefox and WebKit, including semantic selections, page-gap
composition and 100k-block virtualization. The website production build passes.
Final recording and screenshots were inspected in
`artifacts/text-alignment-20260907-recorded-v3/`; the browser evidence is in
`artifacts/text-alignment-20260907-regression-v2/`. HTML fragment typography
remains consumer-owned; this proves alignment, not pixel-identical styling.
The initial browser-selection failure and the interrupted stale-Vite-import
run remain retained rather than counted as passes. No npm release is claimed.

Full-page HTML follow-through (2026-09-07): document import now uses document
parsing and body projection; head titles/styles no longer become paragraphs.
Ignored page metadata/styles/attributes receive `document-shell-omitted` loss
reports. Separate fragment APIs retain their Markdown behavior. Node and
browser tests cover implied boundaries, recovery and noscript. The recorded
report retains headings/alignment, ordered starts, tables and editable content;
consumer-owned CSS remains visibly different, not pixel-identical retention.

Release-readiness follow-through also repairs the inline-image selection
regression exposed by full CI: an exact native range around an inline atom
must stay a node selection, not collapse into a paragraph text caret. New
tests cover asynchronous selectionchange, deletion and returning to text.

The separate unofficial issue-editor lab now demonstrates visual/Markdown
switching, safely mapped untouched source, table editing, task toggle/undo,
reader preview and local Markdown draft download/reopen. Its diagnostics label
collaboration, pagination, virtualization and server runtimes as inactive or
unmeasured. Cross-block reference-source fidelity remains an explicit gap.
See [the workflow/API guide](ISSUE_EDITOR_DEMO.md). Automated text checks alone
missed excessive task/code heights; visual inspection caught and corrected the
host CSS selector. Recorded evidence is in `artifacts/issue-html-20260907-recorded-v3/`.

The user's incremental publication request is being prepared as
`0.4.0-beta.1` under npm `next`, with full verification and maintainer staged
approval still required. This does not mark the parity programme complete or
claim that the preview is already published.

Verification for this increment: `pnpm check` passes 1,235 tests in 105 files,
385 public declarations, Node/workerd/headless/conformance and unchanged
performance limits. Aggregate code measures 1367.6 KiB ESM / 1137.0 KiB CJS;
ceilings increase by 1 KiB each to 1368 / 1138, with individual entry limits
unchanged. Seventeen final browser checks pass across three desktop engines
and the two touch-emulation reorder checks under
`artifacts/issue-html-selection-20260907-browser-v3/`. The recorded HTML and
issue journeys pass and their images/video frames were inspected. Package lint,
packed type-resolution checks (Angular remains ESM-only), release metadata and
the website production build pass. The previous full CI failure is retained
as evidence; a fresh full CI run is still required before npm staging.

DOCX list-numbering follow-through (2026-09-07): export no longer resets ordinary
custom starts to 1 or shares one counter between separate lists. Each list has
an independent instance and explicit base definition/restart, with indentation
for its nested level. Import reads instance identity and level overrides,
including `startOverride` precedence. Tests cover adjacent lists, nested
restarts, separate table cells and independently authored OOXML.

The initial recorded comparison passed text checks but visibly displayed wrong
numbers: the independent browser viewer ignores instance overrides. Explicit
base definitions now display the intended 0, 7, 1 and nested 4 starts as well as
retaining them in Fountain's model. Counter-style and physical indentation
assertions guard that exact visual failure. The second revised render and its
recording were inspected against the editor; typography is not pixel-identical.
`pnpm check` passes 1,208 tests in 104 files, with API/package/runtime/type and
unchanged size/performance limits; nine focused Chromium/Firefox/WebKit checks
pass. Runtime totals remain within 1365 / 1135 KiB (1364.8 / 1134.8 measured).
Evidence: `artifacts/docx-numbering-20260907-recorded-v3/` and
`artifacts/docx-numbering-20260907-browser/`. Earlier failed/mismatched evidence
is retained. The packaged native renderer was attempted but no bundled Windows
LibreOffice executable is available; native Word/LibreOffice validation remains
unverified. Arbitrary Word restart rules, counters resumed across prose and
custom/negative formats remain outside this verified increment. No programme
completion or npm publication is claimed.

List-numbering fidelity audit (2026-09-07): a real zero-based procedure exposed
incorrect `0 → 1` renumbering when lifting/converting selected list items. Shared
slice construction now preserves zero for prefixes and correct offsets for
remainders, including nested lifting. HTML import in browser and pure Node now
uses signed integer-prefix parsing within the native reflected range, rather
than JavaScript number syntax. Huge numeric input no longer reaches schema
validation as Infinity. Independent native `ol.start` comparisons run in all
three desktop engines. The supplied schema still lacks negative starts,
reversed lists, marker styles and per-item values; server conversion reports
these losses explicitly. End-to-end support for those forms (editing, history,
HTML/Markdown/DOCX export, pagination and reader output) remains required work.

Before the repair, 12 focused regressions failed. Afterward `pnpm check` passes
1,205 tests in 104 files, all API/package/server/type checks and unchanged
performance thresholds. Measured runtime is 1364.1 KiB ESM / 1134.3 KiB CJS;
aggregate ceilings rise 1 KiB each to 1365 / 1135, individual caps unchanged.
Twelve focused Chromium/Firefox/WebKit checks pass. A recorded Chrome journey
uses the real clipboard, Shift+Tab, undo/redo and Markdown export/reopen. Reviewed
screenshots and recording frames show the zero-based list and correct remaining
numbers after lifting. Evidence: `artifacts/list-numbering-20260907-recorded/`
and `artifacts/list-numbering-20260907-browser/`. No CommonMark score is promoted
and the overall publication gate remains open.

HTML table section-order audit (2026-09-07): both importers now follow native
header/body/footer row ordering, stable within each section. All six source
arrangements are compared with the browser's independent `table.rows` result;
nested tables and row-group spans retain their separate boundaries. The server
reports source-order projection. If reordering would move protected Markdown
blocks, the flow adapter still falls back with source retained rather than
weakening its preservation invariant. This does not preserve section identity,
repeat-on-print semantics, or arbitrary CSS layout.

Validation: `pnpm check` passes 1,184 tests in 104 files, including pure-Node
coverage; API/package/runtime and existing performance gates pass. Runtime
measures 1363.5 KiB ESM / 1133.7 KiB CJS; only the aggregate ESM ceiling rises
1 KiB to 1364, with CJS and individual entry ceilings unchanged. All 21 focused
Chromium/Firefox/WebKit checks and the website build pass. A recorded Chrome
journey uses the real HTML clipboard, edits a cell, undoes/redoes, exports and
reopens through the server importer. Reviewed source/editor/export screenshots
and recording frames confirm header-first and totals-last ordering. Evidence:
`artifacts/html-table-order-20260907-recorded/` and
`artifacts/html-table-order-20260907-browser/`. CommonMark scores remain unchanged.

HTML table geometry audit (2026-09-07): browser and server import now resolve
zero row spans within each source row group, with nested-table isolation and
HTML integer-prefix parsing shared through a DOM-free helper. A pure-Node grid
check covers spans starting partway through separate groups. Zero-span expansion
is explicitly reported as a snapshot, not a retained live row-group rule;
clamping above the existing 100-row/column limit now reports possible geometry
loss. The table schema and public API remain unchanged.

Projection version 8 compares rows/groups/cells structurally and equates only
unit spans and ordinary cell paragraph wrappers. Fourteen deliberately corrupted
tables must remain distinguishable. Already-working examples 149, 160 and 190
now match, bringing the opt-in baseline to 578 matches / 74 unresolved; default
CommonMark remains 563/72/17. General row-group identity, header/footer layout,
unsupported HTML attributes and specialized raw-text conversion remain open.

Validation: `pnpm check` passes 1,176 tests in 104 files, API/package/server/runtime
checks and unchanged performance limits. Added runtime is ~1.1 KiB ESM / 0.9 KiB
CJS; aggregate ceilings rise by 1 KiB each (1363 / 1134 KiB), individual entry
ceilings stay unchanged. Eighteen Chromium/Firefox/WebKit checks pass, including
physical cell-bottom alignment. A recorded Chrome ownership-table journey
passes real clipboard paste, cell editing, undo/redo, HTML export and server
reopen; reviewed screenshot/video frames show both correctly merged cells.
Evidence: `artifacts/html-rowspan-20260907-recorded/` and
`artifacts/html-rowspan-20260907-browser/`. This is not full table/HTML parity.

CommonMark code-origin audit (2026-09-07): projection version 7 now distinguishes
reference Markdown-generated `<pre>` tags from authored raw HTML by exact
renderer output offsets and parsed source locations. Only the former have their
canonical terminator removed for comparison. The observer leaves all 652
official HTML outputs byte-identical. Twenty LF/CRLF import/source contracts,
including identical HTML from different source kinds and nested/repeated blocks,
pass; six deliberate missing/added newlines are rejected. This corrects example
169, raising the opt-in projection baseline to 575 matches / 77 unresolved
comparisons without any parser/runtime change. The default 563/72/17 baseline
does not change. Table/formatting projection differences, unsupported HTML and
the full release programme remain open.
Validation: the complete conformance command and 1,158 unit tests in 104 files
pass. Runtime/API/bundle files are unchanged; this increment strengthens the
test oracle rather than claiming a new editor capability.

Markdown combined-adapter audit (2026-09-07): the corpus gate now exercises both
server HTML adapters together and locks 574/652 exact neutral-projection matches,
separate from the unchanged default 563/72/17 classification and 1,304 LF/CRLF
source-retention checks. The 78 unresolved comparisons include policy/schema
differences and comparator limitations as well as unsupported conversion; they
are not all parser bugs and do not certify full CommonMark fidelity.

This audit exposed and fixed actual fallback data loss: inline conversion could
remove `</pre>` before a surrounding table flow failed. Failed containers now
recover their inert HTML interpretation, including nested projections, while
successful sibling containers stay converted. No new public API or dependency.
The complete `pnpm check` passes 1,158 tests in 104 files and unchanged runtime,
type, package, size and performance gates. Fifteen focused Chromium/Firefox/WebKit
checks pass. A recorded Chrome journey additionally verifies conversion fallback,
rich clipboard paste, editing, undo/redo, canonical Markdown export and reopen;
reviewed full-size screenshots show the retained tag in editor and export.
Evidence: `artifacts/html-flow-rollback-20260907-recorded/` and
`artifacts/html-flow-rollback-20260907-browser/`. Remaining work includes
source-aware comparator handling for raw `<pre>` newlines, explicit rich-HTML
loss accounting, specialized raw-text scopes, and the broader release gates.

Markdown HTML-flow formatting increment (2026-09-07): surrounding semantic,
style and extension-defined marks now reach existing Markdown blocks through
the same rule/URL validation used for inline HTML. Immutable mark-path copies
retain source, attributes and node IDs; unchanged subtrees remain shared.
Original inline marks take precedence over inherited HTML, and inner HTML
scopes override outer scopes of the same type. Provenance verification follows
those copies, including repeated original blocks under different scopes.
Raw-text/specialized scopes still require a source-aware projection and fall
back explicitly. Block atoms and empty blocks are not arbitrary CSS surfaces.

Validation passes 1,153 tests in 104 files, 1,304 LF/CRLF exact-source
contracts, package/runtime/headless checks, declarations, type checks and
unchanged performance limits. Public signatures are unchanged; the server
declaration comment now describes mark-path copying accurately. Added runtime
code is about 0.7 KiB ESM / 0.6 KiB CJS; only the aggregate CommonJS ceiling
increases by 1 KiB. A recorded Chrome journey and reviewed screenshot/video
frames show italic strikethrough surviving conversion, rich paste, typing,
undo/redo and Markdown export. This is not full CommonMark conformance; the
default semantic score remains 563/72/17, and npm publication stays deferred.
The 27-case browser regression set passes Chromium, Firefox and WebKit. Its
initial raw-text fallback assertion used a valid standalone `<pre>` block, which
correctly converted without fallback; the test now distinguishes that from the
mixed table/pre CommonMark reference case. A matching core regression preserves
both behaviors. No runtime behavior was changed to satisfy the mistaken fixture.
Final type/unit checks and the production website build pass; the existing
large MathJax reference-lab chunk warning remains. The full gate passed before
the additional fixture, and final type/unit checks cover that fixture too.

Markdown cross-block HTML scope increment (2026-09-07): optional `parseHTMLFlow`
and server `parseFlow` / `parseFlowWithReport` retain already-parsed Fountain
blocks as protected objects while resolving raw HTML across blank-line boundaries.
The demo now reconstructs split HTML tables and wrappers without serializing
Fountain content, extension attributes or source as HTML. Duplicate references
to an original block, nested Markdown containers, invalid/foreign results,
consuming custom rules, URL policy and input limits have focused regressions.
Whole-flow fallback is explicit when raw-text/formatting/styled scopes would
require changing protected blocks; implementing those scopes remains next work.

Verification: the full local `pnpm check` passes 1,149 tests in 104 files plus
package/headless/runtime, declarations, type checks and unchanged performance
limits. The conformance gate additionally passes 1,304 exact-source checks over
all 652 reference examples with LF/CRLF endings; this is retention evidence,
not semantic parity. The CommonMark 563/72/17 baseline remains unchanged.
Twelve focused browser checks and fifteen adjacent caption/figure/conversion/
paste regressions pass across Chromium, Firefox and WebKit (one test per engine
is shared between those sets). Two recorded real editing journeys pass; the
split-table screenshot and video frames were visually reviewed through paste,
cell editing, undo/redo and Markdown export. Added flow collection/protection
costs about 4.4 KiB ESM / 3.6 KiB CJS; only aggregate runtime budgets rise,
not individual entries or performance limits. This does not authorize npm
publication or complete the remaining HTML/Markdown or overall parity work.

Markdown HTML-fragment follow-through (2026-09-07): the optional server importer
now distinguishes block fragments from complete documents. Comment-only fragments
produce no visible blocks instead of inserting a standalone document's caret
paragraph between Markdown paragraphs/lists/code. Explicit empty blocks remain;
whole-document imports still provide their required caret host. Markdown adapters
accept readonly block arrays, validate their nodes and nonempty document-content
expression, and retain literal source on invalid/foreign/orphan results. Existing
document-returning adapters and the default inert-HTML policy are unchanged.

The full local `pnpm check` passes 1,129 tests in 103 files, declarations,
package/headless/runtime checks, type checks and unchanged performance limits.
The additive APIs and validation add about 0.9 KiB ESM / 0.8 KiB CJS; only the
aggregate ESM ceiling increases by 1 KiB, not individual entry/performance limits.
A recorded public-demo conversion → rich paste → Enter/type → undo journey and
its screenshots/video frames were visually reviewed. A browser-test read of the
lazy import's temporary empty output was corrected to wait for valid JSON.
A later rebuild left a reused Vite server with a stale import-resolution error;
the affected run was stopped and the local server restarted, not counted green.
The clean-server rerun passes all nine focused checks across Chromium, Firefox
and WebKit. The production website build passes with the existing large MathJax
reference-lab chunk warning.

The CommonMark score remains 563 matching / 72 pending / 17 intentional.
Next unresolved conversion boundary: HTML scopes spanning separately parsed
Markdown blocks (especially table/container fragments), plus complete loss
accounting. Do not treat fragment cleanup as full raw-HTML/CommonMark parity or
permission to publish npm. See `docs/MARKDOWN_SOURCE.md` and `docs/SERVER_HTML.md`.

SURFACE-04 Angular increment (2026-09-07): the optional
`fountainjs-editor/angular` entry provides injection-scoped editor ownership,
signal state and a standalone DOM-view directive. The campaign now runs actual
Angular 22 components and controls, not an Angular-labelled Custom Element.
The library is partial-Ivy ESM with an external optional Angular peer; the
private compiler workspace keeps Angular's TypeScript 6 requirement separate
from the engine's TypeScript 7 build. Core and other surfaces do not import it.

Local verification: `pnpm check` passed 1,118 tests in 103 files, package/runtime
checks, the headless import boundary, public declarations, type checks and
unchanged performance limits. One performance run under concurrent browser
load failed; the isolated rerun passed without changing thresholds. Only the
Angular declaration was added; existing API hashes remain unchanged. The
optional entry measures 4,150 bytes, with no bundled Angular runtime. Packed
ESM/bundler type resolution and package lint pass; Angular's documented ESM-only
profile is scoped separately from all existing dual-format entries in CI.

Browser follow-through fixed metadata drafts resetting on selection updates,
restored the Svelte report's structural cursor control, and gave the Angular
component host block layout after intermittent WebKit control-visibility
failures. The affected media workflow then passed five consecutive WebKit runs.
Local image uploads retain chosen bytes, not substitute artwork. Other media
uploads explicitly require a persistent-URL storage adapter. The recorded
campaign journey is visually reviewed; external YouTube playback was unavailable
and is not certified. A wrapped-line End key in the audit initially split the
last paragraph; the revised journey checks end-of-document insertion and exact
paragraph retention instead. See `docs/ANGULAR.md` for boundaries and tests.
The final focused Vue/Svelte/Angular gallery set passes 19 checks across
Chromium, Firefox, WebKit and the two touch-emulation projects. The reviewed
mobile-Safari screenshot shows the new note in its own paragraph without
horizontal overflow. The production website build passes with the existing
large MathJax reference-lab chunk warning.

This does not complete SURFACE-04: optional framework UI suites, broader Angular
versions/forms, physical-device IME and accessibility evidence remain open.
No npm release is authorized by this increment.

SURFACE-04 Svelte increment (2026-09-07): the optional
`fountainjs-editor/svelte` entry supplies `createFountain`, `fountainState` and
`fountainEditor`. The report demo now runs compiled Svelte components for its
controls, view, state inspector and resettable owner. Hiding the view preserves
document/history; resetting the keyed owner intentionally discards local edits.
Svelte remains an external optional peer, isolated from core/React/Vue imports.
The private Svelte checker workspace uses TypeScript 6 without downgrading the
engine's TypeScript 7 toolchain; frozen-lockfile install and peer checks pass.

Verification: the full `pnpm check` passes 1,114 tests in 101 files, including
real compiled Svelte SSR in pure Node. Public declarations add only the two
Svelte entries; existing signatures remain unchanged. Packed Vue/Svelte type
resolution passes, and package smoke loads both ESM/CJS entries. Svelte's
recorded Chrome report-editing journey, desktop screenshot, mobile-Safari
screenshot and video overview were visually reviewed. The initial remount test
incorrectly used a column index after inserting a column; the value was intact.
It now checks the shifted cell and exact full-document retention across remount.
Custom-block teardown is separately checked against the owner's engine lifetime.
The final Vue/Svelte browser set passes all 13 checks across Chromium, Firefox,
WebKit and two touch-emulation projects. Website build passes with the existing
large MathJax reference-lab chunk warning; no runtime/bundle ceiling was relaxed
except adding the measured optional Svelte entry to aggregate code budgets.
At that checkpoint Angular and equivalent optional framework UI suites remained open; this does not
complete SURFACE-04 or permit npm publication. See `docs/SVELTE.md`.

SURFACE-04 Vue increment (2026-09-07): an optional Vue 3 entry now owns client
editor lifecycles, subscribes through shallow reactive state, and mounts the
existing DOM view through a first-party component. The runbook demo runs an
actual Vue app inside the labelled React gallery shell, not just a Custom Element
recipe. Tests cover provider disposal, SSR without DOM/plugins, replacement,
history and native browser editing through view hide/reopen. At this earlier
checkpoint Svelte/Angular bindings and complete framework-specific panel suites remained open; this does
not change the overall partial status. See `docs/VUE.md`.

The Vue quote-toggle workflow exposed an engine-level endpoint mapping bug:
after wrapping the last paragraph, an automatic trailing-paragraph append could
move the caret out of the quote. Resolution now honors exact text endpoints
before recovering across structural gaps; association still chooses between
adjacent marked spans. Core/repair regressions and the real Vue workflow cover
this fix, which applies to every DOM/framework surface.

Verification for this increment: `pnpm check` passes 1,110 tests in 99 files,
including eight Vue lifecycle/SSR tests. The selection/quote/trailing/undo/caret
browser regression set passes 80 checks across desktop engines and touch
emulation, with two existing Chromium-only clipboard skips. The final Vue-only
set passes all five projects; its recorded Chrome journey, screenshots and
video overview were visually reviewed. That review also fixed an unbounded Vue
JSON-inspector column in Firefox. Website build passes with the pre-existing
large MathJax reference-lab chunk warning. Native device/screen-reader evidence,
then-pending Svelte/Angular packages, remaining format fidelity and the rest of the release
ledger are not completed by this increment; npm publication remains deferred.

Table-caption import repair (2026-09-07): browser and server HTML import preserve
caption content as editable blocks before the table, including rich text,
multiple/empty paragraphs and nested-table captions. The server report explicitly
discloses lost caption association/placement/attributes. This prevents silent
loss through paste and optional Markdown HTML conversion; it does not complete
native table-caption authoring, semantics or bottom-caption layout.

HTML figure retention (2026-09-07): browser and server conversion no longer
extract only images while silently dropping a figure's other content. Simple
media/plain-caption shapes stay attached; complex figures retain supported
descendants in order and the server report discloses lost grouping/attributes.
Rich captions remain editable prose. Markdown's optional HTML-block adapter
inherits this repair; the default inert-HTML/CommonMark policy is unchanged.

DOCX matching-source recovery (2026-09-07): `restoreMathSource: true` optionally
reopens current Fountain-exported equations whose unique bookmark binding and
complete namespace-resolved OMML still match the v2 source record. Exact TeX
and accessibility labels survive; changed/ambiguous bindings are refused.
The recorded lab opens actual downloaded files, undoes import, and rejects an
equation altered in XML while recovering its unchanged peers. This is not an
actual Word edit/save session, authenticated metadata, arbitrary OMML import or
whole-document round-trip parity. Native Word/LibreOffice verification and
reconciliation of changed equations remain open; default import stays opt-out.

DOCX TeX conversion follow-through (2026-09-07): the browser export diagnostic
now uses a real optional MathJax base/AMS host converter, not exact-source
lookup data. Edited fractions, explicit unsupported-spacing fallback, original
source retention and undo are recorded with actual files and visible conversion
reasons. The supported subset and whole-tree resource bounds are documented in
`docs/DOCX.md`; 28 converter tests include pure Node execution. This is a host
example, not automatic npm-runtime TeX support. Native Word/LibreOffice visual
editing, full-paper conversion, numbering/references and equation restoration
remain open; browser viewer omissions still prevent a visual-parity claim.

Native file opportunity (user discussion, 2026-09-07): preserve a proposed `.fjs`
self-contained package as future work, distinct from plain `.fountain.json`
interchange. Candidate contents are a versioned manifest, portable document,
local assets, original imported sources and optional review data. Requirements:
documented language-neutral structure, missing-extension data retention,
explicit asset/conversion losses, safe archive limits/path handling, no automatic
code execution or extension installation, and no embedded credentials or claimed
file-enforced permissions. The extension/name and container design are not
finalized; this is not implemented or a promise of arbitrary external-format
fidelity. Full retention requires round-trip and missing-dependency tests.

Portable-reader companion (user discussion, 2026-09-07): pair that future format
with a local-first web reader requiring no developer tooling; consider an
offline/PWA distribution and later desktop file associations. This is distinct
from today's embedded read-only previews. Preserve unknown extension data and
offer a clearly labelled, optional static preview/source fallback. Require
explicit network permission, safe assets/archive handling, trusted renderer
boundaries and no automatic execution, extension installation or document
mutation. Checksums detect corruption, not signer authenticity. Source included
unencrypted in a package cannot be protected merely by hiding inspection UI.
Verify offline operation, accessibility/reflow, links and missing-dependency
behaviour before claiming a portable reader. PDF remains a separate fixed-layout
publication/export format; no reader application is being built in this increment.

Equation file workflow (2026-09-07): the lab now saves portable JSON/Markdown
files and reopens JSON after a fresh page load, rebuilding reader references.
The audit found root metadata lost by content-only replacement and undo.
Whole-document transactions now preserve root attributes through local history,
version restore and remote collaboration snapshots. File bounds, schema
validation and discarded-field checks precede replacement; failed loads leave
the editor intact. This does not bundle external assets or implement `.fjs`.

Paged-equation follow-through (2026-09-07): reproduced and fixed cross-block
links escaping the paged preview, SVG anchor keyboard-order leakage and shared
IDs across preview instances. The equation lab now builds a landscape Letter
snapshot with an explicit stale-state/rebuild workflow. Cross-browser checks
cover native SVG link navigation to later pages. This does not finish academic
PDF/DOCX fidelity. Arbitrary ID targets inside clipped custom fragments and
stylesheet ID/URL rewriting remain host projection responsibilities requiring
broader reference-layout work; do not claim universal SVG/HTML export parity.

Equation PDF audit (2026-09-07): the lab now prints only a current paged snapshot,
with no author/reader duplication or stale-output printing. A real three-page
Chromium PDF preserves both internal equation destinations and landscape Letter
dimensions; every page was independently rendered by Poppler and compared with
the screen preview. Firefox/WebKit cover print CSS, not native PDF output.
This does not reproduce the original paper, provide tagged accessible math, or
finish DOCX. A separate DOCX regression confirms default math export is TeX
fallback text with explicit loss reports, not native OMML or live numbering/
references. The next Word boundary must preserve technical source while adding
tested editable math and reference semantics, not silently substitute pictures.

Experimental Word-math boundary (2026-09-07): an opt-in `resolveMath` callback
now accepts validated semantic expressions and emits OMML with exact original
TeX metadata. Quotes, lists and table cells use the same nested traversal.
Independent XML/source checks do not certify rendering; the bundled document
renderer cannot run here because its LibreOffice executable is unavailable.
Word/LibreOffice visual and editing checks, a general tested TeX converter,
source restoration after external edits, and live numbering/references remain
open. Imports now warn and show a placeholder instead of silently flattening
structured Word equations. The feature remains experimental and FORMAT-05 stays
partial. See [the DOCX contract](DOCX.md#experimental-native-word-equations).

Native-math visual audit (2026-09-07): the recorded editor/export/independent
browser-viewer comparison exposed empty combined-script and accent equations,
incorrect fraction bars and ignored operator-limit/display modes in the
third-party browser viewer. Those requested semantics are present in the DOCX;
do not regress the exporter to satisfy an incomplete viewer. Three browser
journeys now record these disagreements and exercise source editing, explicit
fallback and undo. This improves the evidence, not the parity percentage:
Word/LibreOffice visual/editing verification and a real tested TeX converter
are still needed before academic DOCX output can be considered finished.

Academic rendering follow-through (2026-09-07): the separate equation-reference
lab now uses a bounded host-owned MathJax SVG renderer for original labelled
equations, forward links, reorder/renumber, source editing, history, visible
missing/duplicate-label failures, and a read-only reader. MathJax/font data stay
outside the npm runtime. Asynchronous resources, incremental compilation,
matching PDF/DOCX export and whole-paper fidelity remain open; see
[the reference audit](REFERENCE_DOCUMENT_AUDIT.md#document-aware-svg-equation-lab).

Academic product opportunity (user discussion, 2026-09-07): target developers
building structured scientific/laboratory applications, rather than declaring
Fountain a replacement for Overleaf, Quarto or Jupyter. Quarto's visual/source
editor, citations, cross-references and executable cells are a workflow benchmark
and potential integration target. Combine source-preserving equations, optional
proof/execution providers and extension-defined research widgets only after
testing their interactions. Stable node IDs are not automatically scholarly
references; large plain-block benchmarks do not certify equation-heavy papers.
Keep bibliography/templates, complete TeX projects, reproducible computation,
save/reopen and independently inspected publication output explicit requirements
of any future academic reference application. This does not start a separate
product or change the existing editor parity release gates.

Reliability follow-up from the equation lab: replacing a text-selected document
with only atoms or childless paragraphs threw during selection mapping before
normalization plugins ran. Transaction mapping now recovers a nearest legal
block gap without inserting synthetic text, including nested containers. Empty
intermediate documents use an all-document selection until the caller inserts
content/sets its intended selection. Nine regression cases cover text, node,
cell and gap selections, nested content, history and continued typing; the real
browser replacement/typing/Enter/history/Backspace journey passed in Chromium,
Firefox and WebKit. This is a bounded repair, not a complete selection audit.

Markdown follow-through (2026-09-07): the opt-in inline HTML adapter now protects
Fountain's original parsed nodes while applying surrounding HTML formatting.
This follows the raw-block adapter and shared strict HTML lexer, rather than
adopting another parser's AST. The conversion demo and developer guide expose
separate default-off block/inline choices and readable-source fallback. Full
raw-HTML conformance and exhaustive conversion-loss reporting are still open;
the default CommonMark result remains 563 matching / 72 pending / 17 intentional.
See [the contract and verification record](MARKDOWN_SOURCE.md#optional-inline-html-formatting).

The follow-up independent oracle verifies inert raw-HTML behavior, exact tokens,
and source/canonical round trips for those 72 pending cases plus 144 generated
variants. Within this fixture set, the remaining work concerns broader opt-in
projection/loss policy; this does not prove all possible inert inputs correct,
claim complete CommonMark conversion, or change the score.

Product-style roadmap items must be finished as complete workflows, not isolated
editor controls. Their acceptance evidence must cover developer integration,
author configuration, the end user's real surface, authenticated permission and
read-only states, persistence or submission, failures and retries, and paired
documentation. Fountain may provide replaceable contracts while the host owns
accounts, authorization, storage, or transport, but a visual role switch is not
evidence that those security boundaries exist.

Real-document acceptance (2026-09-07): reproduce openly licensed academic papers
and native Lean proof workflows as editable documents, with recorded user edits,
independent all-page export inspection, and explicit differences against the
original domain tools. This is required evidence, not a future cosmetic demo.
The first paper preflight found missing display-equation and TeX-table import.
Explicit TeX-environment import now recognizes both original equations without
discarding their labels. Table structure and all 21 original values now import
with explicit placement/rule-loss diagnostics; the host SVG lab now renders
labels, while table layout and whole-paper fidelity remain open. See the open
[reference-document benchmark and pinned sources](REFERENCE_DOCUMENT_AUDIT.md).

Explicit content interpretation (user suggestion, 2026-09-07): provide a consistent
selection/block action such as “Treat as LaTeX / Lean / Python / plain/verbatim.”
This complements automatic import; it does not replace its acceptance checks.
Use existing typed math/code nodes, preserve source, preview conversion losses,
and make conversion undoable. Plain/verbatim must disable interpretation.
Distinguish formula source from a full TeX document.
Show provider/renderer availability and diagnostics: choosing a language must
never execute code, silently connect to a service, or imply successful proof
checking. Developers should register additional interpretations through modules.
The underlying typed blocks exist; this unified end-user workflow is **pending**.

Demand claims submitted on **2026-09-04** are recorded here as research leads.
Before priority is justified publicly, the original Tiptap/ProseMirror issue or
discussion must be linked, dated, checked for current status, and translated
into an independently tested user outcome. FountainJS will not copy upstream
code or APIs.

## Do not rebuild what is already here

Several requested outcomes already ship and should be hardened rather than put
back into a “future” list:

- provider-neutral threaded comments, mapped annotations, tracked changes, and
  named version history;
- cancellable asynchronous suggestions shared by mentions, slash commands,
  emoji, and other triggers;
- audio, video, files, provider-gated embeds, images, and upload boundaries;
- rowspan/colspan-aware table transforms, selection, resizing, repair, and
  rectangular clipboard interchange;
- Markdown/HTML/JSON/text interchange with explicit loss reporting;
- large-document latency, DOM churn, NodeView churn, and memory budgets.

Their current limitations remain in [TIPTAP_PARITY.md](TIPTAP_PARITY.md); “has
an implementation” never means “has a decade of production evidence.”

## Delivered foundation: extension trust and authoring

PROD-06 owns manifests, exact extension API compatibility, deterministic
requirements, hard duplicate/contribution conflicts, framework-neutral
conformance tests, a safe package generator, and installation-wide diagnostics.
The `fountainjs-editor doctor` command is included here because it is the direct
completion of that contract, not a separate speculative feature. That outcome
is now certified in [TIPTAP_PARITY.md](TIPTAP_PARITY.md) and documented for
extension authors in [EXTENSIONS.md](EXTENSIONS.md).

## Delivered foundation: stable releases and migrations

PROD-07 owns explicit API-stability levels, deprecation windows, document and
extension migration contracts, release evidence, security-support policy, and
repeatable release gates. That outcome is now implemented and publicly
certified in [TIPTAP_PARITY.md](TIPTAP_PARITY.md); the operational contracts are
in [MIGRATIONS.md](MIGRATIONS.md) and [RELEASES.md](RELEASES.md).

## Delivered: print-aware pages and pagination

DOC-14 is the first delivered post-foundation capability. Its measured
layout/persistence architecture includes fixtures for pages, headers, footers,
footnotes, tables, lists, media, manual breaks, and continuous accessibility.
Its first platform-neutral milestone now ships in source: physical geometry,
legal-fragment flow, non-persisted automatic boundaries, manual breaks,
footnote intent/integrity, transient first-reference numbering, standard
Markdown and semantic HTML interchange, canonical default/first/odd/even header/footer
templates, dynamic page fields, renderer-neutral per-page furniture/footnote
projection, undo, HTML/JSON, and Yjs. The browser side now
also has isolated measurement for text lines, direct blockquote children, list
items, rowspan-safe table groups, long-footnote line continuations, and manual
breaks; every fragment maps back to its model and
structural paths plus clip geometry, and every page placement resolves to an
exact validated source slice. A separate read-only renderer now projects those
slices into fixed sheets with repeated furniture, table headers, footnotes,
physical print rules, and one continuous accessibility copy. Chromium, Firefox,
and WebKit verify physical A4/Letter sheet geometry, stable named pages,
furniture/fields, footnotes, page breaks, and print-only accessibility/editor
state. A Chromium PDF gate additionally verifies page count, MediaBoxes, and
representative page-specific content without a duplicate hidden document. Timed reflow
observation is coalesced, and mutation-only cycles reuse unchanged top-level
geometry under 1,000-block/75 ms and alternating-edge 5,000-block/250 ms p95
browser gates. Leading insertion/removal preserves 5,000 unchanged DOM blocks,
rebases their model/source paths, and holds page measurement to two/one geometry
reads under a 500 ms p95 structural gate. A guarded editable surface now places
whole top-level blocks and continues measured paragraphs, canonical list items,
and rowspan-safe table row groups over fixed page shells while retaining one
unchanged contenteditable, direct model paths, identity, native IME, and
cross-page selection. Continuations use reversible accessibility-hidden
widgets or spacing, never document nodes. A split table remains one editable
table; page shells show read-only repeated column headers rebuilt from its one
canonical header. Two-row headers retain safe row/column spans, transitive body
rowspans stay in one fragment, and a header rowspan entering body rows disables
the incomplete repeated copy. Canonical page templates and footnote definitions remain
uniquely editable in ordered rails around the page stack while sanitized,
field-resolved, accessibility-hidden copies appear on their assigned sheets.
Rows taller than a page body remain one editable row with explicit overflow.
Images, audio, details, code blocks, and custom NodeViews now follow the same
canonical keep-together rule: move intact when possible and show explicit
non-clipping overflow when taller than the page body. Pagination-owned
attributes and style variables preserve custom NodeView identity without
weakening recovery for unrelated DOM mutations. The read-only renderer also
continues multi-block blockquotes at their canonical direct-child boundaries
while repeating their measured container overhead, and accepts strictly
validated host-declared custom continuation bands and a
sanitized host-owned placement projection for custom NodeViews, canvases,
embeds, and atomic media whose live DOM is unsuitable for print. This contract
does not mutate the model or claim that an arbitrary widget is safely editable
across pages; the guarded live surface falls back to continuous mode for a
custom split.
Long footnotes use the same neutral measured-fragment contract and exact source
offsets in editable and print projections, with no duplicate persisted definitions.
Mapped comments and top-level movement are certified across continued lists and
tables. The surface returns to continuous mode when either the
viewport or embedding container is narrow, and restores pages without
remounting when space returns. History, tracked suggestions, and bidirectional
Yjs edits remain live across those automatic boundaries without persisting page
numbers. Styled semantic HTML imported through the public schema contract is
now checked across all three desktop engines for marks/alignment, ruby, math,
nested quote/list structure, merged tables, and manual breaks, with exact
Chromium PDF body-token de-duplication. This bounded contract is delivered;
new document families remain hardening work under the same gates. CSS
page-shaped boxes or destructive document splitting do not qualify.

## Delivered: stable node identities and lookup

`DOC-17` now provides configurable, portable identities without forcing IDs onto
text leaves; indexed lookup, update, and selection APIs; deterministic repair for
paste, duplication, and mixed-client collaboration; position-neutral history
mapping; schema filtering and stored-JSON normalization; and compatibility with
arbitrary extension nodes and portable attributes. Identity generation is
injectable for deterministic tests and non-browser runtimes, and an invalid or
duplicate identifier never silently targets the wrong node. The complete
400-test package suite and 278-pass Chromium/Firefox/WebKit/mobile
[CI run for `8fca57c`](https://github.com/eddolo/fountainjs/actions/runs/33967296032),
plus its successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33967296119),
certify the public package and rendered demo.

## Delivered: live table of contents

`DOC-15` now derives immutable flat and hierarchical heading indexes from the
platform-neutral document, uses stable node identity for durable anchors,
tracks the active section from the logical selection, and navigates with a
model transaction. Heading edits and movement update their titles and paths
without changing their IDs. A DOM view receives only stable transient anchor
decorations, while the supplied React Navigator adds active state, normalized
indentation, `aria-current`, complete-title hover text, and scrolling. Pure
builders run in Node.js without browser globals. The complete 605-test package
suite and 350-pass Chromium/Firefox/WebKit/mobile
[CI run for `128c533`](https://github.com/eddolo/fountainjs/actions/runs/34037255518),
plus its successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34037255559),
certify the package and rendered workflow; see
[TABLE_OF_CONTENTS.md](TABLE_OF_CONTENTS.md).

## Delivered: text integrity and invisible characters

`DOC-16` now separates non-mutating Unicode inspection, view-only invisible
markers, integrity-sensitive input, and deliberate cleanup. Its isolated
headless entry reports exact UTF-16 positions, code points, UTF-8 bytes,
LF/CRLF/CR differences, normalization, whitespace, zero-width/BOM/bidi
controls, soft hyphens, and invalid surrogates without browser globals. The DOM
extension adds bounded transient markers plus literal input for eligible
code/verbatim blocks. Sanitization requires explicit per-category choices, an
immutable before/after preview, and an unchanged selection/source before one
undoable transaction can apply. The optional React inspector is a replaceable
surface and does not enter the default React bundle. The complete 612-test
package gate and 353-pass Chromium/Firefox/WebKit/mobile
[CI run for `734f151`](https://github.com/eddolo/fountainjs/actions/runs/34039546987),
successful [Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34039547002),
and live rendered inspection certify the package and workflow. Original-byte
verification deliberately remains at the host import/hash boundary; see
[TEXT_INTEGRITY.md](TEXT_INTEGRITY.md).

## Delivered: first-class interactive widget contract

The first-class widget implementation keeps validated values in
portable document attributes; accepted changes are one undoable transaction;
generic Yjs collaboration reproduces them; and explicit focus/cursor handoff,
Tab/Enter/Escape policy, read-only behavior, teardown, and validation are shared
by isolated plain-DOM and React adapters. Public working examples exercise both
renderers. The complete 414-test package suite and 281-pass
Chromium/Firefox/WebKit/mobile
[CI run for `cced9e2`](https://github.com/eddolo/fountainjs/actions/runs/33969832708),
plus its successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33969832692),
certify the public package and rendered demos.

## Delivered: granular collaborative structured attributes

The implementation defines bounded DOM-free object/array contracts, typed
nested commands, whole-root and schema validation, stable-ID addressing, and an
opt-in nested `Y.Map`/`Y.Array` representation beside backward-compatible flat
JSON. Package and real-browser tests prove separate nested fields, changes
inside array objects, concurrent array insertions, local-only undo, room
replacement, public controls, canonical repair, malicious-value failure
containment, and preflighted local writes that cannot partially mutate the
shared canonical tree. The complete 425-test package suite and 284-pass
Chromium/Firefox/WebKit/mobile matrix passed in
[CI run `0a33c87`](https://github.com/eddolo/fountainjs/actions/runs/33972148767),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33972148765)
succeeded.

## Delivered: truly server-native document conversion

The isolated `fountainjs-editor/html/server` entry now parses HTML into the same
schema-validated model without `window`, `document`, `DOMParser`, jsdom, or
another fake DOM. Platform-neutral `parseHTML` rules give custom nodes and marks
one browser/server contract while existing `parseDOM` rules remain compatible
and browser-only callbacks are reported rather than impersonated. Input, tree,
depth, attribute, parser-error, performance, memory, bundle, packed-package,
browser/server parity, and adversarial URL/recovery gates are enforced. The
emitted import/export path runs in Node ESM/CommonJS, Bun, Deno, and Cloudflare
`workerd`. The complete 439-test package suite and 284-pass
Chromium/Firefox/WebKit/mobile matrix passed in
[CI run `ebc3194`](https://github.com/eddolo/fountainjs/actions/runs/33974721733),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33974721742)
succeeded. A clean no-DOM core declaration package is still a separate
portability task and is not implied by this conversion milestone.

## In progress: open document interchange

The isolated `fountainjs-editor/docx` entry now reads and writes bounded Word
OOXML without a DOM, Office process, network request, or conversion SaaS.
Common paragraphs, headings, marks, safe links, nested lists, quotes, code,
tables/spans/header rows, and page geometry map through the receiving schema;
tracked revisions and unsupported content produce immutable path-bearing
reports. ZIP/XML resource limits, packed ESM/CommonJS execution, package budgets,
independent `python-docx` compatibility checks, and a recorded browser
download/re-import journey gate the work. The existing page pipeline supplies
measured A4/Letter/custom print and inspected Chromium PDF output. Verified
embedded PNG/JPEG/GIF/WebP import/export now has resource limits, safe default
data URLs, host-controlled URL resolution, captions, dimensions, relationship
deduplication, and explicit external/unsupported fallback. Deeper Word fidelity
remains active; ODT and EPUB are not claimed. The current visual gate renders a
generated DOCX independently beside its Fountain source and records a real A4
PDF that is rasterized page by page with Poppler. That audit already caught and
corrected Word heading scale, paragraph spacing, image alignment, quote styling,
table borders, and font fallback that semantic round trips could not detect.
Before claiming comparative export superiority, build a neutral representative
corpus and run identical documents through Fountain and competing conversion
stacks; independently render every DOCX/PDF result and score content survival,
layout, reported loss, local/offline execution, and custom-node handling.
The bounded DOCX batch passed 665 behavioral tests, packed all-entry package
checks, a real Lean 4.30 integration check, and the complete 379-pass/14-skip
Chromium/Firefox/WebKit/mobile matrix in
[CI run `bb078bb`](https://github.com/eddolo/fountainjs/actions/runs/34061065186);
the matching
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34061065270)
succeeded.
The follow-up media and visual-fidelity batch passed 669 behavioral tests, the
complete 382-pass/14-skip browser matrix, and seven recorded human-use/export
audits in
[CI run `69091cf`](https://github.com/eddolo/fountainjs/actions/runs/34067541278);
its
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34067541261)
succeeded as well.
See [DOCX.md](DOCX.md).

## Delivered: virtualized rendering for huge documents

The opt-in top-level window keeps the complete immutable model while mounting
only the viewport, overscan, and semantic selection islands. Its neutral height
index reuses measurements by node identity and preserves absolute model
positions. Stable structural scroll anchoring, distant model-backed search and
editing, Japanese IME, decorations, deterministic NodeView lifecycle, remote
transactions, wide rich copy/cut preparation, explicit accessibility/export
suspension, and automatic full-render printing are covered without weakening
the ordinary non-virtual editor. A real 100,000-block contract keeps fewer than
100 top-level blocks mounted across Chromium, Firefox, WebKit, Pixel/Chromium,
and iPhone/WebKit. The complete 452-test package gate and 289-pass browser/mobile
matrix passed in
[CI run `8a6264e`](https://github.com/eddolo/fountainjs/actions/runs/33977243766),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33977243779)
succeeded. Scope, accessibility policy, and the one-enormous-block limitation
are explicit in [VIRTUALIZATION.md](VIRTUALIZATION.md).

## Delivered: enforced platform-neutral core boundary

The portability audit proved that the model, schema, logical selections,
transactions, history, extension composition, collaboration state, Yjs, and
serializers run without a browser, and the isolated server HTML entry is already
runtime-certified. The additive `fountainjs-editor/core` implementation now
compiles and is consumed with no `lib.dom`; a source-graph gate rejects DOM,
React, browser-parser, and aggregate-web imports; Node tests cover generic and
Yjs collaboration without fake browser globals; and the compatible web root and
StarterKit remain unchanged. The complete 455-test package gate and 289-pass
five-surface browser/mobile matrix (with two intentional Chromium-only PDF
skips) passed in
[CI run `2c7ff4c`](https://github.com/eddolo/fountainjs/actions/runs/33979389234),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33979389243)
succeeded.
This designs for future native renderers now; it does not start React Native,
Flutter, SwiftUI, or Compose implementations.

## Native-renderer feasibility design: decision complete

The new engine boundary removes unnecessary browser dependencies, but it does
not make native rich-text editing a renderer swap. The next milestone is a
written bridge design grounded in Fountain's actual selection, transaction,
composition, clipboard, accessibility, and layout contracts. It must identify
the smallest host interface, lifecycle and ordering rules, serialization and
threading costs, and failure boundaries for React Native and Flutter/native
bridges. No production native package should be promised or started until that
design is reviewed; Electron and Tauri continue to use the certified web
surface. A deliberately small feasibility spike may follow the design, not four
parallel renderer implementations. The architecture decision, proposed host
boundary, fail-fast criteria, first-spike scope, and platform risk register are
now explicit in [NATIVE_RENDERER_FEASIBILITY.md](NATIVE_RENDERER_FEASIBILITY.md).

## Active now: higher-fidelity Markdown source preservation

Fountain already reconstructs its supported Markdown semantics and reports
projection loss, but semantic equality is different from source equality. The
first additive source capsule now keeps unchanged input exactly, retains
strict leading YAML frontmatter as inert exact text, reports whether output is
`exact`, `blocks`, `mapped-blocks`, `frontmatter`, or `canonical`, and
canonicalizes changed source honestly after a visual edit. It never executes
YAML and preserves unknown body syntax after a model change only in safely
mapped unchanged blocks. The first versioned, Fountain-authored
CommonMark/GFM-oriented fixture subset also covers ATX/Setext headings,
indented and variable fenced code, collision-safe variable-delimiter code
spans, strict semicolon-terminated HTML5 character references, all ASCII
punctuation escapes, URI/email autolinks, star emphasis, and both hard-break
forms without claiming complete standards conformance. GFM one- and two-tilde
strikethrough is exact-run aware, stops at paragraph boundaries, and keeps runs
of three or more literal. The first GFM extended-autolink slice recognizes
boundary-safe `www.`, `http://`, and `https://` links, validates domains, and
trims punctuation, unmatched closing parentheses, entity-looking suffixes,
and `<` exactly before URL safety validation. Entity-obfuscated URLs
are decoded before protocol validation, while canonical export protects
literal entity-shaped text. Safe path/query-relative destinations, balanced
parentheses, strict title closers, bounded reference labels, and code/paragraph-
aware single/multiline reference extraction, escaped definition labels, and
global definitions nested in blockquotes are also covered. Malformed inline
destinations now preserve shortcut-reference precedence, while actual nested
links suppress their outer link without mistaking code spans for link syntax.
Reference identifiers use pinned Unicode 17 full case folding rather than
locale-sensitive or incomplete JavaScript lowercasing.
Definition labels can span nonblank lines and reject unescaped nested brackets.
Explicit empty links remain semantic links across Markdown and browser/server
HTML, without weakening validation for empty image, media, or action URLs.
Inline parsing now validates physical line endings before projecting ordinary
soft breaks to spaces, so forbidden newlines cannot create accidental link
destinations. Title separation uses CommonMark's ASCII whitespace set rather
than treating non-breaking space or other Unicode spacing as syntax.
Code spans, autolinks, and valid inline HTML are opaque to link-label bracket
matching, preventing false outer closures and hidden inner references.
Reference matching normalizes raw source identifiers rather than parsed inline
content, so escape and character-reference spellings do not falsely collide.
It now applies the exact label-whitespace class, counts the 999-character bound
by Unicode code point, and covers the official adjacent-reference precedence
matrix without letting an earlier shortcut capture a following label.
Image descriptions project nested inline formatting, links, and images to
plain alt text rather than preserving Markdown punctuation in accessibility
metadata.
Inline atom marks now close a lower-level model gap: links and emphasis around
images remain attached to the image node through Markdown, browser/server HTML,
DOM rendering, JSON, and Yjs, while block marks remain schema-invalid.
GFM bare email autolinks accept the specified local-part characters, require a
multi-segment domain, remove a final period from the link, and reject invalid
plus, hyphen, or underscore domain tails rather than linking a valid-looking
prefix.
Safe angle-bracket protocol autolinks cover case-preserving `mailto:` and XMPP
destinations in addition to HTTP(S). CommonMark's syntactic acceptance of
arbitrary and invented schemes does not override Fountain's security boundary:
unknown protocols and `javascript:` remain inert literal text.
End-of-fragment star and underscore closers now obey the same Unicode-aware
flanking rules as every other delimiter, so preceding spaces and line endings
stay literal. List-marker separation is restricted to CommonMark's ASCII spaces
and tabs rather than treating non-breaking spaces as structural syntax.
Thematic breaks now accept spaces or tabs between three or more matching
markers, retain the three-space indentation bound, and interrupt surrounding
lists instead of being swallowed as list-item text.
ATX headings now trim standard trailing spaces and recognize an all-hash
optional closing sequence instead of exposing it as heading content.
Lists now accept all three bullet markers and preserve a structural boundary
when the bullet marker or ordered delimiter changes, avoiding accidental merges
of adjacent source lists.
Ordered lists may start at any value at a block boundary, while only a list
starting at `1` interrupts an existing paragraph as CommonMark requires.
Ordered markers are limited to CommonMark's one-to-nine ASCII digits; zero is
preserved across the model, Markdown, and browser/server HTML boundaries, and
canonical continuation numbers stay within that grammar at the upper bound.
Empty bullet and ordered items are recognized even when the source marker has
no trailing whitespace.
Marker-relative tab stops now preserve indented code inside blockquotes and list
items. A list item may begin with any valid block, including a nested list,
thematic break, indented code, or fenced code, rather than requiring a paragraph
as its first child.
Setext underlines now terminate either a single line or a multiline paragraph,
retaining inline marks across the heading's soft line breaks.
The emphasis baseline now prevents intraword-underscore and whitespace-opening
false positives, accepts double-underscore strong and triple combined runs,
and exports canonical emphasis with round-trip-safe stars. This deliberately
does not claim the remaining full delimiter-stack algorithm.
Unambiguous nested strong/emphasis spans now stay inside their enclosing mark;
links, code, autolinks, and inline HTML group more tightly; and a generated
semantic-span fallback preserves otherwise ambiguous adjacent text-node mark
boundaries without giving up reference-style link output.
CommonMark rule-of-three arithmetic now prevents an ambidextrous delimiter run
from closing the wrong span, including compact nested forms with no separating
whitespace. Earlier overlapping spans keep precedence, including when an
otherwise competing same-marker opener sits inside a nested unlike strong span.
The broader delimiter stack is still an explicit compatibility target rather
than a completed claim.
Uneven-run handling now leaves unmatched delimiter characters outside the
formatted span and round-trips the otherwise ambiguous adjacent literal/mark
boundary through escaped canonical Markdown.
Shared opener/closer runs now preserve parse-order nesting, including repeated
emphasis, underscore surplus, and multiple strong levels. Duplicate identical
marks take the lossless semantic-span export path instead of being silently collapsed.
Indefinite mixed nesting now survives soft line breaks and link labels. The
semantic fallback keeps a non-outermost link at its exact mark-stack position
and applies the same URL safety policy on re-import.
The GFM strikethrough baseline accepts matching runs of one or two tildes,
rejects longer runs, never matches across a paragraph boundary, and treats
code, autolinks, inline HTML, and links as tighter-bound tokens. Lossless
semantic fallback preserves the exact mark stack when strike continues across
adjacent nodes with different inner marks.
Fail-closed aligned top-level spans ensure unchanged blocks and separators stay exact while
changed blocks are canonical. Unique semantic matches now retain their source
through insertion, deletion, and movement with canonical separators. Preserved
immutable node identity now distinguishes equal original blocks without fuzzy
matching, while cloned references and reconstructed ambiguous equals remain
deliberately unmapped. A development-only, schema-independent semantic oracle
now scans all 652 CommonMark 0.31.2 examples without shipping a reference parser
or equating Fountain's AST with CommonMark's: 563 matches are regression-locked,
72 cases are explicitly pending, and 17 safe-URL/GFM/editor-model
differences are intentional. Marker-relative list containers now preserve
multi-digit indentation, lazy nested content, and exact code whitespace through
canonical export/reimport. A recorded runbook journey covers rich paste, nested
editing, Enter, undo/redo, and export/reimport in the public demos. The earlier
Markdown baseline passed the
complete 564-test package gate and Chromium/Firefox/WebKit/mobile matrix in
[CI run `0a7aef6`](https://github.com/eddolo/fountainjs/actions/runs/34004963074),
and the corresponding
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/34004963046)
succeeded. Deeper-structure source mapping and a larger standards corpus remain
before a source editor UI. See
[MARKDOWN_SOURCE.md](MARKDOWN_SOURCE.md).

## Prioritized after release foundations

| Priority | Outcome | Current baseline | Required proof before “Delivered” |
| --- | --- | --- | --- |
| 1 | First-class interactive widgets | Delivered and certified in `cced9e2` | Continue browser, accessibility, format, and extension-composition regression coverage as products adopt the contract. |
| 2 | Granular collaborative structured attributes | Delivered and certified in `0a33c87` | Continue adversarial mixed-version, nested-array, collaboration, and storage regression coverage. |
| 3 | Truly server-native document conversion | Delivered and certified in `ebc3194` | Continue malformed-input, custom-rule, runtime, package, CPU, and memory regression coverage; the delivered no-DOM core gate now prevents browser dependencies from returning through the engine entry. |
| 4 | Virtualized or paged rendering for huge documents | Delivered and certified in `8a6264e` | Continue physical-device, assistive-technology, late-loading NodeView, one-enormous-block, and multi-hour soak evidence. |
| 5 | Enforced platform-neutral core boundary | Delivered and certified in `2c7ff4c` | Keep source/declaration/package/runtime gates permanent and continue separating mixed optional modules only when a real headless/native consumer needs them. |
| 6 | Native renderer feasibility | Architecture design complete; the no-DOM engine boundary is delivered; DOM, Web Component, and React remain web surfaces | Review the concrete coordinate/input/IME/accessibility/lifecycle bridge contract, then deliberately schedule a bounded React Native prototype before promising native packages. A WebView does not count as native. |
| 7 | Higher-fidelity Markdown source preservation | Whole-source, inert frontmatter, aligned spans, identity-first plus unique structural mapping, collision-safe code spans, strict HTML5 references/ASCII escapes, safer relative/balanced links, bounded multiline labels/container definitions, nested/malformed-inline precedence, opaque-token scanning, raw-source normalization, full Unicode 17 label case folding, ATX closer/whitespace and multiline Setext handling, plain image-description projection, inline-node marks, nested emphasis with closing-flanking enforcement, rule-of-three arithmetic, complete bullet/ordered marker styles, up-to-three-space list indentation and interruption rules, ASCII-only list separation, marker-relative tab stops, first-child nested lists/thematic breaks/code blocks, spaced thematic breaks, recursive lazy blockquote continuation, bounded opaque code-language identifiers, unmatched delimiters, outer-to-inner semantic HTML mark projection, continuous mixed-format link projection, and lazy-blockquote Setext precedence are certified; block source survives insertion/deletion/movement with canonical separators and no duplicate guessing. The development-only CommonMark 0.31.2 oracle materializes the specification's tab notation, canonicalizes equivalent URI spellings, and scans all 652 official examples through a neutral semantic projection, regression-locking 563 matches while classifying 72 pending and 17 intentional divergences. | Promote pending semantic cases and add deeper-structure source mapping before considering a raw/visual Markdown UI. Fountain's native AST remains independent; exact source preservation and semantic preservation remain separate promises. |

Pagination and footnotes should be designed together because page geometry,
continuation, numbering, print output, and table splitting interact. Stable node
IDs should precede widgets and deeper review/database integrations because it
provides a durable external-reference primitive.

## Secondary research queue

These are useful, narrower ideas. They should become ledger rows only after an
owner defines persistence, selection, accessibility, collaboration, format,
performance, and browser behavior:

- DOC-19 is delivered and publicly certified; maintain its normalization and
  explicit-loss contract with property-by-property fixtures captured from more
  Word, Google Docs, Excel, MathML/LaTeX, semantic ruby/footnote, revision,
  comment, and unknown application clipboard variants;
- optional provider-neutral audio/video transcription: Fountain owns commands,
  progress/error state, timestamped transcript nodes or attributes, portable
  JSON, selection, and undo; the host chooses a local model, its own server, or
  an external service. No account, credential, upload destination, or paid SaaS
  becomes a core dependency;
- a complete interaction laboratory that mounts an editor capable of every
  supplied document/UI behavior, drives scripted real-browser journeys through
  each action and transition, records screenshots/video where useful, and checks
  both model state and rendered outcome. This complements focused unit and
  browser matrices; a recording alone is not a correctness assertion;
- pair every public capability demo with its developer-guide/API recipe and link
  both directions. Keep the ten environment demos as the portability proof and
  add focused capability labs—starting with block reordering—without pretending
  an environment count is a feature count;
- a post-parity authorable-forms package and paired demo. Keep three roles
  explicit: developers register field types, validation, submission,
  permissions, and storage; form authors visually compose and configure the
  schema; respondents receive a clean fillable renderer. Research accessible
  text/number/date inputs, choices, files and signatures, conditional sections,
  calculated values, and repeatable groups. Store the form definition and
  response data through explicit portable contracts, while leaving deployment,
  identity, secrets, notification, and backend submission ownership to the host.
  Treat the form definition and each submitted response as separate permissioned
  records with independent validation and history; prove author, respondent,
  read-only/public, rejected submission, retry, and persisted-result journeys;
- a visible privacy-aware “Report a bug” route on the website and every demo,
  backed by the existing structured GitHub form; request Fountain version,
  framework/runtime, browser/OS, minimal reproduction, expected/actual behavior,
  and sanitized document JSON without asking users to publish private content;
- extend the delivered unofficial issue-editor workflow lab, using no copied
  branding or implication of affiliation. The first increment demonstrates
  rich/Markdown switching, safely mapped untouched source, tasks, tables, code,
  links and local draft reopening. Still add measured integrated diagnostics
  for virtualization, headless runtimes, collaboration and pagination, plus
  authenticated upload/submission reference workflows. Link
  [GitLab's public architecture evidence](https://docs.gitlab.com/development/fe_guide/content_editor/)
  that its real rich editor uses Tiptap/ProseMirror, and present this as a
  recognizable replacement-workflow test rather than a visual clone;
- delivered a discoverable [real-world workflow hub](https://eddolo.github.io/fountainjs/workflows.html)
  above the ten integration demos, plus an unofficial Todoist-style task-brief
  workspace with independent editor histories, host-owned task metadata and local
  Markdown handoff. See [the implementation and scope](WORKFLOW_DEMOS.md).
  Further document/review, block-knowledge and academic product workflows remain
  candidates, not completed clones or claims about the original products' engines;
- table captions and advanced image/text wrapping;
- cross-editor schema-aware drag and drop; the local general inline/block drop
  cursor is delivered and publicly certified under UI-06, while accepting and
  translating content from another schema remains separate research;
- footnote/endnote interchange independent of paged rendering;
- configurable soft limits in addition to enforced hard character limits;
- iframe/isolated-surface editing and host focus coordination;
- vertical Japanese writing with logical selection/navigation evidence;
- spell-check, dictionaries, thesaurus, and replaceable language-service hooks;
- YAML frontmatter and raw/visual Markdown switching;
- a post-parity language-neutral Fountain protocol: specify versioned document
  JSON, schemas, stable identities, logical selections, operations/steps,
  mappings, validation failures, comments, revisions, and collaboration payloads
  without relying on JavaScript object identity or runtime-only behavior.
  FountainJS remains the reference implementation. A Node/IPC/HTTP service can
  provide the first cross-language bridge; React Native/Flutter bridges,
  Python/Rust/server bindings, WASM, and independent Swift/Kotlin/other engines
  are demand-led later projects, not current promises. Interoperable JSON alone
  must never be described as another language natively executing Fountain;
- post-parity workspace adapters: Monaco or CodeMirror code-cell NodeViews,
  Jupyter-kernel execution, and xterm/PTY terminal blocks. Fountain owns the
  portable document, identity, review, collaboration, and output-node boundary;
  hosts own process/kernel access, credentials, authorization, sandboxing, and
  network transport. Research a Fountain-native code surface only if concrete
  adapter limitations justify a separate Monaco-class engineering programme.
- a post-parity structured-workspace programme spanning documents, spreadsheet
  computation, code, notebooks, terminals, forms, files, charts, and result
  nodes. Start with an adapter-backed spreadsheet block for the useful core of
  typed cells, stable ranges, formulas, formatting, sorting/filtering, tables,
  and charts rather than attempting to clone Excel. Give agents bounded,
  schema-aware operations such as `readRange`, `setFormula`, `fillFormula`,
  `sortRange`, `filter`, `insertColumn`, and `createChart`; route those changes
  through Fountain transactions so they remain inspectable, permissioned,
  reviewable, collaborative, versioned, and undoable. Preserve specialist
  engines behind explicit adapters—calculation engines, Monaco/CodeMirror,
  Jupyter kernels, and xterm/PTY—while Fountain owns cross-surface identity,
  provenance, orchestration, and portable structured state. This is a future
  architectural direction, not part of the current editor-parity promise.

## Broader editor landscape audit

After the active ProseMirror + Tiptap parity work, audit other editor families
for ideas FountainJS can improve or make framework-neutral. This is a research
queue, not a claim that the named projects expose identical capabilities:

- Lexical and Slate: state/update architecture, normalization, operation
  mapping, DOM reconciliation, and custom behavior ergonomics;
- Plate and Remirror: extension composition, typed authoring, supplied UI,
  framework integration, and what happens when their abstraction leaks;
- BlockNote and Editor.js: block-first workflows, structured output, slash and
  drag interactions, and the limits of mixing free-form rich text with blocks;
- CKEditor 5 and TinyMCE: mature authoring workflows, accessibility, import and
  export fidelity, plugin operations, long-term compatibility, and deployment;
- Eddyter and other finished-editor products: onboarding speed, default UI,
  customization boundaries, licensing, and which advertised capabilities have
  independently reproducible evidence.

Use the same evidence template for every audit: public API and license, supplied
features versus paid/hosted services, framework and server portability, input
and IME behavior, collaboration, document fidelity, performance, accessibility,
extension conflicts, documentation quality, and runnable tests. Promote an idea
to the capability ledger only when it has a FountainJS contract and proof plan.

## Sequencing rule

Finish and certify one ledger outcome before beginning another. Each outcome
must remain framework-neutral at its model/command boundary, ship through the
public MIT package, include a working packed-package example, pass applicable
unit/browser/accessibility/performance gates, document honest limitations, and
be compared against ProseMirror + Tiptap as a combined stack. Community size and
years of deployment are evidence gaps that features alone cannot erase.

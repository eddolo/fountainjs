# FountainJS opportunity roadmap

Latest native-colour follow-up (2026-10-07, Unreleased): an independent plain
page reproduces Linux WebKit moving focus from a colour input into a retained
editable selection. A toolbar-only four-key guard fixes that default without
consuming ordinary field caret keys, Tab or picker activation. Linux preflight
passes on `88c541a`; the complete browser matrix is still running. An older
unit contract expecting those colour defaults to remain unhandled is updated
explicitly, retaining focus assertions and all other field cases. The final
complete local gate passes **2,636 tests / 197 files**, unchanged performance
and bundle limits; nine serial three-engine workflows pass without retries.
All 69 captures are visually verified (68 exact hashes, one direct comparison).
The first new complete run passed
performance/budgets/types but failed that old assertion; it remains retained.
Evidence: `artifacts/native-colour-arrow-verification-20261007.json`.
No roadmap-row, CommonMark-score or npm promotion.

Latest focus follow-up (2026-10-07, Unreleased): formatting a retained selection
no longer applies a native Range while an input, textarea or select owns focus;
automatic external selection changes do not overwrite the logical selection.
Explicit `EditorView.focus()` still restores it. All **2,635 tests / 197 files**
and framework type checks pass. Unsafe-link cases retain every input/assertion
in independently reported families; the ID lookup test retains its volume and
time limit while excluding assertion-library overhead. Nine recorded Windows
three-engine workflows pass without retries; all 69 captures are visually
verified directly or by exact hashes to inspected captures. Linux native-color
formatting/undo passes on Linux too, but arrow-focus still fails all retries;
the complete browser matrix was not reached. Linux verification (including
performance/units) and Lean pass on `802f9a5`. Exact evidence:
`artifacts/native-control-focus-verification-20261007.json`. The latest
complete local gate fails server HTML p95 at 1k/5k/10k blocks; its limits remain
unchanged, so this is not a fully green release checkpoint. No ledger,
CommonMark-score, percentage or npm promotion.

Latest server-import follow-up (2026-10-07, Unreleased): bounded, tree-owned
selector compilation lowers import overhead without global tree retention,
schema/API changes, new dependencies, or increased budgets. All local gates pass
on one frozen source across separate runs: **2,626 tests / 197 files**, twelve
recorded three-engine workflows, and 75 visually verified captures. The initial
concurrent ID-lookup timing failure remains documented; the unchanged full unit
suite passes in isolation. Linux native-color focus remains open. Details and
exact evidence: [PERFORMANCE.md](PERFORMANCE.md#tree-owned-server-selector-compilation).
No ledger, percentage, CommonMark or release promotion.

Latest production follow-up (2026-10-07, Unreleased): profiling the GitHub
checkpoint's failed edit-scaling gate led to lower shared-subtree validation,
group-matching, and equality costs without relaxing limits or validation. The
original edit ratios pass locally, but the complete performance gate still
rejects server HTML p95 on this machine. The browser JSON-tab selector is scoped
correctly; Linux WebKit's native-color focus failure remains under investigation
with new before/after diagnostics. See [PERFORMANCE.md](PERFORMANCE.md).
No ledger row, percentage, CommonMark score, or release is promoted.

Latest blank-line visual follow-up (2026-10-06, Unreleased): a real saved-file
audit found and fixed blank paragraphs collapsing to 0px outside the editor.
The default HTML stylesheet and workshop reader now preserve each paragraph's
computed line height, including empty marks, without adding document content.
The public workshop downloads standalone HTML; recorded checks open that actual
file and compare its blank-line geometry with the editor/reader. Full gate:
**2,619 tests / 196 files**. Nine three-engine workflows are recorded; detailed
evidence is in `artifacts/html-blank-lines-visual-verification-20261006.json`.
Themes remain independent; native page/print equivalence remains unproven.
Ledger and CommonMark scores are unchanged. Next: remaining format retention
and actual appearance gaps, not HTML screen evidence substituted for native print.

Latest childless-paragraph follow-up (2026-10-06, Unreleased): HTML now retains
the distinction between genuinely childless paragraphs and empty caret leaves,
including nested Markdown HTML carriers. Both importers refuse to hide children
behind a marker. The DOCX font-context test now compares complete HTML-reopened
JSON without the old empty-leaf exception. Full gate: **2,618 tests / 196 files**;
six recorded three-engine workflows; six new images directly inspected and 24
block-regression images hash-verified. See
`artifacts/html-empty-paragraph-visual-verification-20261006.json`.
This does not certify unfilled paragraph print geometry or arbitrary text-leaf
segmentation. The ledger remains 58 Delivered / seven Partial / two Host
boundaries; CommonMark stays 563/652 default and 613/652 strongest opt-in.
Next: verify blank-line export appearance alongside the remaining HTML/Markdown
retention gaps. No release or percentage promotion.

Previous block-preservation checkpoint (2026-10-06, Unreleased): the isolated
`html/inert` entry now supplies registered unknown **block** wrappers with
editable structured children and bounded inert tag/attribute/token data.
Empty imports remain empty until explicit undoable paragraph authoring.
Real browser editing exposed a document-wide HTML recovery bug: canonical saved
empty paragraphs were classified as unsupported and forced literal-source
fallback. They now use existing offset-bound protected slots; implicit list/quote
caret fillers are unchanged. Original custom elements, handlers and CSS never
activate. Native JSON remains the exact backup; canonical adjacent text-leaf
differences remain explicitly documented and tested. The childless paragraph
follow-up now preserves that empty shape through HTML and nested Markdown HTML
carriers without changing ordinary empty-paragraph caret behavior.

Final unchanged-source gate: **2,606 tests / 195 files**, 409 declarations,
packed ESM/CJS, pure Node/workerd and existing performance/memory limits.
Twelve recorded workflows pass across Chromium/Firefox/WebKit, no retries.
All 24 block captures are visually verified (18 exact matches to captures directly
inspected this turn, six fresh direct inspections); 18 raw-source captures are
byte-checked against inspected evidence or inspected when changed. The remaining
39 regression captures are recorded, not claimed re-inspected this checkpoint.
Evidence: `artifacts/html-inert-block-visual-verification-20261006.json`;
685-file source: `artifacts/html-inert-block-production-source-final-20261006.json`.
CommonMark remains **563/652 default / 613/652 strongest opt-in**. The ledger
stays 58 Delivered / seven Partial / two Host boundaries. No percentage, row or
release promotion. Next: remaining HTML/Markdown retention and canonical-shape
gaps, not active behavior or score inflation.

Previous source-bound URL checkpoint (2026-10-06, Unreleased): imported HTML
navigation now remains separate from literal Markdown backslash data. Optional
bounded `link.htmlHref` preserves source intent only when bound to typed href;
unsafe schemes/authorities and forged/conflicting carriers remain rejected.
Manual link editing clears origin. Reviewed version-11 opt-in scores are
579/580/601/**613**, with default **563** unchanged. Raw HTML example 21 is
repaired; cases 642/643 match in whole-document profiles because browser
navigation is retained, not because encoded controls are falsely aliased.
There are still 39 strongest-profile differences. Older counts below are
historical. No row/percentage or release promotion.
[Destination contract and evidence](MARKDOWN_DOCUMENT_FLOW.md#link-destination-integrity-and-oracle-correction).

Previous URL frozen complete gate: **2,585 tests / 194 files**, 409 declarations,
packed ESM/CJS and Node/workerd (**486 link contracts each**), with existing
performance/memory/entry/CSS limits. Evidence:
`artifacts/html-link-origin-complete-gate-final-20261006.log`; source:
`artifacts/html-link-origin-production-source-final-20261006.json` (682 files).
The 67-row roadmap stays 58 Delivered / seven Partial / two Host boundaries;
roughly 87% row coverage is not an estimate of remaining engineering effort.

Final unchanged-source recording passes **42 workflows** across three desktop
engines, with no retries. All 36 fresh link screenshots are directly inspected;
18 raw-source captures are byte-checked or inspected when changed. Evidence:
`artifacts/html-link-origin-visual-verification-20261006.json`.
Next fidelity work concerns the remaining malformed/unknown/active HTML and
source-retention boundaries, without enabling script/CSS behavior to inflate
the score. Physical-device coverage and wider native-document fidelity stay open.

The preceding version-10 frozen complete gate passes **2,569 tests / 193 files**,
409 public declarations, packed ESM/CJS, Node/workerd (473 link contracts each),
framework types and unchanged latency/scaling/heap/entry/CSS limits. Everything
below remains the historical evidence for its own source checkpoint, not an
assertion that the latest changes are already in the published package.

That preceding frozen source passes **42 recorded three-engine input workflows**
with no retries. All 24 link and 18 raw-source screenshots are visually verified
directly or byte-matched to prior inspected captures; videos/traces are retained.
Physical mobile/IME, remaining HTML fidelity and the remote release matrix
remain open. See the destination contract for exact evidence and limitations.

Inert raw-text follow-up (2026-10-06, Unreleased): a separate, explicit
`createInertHTMLRawTextExtension` captures script/style/textarea source as
editable literal code with bounded metadata and safe carriers, never active
HTML. Unicode stays text rather than emoji atoms; supported user-applied
display marks survive canonical reopening. Altered badges cannot hide media.
Recorded human input reproduced a Chromium empty-source pointer bug; empty
inline code now fills its existing identity/attributes rather than redirecting
typing or replacing the node. Nonempty inline replacement remains unchanged.

The complete gate passes **2,551 tests / 191 files**, 409 declarations,
packed ESM/CJS, pure Node/workerd source/edit/history/reopen checks, headless and
framework types, and existing latency/scaling/heap limits in
`artifacts/html-inert-raw-text-complete-gate-checked-20261006.log`.
The optional entry and aggregate code have explicit measured size allowances;
this is not an unchanged-size claim. Nine no-retry recorded public workflows
pass across Chromium/Firefox/WebKit in
`artifacts/html-inert-raw-text-recorded-fixed-20261006.log`; all 18 new raw
editor/data/reader/narrow-width/empty-source captures are visually inspected.
Retain initial pointer, click-target and history-grouping failures. The latest
675-file source snapshot is
`artifacts/html-inert-raw-text-production-source-checked-20261006.json`.

On that unchanged source, the final no-retry recording passes **36 selected
desktop workflows** (12 per engine) in
`artifacts/html-inert-raw-text-recorded-regressions-20261006.log`: source
preservation plus ordinary code keyboard entry, reverse pointer/keyboard
selection, inline-atom deletion, repeated empty paragraphs, quote exit and
typing history. All 18 fresh raw captures are SHA256-identical to the inspected
captures; three additional code-focus captures are inspected. See
`artifacts/html-inert-raw-text-visual-verification-20261006.json` for scope.

No CommonMark score, parity row or completion percentage changes: 563/652
default and 611/652 strongest existing opt-in remain. Literal source retention
does not reproduce original HTML semantics or layout. Physical mobile/IME,
declaration semantics and remaining wrapper/reference/escaping mismatches are
still open. Next: inspect those remaining cases against the reference semantic
projection, preserving Fountain's model and source/security boundaries; never
erase empty content/filler to raise a score. See
[the explicit raw-text contract](HTML_INERT_SOURCE.md#explicit-raw-text-source-capture).

Unfinished raw-HTML retention follow-up (2026-10-06, Unreleased): reproduced
silent source consumption in both Markdown flow profiles for incomplete tags
(CommonMark 156–158). Speculative conversion now refuses `eof-in-tag`, keeping
editable literal source with an explicit fallback even after diagnostic slots
are exhausted. Complete opening tags may still use normal HTML repair. Direct
HTML import deliberately keeps parser-repair semantics and reports omission;
the public Node/Markdown workshop exposes both paths and real diagnostics.

Evidence: **2,524 tests / 190 files** in
`artifacts/markdown-incomplete-complete-gate-final-20261006.log`, including
packed ESM/CJS, pure Node and workerd guard/source/reopen checks and unchanged
performance/size caps. Six recorded public workflows pass across three engines
in `artifacts/markdown-incomplete-recorded-checked-20261006.log`; all 15 new
unfinished-source captures are visually inspected. The first recording's
center-click/Home test error is retained, then corrected to click the intended
first visual line. That browser-only correction follows the complete gate;
runtime source is unchanged, with a fresh type check and browser recording.
The 673-file checked snapshot is
`artifacts/markdown-incomplete-production-source-checked-20261006.json`.

This is a retention/reliability fix, not a conformance-score gain or parity-row
promotion. CommonMark remains 563/652 default and 611/652 strongest opt-in.
Next: safe representations for remaining unknown wrappers, declarations and
special raw-text semantics; do not erase filler/content just to raise a score.
See [the boundary](MARKDOWN_DOCUMENT_FLOW.md#unfinished-tag-retention-guard-2026-10-06-unreleased).

Production source-boundary follow-up (2026-10-06, Unreleased): the private
experiment is now an opt-in server token API and isolated `html/inert` factory.
Registered unknown inline tags retain bounded attributes and lexical data with
editable children, never their original behavior/layout. A reproduced carrier
bug silently dropped added visible siblings; altered shells now decline that
projection. Dotted tags are HTML input, not CommonMark inline-HTML syntax.

Complete gate: **2,507 tests / 189 files**, 409 public declarations, packed
ESM/CJS, pure Node/workerd interchange/history, headless source/types and existing
latency/scaling/heap limits. Optional module size has explicit separate entry
and aggregate allowances, not an unchanged-size claim. Nine recorded workflows
pass across Chromium/Firefox/WebKit: production inline source, comments and
cleared anonymous flow. All 24 new inline captures are inspected. Early carrier,
startup, format-boundary and offscreen-capture failures remain in the audit logs.

The discoverable Node/Markdown workshop and developer guide use the real module.
See [the contract](HTML_INERT_SOURCE.md). Default schema, 563/652 default and
611/652 strongest existing CommonMark profile, and parity rows are unchanged.
Next: remaining structural/raw-HTML parser cases and their explicit security/
source-loss boundaries. No release, rename or native-layout certification here.

Visual/source-boundary follow-up (2026-10-06, Unreleased): visual inspection of
all 27 selected-regression captures finds scrolled text bleeding through the
shared sticky header. An opaque background replaces translucent blur. The new
reader assertion fails first in Firefox, then six recorded desktop/mobile-width
reader/selection journeys pass across three engines; the six relevant corrected
captures are inspected. Eighteen private inert-source edit/history/Markdown
reopen cases also pass and all 18 captures are inspected on unchanged source.
These are selected regressions, not a full matrix or physical-device proof.

A separate artifact-only lexical-token experiment passes 145 assertions,
including original HTML quote/case/order, CRLF, omitted end tags, nested query
wrappers, import isolation and the four unresolved unknown-inline Markdown
examples. It does not ship a source API or promote reference conformance.
The crucial distinction is parser-input tokens/UTF-16 offsets versus original
Markdown-file source: synthetic flow offsets must never be presented as file
coordinates. Next: define that provenance-aware, bounded source capability and
harden the inert extension's generic registration/security contracts before
shipping it. See [the lexical boundary](MARKDOWN_DOCUMENT_FLOW.md#lexical-token-boundary-experiment-2026-10-06).

Streaming selection lookup follow-up (2026-10-06, Unreleased): replace the
full-document text-leaf table with a bounded walk and reusable path buffers.
Independent oracle, empty/marked/atomic/nested boundaries and four compiled
consumers agree with the previous resolver. The serialized complete gate now
passes all 2,457 tests / 186 files and unchanged size/performance/heap limits;
10k local-edit median is 2.62 ms with 7.22x scaling / 15x. Fifty-one recorded
Chromium/Firefox/WebKit desktop regressions pass on unchanged 664-file source.
The earlier failed sample and unmerged child-validation proposal below remain
historical evidence, not current-source results. No parity row, percentage,
CommonMark score or release promotion. Visual inspection catches sticky-header
text bleed-through, which needs a separate visual correction. Next: finish that
regression, then the inert unknown-source and lexical import boundary. See
[current performance evidence](PERFORMANCE.md#streaming-text-point-lookup-2026-10-06-unreleased).

Schema-owned Markdown projection follow-up (2026-10-06, Unreleased): explicit
`NodeSpec.markdown: 'html'` reuses sanitized HTML export instead of flattening
an opted-in custom node. Neighboring paragraph/heading formatting and literal
newlines survive the matching-reader boundary. Fifteen new tests cover complete
native reopening, history and security filtering. Types and all 2,453 tests /
185 files pass separately; 18 recorded Chromium/Firefox/WebKit actual Markdown
edit/export/reopen cases pass and all captures are inspected, against unchanged
663-file source hashes. The unknown-inline schema remains a private, three-tag
prototype, not a shipped universal importer. Existing CommonMark scores and
roadmap rows/percentage remain unchanged.

The serialized package gate passes build/API/runtime/headless/format/size checks
but fails local median growth at 16.85x / 15x; retain that failure, not a full
green claim. An isolated child-validation proposal removes 9,999 redundant Array
iterator creations from a 10,000-block edit, with complete edited JSON, 576
integrity checks per variant and matching mutable/invalid/foreign-sibling errors.
Its paired timings are mixed (10k candidate medians improve but p95 worsens),
so it is not integrated and does not clear the gate. Its first diagnostic failed
because the headless export does not expose `CoreSchemaSpec`; an explicit
extension import corrects the harness without changing production exports.
Next: validate the remaining hot-path allocation boundaries and stabilize the
normal performance gate, then harden a reusable inert-source extension and
its lexical/source import contract. See
[the preservation evidence and limits](MARKDOWN_DOCUMENT_FLOW.md#schema-owned-markdown-html-boundary-2026-10-06)
and `artifacts/schema-child-walk-prototype-checked-20261006.log`.

Native-instance and owned-attribute integrity correction (2026-10-06,
Unreleased): after the frozen desktop matrix terminates, native `Node`/`Mark`
instances are runtime-frozen and `computeAttrs` uses own-property membership
with a prototype-free scratch builder. This prevents field replacement changing
old snapshots/cached child ownership, preserves own keys such as `constructor`
and `__proto__`, and refuses inherited required/default values. Final public
attributes remain frozen ordinary objects; non-portable mutable values remain
uncached. Permanent tests first reproduce 23 failures; after correcting one
fixture's expected image-error wording, all 29 new regressions and 2,430 total
tests / 183 files pass. Packed ESM/CommonJS root/core, pure Node and workerd each
pass 384 attribute/reopen checks plus instance/history/cache-refusal assertions.
Thirty-three recorded Chromium/Firefox/WebKit editing, backward selection,
Enter/deletion, history, paste and collaboration cases pass against unchanged
661-file hashes; all three new instance-editing captures are inspected.
The initial complete gate stops 40 bytes above the unchanged ESM budget.
Shared text/block cache-decision code then removes duplication without relaxing
validation or allocating child arrays for text; the final-source complete gate
and repeated browser run are verified separately. The repeated batch again
passes all 33 cases with unchanged source; the complete gate hits an Angular
import failure during a concurrent rebuild, so it is not marked green.
A further native text-node JSON audit reproduces discarded metadata and
required attributes: 17 expanded regressions fail before the one-line reopening
fix, then all 30 new tests / 89 focused tests pass. The compiled fixture now
covers 576 attribute/reopen checks per consumer, including text metadata and
required-value validation. Its first assertion wrongly requires root JSON field
ordering; that retained harness failure is corrected without changing native
meaning or dropping attributes. The serialized final gate passes API, package,
Node/workerd, headless, CommonMark, math, DOCX and unchanged size checks, then
fails the 100-block HTML p95 ceiling (40.89 ms / 35 ms). The 5,000-block median/p95
is 274.91/486.44 ms; 10,000 is 530.84/581.45 ms. This is retained in
`artifacts/model-integrity-serialized-checked-gate-20261006.log`, not hidden by
earlier passes. Final-source type checks and all 2,431 tests / 183 files then
pass in a separate non-rebuilding run. The final-source recorded batch also
passes all 33 cases after the text-attribute correction, with all 661 source
files unchanged and all three new editor captures inspected. Evidence:
`artifacts/model-text-attrs-final-unit-20261006.log`,
`artifacts/model-text-attrs-final-typecheck-20261006.log`,
`artifacts/model-text-attrs-final-browser-20261006.log`, and
`artifacts/model-integrity-text-checked-source-20261006.json`.
HTML tail latency remains open. No schema/type/state
mutation closure, full file retention, physical-device IME, release or parity-row
promotion is claimed. Source: `src/core/schema/{node,mark,schema}.ts`;
regressions: `tests/model-integrity.test.ts`,
`scripts/fixtures/model-integrity-check.mjs`,
`tests/browser/model-integrity-journey.ts`. Earlier diagnostic artifacts remain
as before-fix evidence, not current production behavior.

Allocation and simple-expression follow-up (2026-10-06, Unreleased): the initial
artifact-only optional-ancestor-set proposal
avoids constructing an empty Set before primitive-value checks, while preserving
recursive cycle tracking and immutable-cache refusal. Baseline and proposal each
pass 576 compiled model checks, nine nested/cycle/non-portable comparisons, and
three complete HTML/issue comparisons. A 100-paragraph create/validate counter
measures 2,006 Set constructions in the baseline versus 1,205 in the proposal.
The retained paired timing experiment has mixed results; fewer allocations
alone do not prove a universal latency improvement. The helpers are then
integrated in `src/core/schema/{node-spec,schema}.ts`, with three permanent
primitive/nested/cycle tests. The first integrated complete gate passes HTML
latency, but fails local median scaling at 15.31x / 15x. Both the timing and
failure logs remain in `artifacts/model-allocation-timing-20261006.log` and
`artifacts/model-allocation-complete-gate-20261006.log`.

The content matcher creates 20,004 position Sets for one 10,000-child `block+`
check. A direct cardinality/membership path for a top-level repeated name
removes those Sets while retaining the general matcher for choices, sequences
and nested expressions. The isolated prototype compares 148,428 results against
the unchanged matcher and complete edited JSON, measuring 20,013 versus three
Sets for an actual 10,000-block edit. Permanent independent membership tests
cover 21,868 cases, live group changes and foreign-schema refusal. The initial
fixture incorrectly labels an empty choice arm invalid; it is corrected to
preserve the existing grammar, not changed to force the implementation to fit.
The internal parser now uses actual private fields/methods, with no public API
change. Keep the before-fix failure and prototype logs.

The integrated serialized `pnpm check` passes all 2,438 tests / 184 files,
type checks, 407-file API checks, packed ESM/CommonJS, pure Node/workerd,
headless, CommonMark, math, DOCX and unchanged size/performance/heap limits.
Local 10,000-block p50/p95 is 4.97/9.10 ms, with 7.35x median growth; HTML
10,000-block p50/p95 is 451.68/483.90 ms, with 8.96x growth. This is a passing
current-source sample, not proof of the cause of every historical latency
outlier. Evidence: `artifacts/content-matcher-complete-gate-20261006.log` and
`artifacts/content-matcher-integrated-source-20261006.json` (662 files).
The first recorded batch finishes 32 pass / one Chromium startup failure with
all 662 source hashes unchanged. The failed capture is blank, and its trace
records two document loads while Vite discovers cold dependencies: the fixture
accesses its API before the editor module is ready. Keep
`artifacts/content-matcher-browser-20261006.log`, the failed screenshot/video/
trace, and `artifacts/content-matcher-startup-trace-20261006.mjs`. The browser
contract now explicitly asserts API readiness and a visible editor after
navigation, without sleeping, relaxing timeouts or retrying failed edits.
The new frozen snapshot is `artifacts/content-matcher-ready-source-20261006.json`;
the editing repeat passes all 33 Chromium/Firefox/WebKit cases with all 662
hashes unchanged. All three new instance-editing captures are visually inspected
and retain the edited link, separate paragraph and full diagnostic attributes.
Recordings: `artifacts/content-matcher-ready-browser-20261006.log` and its
video/trace/capture directory. This does not claim all development
reloads are fixed. No physical-device, full file fidelity, CommonMark score,
release or parity-row promotion follows.
The separate structural batch also passes all 18 recorded three-engine cases
with the same 662 hashes: editable code language changes, nested table paste,
full-block drag feedback across content kinds, merged-table operations,
1,000-block DOM reuse/input-to-paint and 100,000-block virtualization with
distant selection, synthetic composition, copy and print restoration.
Evidence: `artifacts/content-matcher-structure-browser-20261006.log`. The large
document checks measure the actual editor view, not physical-device typing.
The final serialized complete gate, including the readiness-fixture change,
again passes all 2,438 tests / 184 files and every unchanged API/runtime/type/
format/resource check. Local 10,000-block p50/p95 is 5.36/12.89 ms (10.16x
median growth), HTML is 448.56/527.02 ms (8.61x), and retained HTML heap is
14.30 MiB. Evidence: `artifacts/content-matcher-ready-complete-gate-20261006.log`.
Current-package edits of four remaining unknown-inline HTML examples confirm
exact untouched/undo-restored source, but edited canonical output cannot restore
the identities/attributes already removed by reported import. Empty export
losses are not an end-to-end fidelity guarantee; see
[the diagnosis and next boundary](MARKDOWN_DOCUMENT_FLOW.md#unknown-inline-html-after-a-visual-edit-2026-10-06).

Native Markdown follow-up (2026-10-06, Unreleased): the native delimiter stack
passes 6,674 generated LF/CRLF independent-meaning, exact-source and complete
native canonical checks. Caller-schema testing also reproduces and fixes
unsupported mark delimiters shifting supported emphasis onto the wrong span.
One hundred forty compiled full/partial-schema checks run in packed ESM/CommonJS,
Node and workerd without a DOM or reference parser. The complete package gate
passes 2,401 tests / 182 files and unchanged API/resource checks. Six recorded
issue-edit/history/download/reopen cases pass before the partial-schema fix;
the final-source repeated batch then passes all 18 cases with unchanged 658-file
hashes, and all 15 first-repeat editor/reader/partial-schema captures are reviewed.
The later final-source gate fails the unchanged 5,000-block HTML p95 ceiling
(556.19 ms / 500 ms); a passing standalone GC-traced diagnostic does not close
that unexplained outlier. The independent broad desktop matrix finishes with
601 pass / 17 skip / zero failures and unchanged 658-file hashes; it predates
the later model-integrity correction and cannot replace resource evidence.
The earlier broad
592-pass matrix predates both parser changes and cannot certify them.
Official scores remain 563 default / 611 opt-in, with no parity-row, percentage
or release promotion. See [the current source evidence](MARKDOWN_DOCUMENT_FLOW.md#partial-schema-delimiter-scope-2026-10-06).

Generated Markdown diagnosis (2026-10-06, Unreleased): 3,337 pure-Node
delimiter/link/code paragraph probes reveal 291 reference-semantic mismatches,
despite exact original-source retention and stable canonical meaning in every
probe. Small surplus-run and nearest-opener cases are now retained. An isolated
artifact-only fallback experiment fixes 145 but introduces a new overlap error;
it is rejected as a production fix. No editor/source/distribution change is made
during the frozen browser matrix, and no official score or parity row is promoted.
Resolve delimiter precedence with permanent regressions and independent reference
and actual editing proof; see [the diagnostic evidence](MARKDOWN_DOCUMENT_FLOW.md#generated-delimiter-neighbors-2026-10-06).

Scrolling/flow-retention follow-up (2026-10-06, Unreleased): the named-status
browser batch reproduced WebKit's missed output activation (eight pass / one
fail). Immediate native scrolling replaces the site-wide smooth-scroll rule;
24 repeated three-engine glossary/wrapper/format/DOCX cases and six original
paragraph-recovery cases pass. The 24-case remaining-Markdown diagnosis also
found and fixed a literal trailing-newline loss in the canonical anonymous-flow
carrier, independently of unsupported HTML semantics. The focused unit batch
passes 74 tests; nine recorded flow export/reopen/editing cases pass in all
desktop engines. Six format and six newline captures are inspected with tall
element-capture/sticky-header findings retained. The complete package gate
passes 2,383 tests / 181 files, 407 declarations, 88 headless modules and the
runtime/type/format/resource checks without raised limits. The full cold desktop
matrix finishes with 592 passes, 17 explicit skips and zero failures, and all
654 source files match its snapshot. This proves the pre-delimiter source,
not the subsequent parser follow-up.
Scores remain 563 default / 611 opt-in; 58 Delivered / seven Partial / two Host
boundary rows remain unchanged. See [the scrolling evidence](DOCX_FIDELITY_CHECKPOINT.md#native-control-scrolling-follow-up-2026-10-06)
and [the Markdown diagnosis](MARKDOWN_DOCUMENT_FLOW.md#adapter-diagnosis-and-literal-flow-newline-retention-2026-10-06).

Announcement follow-up (2026-10-06, Unreleased): the new full matrix exposed a
glossary assertion matching two legitimate status regions. That owned run was
interrupted, with its failure and matching source snapshot retained. Import and
export announcements now have distinct accessible names; the warning assertion
is retained and import readiness is checked separately. Nine UI plus 13
conversion cases pass. Recorded three-engine verification subsequently exposes
the output-selection failure addressed above; the new complete gate passes.
No parity promotion. See [the evidence](DOCX_FIDELITY_CHECKPOINT.md#separate-import-and-export-announcements-2026-10-06).

Cold-cache recovery follow-up (2026-10-06, Unreleased): a private fresh-cache
startup reproduces the registered-wrapper import reload. Pre-optimizing its
three lazy parser dependencies passes the original journey in all three engines,
with six desktop/narrow editor captures inspected. The new permanent cold-audit
configuration passes 12 recorded recovery/readiness/format-selection journeys;
18 additional scoped UI images are inspected, with Firefox capture overlap and
other visual findings retained. A permanent isolated cold-import command is
added and its literal invocation passes all three projects. The complete serial package gate
passes 2,373 tests / 181 files plus runtime/type/format/resource checks without
raising limits. WebKit's original output-tab failure remains unexplained/open;
the original 583-pass/17-skip/three-failure matrix remains failed. No row or
percentage promotion. See [the scoped evidence](DOCX_FIDELITY_CHECKPOINT.md#cold-cache-html-recovery-follow-up-2026-10-06).

The replacement full desktop matrix was interrupted after the selector failure
above. It used zero retries and a 653-file pre-run snapshot including root Vite
configuration; all hashes matched at interruption. A new full run remains required;
neither the 12-case follow-up nor the complete package gate replaces this proof.

Headless-file readiness follow-up (2026-10-06, Unreleased): the frozen desktop
matrix finished with 583 passes, 17 explicit skips and three failures. Eight new
UI cases plus 13 adapter cases now pass after fixing false idle validity, missing
loading feedback, stale asynchronous imports/errors and export of a previous
file during replacement. The recorded three-engine handoff follow-up passes;
the newer complete package/type gate passes as above, but there is no new broad
browser pass. The reload has a scoped fix above; WebKit scrolling and visual
findings remain open. Keep the existing parity row
statuses and percentages. See [the scoped evidence](DOCX_FIDELITY_CHECKPOINT.md#headless-file-readiness-follow-up-2026-10-06).

Configuration-control follow-up (2026-10-06, Unreleased): nine supplied forms
have named, instance-local trigger ownership and keyboard opening/closing focus;
native fields retain their editing keys, and mutation repair cannot steal focus
from external controls with an old editor Range. Real visual review also found
and fixed settled hover contrast and clipped desktop Link/Find controls. The
recorded 33-case batch passes before the last layout change; the strengthened
six-case focus/containment/hover follow-up passes on that final layout. The final
interactive scan passes 72 states (66 axe, six empty-sandbox DOM-only), retaining
66 states with manual findings. All 72 final panel/reader images have now been
inspected; Firefox sticky-header overlap, faint WebKit placeholders and narrow
checkbox spacing remain explicit follow-ups, not a blanket visual pass.
The complete serial package gate passes 2,365 tests / 180 files
plus runtime/type/resource checks, with no performance-limit increase. The new
603-case desktop matrix subsequently finished with three failures, as above.
Keep 58 Delivered / seven Partial /
two Host boundary rows (67 total); accessibility and production readiness remain
Partial. No release or percentage promotion. See
[the evidence and retained failures](DOCX_FIDELITY_CHECKPOINT.md#configuration-panels-and-external-focus-follow-up-2026-10-06).

Keyboard/source-safe accessibility follow-up (2026-10-05, Unreleased): continuous
mixed-format links preserve model paths/source, keyboard code browsing no longer
captures an unrelated caret, native code paste preserves literal newlines, and
whole-block feedback retains source backgrounds. The frozen focused browser
batch passes 25 checks with two explicit Chromium-only clipboard skips; the
initial main-page accessibility scan passes 36 states, all with manual checks
still open. The complete serial package gate passes 2,345 tests / 178 files,
including runtime/type/size/performance/memory checks; the earlier performance
failure remains retained and the unchanged 120 ms check passes at 64.98 ms.
No full-matrix/WCAG or release claim follows. The current parity
catalogue contains 67 rows: 58 Delivered, seven Partial and two Host boundary;
about 87% is row coverage, not remaining-effort completion. No row is promoted.
See [the evidence and retained performance failure](DOCX_FIDELITY_CHECKPOINT.md#keyboard-and-source-safe-accessibility-follow-up-2026-10-05).

Accessibility/real-control follow-up (2026-10-05, Unreleased): the initial
six-route desktop/narrow Chromium scan found violations in all 12 states,
including unannounced table resize values, weak contrast, label/name differences
and undersized checkboxes. The table fix announces logical column widths before
interaction, through preview/cancellation and history, with private weakly cached
geometry instead of per-cell grid rebuilds. Real three-engine use exposed and
fixed both selection synchronization stealing handle focus and an obsolete
queued selection overwriting a newer nested transaction. The final six recorded
table/editing checks pass; all six final images were inspected. The focused
table/view/toolbar batch passes 65 tests. Accessibility scanners and the pinned
test-only oracle keep rule failures and incomplete/manual checks visible, not
excluded. Full-page scans remain separate from menus, readers, screen readers
and physical devices. No PROD-03, parity percentage or release promotion.
See [the detailed evidence](DOCX_FIDELITY_CHECKPOINT.md#accessibility-and-table-control-follow-up-2026-10-05).

Current validation follow-up: the complete recorded three-engine audit finished
with 568 passes, 15 explicit capability skips and two failures. Firefox lost the
HTML-comment reader capture; WebKit read the initial JSON pane before the editor
effect committed, before any save/export. A bounded reader-snapshot ownership
change and actual-document readiness wait pass 18 recorded follow-up cases
(three repeats per desktop engine), with 12 representative captures inspected.
The focused four-file unit batch passes 33 cases; the new complete serial local
gate passes 2,325 tests / 176 files, with packaging, headless runtimes, type,
size/performance and memory checks. It is not an updated broad browser pass. No row,
percentage or release promotion. See [the checkpoint](DOCX_FIDELITY_CHECKPOINT.md#source-owned-quote-appearance-and-desktop-audit-2026-10-05).

Latest desktop/DOCX audit (2026-10-05, Unreleased): real export inspection found
and fixed doubled source-owned quote decoration, including borderless native
reopening. Caption editing, Undo/Redo and native re-export compare complete JSON;
independent-preview header omissions stay visible. The serial full local gate
passes 2,322 tests / 175 files, 407 declarations and 88 headless modules. A broad
Chromium run passed 195 checks before the quote change; the subsequent focused
quote/list batch passes six three-engine checks and the strengthened quote batch
passes three, with all nine final images inspected. Broad current-tree browser
verification is separate. Native Word, physical-device, full-CommonMark and
general-format fidelity remain open; no row/% or release promotion. Narrow size
allowances and retained failures are documented in
[the checkpoint](DOCX_FIDELITY_CHECKPOINT.md#source-owned-quote-appearance-and-desktop-audit-2026-10-05).

Latest mixed-table source follow-up (2026-10-05, Unreleased): supported pipe
tables no longer refuse otherwise supported whole-document HTML conversion.
Fresh syntax-derived cells/references/defaults validate original table subtrees;
active/flattening/modified contexts still refuse safely. A discoverable workshop
tests actual cell typing, navigation, history and reopening. The complete local
gate passes 2,315 tests / 174 files, with compiled ESM/CommonJS/Node/workerd proof.
Six paired desktop journeys pass; 21 table images and six additional reader
checkpoints were inspected. Reader row spacing differs from the static reference;
physical-device/full-CommonMark/general-format fidelity remain open. Scores stay
563 default / 611 opt-in. No row, percentage or release promotion. See
[the contract and retained capture failures](MARKDOWN_DOCUMENT_FLOW.md#protected-markdown-tables-2026-10-05).

Latest Markdown block-atom follow-up (2026-10-05, Unreleased): syntax-derived
standalone images and dividers now survive the optional whole-document HTML
source route, retaining original nodes and complete attributes with refusal
guards. Actual browser use also exposed and fixed Save/Reopen writing into image
caption/status controls. The full local gate passes 2,298 tests / 173 files;
compiled ESM/CommonJS and workerd checks pass. Reference scores stay 563 default /
611 opt-in, and full CommonMark remains open. No row/% or release promotion.
Three recorded desktop-engine workflows pass, and all 18 final images were
visually inspected; responsive fit is not physical-device certification, and
reader image alignment still differs from the reference.
See [the contract](MARKDOWN_DOCUMENT_FLOW.md#protected-markdown-block-atoms-2026-10-05).

Latest table-text follow-up (2026-10-05, Unreleased): supported base/conditional
run and paragraph declarations now survive the existing native cascade, editing
and reopening. Word absolute table toggles and nested-table context are explicit;
Normal/default precedence still warns pending native evidence. The complete local
gate passes 2,283 tests / 172 files, with 407 declarations and 88 headless modules.
Six recorded browser workflows pass and all 30 new images were inspected. Native
page verification, wider layout and FORMAT-05 remain open; no row/% promotion.
See [the checkpoint](DOCX_FIDELITY_CHECKPOINT.md#table-owned-text-formatting-2026-10-05).

Latest table-style follow-up (2026-10-05, Unreleased): supported base inheritance
and conditional cell appearance now materialize as editable declarations. Word
region precedence, look flags/bands, grid spans and row-wide conditional margins
are covered. Six recorded desktop import/edit/history/export/reopen workflows
pass; all 30 images were inspected. The behavioral suite has 2,267 passes / 171
files. A complete performance attempt failed at 16.89x remote growth; the isolated
rerun passed at 9.39x without changing the 15x limit. Native rendering is still
unavailable; the independent preview misses source conditional rules and is not
a native oracle. Table text/row/RTL/native layout and FORMAT-05 remain open.
No percentage, row or release promotion. See
[the checkpoint](DOCX_FIDELITY_CHECKPOINT.md#inherited-and-conditional-table-appearance-2026-10-05).

Latest table-repeat follow-up (2026-10-05, Unreleased): native Word row repetition
is independent of semantic header cells and no longer invents coloured/bold
headers. The lab exposes a separate repeat action. Recorded real use found and
fixed explicit empty text/run-mark loss in DOCX. The final complete gate passes
2,235 tests / 169 files; 18 targeted recorded desktop checks pass in four batches,
and all 27 new source/editor/export/reopen/page-stack captures were inspected.
Explicit on/off, typing/history, safe repeated copies and merged-table regressions
are covered. Narrow additive code-size allowances are documented rather than
claiming unchanged size budgets. Native Word rendering is still unavailable,
third-party save retention and broader table styles/layout remain unverified.
No row, release or percentage is promoted. See
[the evidence and limits](DOCX_FIDELITY_CHECKPOINT.md#row-repetition-and-empty-run-retention-2026-10-05).

Latest cleared-flow retention follow-up (2026-10-05, Unreleased): canonical
Markdown now preserves a cleared unmarked caret leaf separately from a genuinely
childless `html_flow`. Existing node-selection typing fills childless flows;
ordinary paragraphs and native empty reader output are unchanged. The workshop
adds sample selection and explicit saved-source reopening, and reader snapshots
replace their sandboxed frames rather than superseding pending preview navigation.
The serial complete gate passes 2,206 tests / 167 files, with the unchanged
407-declaration and 86-module boundaries. The independent Windows WebKit
event-authored clipboard limitation is explicitly not Safari certification.
No parity row, percentage, release or whole-format claim is promoted. See
[the contract](MARKDOWN_DOCUMENT_FLOW.md#optional-anonymous-inline-flow-2026-10-05-unreleased).
The final recorded regression batch has 14 passes / one explicitly excluded
Windows WebKit clipboard case, with all 22 new capture images inspected. The
editing/reader journeys themselves pass in all three desktop engines; real
internal/external clipboard transfer passes in Chromium and Firefox.

Latest anonymous-flow follow-up (2026-10-05, Unreleased): optional
`HTMLFlowExtension` retains anonymous inline HTML without invented paragraph
spacing. The linked-whitespace case has two editor/native-reader paragraphs,
with exact reference paragraph geometry at desktop and narrow widths across
Chromium, Firefox and WebKit. Recorded actual typing, Enter, deletion and undo
pass; native/canonical model reopening passes in Node/workerd. The additional
reference profile remains 611/652, not a conformance-score promotion. The full
gate passes 2,194 tests / 167 files with 407 declarations and an 86-module
headless graph. Native Word/whole-format fidelity, broader layout and production
confidence remain open. No release, row or completion-percentage promotion. See
[the contract](MARKDOWN_DOCUMENT_FLOW.md#optional-anonymous-inline-flow-2026-10-05-unreleased).

Latest CommonMark/comment follow-up (2026-10-05, Unreleased): optional inert HTML
comments now survive browser/server import, real author editing, native HTML and
canonical Markdown reopening. Comment data is not executable or private, and
unsupported projections still report losses. A real keyboard-copy journey found
and fixed author-UI text leaking into an explicitly empty text projection.
The additional opt-in profile matches 611/652 reference examples on both LF/CRLF,
up twelve from the unchanged container-only 599 profile; the default remains
563/652. The complete gate passes 2,179 tests / 165 files, with 405 public
declarations and an 85-module headless boundary. Twelve recorded scope/section/
comment regressions pass across Chromium, Firefox and WebKit; the strengthened
comment-only keyboard/copy/delete/undo journey separately passes in all three.
Reader output was inspected in dedicated visible-frame captures, not certified
from off-screen white regions in an oversized screenshot. Native Word fidelity,
formatted-whitespace layout, unsafe/unknown HTML and wider parity remain open.
No publication or completion-percentage promotion. See [the contract](MARKDOWN_DOCUMENT_FLOW.md).

Latest HTML page-settings follow-up (2026-10-05, Unreleased): supported physical
settings now survive standalone HTML download and browser/server reopening as
validated inert body metadata. Fragments do not transfer document settings.
Word paragraph-mark/empty-line pitch omissions are now located warnings rather
than silent loss. The complete gate passes 2,145 tests / 163 files; 32 new unit
regressions cover these boundaries. Three recorded desktop-browser journeys
compare complete HTML/DOCX-reopened JSON and strict editor geometry; all 24
captures, including standalone HTML, were checked. Compiled Node/workerd tests
also cover metadata retention and rejection. Earlier typing and 15.32x remote
performance failures are recorded alongside the later successful complete run
(10.62x, unchanged 15x limit). Native rendering remains unavailable, four known
font-geometry failures remain open, and no whole-format/parity claim is promoted.
See the [checkpoint](DOCX_FIDELITY_CHECKPOINT.md). No publication or % change.

Character-spacing follow-up (2026-10-05, Unreleased): supported signed Word run
pitch and zero resets now survive style resolution, editing, history, HTML,
Markdown inline HTML and native DOCX. The React Text styles panel exposes
apply/remove controls; custom hosts use the same six-mark module. The new test
found and fixed Markdown reimport dropping this property. The complete serial
gate passes 2,113 tests / 161 files. Three strengthened recorded desktop-browser
journeys pass, comparing full DOCX-reopened JSON and strict editor geometry;
HTML's reported page-settings loss is NOT counted as exact retention. All 21
views were visually checked and three actual downloads independently examined.
The independent preview ignores native run pitch, and packaged native rendering
remains unavailable. Kerning, the four known unknown-font geometry failures,
native layout, CommonMark completion and the wider roadmap remain open. No
release or percentage change. See the [checkpoint](DOCX_FIDELITY_CHECKPOINT.md).

WebKit input follow-up (2026-10-05, Unreleased): recorded Shift+Enter events
revealed WebKit's `insertParagraph` mismatch. The view now preserves keyboard
intent through `beforeinput`, retaining plugin precedence, code-block newlines,
IME/read-only guards and cleanup. The full gate passes 2,076 tests / 160 files;
the rebuilt three-engine line-break edit/export/reopen journey passes. All 18
captures were inspected and three actual DOCX downloads independently checked.
Eighteen separately recorded editor regressions pass across those engines for
paragraphs, quote/list editing, history, composition, code and multiline paste.
Native appearance and the four unknown-font geometry failures remain open;
the independent preview is not Word certification. No percentage or publication
change. See the [checkpoint](DOCX_FIDELITY_CHECKPOINT.md).

Line-break follow-up (2026-10-05, Unreleased): DOCX text-wrapping breaks retain
their run marks, and Shift+Enter now preserves active marks on the break as well
as subsequent text, including explicit mark-off states. Export explicitly warns
when generated Word styles supply unresolved paragraph fonts; the known pixel
geometry failures remain open and strict. The full gate passes 2,060 tests / 160
files. Recorded browser verification is separate from this gate, and the audit
now rebuilds the package before launching to avoid stale demos. No publication
or parity percentage change. See the [checkpoint](DOCX_FIDELITY_CHECKPOINT.md).

Paragraph font-context follow-up (2026-10-05, Unreleased): paragraph family/point
size and empty-line context now remain separate from inline overrides through
JSON, browser/server HTML, shared DOM projection, captions and native DOCX.
Unknown text-run fonts prevent unsafe paragraph-mark-only inheritance and
receive located warnings. The recorded workflow found and fixed generated
heading keep flags overriding source off defaults; no fixture or lab CSS was
changed to hide the defect. The full gate passes 2,055 tests / 160 files; three
targeted recorded browser workflows pass through real typing, history, line
editing and HTML/DOCX reopening, with three actual native downloads independently
checked. Native font/line metrics, generated colour defaults and complete layout
still remain open. No parity percentage or publication change. See the latest
[checkpoint](DOCX_FIDELITY_CHECKPOINT.md).

Paragraph-default follow-up (2026-10-05, Unreleased): Word import now resolves
the supported cascade before materializing never-declared paragraph spacing as
zero before/after and single-line spacing. Editing and DOCX reopening no longer
switch these source defaults to browser/generated Word spacing. Six targeted
recorded Chrome/Firefox/WebKit workflows pass through typing, Undo/Redo,
Enter/Backspace and HTML/DOCX downloads/reopening. All 36 captures were inspected;
six actual downloads retain all 18 native spacing groups. The current numeric
CSS line-height projection is not Word font-metric equivalence; source-preview
differences are retained as evidence. Native rendering, complete paragraph
geometry and broader typography remain open. The final full gate passes 2,048
tests / 159 files. The broad browser run passed 42 journeys; three scientific
journeys pass on rerun after updating only the expected explicit-zero XML
assertion. Failure recordings remain; this is not one all-green 45-case run.
No parity percentage or publication change. See the [checkpoint](DOCX_FIDELITY_CHECKPOINT.md).

Default table-width follow-up (2026-10-05, Unreleased): omitted Word widths now
retain automatic sizing rather than inheriting Fountain's fresh full-width
default. Fresh tables export full width or a complete fixed-grid physical sum,
with an explicit default-projection report. The browser audit exposed and fixed
a 2 px border/grid discrepancy in all three engines; shared DOM/HTML rendering
now includes that border inside grid-following whole-table widths. The full
gate passes 2,043 tests / 159 files. Twelve new recorded workflows pass across
Chromium, Firefox and WebKit; all 42 captures were inspected and 12 actual
downloads were independently checked. Native visual certification, typography,
paragraph defaults, table-style inheritance and complete layout remain open.
No parity percentage or publication change. See the [checkpoint](DOCX_FIDELITY_CHECKPOINT.md).
The full recorded rerun on this code passes 39 journeys (13 per engine).
Typography work must first adjudicate viewer disagreements against source
styles/native rendering, rather than copy a reference viewer's linked-style
colour precedence into Fountain.

Preferred table-width follow-up (2026-10-05, Unreleased): direct physical,
percentage, auto and nil preferences now survive portable JSON, browser/server
HTML and native DOCX without being overwritten by export defaults. Border-box
cell projection avoids counting native grid padding/borders twice. The full
gate passes 2,035 tests in 159 files; 27 new regressions cover the boundary and
six recorded browser workflows pass with actual typing, Undo/Redo and downloads.
All 24 source/editor/reopen/export captures were inspected. Percentage geometry
uses the host surface, not automatically the original page text extent.
Inherited widths/styles, row exceptions, full native layout and visual
certification remain open. No percentage change or publication.
The final broader suite on this code also passes all 27 recorded journeys
(nine per engine). Its next omitted-native versus fresh-host default-width
boundary is addressed by the later follow-up above; full native appearance
equivalence is still not certified.

Direct table-appearance follow-up (2026-10-05, Unreleased): supported physical
borders and padding now survive JSON, live editing, HTML and DOCX. Borderless
imports no longer acquire application grid/padding defaults; explicit resets
and zero lengths remain real document values. The full gate passes 2,008 tests
in 157 files. Twenty-five focused regressions and six recorded browser workflows
cover the change; all captured source/editor/reopen/export images were inspected.
This advances FB-04 without closing inherited/conditional table styles, native
border conflicts/margins, preferred widths or full layout fidelity. The independent
preview still differs from the editor; native rendering remains unavailable.
No percentage change. See the current [checkpoint](DOCX_FIDELITY_CHECKPOINT.md).

Fixed-table layout follow-up (2026-10-05, Unreleased): the optional table layout
mode retains explicit fixed/automatic choices through JSON, HTML, live editing
and native DOCX output. Fixed columns stay stable during long-content editing,
resize and Undo/Redo. Three recorded desktop-browser journeys verify the public
conversion lab. The independent preview misreads OOXML's layout attribute and
expands the export; raw evidence remains retained and native visual certification
is pending. Font-default materialization still affects source/reopen wrapping.
This is progress on FB-04, not completion of table or format fidelity.
The final incomplete-grid diagnostics and direct repeated-header on/off fix pass
the full gate (1,983 tests / 155 files). Explicitly disabled Word header flags
no longer invent header cells and export repetition. Semantic header versus
repeat-on-print roles, inherited table styles and native multi-page behavior
remain open; no roadmap percentage changes.

Caption fidelity follow-up (2026-10-05, Unreleased): attached image captions
retain independent paragraph alignment and supported geometry through DOCX,
JSON and browser/server HTML. The generated Caption style no longer injects
italic text, smaller font sizes, colour or centred alignment. The caption's
whole line remains an editing target; inline atoms inside another block's
editable region retain node selection. The recorded rich-caption import/edit/
export/reopen journey passes in Chromium, Firefox and WebKit, with inspected
editor/export screenshots. Full Office typography and native Word certification
remain open; no parity-percentage claim changes.

Format-bridge implementation (2026-09-12, Unreleased): the active programme has
resumed. Explicit RGB table backgrounds now reach the editor and DOCX round trip,
fixing the reproduced white-on-white headings. Source-package inventory and
located omission reports now accompany clearer lab round-trip scope. FB-01/02/06
remain in progress; broader Office Math, layout/styles and full CommonMark work
remain open. Supported body images, footnotes, page templates and a bounded
native-equation subset now have editable bridges. No completion-percentage or
parity claim changes. See
[checkpoint and verification](DOCX_FIDELITY_CHECKPOINT.md).

Bounded native-equation follow-up (2026-09-12): supported OMML runs, rows,
fractions, radicals, scripts, delimiters, n-ary operators, rectangular matrices,
combining accents, function application, upper/lower limits and equation arrays
now import as real editable Fountain math. The imported
node retains a validated platform-neutral `MathExpression`, so DOCX export writes
the semantic tree directly instead of reparsing generated TeX. Editing TeX clears
that retained tree in an undoable transaction; host `resolveMath` remains the
fallback for newly authored source. JSON and HTML retain the semantic value;
Markdown reports its projection loss. Unknown OMML still produces an explicit
placeholder and located warning. All 1,965 unit tests and 15 real-document
journeys pass across Chromium, Firefox and WebKit; imported/reopened editor views
and source/export pages were visually inspected. The added source/export/reopen
journey covers function application, upper/lower limits and equation arrays in
all three engines. This is not complete Office
Math or native Word/LibreOffice certification.

Word-style reader checkpoint (2026-09-12, internal): document defaults and
paragraph/character style XML now decode into the bounded run-style cascade.
Twenty-one focused XML cases and the unchanged scientific-source diagnostic
verify the reader; the full suite is 1,903 passing tests. This does not yet change
the visible importer or close inherited-style fidelity. Package integration,
editable reset semantics and original/editor/export visual proof remain open.

Historical format-bridge plan (2026-09-08, planned): the user clarified that deliberately
supported formats/features should target faithful 1:1 import, editing, rendering
and export, expanding coverage incrementally. “Unsupported” is an explicit scope
boundary, not an excuse for defects inside claimed support. See the
[implementation sequence and acceptance contract](FORMAT_BRIDGE_PLAN.md), including
open FB-01–FB-06 items from the [real-document audit](CONVERSION_REAL_DOCUMENT_AUDIT.md).
Recording this plan does not resume the paused programme or change completion scores.

Conversion-lab checkpoint (2026-09-08, website): a first local file intake,
editable import, diagnostic report and export/reopen lab now covers the existing
Markdown/HTML/DOCX/JSON adapters. It is linked from demos and the developer guide.
Original-format visual comparison, universal import, reviewed/redacted reproduction
bundles, worker isolation and new adapters remain future work. See
[the lab contract](CONVERSION_LAB.md). The wider programme remains paused.

This roadmap preserves product opportunities that arise from user feedback,
upstream issue boards, editor-community discussions, and FountainJS's own parity
audit. It is not a shipped-feature list and it is not permission to replace
current release gates with a larger pile of unfinished modules.

Document-level HTML source conversion (2026-09-08, Unreleased): an explicit root
adapter now carries supported inline HTML scopes across paragraphs and nested
lists/quotes, with complete inert fallback and no premature local conversion.
The combined optional-container profile has 599/652 semantic matches. Exact
source remains separate; formatted-whitespace layout differences, unsupported
HTML and full CommonMark parity are still open. See
[contract and evidence](MARKDOWN_DOCUMENT_FLOW.md).
Source-retention follow-up: enabling the policy alone no longer rewrites
unrelated Markdown blocks. Independent capture remains available when no
document HTML adapter runs; real cross-block scopes still refuse unsafe splicing.

Optional HTML containers (2026-09-08, Unreleased): bounded div/section wrappers
can now retain structure and supported attributes with HTMLContainerExtension.
The demo exposes the opt-in, host-specific rules take precedence, and unknown
attributes fall back with server loss reports. Thirteen official CommonMark
container cases have separate LF/CRLF reference and source checks; existing
default/profile scores do not change. See [scope and evidence](HTML_CONTAINERS.md).
Follow-up authoring adds explicit insert/append/unwrap commands and a public
property/reader workshop, with empty-container edits undoable on request. It
also corrects omitted block-only children and missing clipboard paragraph breaks.
Complete HTML/CSS retention, automatic empty-container interaction and general
wrap-selection authoring remain open.

Typed glossary handoff (2026-09-08, Unreleased): DOCX now retains term/description
roles using validated versioned controls, preserving supported visible content
and external text edits. Incompatible host schemas fall back without repeatedly
parsing nested entries. See [contract and evidence](DOCX_GLOSSARIES.md). Complete
Word form behavior, native page fidelity and glossary-containing numbered-item
relationships remain open. This is not a new npm release or full export parity.

Word content-control correction (2026-09-08, Unreleased): while investigating
glossary handoff, the importer was found dropping entire block controls and cell
content. Shared block traversal now retains supported displayed content, reports
removed control behavior, and keeps control properties out of inline text. The
public conversion UI exposes the actual messages. See
[audit and remaining limits](DOCX_CONTENT_CONTROLS.md). Full Word forms, typed
glossary export and native page-render verification were not completed by that fix;
the subsequent glossary work is described above.
Verification: 1,661 tests / 128 files; independent Word producer checks; six
three-engine browser checks; recorded and visually inspected handoff; passing
site build. The previous code-ending update's complete Linux CI also passed.

Source-recovery audit (2026-09-08, Unreleased): corrected generated code terminators
being added to editable code buffers. The optional structural recovery route now
has its own 652-example CommonMark regression baseline: 580 required semantic
matches on both LF/CRLF and 1,304 separate exact-source checks. Existing 563/579
profiles remain unchanged; full conformance is unfinished. See
[profile boundaries](MARKDOWN_SOURCE.md#source-recovery-code-endings-and-corpus-coverage).
Visual review also found and corrected hidden terminal blank lines in plain
reader code views. Full check passes 1,649 tests / 127 files; nine three-engine
browser checks and a recorded/visually inspected handoff pass. The prior native
definition-list update's full Linux CI has now also completed successfully.

Definition-list structure (2026-09-08, Unreleased): the reproduced glossary
flattening gap now has native term/description nodes, shared browser/server
projection, insertion/appending/removal controls, history and explicit Markdown
HTML-policy handoff. Plain-text/clipboard boundaries remain readable. See
[definition-list contracts and evidence](DEFINITION_LISTS.md). Broader format
fidelity and the remaining CommonMark semantics remain unfinished.
Verification: 1,633 unit/integration tests, nine browser checks across three engines,
a recorded and visually inspected glossary handoff, and a passing site build.

Recovery regression audit (2026-09-08, Unreleased): the full Linux browser run
for the task-source change reported three failures, all from one stale warning
assertion in the older paragraph-recovery journey. The refusal to flatten a
checked task is intentional. That assertion now checks the specific refusal,
retained task content and checked state. The five related recovery/conversion
journeys pass across Chromium, Firefox and WebKit locally (15 checks); this is
not a claim that the subsequent full Linux CI run has passed.

HTML fidelity audit (2026-09-08, Unreleased): removed standard wrappers now
produce explicit conversion warnings, and the demo no longer implies an empty
report proves losslessness. It also reproduced default-schema definition-list
flattening; the subsequent native implementation above addresses that structure
instead of counting the warning alone as a fix.

Registered-wrapper correction (2026-09-08, Unreleased): fixed rejected HTML
content-shape attempts contaminating hard-break preservation checks. Registered
sections now survive the tested source-recovery/edit/export/reopen path. Seven
new unit cases, compiled server checks and three-engine browser coverage support
this extension-system fix; unknown HTML/layout fidelity remains open.

Task-source follow-through (2026-09-08, Unreleased): opt-in mixed HTML/Markdown
recovery now preserves whole task-list subtrees, including checked state and
nested tasks. Explicit source discriminants prevent confusing tasks with plain
lists. Altered/flattened tasks and custom metadata still roll back. This is an
extension-retention improvement, not an increase in CommonMark corpus scores.

Inline-object follow-through (2026-09-08, Unreleased): the structural HTML adapter
now preserves source-defined inline images, math/emoji, marks and custom inline
data outside preformatted scopes. Twelve new unit cases and seven added LF/CRLF
reference cases cover this boundary. Flattening those objects, changed inline
projections, task blocks and unknown wrappers remain outside the contract.

Hard-break follow-through (2026-09-08, Unreleased): the explicit structural
HTML recovery route now distinguishes plain Markdown hard breaks, physical
soft breaks and spaces. The reference gate covers 58 preformatted stream/source
and 24 complete structure/source contracts. Marked/custom breaks, other atoms,
task lists and outer-wrapper fidelity remain open; corpus scores are unchanged.

Recursive Markdown follow-through (2026-09-08, Unreleased): parser-derived
list/item/quote source events now feed the explicit HTML recovery adapter.
Tight/loose lists, ordered starts and nested quote/list combinations pass the
new reference contracts. Custom data and altered projections still roll back;
tasks, inline atoms and outer-wrapper fidelity remain open. See
[the exact boundary](MARKDOWN_SOURCE.md#explicit-text-block-source-flow-recovery).

Opaque code-label correction (2026-09-08, Unreleased): the earlier default-schema
fence-label rejection is resolved. Whitespace-free labels are metadata, including
long names and HTML punctuation. Fence entities/escapes decode before language
selection; canonical export protects literal label values. Own-property checks
fix prototype-name crashes in highlighting. Long view labels wrap and have
original-spelling hover text. The new 34 LF/CRLF reference-semantic/source/
canonical contracts leave corpus scores unchanged. Lists/nested source events,
inline atoms and wrapper retention remain the next Markdown boundaries.

Code-language import correction (2026-09-08, Unreleased): `c++`, `c#` and dotted
labels no longer truncate during browser/server HTML conversion. Complete class
token matching avoids misleading partial names. Full check: 1,515 tests / 119
files, including compiled Node/workerd. This is separate from the still-open
Markdown fence-info schema rejection below; it does not increase corpus scores.
Three-engine conversion/paste/public-source/reader checks and a separate recorded
run passed; visual inspection confirmed the reader result. Syntax highlighting's
`cpp` display alias is checked separately from the retained `c++` model label.

Text-block source flow (2026-09-08, Unreleased): direct ATX/Setext headings and
fenced/indented code now retain syntax context, wrappers and generated code
terminators through the separate opt-in `parseTextBlockFlow` adapter. The demo
uses this extension of paragraph recovery. Twenty-four LF/CRLF reference-code
and source contracts pass; existing corpus scores and outer-div mismatches are
unchanged. Custom metadata, modified blocks, nested containers and atoms are
still refused. Full sequential check passes 1,503 tests / 118 files, compiled
Node/workerd recovery, API/headless/package/type/performance gates. Runtime is
1381.5 KiB ESM / 1148.1 KiB CJS; aggregate caps rise 2 KiB to 1382/1149 with no
individual or performance relaxation. Next: nested container/source events,
hard-break semantics, wrapper retention, and the separate default-schema fence
info rejection (some valid CommonMark labels still throw during node creation).
The extended conversion/edit/undo/download/reopen/reader journey passes three
desktop engines. Its separate recording, desktop conversion/editor and 390px
reader were visually inspected; see [evidence](MARKDOWN_FLOW_PROVENANCE.md).

Paragraph-source flow recovery (2026-09-08, Unreleased): an explicit opt-in server
adapter and conversion-demo switch now recover four mixed HTML/pre fixture kinds.
Eight LF/CRLF contracts retain exact code text/source; two also match complete
reference structure. Outer-div mismatches remain visible. Assigned IDs/custom
paragraph data, changed projections, headings/lists/code and inline atoms are
refused. The original flow contract and 563/579 baselines remain unchanged.
Full check: 1,484 tests / 117 files, compiled Node/workerd recovery and existing
API/headless/package/type/performance gates. Next: structural source events and
non-text/metadata-preserving projection, not normalizing away wrapper mismatches.
The expanded user journey and stronger whole-replacement assertions pass all
three desktop engines. Recorded conversion/editor/mobile-reader views were
inspected; production website build passed. Runtime: 1379.1 KiB ESM / 1146.1 KiB
CJS, with aggregate caps 1380/1147 and individual/performance limits unchanged.

Paragraph provenance implementation (2026-09-08, Unreleased): HTML flow adapters
can lazily inspect direct paragraph syntax through an optional context. Physical
LF, raw tokens and tight-list context survive separately from current converted
blocks. Existing adapters need no change; no host callbacks are replayed. This
resolves the inspection collision, not whole-container semantic recovery.
Next: structural rendering events and a source-aware server projection that
preserves original content/identity or explicitly declines unsupported nodes.
Verification: full sequential check passed 1,466 tests / 116 files, compiled
Node/workerd inspection, existing API/headless/package/type/conformance and
performance checks. Three desktop browser journeys passed; the separate recorded
journey's editor, list reader, mobile preformatted view and overview were inspected.
ESM runtime is 1376.5 KiB (1377 cap); CJS 1143.9 KiB (1144 unchanged cap).

Whole-container Markdown audit (2026-09-08): proved that different physical
newline/space inputs currently produce identical complete flow-node streams.
Recovery therefore needs earlier parser provenance, not a `textContent` patch.
Eight fixed reference fixtures now exercise 48 LF/CRLF safe-fallback, rollback
and source-retention checks across three adapter routes. No capability gain or
runtime/API change is claimed; the 563/579 semantic baselines remain unchanged.
See [the concrete boundary design and acceptance criteria](MARKDOWN_FLOW_PROVENANCE.md).

Firefox audit follow-through (2026-09-08): the retained trace proves a document
reload between Select All and paste while another audit rebuilt the shared
checkout. This specific failure is an invalidated run, not evidence of a
selection-engine defect. Added a tested stable-document guard, isolated
three-engine repetitions (nine passed) and a recorded Firefox journey with
visually inspected results. Full sequential check: 1,451 tests / 115 files.
No editor code or capability totals changed.
See [the trace timeline, checks and audit isolation rules](BROWSER_AUDIT_RELOADS.md).

Preformatted newline correction (2026-09-08, Unreleased): CRLF pairs spanning
protected text nodes now remain a single newline. Import-local `textRun`
provenance respects raw tags/comments and generated Markdown mark boundaries;
initial-LF handling also accounts for empty text slots. Eighteen added tests
bring the full clean check to 1,447 tests / 114 files. The oracle has 76 paragraph
reference/source contracts; the 563/579 corpus semantic baselines are unchanged.
Measured runtime code is 1375.9 KiB ESM / 1143.5 KiB CJS; aggregate ceilings rise
1 KiB each, to 1376/1144, without individual entry or performance cap changes.
The recorded edit/undo/download/reopen/reader journey passed; editor, reader,
narrow-screen screenshots and recording contact sheet were visually inspected.
Chromium and WebKit passed. Firefox initially pasted into only the first block
after Select All during a loaded run, then passed three isolated reruns without
a code change. Preserve the initial failure under `artifacts/preformatted-crlf-browsers`
for evidence; the reload investigation and guarded reruns are documented above.
An overlapping audit rebuild disrupted the first full check's Angular import;
the complete sequential rerun passed. Do not rebuild `dist` while tests consume it.
Cross-block Markdown emphasis still loses an empty reference wrapper; its
correct code text/source retention is not counted as full structural conformance.

Preformatted paragraph follow-through (2026-09-08, Unreleased): closed text-only
pre scopes can now become code blocks without flattening physical soft breaks.
Optional segment `softBreak` provenance distinguishes LF from ordinary spaces.
The server applies HTML CR/CRLF and initial-LF rules, retains text attributes and
marks, and reports the plain-text export boundary. Nested/orphan/cross-paragraph
pre tags and atoms still fail explicitly; unsupported closing tags remain literal.
Twenty added unit cases bring the full check to 1,429 tests / 114 files; compiled
Node/workerd, API/headless, package and performance gates pass. The paragraph
oracle now has 62 LF/CRLF reference/source contracts plus 1,304 source-retention
checks, without changing the default 563 / block+inline 579 baselines. The extended
editing/undo/download/reopen/reader journey passes Chromium, Firefox and WebKit.
Measured code: 1374.9 KiB ESM / 1142.7 KiB CJS; aggregate ceilings rise 1 KiB each
to 1375/1143, all individual entry limits unchanged.
The extended recorded audit passed; code editor, reopened reader and narrow-screen
views were visually inspected with all three lines and indentation retained.

Next: whole-container preformatted/raw-text source projection. The current flow
API protects parsed block nodes but does not carry the source/render provenance
needed to reinterpret them within raw-text scopes. Do not flatten their model
text or serialize private attributes into HTML as a shortcut. Hard-break atoms,
foreign/active content, comment identity and empty-item representation are still
separate open cases; this is not full CommonMark or verbatim-mode completion.

Tight-list paragraph follow-through (2026-09-08, Unreleased): the optional
paragraph adapter now receives frozen `tightList` context, and the server adapter
omits its implicit paragraph wrapper only where required. Direct sibling source
boundaries determine tightness; nested lists/quotes, code and HTML keep their own
scope. Host callbacks are deferred, not replayed. Full check passes 1,409 tests /
113 files, Node/workerd recovery, package/API/headless and performance gates.
The recovery oracle now checks 38 LF/CRLF semantics/source contracts plus 1,304
corpus source contracts; three desktop engines pass editing, undo, file reopen
and reader journeys. Measured aggregate code: 1373.1 KiB ESM / 1141.2 KiB CJS,
under revised 1374/1142 caps; individual entry limits remain unchanged.
Recorded tight-list editor/reopened-reader/narrow-screen views were inspected.
A separate compiled 10,000-item probe retained three blocks per recovered item
and invoked each paragraph adapter once; it is not a cross-machine benchmark.
Empty list-item placeholders and omitted HTML comment identity remain explicit
mismatches. Raw-text/preformatted recovery is the next boundary to investigate;
do not claim full CommonMark or promote the existing 563/579 baselines.

Paragraph HTML recovery (2026-09-08, Unreleased): a new default-off block-returning
`parseHTMLParagraph` boundary and DOM-free `ServerHTMLImporter.parseParagraph`
allow ordinary paragraph HTML to recover into separate editable blocks while
retaining original inline nodes/metadata and explicit failure paths. Seventeen
unit cases pass; eight independent reference/source checks and 1,304 corpus source
checks do not replace conformance. The conversion demo exposes the experimental
option and the workflow passes Chromium, Firefox and WebKit through editing,
download/reopen and reader views. Runtime growth is measured at ESM 1371.6 KiB and
CJS 1140.3 KiB; aggregate caps increase by 2 KiB each to 1372/1141, with individual
entry limits unchanged. Public declarations add the optional callback/reporter
and paragraph methods; existing APIs remain available.
Full `pnpm check` passes 1,391 tests / 113 files, compiled Node and workerd
paragraph-recovery checks, API/headless boundaries and performance budgets.
Recorded editor, reopened reader and narrow-screen screenshots were visually
inspected; the recorded journey also passed. This is bounded workflow evidence,
not certification of arbitrary pasted HTML or physical mobile input.

The tight/loose list rendering context gap discovered here is addressed by the
follow-through above; ordinary/loose paragraphs retain HTML closing-tag recovery.
Preformatted/raw-text scopes and exact unsupported wrapper identity remain open.
Do not call this full CommonMark support or promote the existing 563/579 baselines.

CommonMark evidence audit (2026-09-08, Unreleased): the neutral comparator now
recognizes equivalent paragraph/heading formatting scopes instead of requiring
the reference HTML and Fountain's inline marks to share one representation.
Example 167 is newly recognized, not newly implemented: opt-in HTML is 579/652,
default stays 563/652. Twenty reference/source contracts and ten deliberately
damaged outputs guard the equivalence. Inline HTML containing block tags and
raw-text scopes over protected Markdown blocks remain open; explicit fallback
contracts prevent those gaps from being silently counted as supported.
The conversion → HTML paste → Markdown download/reopen → reader journey passes
Chromium, Firefox and WebKit; `tests/browser/markdown-scope-journey.ts` verifies
separate rendered paragraphs, strike/emphasis and an unformatted sibling.
The next inline-block work must address the inline-only adapter return contract:
HTML recovery may split a Markdown paragraph into several blocks, which cannot
be represented by inserting block nodes into its existing inline content array.
Keep protected-node/source checks and explicit fallback during that work.

Table handoff follow-through (2026-09-08, Unreleased): the issue workflow now
exposes the existing HTML-table option and opts into schema-projected table
imports on file/source reopen. Six host-policy tests bring the full local check
to 1,374 tests / 112 files; Chromium, Firefox and WebKit pass the mixed/headerless
table journey, including merged cells, paragraphs, bold rendering and reopen
undo/redo. Recorded editor/reader/mobile captures and recording overview under
`artifacts/issue-table-handoff-recorded-v2/` were visually inspected. See
[the workflow contract](ISSUE_EDITOR_DEMO.md#table-handoff-policy).
This closes the missing demo preservation route, not pipe-format limitations,
arbitrary CSS fidelity or the remaining CommonMark programme.

HTML formatting inheritance repair (2026-09-08, Unreleased): both browser and
server import retain supported marks/typography around blocks, list items and
table row groups/rows/cells, with nearest supported color overrides. Verified by
1,368 tests / 111 files in the full local check and three browser workflow runs;
recorded source/editor/reader/mobile captures were inspected. See
[the exact scope](SERVER_HTML.md#block-html-projection). No public API or bundle
ceiling changed. Follow up on CSS reset semantics and lossless alternatives for
native table roles not representable by pipe Markdown; do not equate reported
conversion losses with solved export fidelity. The CommonMark baseline is unchanged.

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
At this checkpoint explicit RTL direction/locales were still open; the
2026-10-07 direction work below is separate from this alignment evidence.

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

Attached rich image captions (2026-09-13): `image_super` now accepts editable
inline caption content while retaining its legacy string attribute. Browser and
server HTML preserve supported marks and links, DOCX Caption paragraphs import
those runs into the image and export them natively, and image controls remain
available while the caret is inside the caption. Whole-image pointer/keyboard
selection is explicit through `NodeSpec.selectable`; model-owned `contentDOM`
still receives ordinary text selection. The full 1,965-test suite and the real
caption interaction pass Chromium, Firefox and WebKit. Arbitrary block captions,
fields, floating text wrapping and native Office visual certification remain open.

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
finish DOCX. At this 2026-09-07 checkpoint, default math export was TeX fallback
text with explicit loss reports rather than native OMML. The later bounded
native-equation checkpoint supersedes that result for nodes carrying a validated
semantic tree; live numbering/references remain open.

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

Historical baseline: the independent 2026-09-08 DOCX audit reproduced
missing header/footer content and footnotes, unsupported native equations,
white-on-white table labels, and lost original style/page settings. Later dated
checkpoints supersede each of those bounded fixture results; broader format
fidelity remains governed by [Faithful document format bridge](FORMAT_BRIDGE_PLAN.md).

Unreleased 2026-09-12 follow-up: table fills remain readable and native DOCX
footnotes now survive import, direct editing, undo/removal and export/reopen.
The lab uses StarterKit + Pages and exposes note controls. The recorded independent
fixture journey passes Chromium/Firefox/WebKit; 1,788 tests / 139 files, TypeScript,
package and website builds pass. This does not close FB-03 or DOCX fidelity:
headers, endnotes, native math, original styles/page geometry and automatic image
dimensions still need work. See [scope and evidence](DOCX_FIDELITY_CHECKPOINT.md).

Subsequent local checkpoint: single-section header/footer templates and the
independent fixture's header-logo bytes now survive direct edits and native DOCX
export/reopen. The three-browser journey and 1,796 tests / 140 files pass, along
with types/package/site builds. Simple page fields retain structure but their
display/recalculation is not certified (the independent viewer leaves the number
blank). Multi-section inheritance, original layout/styles and complex fields
remain open; this does not close FB-03 or supersede the broader parity goal.

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

### Local DOCX page-break checkpoint — 2026-09-12

FB-04 now retains the reproduced explicit Word page break through import and
native export, exposes insertion/selection in the conversion lab, and verifies
Delete/Backspace, undo/redo and file reopening in three recorded browser engines.
1,807 tests pass; types/package/site builds pass. Visual comparison still fails
original typography, native math and paper geometry. This is progress within the
format bridge, not completion of layout fidelity or a new parity percentage.
See [the evidence and remaining work](DOCX_FIDELITY_CHECKPOINT.md).

### Local DOCX page-settings checkpoint — 2026-09-12

FB-04 now preserves single-section physical paper dimensions and margins in
neutral root data, including header/footer edge distances and gutter. The lab
supports Apply/Undo/Redo and downloaded-file verification. 1,826 tests pass;
three recorded browser journeys preserve the fixture's actual Letter/custom
settings and unchanged assets. Original style fidelity, fixed-height automatic
reflow, multi-section layout and native Word math remain open. This is not full
DOCX fidelity or a change to the parity completion percentage.
See [the current evidence](DOCX_FIDELITY_CHECKPOINT.md).

### Local DOCX direct-font checkpoint — 2026-09-12

FB-04 now bridges explicit named Latin fonts and physical sizes through existing
editable text-style marks and native Word run properties. Missing/unsupported
font choices and conversions are reported. 1,841 tests and six recorded browser
journeys pass; the font-specific source/editor/export/reopen views were visually
checked. This does not resolve inherited Word styles or the original cooling
report's title/heading mismatch. See the detailed next style requirements in
[the format-bridge plan](FORMAT_BRIDGE_PLAN.md).

### Internal DOCX style-cascade groundwork — 2026-09-12

FB-04 now has a tested internal run-style resolver (26 new pure-Node cases;
1,867 tests total passing), including bounded ancestry, overrides and per-script
font precedence. It is not connected to import/rendering yet and does not close
the title/heading fidelity gap. The remaining XML/theme decoding, editable-reset
and visual-audit steps are recorded in [the bridge plan](FORMAT_BRIDGE_PLAN.md).
No parity percentage or release status changes.

### Local DOCX inherited run-style checkpoint — 2026-09-12

The public importer now resolves document defaults and paragraph/character style
ancestry into editable run formatting. All 1,923 tests and 12 recorded browser
journeys pass; all exported pages were visually inspected. The unchanged source's
25 pt title and 16 pt headings now survive. At this checkpoint, full spacing,
borders, table width, rich image captions, native equations and native Word layout remained open;
later entries supersede the bounded table/equation findings.
Implicit Word defaults may become explicit marks, not byte/JSON identity.
See [the evidence and next gaps](DOCX_FIDELITY_CHECKPOINT.md). No percentage increase.

### Local DOCX paragraph-layout checkpoint — 2026-09-12

FB-04 now carries supported effective paragraph geometry as validated, platform-
neutral block data: spacing and line rules, logical/first-line/hanging indents,
keep-with-next, keep-lines, page-break-before, RGB shading and supported solid
borders. DOCX/HTML import, native DOCX export, Markdown loss reporting, block
conversion and splitting use that one value. All 1,931 tests / 151 files and all
12 recorded Chromium/Firefox/WebKit journeys pass; their final document views
were visually inspected. That inspection also exposed and fixed conversion-page
CSS compressing imported heading letters. At this checkpoint table geometry,
rich captions, character spacing, conditional styles, native equations,
multi-section layout and native Word/LibreOffice certification remained open;
later entries supersede the bounded table/equation findings. This checkpoint changes no
parity percentage. See [the detailed evidence](DOCX_FIDELITY_CHECKPOINT.md).

### Local DOCX editable-emphasis checkpoint — 2026-09-12

Added explicit normal block emphasis with editable inline bold/italic, HTML/DOCX
interchange, Enter/block conversion, history and Yjs coverage. All 1,915 tests and
12 recorded Chromium/Firefox/WebKit journeys pass. Final exports were visually
reviewed. This prepared Word style projection; inherited styles were not yet
connected to import. At this checkpoint mixed-mark DOCX ordering, paragraph
spacing, native equations and scientific layout remained open; later entries
supersede the bounded equation finding. No change to the parity completion percentage.
See [the evidence and limitations](DOCX_FIDELITY_CHECKPOINT.md).

### Local DOCX direct-theme-font checkpoint — 2026-09-12

FB-04 now resolves embedded major/minor Latin regional theme fonts used directly
on runs into editable named-font marks, with explicit theme-binding normalization
reports. 1,882 tests and nine recorded three-engine conversion journeys pass.
Independent pages and reopened editor views were visually inspected. Language-
dependent fonts and inherited paragraph/run styles remain unfinished; this does
not close original title/heading or page-layout fidelity. See the
[checkpoint and limitations](DOCX_FIDELITY_CHECKPOINT.md).

## Inkognito naming check 2026 10 05

The candidate is **not cleared for a rename**. Keep `FountainJS`,
`fountainjs-editor`, existing repository URLs, document formats and imports
unchanged. This is a collision check, not a trademark opinion or an instruction
to reserve a name.

- The first-party [Inkognito site](https://www.inkognito.io/) already presents
  an exact-name web-analytics software product. Its advertised launch timing is
  not independently verified; the visible use of the brand is sufficient to
  prevent treating the name as uncontested.
- [trionlabs/inkognito](https://github.com/trionlabs/inkognito) is a separate
  exact-name signed-document/identity proof project. Repository names are not
  globally exclusive, but this is relevant software/document search overlap.
- Read-only HTTPS requests to npm's public registry returned **404** for
  `inkognito`, `inkognitojs` and `inkognito-editor` on this date. That means these
  exact package metadata endpoints had no public package at the time of the
  check; it does **not** prove that publishing is permitted, that a scope/domain
  is available, or that a brand is legally clear.
- No exhaustive jurisdiction-specific trademark search, domain-registration
  availability check or legal clearance was completed. Search results and a
  missing npm package are insufficient grounds to rename a shipped library.

Recommendation: continue the technical programme under FountainJS. If renaming
is revisited, choose/recheck a candidate, obtain the appropriate clearance and
explicit maintainer decision, then plan redirects, package aliases, documentation
and compatibility rather than breaking existing imports or stored documents.

## 2026-10-07: block direction and explicit document focus

PROD-04 remains **Partial**, and the ledger count is unchanged. Paragraphs and
headings now have optional LTR/RTL/auto direction, selection-wide commands and
logical start/end alignment. Source text is not rewritten. Direction/alignment
survive heading conversion and Enter; browser/server HTML rules share fixed
inheritance handling, and pure-Node/Yjs tests cover updates and clearing.
Ordinary Markdown and DOCX explicitly report unretained direction; the latter
uses a reported physical alignment approximation, not a native Word bidi bridge.

The isolated public Go-docs workflow passes once each in Chromium, Firefox and
WebKit with retries disabled. Real keyboard arrows/Shift-selection, replacement,
Enter, undo, direction buttons and exported-reader direction are asserted;
nine desktop/narrow/editor/reader captures were visually inspected. The reader
uses default browser styling, not a claim of pixel-identical export. Broad bidi
navigation, authored/default alignment under inherited-auto or RTL hosts,
inherited-auto wrapper flattening, inline isolation, mirrored
list/table structure, native mobile input, locales and native Word fidelity are
still required before this row can close. Details/API are in [TOOLBAR.md](TOOLBAR.md).

The published `421a329` CI run completed: verify and real Lean integration
passed; the full browser job reported **673 passed, 16 skipped, 3 failed**.
All three failures are comment-copy journeys after a previous external checkbox
interaction. New focused tests reproduce the stale field focus in editable and
read-only editors. Explicit pointer selection now focuses the document before
applying the selected atom/cell range; background formatting still preserves
native-field focus. The focused direction/model/HTML/history/focus set passes
**117 tests in eight files**, including explicit atom and cell pointer focus
after an external checkbox. The combined retry-free, one-worker recording
passes **nine journeys across Chromium/Firefox/WebKit**. Visual review found
an iframe capture readiness gap and sticky-header occlusion in tall workshop
screenshots; the three-engine follow-up passes and includes separate reader and
unoccluded editor captures. The tall workshop captures still have off-screen
iframe/sticky-header artifacts and are not complete-layout evidence. The final
emitted ESM/CJS root/core consumer checks verify direction/history/HTML and
explicit loss reports without a DOM shim. API/headless/bundle checks pass;
aggregate runtime is 1578.9 KiB ESM / 1313.6 KiB CJS against the documented
1579.5 / 1314.5 ceilings. All existing per-editor/CSS/performance limits remain
unchanged. Full current-source CI approval remains required. See
`artifacts/block-direction-focus-verification-20261007.json` for exact scope.
No npm release or complete-parity claim follows
from this checkpoint.

## 2026-10-07: independent performance gate and native-selection follow-up

The `6b925d1` Linux browser run is terminal: **678 passed, 16 skipped, one
failed**. Comment-copy focus regressions no longer fail. Firefox RTL selection
fails at Shift+Left after moving to offset one, selecting `א` instead of `בג`
on every attempt. Matching native selection endpoints should not be replaced
with a new browser range: that can lose browser-only caret affinity. A focused
guard preserves such ranges; changed endpoints and replaced document nodes
continue to synchronize. Unit tests check collapsed, forward and backward
native ranges plus explicit commands and edited-node restoration. The public
RTL journey retains its original assertions and additionally records an
untouched native contenteditable baseline and an observational range-reconstruction
probe. Both native sequences select `בג` in all three Windows engines; this does
not reproduce or prove the cause of Linux's failure. Linux certification remains open.

Immutable-node size reuse, tail-first complete equality and one direction read
per imported HTML block are also under verification. The focused model/import
set passes 138 tests; no schema-validation bypass or equality-result cache is
introduced. Current local performance still fails local scaling and three
server p95 caps. Passing diagnostic/focused runs do not replace those failures.
CI performance remains mandatory but now runs independently so functional
tests/type checks can complete despite performance failures. Full verification
is required before publishing; ledger coverage and CommonMark counts are not
promoted by this work.

## 2026-10-07: Linux native selection evidence and CI-policy correction

`d0dc2e7` passes unchanged Linux performance/heap limits and real Lean; Pages
deploys. The independent job achieves server/local/remote growth
8.82x/9.99x/10.16x against 15x. Failed local runs are retained, not reclassified.
The full unit run reports 2,664 passes and one release-policy failure: that test
expected every command inside `verify`. Its update recognizes performance only
in a separate unconditional, failure-gating, frozen-install/build job; seven
negative regressions prevent skipped, ignored or unprepared jobs from counting.

The Firefox preflight fails its **plain native baseline**, before opening
Fountain. Linux selects `א` (anchor one/focus zero) where Windows selects `בג`
(one/three). Native range reconstruction also loses backward direction and
then collapses the Linux selection. The journey now uses actual native
anchor/focus/text endpoints at every keypress, with exact source-range
replacement and undo assertions. Other history/direction/export checks stay.
This is a browser-platform policy distinction, not proof of a current editor
selection bug or universal visual navigation. Full follow-up CI remains
required; the RTL/localization row is still Partial and no npm release follows.

## 2026-10-07: authored physical-left alignment under inherited direction

The legacy default `align: 'left'` omitted CSS to preserve natural host layout;
an explicit left command was previously indistinguishable from that default.
First-party paragraphs/headings now declare optional `alignExplicit: true`.
The first left command is undoable, repeated left is a no-op, and other
alignments clear the marker. Reading direction stays independent. Default
JSON/canonical HTML remain unchanged; custom schemas without the marker retain
their old command contract. Supported conversion, Enter, JSON/Yjs and HTML
retain the override. Supported DOCX physical-left paragraph projection emits
and reimports explicit justification, including rich code-style fallback;
Markdown reports the unsupported presentation.

Recorded one-worker Chromium/Firefox/WebKit use verifies natural-right versus
authored-left text geometry, undo/redo, Enter, inherited-auto HTML readers,
DOCX export/reopen into Fountain and narrow viewports. The reader screenshots
do not certify native Word appearance or native mobile keyboards. General CSS
ancestor inheritance, inherited-auto flattening, inline isolation, mirrored
structure, broader bidi navigation and translated locales remain open; PROD-04
stays Partial and ledger/CommonMark counts do not change. The measured feature
needs only narrow aggregate bundle allowances; all other caps stay unchanged.
Current-source cloud verification is required before stronger claims or npm.
Focused checks pass 68 tests / seven files, plus package/API/headless/framework
types and unchanged CommonMark profiles. Three recorded desktop journeys pass
without retries; 15 final PNGs match reviewed captures. Nine videos are recorded,
not manually watched. Source/capture hashes, exact scope and failed diagnostic
logs are in `artifacts/explicit-left-verification-20261007.json`.

## Sequencing rule

Finish and certify one ledger outcome before beginning another. Each outcome
must remain framework-neutral at its model/command boundary, ship through the
public MIT package, include a working packed-package example, pass applicable
unit/browser/accessibility/performance gates, document honest limitations, and
be compared against ProseMirror + Tiptap as a combined stack. Community size and
years of deployment are evidence gaps that features alone cannot erase.

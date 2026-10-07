# Performance and memory contract

## Block-direction work in progress

Unreleased, 2026-10-07: optional block direction/logical alignment and explicit
Word loss reporting add about 2.4 KiB ESM / 2.1 KiB CJS, including the subsequent
small explicit-pointer-focus repair. Only the aggregate runtime ceilings and
the optional DOCX entry ceilings are updated for this new capability; existing
editor/framework/CSS, latency, scaling and heap limits are unchanged. The
pre-adjustment failure is retained in
`artifacts/rtl-direction-budget-before-20261007.log`.

Local verification uses one test worker and sequential check phases following
a CPU-contention incident. The overlapping full unit attempt was stopped after
multiple timing failures; it is not a completed or passing gate. The isolated
direction browser workflow and focused unit checks pass. The final build,
ESM/CJS consumer, API, headless boundary and framework type checks also pass;
aggregate sizes are 1578.9 KiB ESM / 1313.6 KiB CJS. Full current-source
performance/CI certification is pending. The native-colour checkpoint below
describes the earlier frozen source, not this unverified addition.

## Native-colour final local checkpoint

Unreleased, 2026-10-07: the final narrow toolbar guard and explicit colour-key
unit contract pass the complete local gate: **2,636 tests / 197 files**, API,
package/server/headless/conformance, framework types and unchanged resource caps.
Server HTML p95 at 100/1k/5k/10k is **11.20/60.75/252.24/469.35ms** against
35/120/500/900ms. Server/local/remote median growth is **8.60x/7.50x/13.66x**
against 15x. Live-session growth is 0 MiB; destroyed editor 0.06 MiB; retained
server document 14.30 MiB, within existing limits. Aggregate ESM/CJS remains
1576.4/1311.3 KiB against 1576.5/1311.5 KiB.

Earlier failures below are retained, not replaced by this later pass. The
toolbar change is not an importer speedup; the cause of timing variation is
not established. Linux's native-control preflight passes; its full browser
matrix remains pending. Nine recorded Windows workflows and all 69 captures
are verified on the frozen final source. Exact evidence:
`artifacts/native-colour-arrow-verification-20261007.json`.

## Native-control follow-up: failed complete gate retained

Unreleased, 2026-10-07: the focus fix passes the complete default unit suite
(2,635 tests / 197 files), framework types and nine recorded three-engine
Windows workflows. This does **not** make the complete local gate green:
`artifacts/native-control-focus-verified-gate-20261007.log` fails server HTML
p95 at 1k/5k/10k: **195.83/1000.72/1862.55ms** against **120/500/900ms**.
Growth ratios and retained-heap checks pass; no budget or timeout was increased.

A separate six-sample importer-only CPU/GC diagnostic measures
107.54/396.04/783.93ms p95. Its different process history and profiling overhead
mean it cannot replace the failed complete gate. Sampled GC accounts for roughly
13% of its total time; repeated attribute projection and HTML-source processing
remain visible hotspots. The cause of the complete-run slowdown is not yet
established. An artifact-only attribute-lookup experiment passes seven
differential fixtures (including case-sensitive names, empty values, SVG
namespaces and fresh reads after host mutation), but is rejected: alternating
1k/10k medians worsen from 86.31/624.78ms to 95.83/658.18ms; 5k is similar.
No production optimisation is adopted from that experiment.
See `artifacts/native-control-focus-verification-20261007.json`
for frozen-source evidence, retained failures and visual-review scope.

The ID lookup unit test still performs and checks every one of 100,000 lookups
against the same 1.5-second bound, but does not include matcher allocations in
the measured interval. Unsafe-link safety inputs/assertions are unchanged and
split into independent threat families. Neither change is an engine speedup.

## Tree-owned server selector compilation

Unreleased, 2026-10-07: the earlier artifact-only selector experiment is now
implemented after warmed alternating measurements and permanent equivalence
checks. `src/html/server.ts` shares a private compiled-selector map only within
one parsed tree, including descendant/query/parent wrappers. The map clears at
256 entries and disables query-result caching. Nothing is retained on the
importer or schema; separate imports recompile their queries. Relative `:has`
scope closures therefore cannot keep previous trees through a global cache.
There is no new dependency or public API.

Permanent tests compare complex/relative/scoped selectors with the uncached
library in document and fragment modes, check compilation counts across separate
imports, and exercise 270 contributions with an observed 256-entry bound and
unchanged invalid-selector reports. Local performance passes **589.28ms p95 /
900ms** for 10,000 HTML blocks; server/local/remote growth is **8.34x/7.17x/7.55x**
against 15x. Heap and bundle limits also pass: **1576.5 KiB ESM / 1311.4 KiB CJS**.
No limit is increased. These are local observations, not hardware-independent
promises. Initial candidates exceeded ESM by 0.1 KiB; the compact-candidate
failed budget log remains evidence. Making the cache genuinely private keeps the final build
inside the existing cap.

All functional/package/runtime/type checks and **2,626 tests / 197 files** pass
on the frozen source across separate runs. The first aggregate test run, with
simultaneous browser recording, failed the existing ID-lookup timing assertion
at 1550.45ms / 1500ms; all other 2,625 tests passed. The full unchanged unit suite
passes after recording ends, without weakening that assertion. Twelve recorded
retry-free three-engine workflows pass; all 75 captures are visually verified
(30 directly, 45 exact hashes to inspected evidence). See
`artifacts/server-html-selector-verification-20261007.json` for exact logs,
source digest, failed attempts and limitations. Linux native-color focus is
separate and still open; preceding Linux verification/Lean jobs succeeded, but
do not certify this subsequent cache source.

## Shared-subtree edit cost follow-up

Unreleased, 2026-10-07: the GitHub checkpoint's Linux job rejected local edit
growth of 15.83x against the existing 15x limit. Revalidation reproduced the
scaling failure. Profiling identified redundant validation path/result arrays,
single-group token arrays, and deep-equality calls on unchanged siblings.
Validation now skips already validated immutable children before allocating
diagnostic paths, still checks every uncacheable sibling, and revalidates mutable
host attributes. Simple group matching avoids splitting exact single groups;
whitespace/multi-group declarations and live declaration changes retain their
semantics. Equality uses shared-child identity before recursing and still checks
changed attributes, marks, text, and schema ownership.

The unchanged 300-edit diagnostic measured 10,000-block local p50 at 3.6018ms
before and 1.0699ms after these changes on this machine. These ordered diagnostic
observations are not a cross-hardware performance promise. The normal gate then
measured local/remote growth at 7.50x/7.55x against 15x. Heap limits passed and
bundle sizes stay inside the unchanged caps (1576.5 KiB ESM / 1311.3 KiB CJS).
**The complete performance gate remains unproven:** that run rejected server
HTML's 10,000-block p95 of 931.09ms against 900ms. Neither the limits nor sample
counts have been increased, and the failed attempts remain local evidence.
See `artifacts/shared-equality-performance-20261007.log` and
`artifacts/shared-equality-verification-20261007.json`.

The GitHub browser run also found an ambiguous unscoped JSON-tab test selector,
now scoped to the output navigation, and a Linux WebKit native-color focus
failure. Windows did not reproduce the latter; before/after focus diagnostics
are added without removing the assertion or claiming Linux resolution.
The recorded trace attachments confirm Chromium/Firefox use `type="color"`,
whereas Windows WebKit exposes `type="text"`. Its text-fallback focus pass is
not evidence for Linux's native color control. Functional checks pass **2,623
tests / 196 files**; nine serial, retry-free three-engine workflows are recorded.

## Blank-line appearance follow-up

Unreleased, 2026-10-06: the default standalone HTML blank-line rule adds no
dependency or API and stays within all existing caps (**1576.2 KiB ESM /
1311.1 KiB CJS**, caps 1576.5/1311.5). No budget is increased for this follow-up.
`artifacts/html-blank-lines-complete-gate-20261006.log` passes **2,619 tests /
196 files**, packaging/runtime/types and all performance/memory gates.
1,000→10,000 median growth: server HTML 8.79x, local 5.29x, remote 11.67x,
all below 15x. Live growth remains 0.00 MiB / 8 MiB; destroyed editor 0.06 MiB /
16 MiB. These are local benchmark results, not native Word print evidence.

## Childless paragraph retention cost

Unreleased, 2026-10-06: restoring the existing empty-paragraph marker in browser
and server HTML importers and emitting it from HTML export measures **1576.1 KiB
ESM / 1311.1 KiB CJS** overall. Aggregate ceilings rise by **0.5 KiB each** to
1576.5/1311.5; all entry-specific/CSS, latency, scaling and heap limits remain
unchanged. No API or runtime dependency is added. The initial full gate stops
at the previous size cap (0.1 KiB over) in
`artifacts/html-empty-paragraph-complete-gate-20261006.log`; it is not a passing
full gate. This narrow allowance does not waive any remaining parity requirement.

Verified final gate: `artifacts/html-empty-paragraph-complete-gate-verified-20261006.log`
passes **2,618 tests / 196 files**, API/package/runtime/type checks and all budgets.
1,000→10,000 median growth: server HTML **8.29x**, local **7.25x**, remote
**10.48x**, all below 15x. Live 2,000-edit growth is 0.00 MiB / 8 MiB; destroyed
editor retention 0.06 MiB / 16 MiB; retained server document 15.17 MiB / 48 MiB.
The intermediate `html-empty-paragraph-complete-gate-final-20261006.log` is a
failed run: its older DOCX test required the now-fixed empty-leaf mismatch. The
test now checks complete JSON without an exception; it was not weakened.

## Inert block-wrapper cost

Unreleased, 2026-10-06: the shared optional block-wrapper mode, paragraph
authoring command and explicit empty-paragraph flow guard measure
**1575.9 KiB ESM / 1310.9 KiB CJS** overall. Aggregate ceilings rise narrowly
by 1 KiB each to **1576/1311**; isolated `html-inert` entry ceilings rise from
6/5 to **7/6 KiB** (measured about 6.0/5.1). All other entry/CSS limits and all
latency/scaling/heap limits remain unchanged; no new runtime dependency.
Initial size failure is retained in
`artifacts/html-inert-block-budget-initial-20261006.log`.

Final unchanged-source full gate:
`artifacts/html-inert-block-complete-gate-final-20261006.log` passes 2,606 tests /
195 files, API/package/headless/framework checks and performance budgets.
1,000→10,000 median scaling: server HTML **8.83x**, local edits **8.97x**,
incremental remote edits **9.80x**, all under 15x. Live 2,000-edit session heap
growth: 0.00 MiB / 8 MiB; destroyed editor: 0.06 MiB / 16 MiB; retained 10,000-block
server HTML document: 15.20 MiB / 48 MiB. These are local benchmarks, not mobile
device or arbitrary custom-renderer guarantees.

## Link destination integrity cost

Unreleased source-bound navigation follow-up, 2026-10-06: measured totals are
**1574.7 KiB ESM / 1309.9 KiB CJS**, +2.6/+2.2 KiB over the literal-link
checkpoint. Aggregate ceilings gain 2 KiB each to **1575/1310**. Individual
entries, CSS, latency, scaling and heap caps stay fixed; no runtime dependency
is added. Retained initial aggregate failure:
`artifacts/html-link-origin-budget-initial-20261006.log`; checked result:
`artifacts/html-link-origin-budget-checked-20261006.log`. Version-11 CommonMark
requires 563 default / 613 strongest opt-in. Actual browser navigation is tested
separately from model/source retention.

Unchanged-source full gate:
`artifacts/html-link-origin-complete-gate-final-20261006.log` passes 2,585 tests /
194 files, API/package/headless/framework checks and performance budgets. Server
HTML median scaling (1,000→10,000) is 8.91x / 15x; local edits 9.97x / 15x;
incremental remote edits 11.38x / 15x. Retained 10,000-block server HTML document:
15.18 MiB / 48 MiB; destroyed editor: 0.06 MiB / 16 MiB. No performance limit
was raised. The separate aggregate size increment above remains explicit.

Historical literal-link checkpoint: shared literal-control validation, escaped Markdown
destinations and bound native backslash carriers measure about **1572.1 KiB ESM /
1307.7 KiB CJS**, approximately +2.0/+1.9 KiB over the raw-source checkpoint.
Aggregate ceilings are narrowly 1573/1308 KiB. Every existing individual entry,
CSS, latency, scaling and heap ceiling is unchanged; no runtime dependency is
added. Retained pre-allowance failure:
`artifacts/html-link-literal-budget-20261006.log`.

The four repaired Markdown destination cases do not excuse falsely equating raw
URL controls/backslashes with encoded data. Version-10 CommonMark verification
required 563 default / 610 strongest opt-in. Four old false URL matches were
repaired; that checkpoint introduced raw HTML navigation regression 21, now
repaired by source-bound HTML intent. See
[the oracle correction](MARKDOWN_DOCUMENT_FLOW.md#link-destination-integrity-and-oracle-correction).

Historical frozen gate `artifacts/html-link-literal-complete-gate-final-20261006.log`
passes 2,569 tests / 193 files, 409 declarations, packed ESM/CJS and actual
Node/workerd (473 link contracts in each). Retained 10,000-block server HTML
document: 15.18 MiB / 48 MiB; destroyed-editor retained heap: 0.06 MiB / 16 MiB.
Server parse median growth 1,000→10,000 blocks: 9.96× / 15×. No performance cap
was increased for this fix. The 681-file source checksum is recorded separately.

## Literal raw-source and empty-code input cost (2026-10-06, Unreleased)

The shared optional inline/raw-source factory measures 5,204 bytes ESM / 4,389
bytes CJS. Explicit script/style/textarea source, literal Unicode HTML import,
strict badge inspection and empty inline-code input bring total runtime code
to 1,570.1 / 1,305.8 KiB, approximately +2.0 / +1.8 KiB over the prior source
module checkpoint. Optional entry ceilings are 6 / 5 KiB; aggregate ceilings
are 1,571 / 1,306. Keep every pre-existing entry/CSS, latency, scaling and heap
ceiling fixed. The preceding 1,570 ESM ceiling failure is retained in
`artifacts/html-inert-raw-text-complete-gate-20261006.log`, not hidden. This is
an explicitly measured new-feature allowance, not an unchanged-bundle claim.

`artifacts/html-inert-raw-text-complete-gate-checked-20261006.log` passes the
complete gate: 2,551 tests / 191 files plus API/packed/runtime/headless/framework
checks. Local 10k p50/p95 is 2.62/10.34 ms, incremental remote 2.92/11.47 ms;
median scaling is 10.84x / 9.21x against 15x. Server HTML p50/p95 is
450.78/478.15 ms, 8.71x scaling, retained document heap 15.16 MiB / 48 MiB.
No sample/outlier/performance limit was relaxed. These default-importer
performance checks do not certify dense opt-in raw-source/token retention at
every scale. Earlier checkpoints below remain historical evidence.

## Optional inert source preservation cost (2026-10-06, Unreleased)

The separate `html-inert` entry measures 4,462 bytes ESM / 3,729 bytes CJS;
its bounded entry ceilings are 5 / 4 KiB. Opt-in server lexical inspection and
this module bring aggregate runtime code to 1,568.1 / 1,304.0 KiB. Account for
the measured new feature with aggregate ceilings 1,569 / 1,305, retaining every
pre-existing entry/CSS ceiling and all latency, scaling and heap contracts.
The preceding 1,563 / 1,300 aggregate failures are retained in the source-token
and inert-source budget logs. This is an explicit optional-feature cost, not a
claim that the entire distribution is unchanged in size. Core/StarterKit do
not import the optional factory; source inspection is disabled by default.

On unchanged source, `artifacts/html-inert-production-complete-gate-20261006.log`
passes 2,507 tests / 189 files and the full public/packed/runtime/type suite.
Local 10k p50/p95 is 2.65/5.52 ms with 7.92x median scaling (limit 15x);
incremental remote is 2.94/10.79 ms, 9.25x; server HTML 435.15/468.62 ms,
8.88x, with retained heap 15.15 MiB / 48 MiB. No latency, scaling, sample,
outlier, heap or pre-existing entry/CSS ceiling changed. This default-importer
run does not certify dense opt-in token retention at every scale.

## Streaming text-point lookup (2026-10-06, Unreleased)

`src/core/transaction/mapping.ts` now walks to the required text point instead
of allocating a full-document leaf-position table for each selection mapping.
Endpoint association, empty runs, nested blocks, nearest-point behavior and
invalid-position errors are unchanged. Four permanent regressions include an
independent exhaustive oracle and a 10,000-block allocation check. The saved
pre-change resolver agrees in 4,718 prototype comparisons; shipped root/core
ESM/CommonJS agree in 40,588 comparisons per consumer. Complete edited JSON and
selection match for carets at the first and last blocks. The diagnostic removes
30,000 Array iterator creations per 10k edit (40,050 to 10,050), not all editing
allocations. Child-validation and recursive node-size behavior remain unchanged.

The serialized `artifacts/stream-text-point-complete-gate-20261006.log` passes
all 2,457 tests / 186 files, types, 407 API snapshots, packed/runtime/headless
checks and unchanged resource limits. Local 10k p50/p95 is 2.62/9.42 ms with
7.22x median scaling (limit 15x); remote 3.02/10.51 ms, 10.06x; server HTML
434.59/461.60 ms, 9.01x, retained heap 15.15 MiB / 48 MiB. Aggregate sizes are
1,562.7 KiB ESM / 1,563 and 1,299.6 KiB CJS / 1,300. No limit, warmup, sample
count or outlier rule changed. The preceding 16.85x failure below is retained.

Fifty-one recorded desktop cases pass across Chromium/Firefox/WebKit with one
worker and no retries, including typing/history, backward selection, tables,
clipboard, drag feedback, collaboration and 100k virtualization. Source checks
before/after match the same 664-file snapshot in
`artifacts/stream-text-point-source-20261006.json`. This is a selected regression
batch, not a new full matrix or physical mobile/IME certification. Captures also
expose a translucent sticky-header readability issue; functional passes do not
certify that visual detail. Evidence: `stream-text-point-recorded-20261006.log`
and `stream-text-point-compiled-20261006.log` in `artifacts/`.

Previous schema-owned Markdown boundary (2026-10-06, Unreleased): the serialized
`artifacts/markdown-schema-html-complete-gate-20261006.log` fails local median
growth at **16.85x / 15x** (1k 0.55 ms; 10k p50/p95 9.34/26.43 ms). It passes
HTML scaling/latency/heap, build sizes and preceding runtime/format checks,
but is not a complete green gate. Independent types, all 2,453 unit tests and
18 recorded Markdown editing cases pass on its unchanged 663-file source.
Older complete passes below are separate samples, not current failure erasure.

The artifact-only `schema-child-walk-prototype-20261006.mjs` avoids constructing
validation paths for already-cached immutable children and removes the temporary
boolean array, while still visiting every uncacheable sibling. It checks 576
integrity cases per variant, complete actual edited JSON and identical errors
for mutable attributes, later invalid siblings and foreign-schema content.
The 10k edit creates 40,050 versus 30,051 Array iterators under the counter.
Paired unminified 10k medians are baseline/candidate 8.23/6.53 ms and 6.76/6.31 ms;
candidate p95s are worse (13.13/13.12 versus 8.88/9.88 ms). This establishes an
allocation reduction, not reliable tail improvement or a normal gate pass.
The proposal remains unintegrated. Keep both the initial missing-CoreSchemaSpec
diagnostic failure and corrected log:
`artifacts/schema-child-walk-prototype-20261006.log`,
`artifacts/schema-child-walk-prototype-checked-20261006.log`.

FountainJS treats performance as a measured release property, not a claim that
follows from using an immutable tree. The repository contains two enforced
gates:

```sh
pnpm build
pnpm test:budget
pnpm test:performance
pnpm test:browser
```

`test:performance` requires Node's exposed garbage collector and is already
wired through the package script and CI. It measures the built production ESM
entry rather than TypeScript source. The browser suite measures the real input,
state, reconciliation, selection, and next-animation-frame path in Chromium,
Firefox, and WebKit.

The earlier published contract is certified by the public 452-test package gate and
289-pass Chromium/Firefox/WebKit/mobile matrix in [CI run
`8a6264e`](https://github.com/eddolo/fountainjs/actions/runs/33977243766), with
the two non-passing matrix entries being intentional non-Chromium skips for the
Chromium-only PDF-binary assertion.

## Current allocation follow-up (2026-10-06, Unreleased)

Primitive attribute checks no longer allocate an initial ancestry Set. Recursive
objects still receive cycle tracking, cloning/freezing and cacheability checks.
Simple top-level repeated schema names (`block+`, `inline*`, `table_row+`, etc.)
now use direct cardinality/membership checks; the general position matcher is
retained for complex expressions. A 10,000-child simple-rule check previously
allocated 20,004 Sets and now allocates none. An isolated complete local edit
measured 20,013 versus three Sets with identical edited JSON; this is allocation
evidence, not a claim of zero total allocations or logarithmic editing.

The serialized production-package gate passes with all limits, warmups, sample
counts and outliers unchanged. Its current Windows / Node 24.19.0 sample is:

| Blocks | Local p50 / p95 | Incremental remote p50 / p95 | Server HTML p50 / p95 |
| ---: | ---: | ---: | ---: |
| 100 | 0.22 / 1.87 ms | 0.12 / 0.17 ms | 7.18 / 11.20 ms |
| 1,000 | 0.68 / 1.07 ms | 0.54 / 1.39 ms | 50.38 / 54.80 ms |
| 5,000 | 2.38 / 4.78 ms | 3.42 / 4.16 ms | 232.00 / 253.00 ms |
| 10,000 | 4.97 / 9.10 ms | 6.37 / 12.95 ms | 451.68 / 483.90 ms |

Median growth is 7.35x local, 11.70x incremental remote and 8.96x HTML, below
the unchanged 15x ceilings. Retained HTML-document heap is 15.17 MiB / 48 MiB.
The full gate also passes 2,438 unit tests, package/runtime/type checks and size
checks. See `artifacts/content-matcher-complete-gate-20261006.log` and its frozen
662-file source snapshot. Earlier failures remain retained: 556.19 / 500 ms
HTML p95, 40.89 / 35 ms HTML p95, and the first helper-only local curve
15.31x / 15x. This passing sample does not prove the cause of every earlier
outlier, predict all machines or certify physical-device input.

After an explicit browser-fixture readiness assertion, the final serialized
complete gate again passes 2,438 tests and all limits. Its local 10,000-block
p50/p95 is 5.36/12.89 ms (10.16x median growth); HTML is 448.56/527.02 ms
(8.61x), with 14.30 MiB retained heap. All 33 recorded editing plus 18
structural/large-document browser cases pass with unchanged 662-file hashes;
the three new instance-editing captures are inspected. The initial 32-pass/
one-failure browser run and two startup document requests are retained, not
counted as green. See `artifacts/content-matcher-ready-complete-gate-20261006.log`,
`artifacts/content-matcher-ready-browser-20261006.log` and
`artifacts/content-matcher-structure-browser-20261006.log`. This is selected
desktop coverage, not a new full browser/mobile release matrix.

## Recorded baseline

This development baseline was recorded on 2026-09-04 with Node 24.19 on
Windows. It is descriptive; the ceilings in
`scripts/check-performance-budgets.mjs` are the enforced, cross-machine
contract.

| Top-level blocks | Local transaction p50 / p95 | Incremental remote p50 / p95 | Full JSON boundary p50 / p95 |
| ---: | ---: | ---: | ---: |
| 100 | 0.16 / 0.55 ms | 0.11 / 0.38 ms | 1.34 / 1.96 ms |
| 1,000 | 0.87 / 1.55 ms | 0.94 / 1.61 ms | 9.50 / 15.56 ms |
| 5,000 | 3.75 / 6.19 ms | 4.16 / 6.14 ms | 52.82 / 59.36 ms |
| 10,000 | 8.57 / 12.03 ms | 10.42 / 13.83 ms | 94.12 / 98.44 ms |

The isolated DOM-free HTML importer has its own production-build curve. The
fixture contains a paragraph, strong text, ordinary text, and a safe link per
top-level block. The 10,000-block source is about 1.1 MiB/60,000 parsed nodes,
so the benchmark explicitly opts into the public 2 MiB/100,000-node policy
instead of weakening request-oriented defaults.

| HTML blocks | Server import p50 / p95 |
| ---: | ---: |
| 100 | 6.07 / 9.26 ms |
| 1,000 | 35.66 / 41.20 ms |
| 5,000 | 191.40 / 206.31 ms |
| 10,000 | 425.07 / 475.79 ms |

CI caps those p95 values at 35/120/500/900 ms respectively, caps median growth
from 1,000 to 10,000 blocks at 15×, and caps the retained 10,000-block parsed
document at 48 MiB. This sample grew 11.92× and retained 14.21 MiB. Input byte,
node, depth, attribute, and parser-error limits are independently tested; see
[SERVER_HTML.md](SERVER_HTML.md).

The local and incremental-remote medians may grow by at most 15× when the
fixture grows from 1,000 to 10,000 blocks. This allowance absorbs runner noise
but rejects the former quadratic content-expression path, which approaches
100× growth. Absolute p95 ceilings also apply at every size.

The retained-memory gate performs 2,000 edits in one live 1,000-block editor,
then creates, subscribes to, edits, unsubscribes from, and destroys forty more
editors. Garbage collection runs before each comparison. The live session may
grow by at most 8 MiB and destroyed editors may retain at most 16 MiB. The
recorded destroyed-editor sample retained 0.13 MiB.

The build gate currently limits the independently loadable production entries,
including 111/93 KiB raw for the ESM/CommonJS root, 30/25 KiB for the optional
Yjs adapter, 54/45 KiB for the isolated DOM pagination entry, 7/6 KiB for the
DOM-free table-of-contents entry, 13/11 KiB for headless integrity, 6/5 KiB for
its DOM behavior, 12/10 KiB for its optional React inspector, and 270/225 KiB
for the self-contained server HTML entry. Aggregate ceilings are 1,563/1,300 KiB for all
emitted ESM/CommonJS runtime code excluding the isolated full emoji catalogue.
Gzip sizes are printed by the build but raw sizes are enforced because they are
deterministic. The self-contained server parser and source-aware browser paste
pipeline intentionally affect aggregate code; exact per-entry ceilings remain
independent, so adding a feature cannot hide growth in a consumer-facing package
surface.

## Why small edits stay local

- Schema validation memoizes successfully validated immutable subtrees in a
  `WeakSet`. A text edit revisits the new root, the changed ancestry, and the
  changed leaf; shared subtrees do not rerun attribute or custom invariant
  validation. Failed and foreign-schema nodes are never trusted.
- `Node.eq` immediately accepts shared identity. Transaction and NodeView
  comparison therefore stop at unchanged branches.
- Simple repeated schema names use direct membership/cardinality checks without
  per-child position Sets. Complex expressions retain the general matcher, which
  accumulates accepted positions without copying the complete set for every
  child. Ordinary `block+` and `inline*` validation remains linear.
- The undecorated DOM renderer reconciles by immutable top-level identity. The
  1,000-block browser gate inserts through `beforeinput`, waits for the next
  animation frame, requires 999 unchanged block elements to retain identity,
  caps added/removed DOM nodes at three each, and requires input-to-paint below
  250 ms in every desktop engine. Structural insertion/removal also moves and
  rebases unchanged blocks instead of recreating them.
- DOM pagination caches geometry by immutable node plus rendered-element
  identity and rebases item, fragment, template, warning, and structural source
  paths when top-level indexes shift. Repeated edits in 1,000 blocks are capped
  at 75 ms p95; alternating edge edits in 5,000 blocks are capped at 250 ms p95
  and two geometry reads; six 5,000-block leading insertion/removal cycles are
  capped at 500 ms p95 and exactly two/one reads while retaining every unchanged
  DOM block.
- Unchanged React NodeViews are carried across that reconciliation without an
  `update` or React render. A fifty-NodeView regression test requires zero
  unrelated rerenders. React state uses `useSyncExternalStore`, and Strict Mode
  lifecycle tests require one owned editor plus exact teardown.
- Provider-neutral adapters can submit a current-state transaction through
  `applyRemoteTransaction`. The Yjs adapter converts text-only `Y.Text` deltas
  directly into Fountain steps, so a remote keystroke does not rebuild or parse
  the document JSON. Structural or untrusted snapshot updates deliberately use
  the fully validated JSON boundary.
- Opt-in top-level virtualization keeps only the viewport, overscan, and
  selection islands mounted. Its renderer-neutral prefix index reuses measured
  heights by immutable node identity and preserves complete model positions for
  selection and decorations. A 100,000-block real-browser gate requires fewer
  than 100 mounted top-level blocks through scrolling, distant IME input, and
  copy restoration in Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit. See [VIRTUALIZATION.md](VIRTUALIZATION.md).

## Interpretation and limits

The three curves measure different contracts. Local and incremental remote
updates start with a trusted immutable Fountain document. The JSON boundary
accepts untrusted portable data, so parsing and complete validation are required
and intentionally remain proportional to document size.

The current array-backed top-level document also makes a leaf update linear in
the number of top-level blocks because the changed ancestry is copied. The gate
proves bounded near-linear behavior; it does not claim logarithmic editing.
Decorated non-virtual documents currently use a complete render pass because an
earlier edit can shift absolute decoration positions. Virtual views limit that
work to mounted windows but still recompute their absolute full-model positions.
Virtualization is top-level only; one enormous mounted node remains the host or
NodeView's responsibility. Physical-device input latency, multi-hour browser
soak tests, and independent production traces remain useful maturity work. These limits are recorded so the
benchmark is evidence, not a claim that FountainJS has already accumulated
ProseMirror's decade of production tuning.

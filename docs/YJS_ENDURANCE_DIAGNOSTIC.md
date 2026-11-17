# Real retained-Yjs endurance diagnostic

`scripts/diagnose-yjs-endurance.mjs` is an opt-in semantic diagnostic and metrics
collector for an **installed Fountain package**. It does not change CI, package
scripts, library behavior, or acceptance limits. The installed-package smoke
and a twelve-cycle baseline at 100 and 1,000 paragraphs pass their semantic
assertions. The baseline exposes substantial retained-adapter latency at 1,000
paragraphs. The subsequent repair materially reduces structural-edit latency
but leaves typing latency open; these measurements do not establish production
readiness.

## Consumer and invocation

Use a completed build, pack it, and install the tarball in a separate consumer.
The script resolves CommonJS public exports from that installed package and uses
its installed `yjs` peer. It never imports repository source or a private adapter.
Checkpoint functions come from the existing public experimental entry; ordinary
editing always uses `fountainjs-editor/yjs`.

Example PowerShell setup, from the repository after its build has finished:

```powershell
$enduranceConsumer = Join-Path ([IO.Path]::GetTempPath()) ('fountain-endurance-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $enduranceConsumer | Out-Null
$enduranceTarball = Join-Path $enduranceConsumer 'fountainjs-editor.tgz'
pnpm pack --out $enduranceTarball
Set-Content -LiteralPath (Join-Path $enduranceConsumer 'package.json') -Value '{"private":true}'
pnpm --dir $enduranceConsumer add --ignore-scripts $enduranceTarball yjs@13.6.32
$endurancePackage = Join-Path $enduranceConsumer 'node_modules/fountainjs-editor'
```

First run a small semantic smoke before collecting larger metrics:

```powershell
node --expose-gc scripts/diagnose-yjs-endurance.mjs --package-root $endurancePackage --tarball $enduranceTarball --sizes 10 --cycles 2 --checkpoint-every 1 --output artifacts/yjs-endurance-smoke.json
```

The bounded default workload uses 100 and 1,000 paragraphs, twelve cycles and a
checkpoint every six cycles. The final cycle always checkpoints:

```powershell
node --expose-gc scripts/diagnose-yjs-endurance.mjs --package-root $endurancePackage --tarball $enduranceTarball --output artifacts/yjs-endurance-diagnostic.json
```

Larger workloads are explicit, for example `--sizes 5000 --cycles 24
--checkpoint-every 6`. There is no timer-based infinite loop. The argument bounds
are safety limits on requested workload, not performance acceptance thresholds.
Run serially when other browser/build gates have completed.

## Workload and enforced semantics

Two independent Yjs documents exchange real state-vector updates. Only the
first author initializes a room; the second receives its established state
before mounting. Public stable-node-ID support precedes collaboration.
The working paragraph is accompanied by untouched reference paragraphs, a
heading, quote, list, table and image reference. No asset is fetched.

Each cycle types a character burst, partially deletes it, adds/removes a mark,
then withholds delivery while one author splits or wraps the paragraph and the
other inserts a unique token. Delivery order alternates. Two exchanges include
any schema-owned repairs; replaying an actual previous update must leave shared
bytes unchanged. Both editors must remain connected and have identical JSON
and valid stable IDs.

Explicit public history boundaries separate actions. History-neutral review
metadata must survive undo. Structural undo preserves the peer's token and the
original paragraph ID; redo must recreate the exact merged JSON. The second
author can undo/redo its own token without undoing review metadata. Untouched
reference blocks must remain exactly unchanged.

Checkpoints are captured without modifying the source, restored into an isolated
document, and mounted through the public default adapter. Restoring must retain
the model and room identity but must not manufacture local author history.
The still-active original author then types, undoes, redoes and undoes again;
the reopened peer must accept each update and retain empty author history.

Failures produce a nonzero exit and a report containing the stage, cycle,
partial measurements and error. The script stops before starting another
profile. Editors and documents are destroyed on both success and failure.

## Measurements and interpretation

The report records the installed version, a SHA-256 fingerprint of `dist/**`
plus the export manifest, an optional tarball digest, Node/Yjs versions,
operating system/CPU, workload and native client IDs. The optional tarball hash
records the supplied artifact; it does not independently prove how the consumer
was installed. Initial room IDs and reopened client IDs remain naturally fresh.

Measurements include first/median/p95/maximum and all samples for local actions,
peer update application, delta encoding and checkpoint capture/restore. Typing
latency is explicitly a **burst**, not one keystroke. Assertions, equality
checks and forced-GC milestone collection sit outside the timed action. Traffic
counts include repair exchanges, duplicate replay and empty protocol updates;
they exclude initial bootstrap, checkpoint payloads and network framing.

Milestones report visible document size, full V1 bytes/hash, model hash, undo
availability and live memory. After the workload returns and its fixtures are
released, a separate event-loop turn and forced JS GC measure destroyed-session
memory. Loaded modules/JIT and the numeric report remain resident; the result
is evidence, not a universal leak verdict. No local history is cleared and no
Yjs GC policy is changed to improve numbers.

No timing or byte-growth thresholds are invented. Compare matched profiles
before defining reviewed limits. Retained provenance and author undo cause
legitimate growth; immutable native allocations intentionally survive undo
([deletion contract](YJS_RETAINED_DELETION_AUDIT.md)). Increasing full-state bytes
is therefore not by itself a defect. Unchanged-sized documents becoming steadily
slower, duplicated state after replay, unnecessary whole-document traffic, or
unreleased destroyed sessions are stronger signals.

Same-room checkpoint recovery is **not compaction** and does not serialize
UndoManager stacks, awareness or provider queues
([checkpoint ownership](YJS_RETAINED_CHECKPOINT_AUDIT.md#what-this-does-not-restore)).
The script deliberately does not expose an admin compaction command. A separate
test of the existing authority reference must apply explicit writer fencing,
source archives, history-reset and offline-branch policies
([compaction boundary](YJS_RETAINED_COMPACTION_DIAGNOSTIC.md),
[handoff contract](YJS_RETAINED_HANDOFF_AUDIT.md)).

This uses an in-memory transport relay, not WebSocket/server persistence or a
physical browser. It does not certify network failure recovery, native input,
multi-host authority, accessibility, or production readiness.

## Initial semantic smoke — 2026-11-10

All 998 files in the installed consumer's `dist` directory matched the current
build by SHA-256 and inventory before execution. Evidence:
`artifacts/yjs-endurance-packed-match-20261110.json`. The actual tarball was
`artifacts/fountainjs-selection-20261110.tgz`; its digest and installed runtime
fingerprint are included in the report.

The first invocation refused the diagnostic fixture's numeric image dimensions
before creating a room. Fountain's image schema requires CSS size strings; the
fixture was corrected to `320px`/`180px`, with the initial failure retained in
`artifacts/yjs-endurance-smoke-20261110-initial.json` and `.log`. No library
assertion, capacity limit, or semantic expectation changed.

The corrected smoke passes both split and quote cycles, both checkpoint/reopen
continuations, actual duplicate updates, marks/deletion, neutral metadata,
stable identities and author undo/redo. Evidence:
`artifacts/yjs-endurance-smoke-20261110.json` and `.log`. It used Node 24.22.1,
Yjs 13.6.32 and the installed 0.4.0-beta.2 candidate. Other verification jobs
were running concurrently; its recorded timings/memory are **not** an endurance
baseline or performance comparison. Larger profiles were subsequently measured
after those verification jobs completed, as recorded below.

## Baseline and CPU diagnosis — 2026-11-10

The unprofiled baseline used the same installed candidate, twelve cycles per
size and checkpoint cadence six. Both sizes passed all semantic assertions.
Evidence: `artifacts/yjs-endurance-20261110.json` and `.log`.

| Action | 100 paragraphs, median ms | 1,000 paragraphs, median ms | Samples per size |
| --- | ---: | ---: | ---: |
| Type an 11-character burst | 121.30 | 621.76 | 12 |
| Split the working paragraph | 54.02 | 1,611.53 | 6 |
| Wrap it in a quote | 18.47 | 340.38 | 6 |
| Capture a checkpoint | 52.01 | 319.50 | 2 |
| Restore a checkpoint | 23.91 | 175.62 | 2 |

The first typing burst was 24.51/114.46 ms respectively; subsequent bursts
operate on the retained history produced by earlier cycles. The sample sequence
is included in the JSON. This is a bounded regression baseline on one machine,
not a statistically established latency guarantee or an independent leak test.
Remote-apply counts also include empty and duplicate updates; their overall
median must not be presented as the cost of applying a substantive edit.

One separate CPU-profile run used 1,000 paragraphs, two cycles and checkpoint
cadence one. It also passed the semantic assertions. The exact invocation was:

```powershell
node --expose-gc --cpu-prof --cpu-prof-dir artifacts --cpu-prof-name yjs-endurance-1000x2-20261110.cpuprofile scripts/diagnose-yjs-endurance.mjs --package-root artifacts/selection-consumer-20261110/node_modules/fountainjs-editor --tarball artifacts/fountainjs-selection-20261110.tgz --sizes 1000 --cycles 2 --checkpoint-every 1 --output artifacts/yjs-endurance-profile-20261110.json
```

The profiled split took 1,692.05 ms, quote wrap 360.16 ms, and the two typing
bursts 150.03/553.56 ms. These instrumented two-cycle measurements are distinct
from the unprofiled twelve-cycle baseline above; neither their timing nor their
checkpoint cadence should be substituted into that baseline.

The raw local profile is `artifacts/yjs-endurance-1000x2-20261110.cpuprofile`.
The compact source-mapped analysis is
`artifacts/yjs-endurance-cpu-summary-20261110.json`; the diagnostic report and
log are `artifacts/yjs-endurance-profile-20261110.json` and `.log`. The installed
runtime fingerprint is
`454c9699818a88a92b33ad23c3f1eba21f3a68ccc57a64f9170b8930cca45aee`;
the supplied tarball SHA-256 is
`70d82ed489ac719f60b690e53c7ab9db1b061b617dbc38ebd5912ece696bc3a2`.
These identify the measured pre-optimization candidate independently of later
source edits. Runtime: Node 24.22.1, Yjs 13.6.32, Windows build 26200,
Intel Core i3-12100F.

The 8,097.27 ms sampled profile attributes 5,293.98 ms to the nearest retained
Fountain/Yjs caller, 332.14 ms to core and 111.19 ms to stable IDs. This exclusive
nearest-caller attribution includes dependency descendants. Package fingerprint
work consumed 613.94 ms and GC 496.39 ms; neither is editing latency. Inclusive
call stacks overlap and must not be added to these totals.

Concrete findings in the profiled source snapshot:

- `src/yjs/retained-text.ts:201` (`assertLive`) and
  `src/yjs/retained-nodes.ts:106` (`valid`) repeatedly read shared `Y.Map.size`
  while visiting text groups and structural nodes. In
  `node_modules/yjs/src/types/YMap.js:144`, size is implemented as
  `[...createMapIterator(this)].length`: each read scans and allocates over the
  whole map. During the split stack, 917.24 ms and 464.30 ms respectively were
  attributed to these checks, about 84% of its 1,637.75 sampled ms.
- `src/yjs/retained-document.ts:795` gates unchanged text-group preservation
  with `!intent`. A single split therefore disables that reuse for every group,
  including untouched reference paragraphs. The following per-group work at
  lines 839–841 and 895 repeatedly projects/resolves those groups. This supplies
  a concrete route from one local split to repeated whole-pool validation.
- `src/yjs/retained-document.ts:935` uses a document-wide `reordered` flag to
  choose `nodes.childrenOf(parent)` for subsequent parents. Once one parent
  changes order, otherwise unchanged parents can incur fresh validated reads.
- The two typing bursts contained 657.40 sampled ms, including 417.75 ms in the
  general `change` path and 354.85 ms in `finishChange` (overlapping inclusive
  times). Repeated pool-size checks alone do not explain their latency. Inspect
  `prepareChangeText` at line 688 and general projection at line 720 before
  attributing this cost to the core or stable-node-ID extension. Binding
  fragmentation after formatting/split/undo is a candidate cause of fallback,
  not a separately instrumented conclusion of this profile.

The first repair targets are preserving unaffected groups during a split and
avoiding repeated full-pool checks within one validated operation. Any cached
count or validation result must remain correct under remote transactions,
author undo and foreign changes; removing capacity checks is not a solution.
Repeat the exact packed-package workload after repairs and retain every semantic
assertion. This diagnostic itself changes no library behavior or acceptance
threshold.

## Measured repair — 2026-11-10

The same installed-package workload was repeated after the repair, with the
same Node/Yjs versions, hardware, 12 cycles and semantic assertions. Other
Fountain build/browser/source jobs were stopped during each measured run.
These are matched single runs on one machine, not a cross-device benchmark.

| Paragraphs | Action | Baseline median | Repaired median |
| --- | --- | ---: | ---: |
| 100 | Split | 54.02 ms | 24.91 ms |
| 100 | Wrap | 18.47 ms | 14.50 ms |
| 100 | 11-character typing burst | 121.30 ms | 127.64 ms |
| 1,000 | Split | 1,611.53 ms | 115.93 ms |
| 1,000 | Wrap | 340.38 ms | 99.46 ms |
| 1,000 | 11-character typing burst | 621.76 ms | 585.78 ms |

The 1,000-paragraph split is about 13.9 times faster in this workload; its
repaired p95 is 126.44 ms. The small typing changes do **not** establish a
typing improvement: 100-paragraph bursts are slower in this sample, and
1,000-paragraph typing remains a substantial gap. Remote-apply p95 also remains
open (26.63 to 30.34 ms at 1,000 paragraphs); the sample includes empty protocol
updates and is not a network-latency measurement.

Both repaired profiles pass all convergence, duplicate-delivery, untouched
content, author-history and checkpoint-continuation assertions. Evidence:
`artifacts/yjs-endurance-repaired-20261110.json`. All 1,000 installed `dist`
files match the rebuilt package; the extra two files are internal helper
declarations. See `artifacts/yjs-reconciliation-packed-match-20261110.json`.

The implementation changes are deliberately bounded:

- `src/yjs/retained-map-capacity.ts` uses Yjs's physical `_map.size` only as a
  conservative live-key upper bound. When it cannot prove capacity, the exact
  public `size` check still runs. This relies on the tested Yjs 13.6.x map
  representation; it adds no cached count or observers. Large tombstone-heavy
  pools can still require linear scans. Every existing pool limit is unchanged.
- `RetainedDocumentStore.change` preserves unaffected text groups during a
  split only after the existing identity/ownership/provenance proof. Both
  explicit split targets still process their boundaries. The document-wide
  parent-order invalidation remains unchanged.
- The new concurrent-edit regression found an existing empty-sibling defect:
  an earlier split shifted its numeric path, causing unnecessary allocation
  and layout writes. A peer could type into that paragraph, then the splitter's
  undo removed layout needed by the surviving text. Exact immutable parent/leaf
  identity and zero-length bindings now preserve that original empty record.
  The unchanged packed baseline reproduces both delivery-order failures;
  the repaired installed package passes the same script, including redo.

Source validation passes 5,151 tests in 321 files with no failures or skips.
Seventeen new tests cover capacity boundaries, pending/remote transactions,
undo, unchanged marked siblings, split edges, nested relocation and empty
record retention. No test asserts machine-dependent elapsed time.
The prior CommonJS size cap fails by 34 bytes; a documented 64-byte aggregate
allowance covers the repair. No other size, storage or performance cap changes.
Build, TypeScript, 450 public declarations, package exports and the 139-module
headless boundary pass. All 48 compiled-default browser journeys pass across
Chromium, Firefox and WebKit. The added journey uses the file picker, native
typing/Enter, pause/synchronize controls and author Undo/Redo. Firefox undo and
WebKit redo screenshots plus sampled Firefox recording frames were inspected;
both views retain the peer's text and marked context.

A separate installed consumer with Yjs 13.6.33 also passes both empty-sibling
reproductions and the 1,000-paragraph/two-cycle checkpoint diagnostic. This is
bounded patch-version coverage, not the complete source/browser matrix on
13.6.33. The workspace remains pinned to 13.6.32. Evidence:
`artifacts/yjs-endurance-peer-13.6.33-20261110.json`.

The build remains unreleased. Full release CI, real-device/IME validation,
broader sustained performance and the previously recorded startup reliability
limitations remain open. No preceding failed browser receipt is superseded by
this narrower default-adapter run.

## Typing after split and undo

A separate CPU profile of the installed structural repair sampled 1,839 ms
inside the typing bursts of a four-cycle, 1,000-paragraph workload. General
reconciliation accounted for 1,357 sampled ms and capacity reservation for
259 sampled ms. Those samples locate the work. The unprofiled runs provide the
latency comparison.

In-memory instrumentation of that same package traced 66 character inserts
over six cycles at 100 paragraphs. The first 11 used a single binding that
covered the whole retained partition. The other 55 used a single binding
covering the final formatted run of a partition with two to six runs. Each
insertion was at the end of its visible leaf and physical partition. The
binding started at a nonzero offset, so it failed the original native proof.

The repair in `src/yjs/retained-document.ts` verifies that the final model
leaf occupies the entire last wire run of the partition, then translates an
append to its physical offset. It uses the existing stream refresh, capacity
reservation and observer checks. Interior edits and ambiguous boundaries
continue through general reconciliation.

Both installed packages passed all semantic checks in the back-to-back,
12-cycle run at 1,000 paragraphs on the same Windows host with Yjs 13.6.32.

| Action | Structural repair | With trailing-run append |
| --- | ---: | ---: |
| Eleven-character burst median | 714.9 ms | 136.0 ms |
| Eleven-character burst p95 | 916.4 ms | 163.1 ms |
| Split median | 128.4 ms | 137.3 ms |
| Wrap median | 116.9 ms | 125.0 ms |
| Remote apply p95 | 32.7 ms | 32.4 ms |

In the separate two-size run the typing medians were 33.9 ms at 100
paragraphs and 150.3 ms at 1,000. The earlier structural build measured
127.6 and 585.8 ms in that workload. Split and wrap times also rose in
the two-size run. The back-to-back run showed a smaller increase of about
7% for each. These are single-host observations. Whole-model normalization
still contributes to typing cost, and sustained structural performance at
larger document sizes needs further measurement.

The paired run exchanged 584 updates and 309,148 bytes in each package,
including 24 duplicate deliveries. The local receipts are
`artifacts/yjs-typing-rematch-base-20261110.json` and
`artifacts/yjs-typing-rematch-new-20261110.json`. The 959 Yjs tests cover
shared data equality, relative anchors, repeated appends after mark changes,
author undo and redo, and projection invalidation during a foreign stream write.
The compiled package passed 48 recorded journeys across Chromium, Firefox
and WebKit. The focused continuation journey also checks formatting the
prefix after a split undo, typing into the trailing run, and author-only
undo and redo with both editors still connected.

The CommonJS runtime totals 1,449,193 bytes, 199 bytes more than the preceding
build. The aggregate allowance grows by 192 bytes to cover the checked append.

## Projection indexing at 5,000 paragraphs

In a four-cycle CPU profile of the installed append build, frame
normalization accounted for 1,637 of 2,067 sampled milliseconds during typing.
The projection already builds path indexes for anchors and stable identities.
It now records reuse candidates in that same pass. Each subsequent projection
resolves matching candidates from the preceding model and validates them
before reuse. Ambiguous text bindings remain ineligible for reuse.

Both installed packages passed all assertions in the separate unprofiled
comparison at 5,000 paragraphs, four cycles and a checkpoint every two cycles.

| Action | Append build | With projection index reuse |
| --- | ---: | ---: |
| Eleven-character burst median | 505.1 ms | 438.9 ms |
| Eleven-character burst p95 | 690.3 ms | 533.8 ms |
| Split median | 659.6 ms | 518.8 ms |
| Wrap median | 622.0 ms | 525.5 ms |
| Remote apply p95 | 166.9 ms | 134.2 ms |

The two runs exchanged 216 updates and 56,772 bytes each, including eight
duplicate deliveries. Both checked offline merges, author undo and redo,
stable identities, and continued editing after checkpoint reopen. The local
receipts are `artifacts/yjs-5000-base-20261110.json` and
`artifacts/yjs-5000-index-20261110.json`.

The candidate also passed a separate 12-cycle run at 5,000 paragraphs with
two checkpoint reopens. It exchanged 584 updates and 309,657 bytes. The
typing burst measured 569.3 ms at the median and 893.2 ms at p95. Splitting
and wrapping measured 726.7 ms and 644.6 ms at the median. This longer run
qualifies the measured history and recovery behavior on this host. The
latencies remain an open performance gap. The local receipt is
`artifacts/yjs-5000-index-endurance-20261110.json`.

The build passes 959 Yjs tests and 48 recorded Chromium, Firefox and WebKit
journeys. The Firefox capture of the 1,000-paragraph workflow was inspected
and shows both authors' views agreeing on the edited paragraph and its marks.

## Plain text projection and empty field handling

The CPU profile of the index build sampled 1,588 ms in frame normalization
during 2,026 ms of typing work. Decoding retained runs accounted for 116 ms
within normalization. Ordinary text runs now recognize their exact two-field
wire shape without parsing an empty mark list. The projection checks which
fields already have content only when it encounters a potential empty leaf.
The added regressions check an earlier empty partition sharing a field with
later content, and rejection of extra text metadata with an empty mark order.

Both installed packages passed all assertions across 12 cycles at 5,000
paragraphs, with a checkpoint reopen every six cycles.

| Action | Index build | With plain text projection changes |
| --- | ---: | ---: |
| Eleven-character burst median | 523.4 ms | 468.0 ms |
| Eleven-character burst p95 | 572.8 ms | 529.1 ms |
| Split median | 662.6 ms | 590.7 ms |
| Wrap median | 626.0 ms | 608.7 ms |
| Remote apply p95 | 162.0 ms | 151.5 ms |

Both runs ended with the same portable document digest and exchanged 584
updates. Traffic measured 309,141 and 309,637 bytes, respectively. The fresh
native peer IDs after checkpoint reopen differ between the runs. Local
receipts are `artifacts/yjs-5000-plain-base-20261110.json` and
`artifacts/yjs-5000-plain-new-20261110.json`. Whole-document normalization
still runs on each edit and remains a cost at this scale.

The change passes 961 Yjs tests and 12 recorded journeys across Chromium,
Firefox, and WebKit. The journeys cover empty siblings, continued formatted
typing after undo, editing at 1,000 paragraphs, and blank-line selection.
The Firefox undo capture shows both editors retaining the peer's text and
its surrounding marks.

## Projection indexing experiment at 5,000 paragraphs

Two installed packages ran six offline editing cycles per trial, with a
checkpoint every three cycles. The candidate built anchor indexes during
model projection, removing the separate indexing pass. The second trial
reversed package order. Every run converged to the same portable document
digest and exchanged 308 updates.

| Trial | Median 11-character burst | Median wrap | Median checkpoint restore |
| --- | ---: | ---: | ---: |
| First baseline | 446.9 ms | 586.2 ms | 1,196.2 ms |
| First candidate | 460.5 ms | 701.2 ms | 913.6 ms |
| Reverse candidate | 457.7 ms | 588.4 ms | 981.6 ms |
| Reverse baseline | 481.5 ms | 601.6 ms | 922.4 ms |

The timing advantage did not repeat in both orders, so the candidate was
discarded. The retained regression covers disconnected typing on both sides
of an inline hard break, preserving the break identity, surrounding marks
and both relative anchors after synchronization in either delivery order.

A separate baseline profile at 5,000 paragraphs sampled 1,318.9 ms in the
typing bursts. Normalization accounted for 1,028.7 ms of those samples. The
separate index walk accounted for 210 ms of self time and attribute
computation for 183 ms. Both are part of full-document normalization. These
are profile samples from one host. The unprofiled timing receipts are
`artifacts/yjs-single-projection-{baseline,candidate,rematch-candidate,rematch-baseline}-20261110.json`.
The raw profile is `artifacts/yjs-current-5000-20261110.cpuprofile`.

## Fewer allocations when checking retained metadata

Immutability checks allocate an ancestor set only when descending into nested
objects. Ordered attribute comparison walks the existing key arrays directly.
Factory validators still run on retained values, including unchanged branches.

The same 5,000-paragraph diagnostic ran twice per installed build, with the
order reversed for the second pair. Each run exercised six offline editing
cycles and two checkpoint reopens using Yjs 13.6.32.

| Run | Median 11-character burst | Burst p95 | Median split | Median wrap |
| --- | ---: | ---: | ---: | ---: |
| Baseline first | 482.6 ms | 574.9 ms | 648.2 ms | 571.7 ms |
| Candidate second | 464.9 ms | 535.7 ms | 616.1 ms | 607.6 ms |
| Candidate first | 450.3 ms | 480.0 ms | 618.4 ms | 619.3 ms |
| Baseline second | 464.5 ms | 503.7 ms | 614.2 ms | 613.3 ms |

Typing burst medians improved by 3–4% in the paired runs on this host.
Split timings were mixed and wrap medians were slower by 6–36 ms. All runs
ended with the same portable document digest and exchanged 308 updates and
102,356 bytes. The change leaves whole-document normalization on the typing
path. Local measurements are in `artifacts/yjs-flat-metadata-*.json`.

All 997 focused model and Yjs tests passed. The public collaboration demo
passed 21 recorded Chromium, Firefox and WebKit workflows covering offline
text merges, independent undo, and typing after competing wraps. Package,
API and bundle budget checks passed.

## Partition map reuse experiment

Reusing the checked native edit's partition map did not produce a repeatable
typing improvement. Across two run orders at 5,000 paragraphs, the existing
build's eleven-character burst medians were 411.6 and 407.7 ms. The candidate
measured 415.2 and 403.2 ms. All four runs converged to the same document digest
and exchanged 308 updates each. A separate continuous typing probe was also
mixed. The candidate was discarded. Local reports are in
`artifacts/yjs-owned-partitions-*.json`.

## Frozen coordinate reuse experiment (2026-11-17)

A fresh profile of the current `0.5.0-beta.1` installed package sampled 1,458.6 ms
below the typing callback. The separate binding/index walk accounted for
217.4 ms of self time and attribute computation for 193.0 ms. Root-level garbage
collection samples cannot be attributed to individual typing actions and are
excluded from those figures. Profiling is diagnostic evidence, not a latency
comparison.

The candidate reused preceding frozen coordinate arrays only when their full
parent prefix and child index matched, with a weak cache for their string keys.
It retained every normalization traversal, attribute/mark/node validator and
atomic index publication. Four separate unprofiled runs used 5,000 paragraphs,
six cycles and checkpoints every three cycles, with package order reversed.

| Run | Median 11-character burst | Burst p95 | Median split | Median wrap |
| --- | ---: | ---: | ---: | ---: |
| Baseline first | 453.2 ms | 523.5 ms | 619.2 ms | 613.2 ms |
| Candidate second | 480.5 ms | 624.2 ms | 615.4 ms | 615.2 ms |
| Candidate first | 477.7 ms | 742.1 ms | 633.9 ms | 593.3 ms |
| Baseline second | 431.7 ms | 488.6 ms | 702.7 ms | 566.5 ms |

All four runs passed the mandatory assertions, ended with the same portable
content digest, and exchanged 308 updates / 102,356 bytes, including twelve
duplicate deliveries. Typing medians and p95 were slower in both orders; the
runtime candidate was discarded. Structural timings were mixed. No acceptance
limit, wire format or package dependency changed. Whole-document normalization
remains an open typing-performance cost.

The retained regression checks cursor ownership after a same-depth reparenting:
the leaf index stays the same while its parent prefix changes. Anchors must
resolve at the new location, held coordinate snapshots must remain frozen and
unchanged, and new anchors must target the moved text.

The [decision receipt](../artifacts/yjs-path-reuse-decision-20261117.json)
records installed-package fingerprints, raw-report hashes, every timing sample,
traffic and memory observations, and reproduction commands. The
[discarded patch](../artifacts/yjs-path-reuse-rejected-20261117.patch) is evidence
only; it is not present in the runtime. Raw CPU profiles, tarballs and consumers
remain local artifacts. These single-host observations do not establish native
GitLab performance, a universal regression rate or production readiness.

## Flat attribute certificate experiment (2026-11-17)

A separate candidate recorded a weak immutability certificate for flat, frozen
attribute bags made by Fountain's own factory. The read shortcut preserved active
ancestor checks and did not skip attribute/whole-node validators. Foreign frozen
accessors, proxy wrappers, nested objects and mutable host values retained their
ordinary inspection paths. This targeted repeated immutability inspection while
leaving full-document normalization intact.

The installed-package experiment used the same 5,000-paragraph workload, six
cycles and checkpoints every three cycles, with reversed package order:

| Run | Median 11-character burst | Burst p95 | Median split | Median wrap |
| --- | ---: | ---: | ---: | ---: |
| Baseline first | 445.6 ms | 530.2 ms | 597.8 ms | 605.3 ms |
| Candidate second | 485.1 ms | 539.9 ms | 677.5 ms | 700.8 ms |
| Candidate first | 455.4 ms | 490.9 ms | 613.8 ms | 610.6 ms |
| Baseline second | 440.3 ms | 554.5 ms | 624.3 ms | 610.4 ms |

Typing medians were slower in both pairs; p95 and structural timings were mixed.
After session destruction and forced GC, heap plus array buffers remained about
2 MiB higher in both candidate processes. This is a single-host memory observation,
not proof of a leak or a general threshold. All four runs passed the semantic
assertions and ended with the same portable document digest. Each exchanged 308
updates including twelve duplicate deliveries; encoded traffic ranged from
102,345 to 102,356 bytes. Checkpoint reopen creates fresh client identities, and
adapter IDs use compact random UUID prefixes. Actual byte counts are retained;
byte-identical traffic is not claimed.

The runtime candidate was discarded. Five new regression cases remain for active
ancestors, live foreign accessors/proxy inspection and nonportable values. The
restored code passed 1,019 focused model/Yjs tests across 39 files, TypeScript and
a production rebuild. No runtime API, dependency, budget or acceptance limit
changed. No new browser run is claimed for this discarded candidate.

The [decision receipt](../artifacts/yjs-flat-certificate-decision-20261117.json)
records package fingerprints, report hashes, every timing sample, memory and
traffic observations, source comparison and reproduction commands. Its
[discarded patch](../artifacts/yjs-flat-certificate-rejected-20261117.patch) is
archival evidence only. The installed baseline's TypeScript, package manifest and
lockfile match the current source before the experiment; its only later public
source difference is CSS, which is not loaded by this Node workload. Raw reports,
logs, packages and consumers remain local. Whole-document normalization and
large-document collaborative typing latency remain open work.

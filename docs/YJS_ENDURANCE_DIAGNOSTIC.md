# Real retained-Yjs endurance diagnostic

`scripts/diagnose-yjs-endurance.mjs` is an opt-in semantic diagnostic and metrics
collector for an **installed Fountain package**. It does not change CI, package
scripts, library behavior, or acceptance limits. The installed-package smoke
and a twelve-cycle baseline at 100 and 1,000 paragraphs pass their semantic
assertions. The baseline exposes substantial retained-adapter latency at 1,000
paragraphs; these measurements do not establish production readiness.

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

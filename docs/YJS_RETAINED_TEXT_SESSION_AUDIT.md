# Retained text operation reads and long sessions

The later [initialization audit](YJS_RETAINED_SEED_AUDIT.md) adds validated fresh
node-tree seeding, a full source refresh and explicit old/new interoperability.
The measurements below belong to this earlier text-operation checkpoint.

2026-11-06, local follow-up to `29f8e6ea` and the
[projection audit](YJS_RETAINED_PROJECTION_AUDIT.md). This is experimental
collaboration work, not adoption of the candidate or a release.

## Implementation boundary

`src/yjs/retained-text.ts` previously scanned the same shared text again to
validate an insertion's character limit, resolve a range's second endpoint or
find adjacent join boundaries. A private operation-local read now supplies the
validated stream, partition positions and boundary list together. Delete and
format resolve both endpoints against that one read; insert derives the
character count from validated stream length minus private boundary embeds;
join reuses the scanned adjacency list. Attribute inputs are copied and checked
before the position read.

Every separate operation still reads current shared state. No transaction-wide
or observer-invalidated text cache is introduced. Unknown embeds, malformed
styles/owners, global limits, ordered ranges and destroyed-store checks remain
in force. The strengthened existing test performs split, insert, format,
delete, join and mark removal inside one caller-owned transaction, synchronizes
to a peer and checks destruction. Insertion-owned provenance is deliberately
unchanged: equal visible formats do not make separate offline insertions
interchangeable.

## Long-session evidence

`artifacts/retained-session-20261106.mjs` exercises the actual compiled engine
and private adapter in pure Node. Each build runs three independent sessions:
1,024 separately undoable single-character insertions, one offline peer edit,
synchronization, undo of all 1,024 author edits, redo of every edit and reopen
from encoded shared state. Original image and document equality checks guard
the round trip. Client/controller identities are fixed only within these
isolated diagnostic processes; no network or production identity policy changes.

All six sessions pass exact convergence, author-only undo/redo and reopen.
Complete final document hashes, encoded shared-state hashes, and every measured
stage's sizes/container counts match between the baseline and candidate. Weak
references to both editors and both shared documents clear after destruction
and explicit GC in every trial.

The diagnostic exposes unresolved storage growth:

| Stage | Encoded V1 bytes | Diagnostic V2 bytes | Text delta operations |
| --- | ---: | ---: | ---: |
| Seed | 3,058 | 2,948 | 2 |
| Converged after typing | 60,805 | 42,032 | 1,028 |
| All author edits undone | 60,810 | 42,037 | 4 |
| All author edits redone | 118,390 | 77,881 | 1,028 |

The visible document after redo equals the pre-undo document, but its CRDT
history is larger. V2 is measured only; transport encoding is not changed.
The named style pool has two entries after the peer joins, so style-definition
duplication is not the cause in this fixture. Unique insertion provenance and
retained history still carry cost. Removing provenance or rebuilding live
shared state without an epoch/offline-peer contract would risk correctness.

Median final-128 insertion time is 6.99 ms before and 6.56 ms after; median full
undo is 1,255.37 / 1,178.58 ms and redo is 1,361.86 / 1,347.37 ms. These small
diagnostics do not certify long-session latency. Post-GC totals still change
across trials and include runtime warmup and retained diagnostic records.
Cleared editor/document references do not establish bounded memory for an
indefinitely active editor.

## Controlled document-size evidence

The three-trial baseline is compiled from `29f8e6ea` without modifying working
source. Both builds use one engine/adapter module graph. Each document-size
trial performs twelve timed edits and a separate instrumented edit. Timing
excludes instrumentation. All document values match the plain editor; encoded
shared-state bytes and hashes match between builds at each size.

| Paragraphs | Before: median of edit medians | After: median of edit medians | After: maximum sample |
| --- | ---: | ---: | ---: |
| 100 | 6.62 ms | 8.56 ms | 43.63 ms |
| 500 | 33.25 ms | 34.79 ms | 81.18 ms |
| 1,000 | 70.79 ms | 66.20 ms | 94.67 ms |

The instrumented edit consistently makes 33 fewer `Y.Map.size` calls. Timing
does not improve consistently across sizes, and no universal speedup is
claimed. Initialization medians are 79.90 / 62.94, 752.40 / 758.49 and
2,759.32 / 2,844.83 ms respectively. Full projection and initialization remain
adoption concerns. These are Node v24.22.1 measurements at reduced priority on
two logical processors, sequentially, not competitive benchmarks or new gates.

## Verification and remaining work

The focused run has 191 passing candidate tests and the same six required
default-adapter failures: 207 passes / six failures / zero skips, 213 total.
Compiled ESM/CommonJS probes cover 36 pure-Node journeys. All 93 recorded browser
journeys pass in Chromium, Firefox and WebKit, without retries or skips. Every
journey verifies actual compiled runtime imports; source maps match 190 current
source modules. Twelve representative screenshots and sampled filmstrips from
three recordings were inspected, covering structural edits, continued typing,
backward selection and reopened documents.

Build, framework types, API, headless, package, server/workerd and the existing
public performance/heap checks pass. All 170 public JavaScript/CommonJS files
and CSS are byte-identical to the preceding public build. API declarations,
default adapter/tests, CI workflow and acceptance limits are unchanged. The
same three size overruns remain: core ESM 0.1 KiB, aggregate ESM 75.9 KiB and
aggregate CommonJS 59.9 KiB. None is hidden by this checkpoint.

`artifacts/verify-retained-frame-20261106.mjs` checks the current imports/source
maps, required failures, binary comparisons and public-build invariants. Its
receipt records source/report/recording hashes. Raw broad reports/traces remain
local; representative images/recordings and the comparison/reproduction tools
accompany the checkpoint. Complete CI and a fresh full source run remain
required for release. No public adapter switch, acceptance-limit increase or
publication is part of this work. COLLAB-01 remains partial.

The next adoption work is larger-document initialization/projection, repeated
editing/history growth, compaction with explicit offline-peer/undo semantics,
legacy representation migration and a safe rollout. Compaction must state
whether it preserves old anchors/history or intentionally begins a new
document epoch; it cannot silently replace a live Yjs document while old peers
still hold updates.

## Reproduction

```text
node artifacts/build-retained-baseline.mjs 29f8e6ea retained-frame-baseline-20261106
node artifacts/build-cursor-overlay-canary-20261106.mjs
node --expose-gc artifacts/retained-session-20261106.mjs 1024 retained-frame-session-baseline-trials-20261106 retained-frame-baseline-20261106-build 3
node --expose-gc artifacts/retained-session-20261106.mjs 1024 retained-frame-session-candidate-trials-20261106 cursor-overlay-build-20261106 3
node artifacts/retained-read-controlled-cost-20261106.mjs retained-frame-baseline-20261106-build retained-frame-cost-baseline-20261106 3 100,500,1000
node artifacts/retained-read-controlled-cost-20261106.mjs cursor-overlay-build-20261106 retained-frame-cost-candidate-20261106 3 100,500,1000
node artifacts/compare-retained-frame-20261106.mjs
pnpm exec playwright test --config artifacts/retained-frame-browser-20261106.config.ts
node artifacts/verify-retained-frame-20261106.mjs
```

Browser configuration stays headless with one worker, videos/traces and private
port 4195. It neither opens visible browser windows nor reuses user servers.

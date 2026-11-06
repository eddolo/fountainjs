# Retained collaboration: fresh reads and affected text work

2026-11-06. Local follow-up to `10170139` and the
[move and label audit](YJS_RETAINED_MOVE_AND_LABEL_AUDIT.md). The experimental
adapter remains private. This checkpoint does not adopt its protocol, migrate
existing rooms, change acceptance ceilings, or publish a release.

## Correctness before caching

The new direct-edit regression first failed: after warming a text projection,
an external `Y.Text.insert` inside a caller-owned `Y.Doc.transact` left
`RetainedTextStore.project` returning `Alpha` instead of `AlXpha`. The observer
that invalidated the cache had not run yet. Existing tests exercised the store's
own mutation methods, which explicitly invalidated it; they did not cover this
case. The red receipt is `artifacts/retained-read-before-20261106.log`.

`src/yjs/retained-text.ts` removes the observer-invalidated stream cache. Its
`projectMany` checks the pool/version/style bounds once, validates each requested
owner and stream, and scans each distinct stream once during that synchronous
read. Entries are indexed by partition ID. No read cache survives the call, and
no transaction is opened or shared repair emitted by reading. Single-partition
reads use the same implementation. Exact encoded-style decoding reuse remains,
with the current encoded value checked on each lookup.

`join` now checks adjacency by partition ID rather than relying on cached
object identity. The store no longer installs cache-invalidation observers and
still refuses operations after destruction. Tests cover direct interleaved edits,
independent read results, pending malformed styles and restored reads, and
actual 100,001-entry owner/text/style maps before their surrounding transaction
finishes. Reads must reject these oversized pools without changing shared state.

## Bound checks per synchronous operation

`src/yjs/retained-nodes.ts` checks global pool bounds once per projection or
child-order batch, instead of re-enumerating both global maps for each record
inside that operation. Record types, identities, metadata, placements, child
references, depth, cycles and ownership remain validated. Ordinary mutators
retain their entry/capacity checks. `childrenOfMany` returns an operation-local
snapshot; callers can observe a new order on another call within the same outer
transaction. An actual 100,001-entry node-map test checks rejection before
traversal, both during and after the transaction.

`src/yjs/retained-document.ts` imports the existing `RetainedTextPartition`
type from `./retained-text`. It collects visible text and live split-family
partitions before one batch read, then uses those values for ordering, empty
field suppression and model construction. It still validates schema/source
metadata, transaction provenance and the resulting model. Only successful
projection replaces its model/path indexes.

## Work only where local text intent changed

During a local change, unchanged groups can retain their existing partition
ownership without rebuilding character anchors and reapplying formatting.
Eligibility requires both a unique, exact reused parent object and full,
offset-preserving transaction provenance for every nonempty text leaf. Equal
strings or object identity alone are insufficient. Explicit split steps and
empty groups take the existing full reconciliation path.

Tests distinguish moving reused paragraphs from an explicit whole-document
replacement that reuses the same paragraph objects: movement retains active
text ownership, while replacement creates new active character ownership.
Concurrent edits to separate paragraphs preserve rich untouched leaves, media,
root attributes and author-only undo/redo in both exchange orders.

Child orders are also read in one batch. After any actual move, later parents
are read again; the batch is never reused across a reparenting operation.
This preserves the earlier scheduler's refresh-after-move requirement.

## Controlled diagnostic

`artifacts/build-retained-read-baseline-20261106.mjs` extracts only `src` from
commit `10170139` into a separate directory and builds it without changing the
working source. Both baseline and candidate build engine and adapter in one
module graph. The diagnostic runs three trials at 100 and 500 paragraphs,
twelve timed edits each and one separately instrumented edit.

`artifacts/retained-read-controlled-cost-20261106.mjs` fixes the Yjs client ID
and controller UUID for these isolated, unnetworked diagnostic cases. The UUID
override spans actual editor construction, is restored afterward, and the
resulting room ID is asserted. An earlier harness restored it too early and
therefore did not fix the controller UUID; that completed exploratory run is
excluded from the controlled comparison. Ordinary application identity behavior
is unchanged.

| Metric (three trials) | 10170139 | Candidate |
| --- | ---: | ---: |
| Edit, 100 paragraphs | 63.27 ms | 10.87 ms |
| Edit, 500 paragraphs | 1,370.19 ms | 42.84 ms |
| Initialization, 100 paragraphs | 227.98 ms | 74.58 ms |
| Initialization, 500 paragraphs | 16,184.53 ms | 701.45 ms |
| Size getter calls, one extra edit at 500 | 49,094 | 4,133 |
| Sum of returned map cardinalities at 500 | 42,568,004 | 81,504 |

At 500 paragraphs, trial edit medians are 63.92/42.68/42.84 ms; the maximum
individual timed candidate sample is 78.33 ms. Encoded shared state is identical
byte-for-byte across all six baseline/candidate trials for each size: 181,389
bytes at 100 paragraphs and 911,676 bytes at 500. Exact document JSON also
matches the plain-editor reference. The comparison script verifies hashes,
not just lengths. These measurements are Node v24.22.1, reduced priority and
affinity to two logical processors, sequential execution. They are a diagnostic
of this workload, not a general 32-times speed claim or a competitive benchmark.

A separate candidate-only 1,000-paragraph run has edit medians
111.71/85.69/88.19 ms, median initialization 2,606.45 ms and maximum timed sample
165.70 ms. Its model matches the plain editor in all three trials. This is
additional scaling evidence, not a claim of interactive-frame latency or a
comparison with an unmeasured baseline at that size. Initialization still grows
more steeply than editing, and the full model projection remains a bottleneck.

The public build's 170 JavaScript/CommonJS files and CSS file are byte-identical
to the pre-change build. The implementation remains outside published runtime
entry points; it changes the internal experimental graph and its tests.

## Verification

The full source run reports **4,328 passes, the same six required default-adapter
failures, zero skips, 4,334 total**. All **182** focused retained-store/adapter
tests pass. All **32** compiled ESM/CommonJS Node journeys pass without a DOM.
All **87** compiled Chromium/Firefox/WebKit journeys pass, with 29 per engine,
87 recordings, no retries and no skips. Source maps match all 190 current
modules in the canary.

Visual review checks convergence captures and sampled recording frames in each
engine: different edited paragraphs converge, untouched rich text and the image
remain present, and the journey verifies author-only undo/redo. This is software
browser evidence, not physical mobile/IME certification.

Build, API, headless, package, Node/workerd server, framework types and existing
public performance/heap gates pass. Strict type checking initially found two
missing callback type annotations in new tests. Only those annotations changed
after the full source run; the affected text suite was rerun successfully and
the entire framework type gate passed. The original type failure is retained
separately. Application sources remained unchanged.

The unchanged size gate still fails for core ESM (0.1 KiB), aggregate ESM
(75.9 KiB) and aggregate CommonJS (59.9 KiB) overruns. API declarations, public
runtime bytes, default-adapter code, required legacy assertions, CI workflow
and acceptance limits remain unchanged. No GitHub CI execution is claimed.

`artifacts/retained-read-verification-20261106.json` records source/report hashes,
exact known failures, controlled comparison, scaling results and all recordings.
Its verifier checks current source-map content, every journey's compiled imports,
all 171 public runtime/CSS hashes, and unchanged guards. Raw full unit/browser
reports and traces stay local; tools, summarized receipts and representative
captures/recordings accompany the checkpoint.

## Remaining adoption work

Full model/schema/source projection and validation still occur. Large-document
scaling, long-session metadata/history growth, compaction, migration, room
compatibility and broader collaboration workloads remain required. These small
controlled fixtures do not certify 100,000-block collaborative documents.
The default adapter's six required failures remain open, and public size
overruns remain release blockers.

One next optimization target is visible in `RetainedDocumentStore`: `change`
projects and checks its result, then `apply` performs another full `read`.
Avoiding duplicate projection in the actual adapter lifecycle needs explicit
observer/outer-transaction tests; the direct store API must still return the
current shared state after observer activity. This checkpoint does not remove
that validation or assume observers cannot change data.

## Reproduction

```text
node artifacts/build-retained-read-baseline-20261106.mjs
node artifacts/build-cursor-overlay-canary-20261106.mjs
node artifacts/retained-read-controlled-cost-20261106.mjs retained-read-baseline-build-20261106 retained-read-controlled-baseline-fixed-20261106
node artifacts/retained-read-controlled-cost-20261106.mjs cursor-overlay-build-20261106 retained-read-controlled-candidate-fixed-20261106
node artifacts/compare-retained-read-cost-20261106.mjs
node artifacts/retained-read-controlled-cost-20261106.mjs cursor-overlay-build-20261106 retained-read-scaling-1000-20261106 3 1000
pnpm exec vitest run tests/yjs-retained-text.test.ts tests/yjs-retained-nodes.test.ts tests/yjs-retained-document.test.ts tests/yjs-retained-adapter.test.ts tests/yjs-retained-mapping.test.ts --maxWorkers=1
pnpm exec playwright test --config artifacts/retained-read-browser-20261106.config.ts
```

The browser audit remains headless, one worker, private port 4195 with recordings
and traces. It adds a real file-open, offline multi-paragraph editing,
synchronization and author-history journey to the native presence matrix.

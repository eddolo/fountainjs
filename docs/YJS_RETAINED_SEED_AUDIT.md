# Retained document initialization

2026-11-06, local follow-up to `77eb75a5` and the
[text-operation/session audit](YJS_RETAINED_TEXT_SESSION_AUDIT.md). The default
public adapter is not switched, and overall collaboration parity stays partial.

## Bottleneck and implementation

An initialization-only CPU profile of the actual compiled candidate exposes
repeated validation of growing node/identity pools and growing sibling lists.
At 1,000 paragraphs, the separate instrumented initialization makes 47,031
`Y.Map.size` calls, reports 55,517,506 entries through those calls and reads
1,003,000 child-array entries. This work is avoidable while building a fresh
tree, without introducing a live projection cache.

`src/yjs/retained-nodes.ts` adds a private-module `RetainedNodeSeed` tree and
`RetainedNodeStore.seed` operation. It snapshots/encodes node metadata, validates
every supplied identity and placement token, enforces unique ownership and the
existing node/depth bounds, and rejects malformed/sparse/extended child arrays.
The operation requires empty node, placement, identity and child pools, and
checks that condition again after preflight because input getters can write
shared state. Only then does it create the records, child arrays and placements
in one transaction. Ordinary `create` and editing methods keep their fresh
validation; metadata preparation is shared rather than duplicated.

`src/yjs/retained-document.ts` retains source/schema preflight, prepares the
whole tree and text group identities, invokes the new node seed and writes the
text streams. Root metadata, empty-text layout, marks, opaque values and the
final complete-model equality check remain. Text streams still use their
validated creation path. This is not a bulk mutation API for an existing tree.

## Measured scope

The isolated baseline builder compiles `77eb75a5` without changing working
source. Three sequential trials per size use the same fixed diagnostic
identities, compiled engine/adapter graphs and plain-editor reference. Twelve
edits are timed separately from the instrumented extra edit.

| Paragraphs | Before initialization median | After initialization median | Before edit median | After edit median |
| --- | ---: | ---: | ---: | ---: |
| 100 | 52.81 ms | 26.75 ms | 6.71 ms | 7.12 ms |
| 500 | 616.27 ms | 138.49 ms | 28.19 ms | 25.52 ms |
| 1,000 | 2,298.88 ms | 267.62 ms | 55.01 ms | 60.04 ms |

Initialization improves in this workload; typing is not the target and its
results are mixed. The separate 1,000-paragraph instrumented seed falls to
13,038 map-size calls, 2,539,505 reported map entries and 4,000 child-array
entries. Profiled wall time is 2,898.16 / 388.10 ms, including profiler overhead;
the unprofiled trial medians above are the more useful timing comparison.

These are Node v24.22.1 diagnostics at reduced priority on two logical processors,
not new acceptance limits or a general performance certificate. Full projection,
text-pool creation and larger documents still require work.

## Shared-state compatibility and retention

All controlled document values match the plain editor. Unlike the previous
operation-local read optimization, this change alters seed write order and
therefore the encoded CRDT bytes. At 100/500/1,000 paragraphs the measured
post-edit V1 sizes are 181,389 / 911,676 / 1,834,709 bytes before and
181,476 / 912,312 / 1,834,539 bytes after. No binary-identity claim is made.

Representation versions and record fields stay the same. An actual compiled
old/new interoperability probe passes 28 journeys: both seed directions, both
exchange orders and concurrent insertion against quote, bullet/ordered/task
wrapping, formatting, splitting and movement. Each editor uses its own build's
engine/adapter graph. Both authors' undo/redo, exact convergence, root metadata
and image retention are checked. This evidence concerns the two experimental
builds; it does not migrate the public legacy representation.

Three new 1,024-edit sessions pass offline synchronization, complete author
undo/redo, encoded-state reopen and post-destruction editor/document reference
release. History/wire growth is still present. Neither compaction nor bounded
memory for an indefinitely active editor is certified.

## Verification

Fourteen new source cases cover nested metadata/layout and peer editing,
identity/token collision, malformed metadata/layout/arrays, depth/count limits,
nonempty pools and getter-triggered foreign writes. The full source run reports
4,351 passed / six failed / zero skipped, 4,357 total across all 289 discovered
source test files. All 205 candidate tests pass. The failures match the exact
six existing default-adapter cases; no assertion or skip is relaxed.

Compiled ESM/CommonJS probes pass 36 pure-Node journeys; all 93 recorded browser
journeys pass without retries/skips across Chromium, Firefox and WebKit. Six
structural/continued-typing screenshots and sampled filmstrips from three
recordings were inspected. Build, framework types, API, headless, package,
server/workerd and existing public performance/heap checks pass. All 170 public
JavaScript/CommonJS files and CSS are byte-identical to the preceding public
build. API declarations, default adapter/tests, CI workflow and acceptance
limits are unchanged. The same three size overruns remain: core ESM 0.1 KiB,
aggregate ESM 75.9 KiB and aggregate CommonJS 59.9 KiB.

The verification receipt records exact source, measurement, report and
recording hashes. It verifies current source maps and compares the baseline's
mapped source to actual Git blobs, rather than trusting a directory label.
Broad raw reports/traces remain local; reproduction tools, measurements,
compressed CPU profiles and curated visual evidence accompany this checkpoint.
Complete CI remains required for release, and this document does not claim
publication or full editor parity.

## Next adoption work

Avoid repeated text-pool work during initialization, improve full projection
and editing at larger sizes, and resolve history growth, compaction, old-peer
semantics and migration before adopting the candidate. The six public-default
failures and existing size overruns remain visible. Do not remove per-insertion
provenance or silently rebuild live shared state to reduce bytes.

## Reproduction

```text
node artifacts/build-retained-baseline.mjs 77eb75a5 retained-seed-baseline-20261106
node artifacts/build-cursor-overlay-canary-20261106.mjs
node artifacts/profile-retained-seed-20261106.mjs retained-seed-baseline-20261106-build retained-seed-before-20261106 1000
node artifacts/profile-retained-seed-20261106.mjs cursor-overlay-build-20261106 retained-seed-after-20261106 1000
node artifacts/retained-read-controlled-cost-20261106.mjs retained-seed-baseline-20261106-build retained-seed-cost-baseline-20261106 3 100,500,1000
node artifacts/retained-read-controlled-cost-20261106.mjs cursor-overlay-build-20261106 retained-seed-cost-candidate-20261106 3 100,500,1000
node artifacts/retained-seed-interop-20261106.mjs
node --expose-gc artifacts/retained-session-20261106.mjs 1024 retained-seed-session-20261106 cursor-overlay-build-20261106 3
node artifacts/compare-retained-seed-20261106.mjs
pnpm exec playwright test --config artifacts/retained-seed-browser-20261106.config.ts
node artifacts/verify-retained-seed-20261106.mjs
```

The final verifier requires the saved source/unit/check reports and logs, source
maps and visual evidence at its documented paths. Browser runs remain headless,
one worker, port 4195, with recordings/traces. User servers are not reused.

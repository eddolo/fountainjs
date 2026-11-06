# Retained text-pool initialization

2026-11-06, local follow-up to `744c2731` and the
[fresh-node seed audit](YJS_RETAINED_SEED_AUDIT.md). This remains experimental;
the public default adapter and overall parity status are unchanged.

## Change and bounds

`src/yjs/retained-text.ts` adds a fresh-pool `seed` operation. It snapshots run
text/attributes, checks stream and partition identities, refuses duplicates,
validates existing character/format bounds, and reserves the complete set of
canonical style definitions before any shared write. Both preflight boundaries
require empty text, owner, style and local-cache pools. Writes made by input
getters are preserved and cause refusal rather than being overwritten.

The writer consumes only those prevalidated style reservations. Ordinary
insertion still checks the live style capacity; separate operations still read
fresh shared state. Existing definitions are checked before reuse, every
insertion keeps its unique provenance, and no cross-transaction projection
cache or caller-controlled validation bypass is added. Shared versions and
capacity constants are unchanged.

Run preparation is shared with ordinary creation, avoiding double reads from
mutable getters and refusing malformed/sparse/extended arrays before writes.
`src/yjs/retained-document.ts` passes its prepared text groups to this operation
after node seeding. Text/group creation order and the serialized representation
stay unchanged from the node-seeding checkpoint.

## Controlled evidence

The baseline is compiled from `744c2731`, with mapped sources checked against
its actual Git blobs. Each compiled engine and adapter share one module graph.
Three sequential trials per size use fixed isolated diagnostic identities,
twelve timed edits and a separate instrumented edit; documents are compared
with an ordinary editor reference. Complete model hashes and encoded shared
state hashes match across both builds and every trial at each size.

| Paragraphs | Before initialization median | After initialization median | Before edit median | After edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 208.88 ms | 144.10 ms | 75.81 ms | 52.35 ms |
| 5,000 | 2,287.23 ms | 638.46 ms | 267.35 ms | 251.80 ms |
| 10,000 | 8,462.07 ms | 1,321.48 ms | 546.90 ms | 520.38 ms |

The unchanged post-edit V1 sizes are 1,834,539 / 9,309,325 / 18,670,921 bytes.
Initialization improves in this workload. Editing at 10,000 paragraphs is still
too expensive for adoption; no production latency certificate follows.

A separate 5,000-paragraph profiled/instrumented initialization reduces reported
map-size entries from 62,697,505 to 210,005 and calls from 65,038 to 40,050.
Child-array entries remain 20,000, consistent with the preceding node repair.
Profiled wall time is 2,825.25 / 1,167.80 ms, including profiler overhead; use the
unprofiled medians above for the main timing comparison. Measurements use
Node v24.22.1 at reduced priority on two logical processors, not new gates or
competitive benchmarks.

Three paired 1,024-edit sessions per build pass offline synchronization, full
author undo/redo, encoded-state reopen and post-destruction editor/document
reference release. Every stage's sizes/container counts and the final document
and shared-state hashes match across all six sessions. History growth remains;
reference release does not prove bounded memory for an indefinitely live editor.
Twenty-eight old/new candidate interoperability/history journeys also pass.

## Verification scope

Reviewing the first toolbar-driven recording led to a stronger keyboard
follow-up. Ctrl+Z failed in all three engines: this bare-core fixture omitted
the host binding required by the collaboration contract. The host now installs
a plugin mapping Ctrl/Cmd+Z, Shift+Z and Y to the origin-aware collaboration
commands, consuming empty stacks without invoking native DOM history. It
respects read-only, composition and Alt-modified input. The library's history
policy is unchanged. `docs/COLLABORATION.md` now provides the copy-paste recipe.
The three pre-repair failures, fixture snapshot and captures are retained; the
final full browser run uses native keyboard undo/redo for both authors.

Twenty new source cases cover exact sequential/bulk wire equality, subsequent
style reuse, offline insertion after source deletion, malformed inputs, stream
and owner collisions, capacity bounds, foreign writes, one-time run snapshots
and destruction. All 225 candidate cases pass. The combined six-file run has
241 passes / six existing default failures / zero skips, 247 total. The exact
failure names are unchanged. This is a focused run; the full-source result at
`744c2731` remains a historical checkpoint rather than being relabelled as a
current full run.

The browser matrix adds an actual 1,000-paragraph native-input journey. It opens
a mixed-mark document with an image, edits distant paragraphs independently,
synchronizes, checks every untouched block, and undoes/redoes both authors'
characters independently. It captures the middle of the real editor without
attempting an enormous full-page screenshot. All 96 browser journeys pass
without retries/skips in Chromium, Firefox and WebKit, including the three
large-document journeys. Six captures and three evenly sampled recording
filmstrips were inspected. The compiled ESM/CommonJS probes pass 36 pure-Node
journeys. Build, framework types, API, headless, package, server/workerd and
existing public performance/heap checks pass. All 170 public JavaScript/CommonJS
files and CSS are byte-identical to the preceding public build. API declarations,
default adapter/tests, CI workflow and acceptance limits are unchanged. The
same three size overruns remain: core ESM 0.1 KiB, aggregate ESM 75.9 KiB and
aggregate CommonJS 59.9 KiB.

The verifier checks current compiled imports/source maps, baseline Git blobs,
the exact required failures and the paired state hashes. Broad raw reports and
traces stay local; tools, measurements, receipts, compressed CPU profiles and
representative recordings/captures accompany this checkpoint. No public adapter switch, acceptance
limit increase, migration or publication is claimed.

## Remaining adoption work

Full projection and editing cost, history/metadata growth, compaction with
explicit old-peer/undo semantics, legacy migration and rollout remain open.
The six default failures and three existing public-size overruns are retained.
Fresh full-source and complete CI remain required before release. This does
not certify 100,000-block collaboration, physical mobile keyboards/IME or
overall ProseMirror + Tiptap parity.

## Reproduction

```text
node artifacts/build-retained-baseline.mjs 744c2731 retained-text-seed-baseline-20261106
node artifacts/build-cursor-overlay-canary-20261106.mjs
node artifacts/profile-retained-seed-20261106.mjs retained-text-seed-baseline-20261106-build retained-text-seed-before-20261106 5000
node artifacts/profile-retained-seed-20261106.mjs cursor-overlay-build-20261106 retained-text-seed-after-20261106 5000
node artifacts/retained-read-controlled-cost-20261106.mjs retained-text-seed-baseline-20261106-build retained-text-seed-cost-baseline-20261106 3 1000,5000,10000
node artifacts/retained-read-controlled-cost-20261106.mjs cursor-overlay-build-20261106 retained-text-seed-cost-candidate-20261106 3 1000,5000,10000
node artifacts/retained-seed-interop-20261106.mjs retained-text-seed-baseline-20261106-build cursor-overlay-build-20261106 retained-text-seed-interop-20261106
node --expose-gc artifacts/retained-session-20261106.mjs 1024 retained-text-seed-session-baseline-20261106 retained-text-seed-baseline-20261106-build 3
node --expose-gc artifacts/retained-session-20261106.mjs 1024 retained-text-seed-session-candidate-20261106 cursor-overlay-build-20261106 3
node artifacts/compare-retained-text-seed-20261106.mjs
pnpm exec playwright test --config artifacts/retained-text-seed-browser-20261106.config.ts
node artifacts/verify-retained-text-seed-20261106.mjs
```

The final verifier also requires the saved focused/check reports and logs,
compiled maps and curated evidence at its named paths. Browser runs remain
headless, one worker, with videos/traces on private port 4195. No user server is
reused and no visible browser is opened.

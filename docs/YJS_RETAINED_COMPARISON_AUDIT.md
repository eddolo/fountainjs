# Retained document comparisons and single-step planning

2026-11-06, local follow-up to `05a68f06` and the
[text-pool initialization audit](YJS_RETAINED_TEXT_SEED_AUDIT.md).
The candidate remains private and experimental; COLLAB-01 remains Partial.

## Change and safety boundaries

`src/yjs/retained-document.ts` compares validated portable values directly,
without sorting and copying complete object trees for JSON serialization.
Object-key order is immaterial; array order, missing fields and null remain
distinct. No input validation is removed. Source checking first uses immutable
model equality; an order-independent portable comparison remains the fallback
when equivalent metadata has different key insertion order.

A single-step transaction reuses its already checked text-provenance plan.
Multi-step transactions still preflight every step before any shared write,
then recompute individual plans rather than keeping an entire document plan
for every step. No document cache survives an apply call. Observer writes,
including matching-origin follow-up transactions and caller-owned outer
transactions, retain the preceding fresh-read behavior.

Five added cases cover reordered root/node metadata without shared writes or
history entries, a subsequent real edit from the equivalent original source,
nested array ordering, absent versus null values, and stale text/metadata
sources refused before writes. The new test's UndoManager takes a mutable copy
of the store's readonly scope, matching the Yjs constructor type.

## Controlled comparison

The baseline is compiled from `05a68f06`; embedded source maps are checked
against that commit's Git blobs. Candidate engine and adapter share one
compiled module graph. Three sequential trials per size use the same isolated
diagnostic identities and twelve timed edits per trial. Every document matches
an ordinary editor reference, and document/shared-state hashes agree between
all baseline and candidate trials at each size.

| Paragraphs | Before initialization median | After initialization median | Before edit median | After edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 130.07 ms | 130.44 ms | 51.08 ms | 42.93 ms |
| 5,000 | 606.22 ms | 584.63 ms | 242.40 ms | 217.83 ms |
| 10,000 | 1,199.72 ms | 1,274.31 ms | 497.49 ms | 433.87 ms |

Initialization is mixed; this change targets editing comparisons/planning.
Editing improves in this workload but remains far too expensive at 10,000
paragraphs. Reported map-size accesses are unchanged: full projection and
shared-store traversal are still required optimization work. This is a
controlled local diagnostic at reduced priority on two logical processors,
not a competitive benchmark or production latency certificate.

Three paired 1,024-edit sessions per build verify offline peer typing, complete
author-only undo/redo, reopen, and release of editor/document references after
destruction. Every recorded stage's container counts and shared sizes, plus
the final document and shared-state hashes, match across all six sessions.
History still grows; reference release does not establish bounded memory for
an indefinitely live editor. Twenty-eight old/new candidate compatibility
journeys also preserve convergence, both authors' history, root metadata and
the image.

## Verification and visual review

The focused six-file run has 252 tests: 246 passes and the six unchanged,
required default-adapter failures. All 230 candidate cases pass. The later
optimization does not repair or suppress those default-adapter assertions.
The last full-source run remains the historical `744c2731` checkpoint:
4,351 passes and six failures across 289 files. No fresh full-source result
is claimed here.

All 96 recorded journeys pass without retries/skips in Chromium, Firefox and
WebKit. These include native typing in distant paragraphs of a 1,000-paragraph
document, synchronization, independent keyboard undo/redo, unchanged rich
content, continued typing/Enter after observer writes, backward selections,
room replacement, download/reopen, native grapheme navigation and presence
labels. The tests inspect the actual compiled runtime imports; source maps
match current production files. Six stage captures and three six-frame
recording filmstrips are reviewed. This is sampled visual evidence, not full
video playback or physical-device/IME certification.

Compiled ESM/CommonJS consumers pass 36 pure-Node journeys without DOM globals.
Types (including Svelte/Angular), build, public API, headless boundary, package,
server/workerd and existing public performance/heap checks pass. All 171 public
JavaScript/CommonJS/CSS files remain byte-identical. The API snapshot, public
adapter, required default tests, protocol versions, CI workflow and acceptance
limits are unchanged.

The same three size overruns remain: core ESM 0.1 KiB, aggregate ESM 75.9 KiB,
aggregate CommonJS 59.9 KiB. The budget check is still red; the verifier expects
and identifies these existing failures rather than calling the whole gate green.

## Still required

Incremental projection/validation, large-document editing cost, history and
metadata growth, compaction with explicit old-peer/undo semantics, legacy
migration and safe adoption remain open. Full fresh source/complete CI and
size acceptance remain required for release. No default-adapter switch,
publication or overall parity promotion is made.

The [verification receipt](../artifacts/retained-equality-verification-20261106.json)
records source/build/report hashes and exact check outcomes. Representative
recordings/captures, the comparison, and reproduction tools accompany it.
Broad raw reports/traces stay local.

## Reproduction

```text
node artifacts/build-retained-baseline.mjs 05a68f06 retained-equality-baseline-20261106
node artifacts/build-cursor-overlay-canary-20261106.mjs
node artifacts/retained-read-controlled-cost-20261106.mjs retained-equality-baseline-20261106-build retained-equality-cost-baseline-20261106 3 1000,5000,10000
node artifacts/retained-read-controlled-cost-20261106.mjs cursor-overlay-build-20261106 retained-equality-cost-candidate-20261106 3 1000,5000,10000
node artifacts/retained-seed-interop-20261106.mjs retained-equality-baseline-20261106-build cursor-overlay-build-20261106 retained-equality-interop-20261106
node artifacts/retained-adapter-node-20261106.mjs es cursor-overlay-build-20261106 retained-equality-node
node artifacts/retained-adapter-node-20261106.mjs cjs cursor-overlay-build-20261106 retained-equality-node
node --expose-gc artifacts/retained-session-20261106.mjs 1024 retained-equality-session-baseline-20261106 retained-equality-baseline-20261106-build 3
node --expose-gc artifacts/retained-session-20261106.mjs 1024 retained-equality-session-candidate-20261106 cursor-overlay-build-20261106 3
powershell -NoProfile -File artifacts/run-retained-equality-checks-20261106.ps1
node artifacts/curate-retained-equality-20261106.mjs
node artifacts/verify-retained-equality-20261106.mjs
```

The runner preserves separate logs and exit codes; its focused and budget
commands are expected to fail only for the exact existing failures checked
by the verifier. Browser work remains headless, one worker, on private port
4195, with no user server reused or visible browser opened.

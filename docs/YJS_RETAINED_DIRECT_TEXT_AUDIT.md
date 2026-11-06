# Direct retained text transactions

2026-11-06, local follow-up to `9d7793dc` and the
[operation-local node-read audit](YJS_RETAINED_NODE_READ_AUDIT.md).
The replacement adapter remains private and experimental. COLLAB-01 is Partial.

## Change and eligibility

`src/yjs/retained-document.ts` can apply a single native `ReplaceTextStep`,
including its inherited insertion behavior, directly to its existing shared
text partition. Previously, such a keystroke built bookkeeping for every
unchanged node/text group before performing the same text operation.

Eligibility requires the original native apply implementation, its exact
mapping intent, one complete binding starting at zero, a nonempty source and
target with some source text retained, an existing nonempty layout, and one
uniform format. The actual partition text and every run's format are read and
compared before any write. If the enclosing Yjs transaction already contains
shared writes, the operation uses the general reconciliation path.

Empty leaves, complete replacement/deletion, incomplete/mixed partitions,
custom apply implementations, different mapping intent and multi-step
transactions continue through the general implementation. These are algorithm
choices; the supported document and command capabilities are unchanged.

Every transaction still validates its document and preflights every step/map
before writing. Both algorithms finish through the same full fresh projection,
exact target-shape comparison and schema validation. Observer follow-up writes,
including matching-origin transactions, retain the existing fresh-read logic.
No document cache, validation bypass, storage version or capacity change is
introduced. Full projection/model rebuilding remain expensive.

## Regression contracts

Fourteen added source cases compare native/general behavior for prefix/suffix
insertion, partial deletion/replacement, literal Unicode, full/empty content,
mixed marked fragments, alternate mapping intent, custom metadata intent and
pending shared layout changes. The corresponding native/general cases compare
encoded shared state and complete author undo/redo, not just visible text.
The same-text case explicitly requires no steps, no shared updates and no
history item, following the engine's no-op contract.

The pending-write case verifies that earlier shared layout changes still receive
general reconciliation. A custom text transformation's additional metadata
must survive; alternate whole-leaf mapping must retain its declared intent.

All 253 candidate cases pass. The focused run has 269 passes and the six
unchanged required default failures, 275 total. The fresh complete source run
has 4,399 passes and those same six failures, 4,405 total across all 289
discovered source files, without skips. Required failures are checked by name;
a nonzero source-suite exit is not represented as a green release gate.

## Measurements and recorded real use

Three sequential trials per size compare twelve timed edits against an ordinary
editor reference. The baseline is compiled from `9d7793dc`, with embedded
sources checked against its Git blobs. All model and shared-state hashes agree
between both builds and every trial at each size.

| Paragraphs | Before initialization median | After initialization median | Before edit median | After edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 113.73 ms | 123.73 ms | 38.09 ms | 29.47 ms |
| 5,000 | 637.56 ms | 520.39 ms | 189.72 ms | 132.40 ms |
| 10,000 | 1,166.00 ms | 1,236.66 ms | 375.76 ms | 264.57 ms |

Initialization is mixed; this change targets editing. Editing improves in this
workload, but 10,000-paragraph editing remains too expensive for adoption.
These are local diagnostics at reduced priority on two logical processors,
not competitive benchmarks or new production latency gates. The 5,000-paragraph
instrumented edit reduces node-pool gets from 15,001 to zero and placement gets
from 20,000 to 10,000, with identical encoded shared state. Remaining projection
reads are still real work; zero node-pool gets does not mean zero node traversal.

All 99 recorded browser journeys pass without retries/skips in Chromium,
Firefox and WebKit. The new journey natively selects and replaces marked text,
deletes a character, synchronizes another author's edit, and independently
undoes/redoes both authors' edits with keyboard shortcuts. It checks exact
documents, retained marks, image/root metadata and connected status. Existing
1,000-paragraph, observer, structural and cursor journeys also pass. Six stage
captures and six sampled recording filmstrips were reviewed. This is not full
video playback or physical-device/IME certification.

The 36 compiled ESM/CommonJS Node journeys and 28 old/new candidate compatibility
journeys pass. Three paired 1,024-edit sessions per build preserve offline
typing, full author-only history, reopen, every stage's sizes/container counts
and final model/shared-state hashes. References are released after destruction;
history still grows from 60,805 bytes after convergence to 118,390 after full
redo. This is not a bounded-memory certificate for an indefinitely live editor.

Types, including a refresh after the new manual journey, build, API, package,
headless, server/workerd and existing public performance/heap checks pass. All
171 public JavaScript/CommonJS/CSS files remain byte-identical. Public APIs,
the default adapter, required default failures, limits and CI workflow stay
unchanged. The same three size overruns remain: core ESM 0.1 KiB, aggregate
ESM 75.9 KiB and aggregate CommonJS 59.9 KiB.

## Remaining adoption work

Browser, package, compatibility, timing and session evidence is recorded
in the [verification receipt](../artifacts/retained-direct-text-verification-20261106.json).
The receipt checks actual compiled imports/source maps, baseline Git blobs,
model/shared-state hashes and exact failures. Broad raw reports and traces stay
local; representative recordings/captures and reproduction tools accompany the
checkpoint. No overall parity or release claim follows from scoped results.

Full projection/validation costs, history and metadata growth, compaction with
old-peer/undo semantics, legacy migration and safe rollout remain open. The
default adapter's six failures and complete fresh CI must be resolved before
release. Existing public-size overruns are not waived. No public adapter switch,
limit increase or publication is made.

## Reproduction

```text
node artifacts/build-retained-baseline.mjs 9d7793dc retained-direct-text-baseline-20261106
node artifacts/build-cursor-overlay-canary-20261106.mjs
node artifacts/retained-read-controlled-cost-20261106.mjs retained-direct-text-baseline-20261106-build retained-direct-text-cost-baseline-20261106 3 1000,5000,10000
node artifacts/measure-retained-node-reads-20261106.mjs retained-direct-text-baseline-20261106-build retained-direct-text-counts-baseline-20261106 5000
powershell -NoProfile -File artifacts/run-retained-direct-text-checks-20261106.ps1
powershell -NoProfile -File artifacts/run-retained-direct-text-probes-20261106.ps1
node artifacts/verify-retained-direct-text-20261106.mjs
```

The check runner saves individual logs and exit codes, including the expected
focused/full-source/budget failures checked by the verifier. The probe runner
also refreshes framework types after the manual test changes, compiled Node,
old/new interoperability, paired sessions, diagnostics and visual curation.
Browser runs remain headless, one worker, on private port 4195. No user server
is reused and no visible browser is opened.

# Checked shared frames for native retained text edits

2026-11-06, local follow-up to `c76553e5` and the
[model shape-comparison audit](YJS_RETAINED_SHAPE_EQUALITY_AUDIT.md).
The adapter remains private and experimental. COLLAB-01 stays Partial.

## Shared acquisition and model normalization

`src/yjs/retained-document.ts` separates shared node/placement/partition
acquisition from model normalization. Explicit `read()` always clears its prior
frame, reacquires shared state and checks document initialization/representation.
Remote projections, general structural operations and uncertain cases retain
the full acquisition path. The existing normalization still walks the complete
model, runs factory/attribute/mark rules, checks ownership and reconstructs
bindings and paths. No schema rule is skipped to obtain the optimization.

A successful read can retain its privately owned decoded graph, text partitions
and split placements. Only an already eligible single native text step can use
that checked frame, and only when its owning Yjs transaction starts without
shared changes. Existing native eligibility still requires the exact native
apply implementation and map, one complete nonempty uniform binding, and some
retained source text. Full replacement, empty leaves, mixed/incomplete bindings,
custom steps and multiple-step transactions use the general route.

`src/yjs/retained-text.ts` reads the actual target stream before the edit. After
the write, its proof allows only that existing text type and, if necessary, the
one new style-definition key at the expected insertion clock. Existing styles,
ownership, other streams and metadata cannot change under this proof. It rereads
the entire edited stream, verifies that partition identities/order are unchanged,
and updates every relevant partition's coordinates, including later siblings.
Any uncertainty falls back to full acquisition.

## Freshness and cleanup

A store-owned `afterTransaction` listener invalidates the frame on every other
transaction, independent of origin. A checked local result becomes reusable only
when the exact writer transaction finishes with its expected write stamp and
allowed changed types/keys. A full result can be retained when its acquisition
and normalization complete without intervening writes. Pending outer writes
prevent the native fast path; matching-origin observer transactions remain real
invalidations rather than being mistaken for the original writer.

The stamp includes the encoded insertion state and the transaction's total
deleted range length. Insertion clocks alone miss deletion-only edits. The stamp
is checked across normalization and again at transaction completion. Unexpected
factory-side writes force a fresh read; actual target-shape differences still
throw. Failed reads clear the old frame. The listener and cached data are released
by `destroy()`, including when the caller keeps the Yjs document alive.

Frame invalidation follows actual Yjs transaction operations. Explicit reads
remain the fresh inspection route; mutating a Yjs-owned JavaScript payload
directly is not a synchronized Yjs operation or a cache invalidation API.

## New regressions

Twelve new cases cover committed malformed metadata, deletion-only changes in
another stream, shifted split-partition coordinates and anchors, extra insertions
and deletions during normalization of the already allowed stream, off-path
factory validation, retained-document listener cleanup, unexpected metadata,
existing-style changes, other-stream changes and new partition markers.

The same-stream deletion case explicitly verifies that the state vector stays
unchanged while the write stamp changes. Both same-stream callback cases retain
valid character provenance, so the required shape error is exercised rather
than being replaced by a malformed-character error. Existing matching-origin
observer, pending-transaction, mutable-default and custom-map cases remain required.
All 277 candidate cases pass. The focused run has 293 passes and the same six
required default failures, 299 total. The fresh full source run has 4,423 passes
and those six failures, 4,429 total across all 289 discovered source files,
without skips. Failures are checked by name and remain failing assertions;
nonzero exits are not represented as successful release gates. Types, production
build, API, package, headless/server and existing public performance/heap checks
pass. Three existing size overruns remain failures, with no limit changes.

## Measurements and evidence

The isolated baseline is compiled from `c76553e5`; source-map contents are checked
against that commit's actual Git blobs. Its build folder retains the local name
`retained-frame-baseline-20261106-build`; the source/commit proof, not that folder
label, identifies the baseline. Historical tracked `retained-frame-*` receipts
are preserved. This checkpoint uses the separate `retained-checked-projection-*`
namespace for its new evidence.

Three uninstrumented local timing trials and independent read-count probes
compare exact document and encoded-state hashes. A paired receiver diagnostic
separates remote performance from the local path. A snapshot diagnostic measures
the extra live cache as well as explicit snapshot retention; it is not a general
bounded-memory or compaction certificate. Long sessions retain offline typing,
author-only history, reopen and reference-release checks.

| Paragraphs | Baseline initialization median | Current initialization median | Baseline edit median | Current edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 127.68 ms | 137.85 ms | 31.68 ms | 10.39 ms |
| 5,000 | 524.75 ms | 546.85 ms | 130.88 ms | 51.49 ms |
| 10,000 | 1,172.87 ms | 1,137.10 ms | 270.91 ms | 108.69 ms |

The edit improvement is specific to this eligible local workload; initialization
is mixed. Trials run sequentially at reduced priority on two logical processors.
All three trials at each size have identical final document and shared-state
hashes across builds. These are diagnostics, not competitive benchmarks or
changed adoption gates. At 5,000 paragraphs, an independently instrumented edit
reduces placement-map gets from 10,000 to zero, with node-pool gets already zero.
Model traversal still occurs; zero pool lookups does not mean zero document work.

The paired one-trial receiver diagnostic is mixed: 10,000-paragraph receiving
edits measure 282.15 ms before and 265.99 ms after, while 1,000-paragraph receiving
edits increase from 25.53 to 33.31 ms. Remote acquisition remains full and no
general remote speedup is claimed. The post-change CPU profile identifies
`Node.descendants`, `normalizeFrame` and its model walk as remaining costs.

The single-trial memory diagnostic holds 65 exact receiving-editor snapshots.
Both builds retain 2,193 unique model nodes and 566,856 bytes (0.54060 MiB) of
extra snapshot memory. With snapshots cleared and both editors/Yjs documents
still alive, measured total memory changes from 42,302,457 to 43,010,193 bytes,
about +0.68 MiB for the pair in this 1,000-paragraph workload. That exposes the
live-cache tradeoff; one GC diagnostic is not a steady-state memory guarantee.

All 36 compiled ESM/CommonJS Node journeys and 28 old/new interoperability
journeys pass. Three paired 1,024-edit sessions per build preserve exact documents,
encoded state, offline typing, full author-only undo/redo and reopen, then release
both editors and Yjs documents. Shared V1 state still grows from 60,805 bytes after
convergence to 118,390 after full redo. This phase does not solve history growth.

All 99 recorded browser journeys pass without retries or skips: 33 each in
Chromium, Firefox and WebKit. Every journey checks its actual compiled modules.
Native edits, backward selection, remote presence, both authors' history, mounted
room replacement, download/reopen and 1,000-paragraph shared documents remain
covered. Six final stage captures are byte-identical to reviewed parent captures;
six new six-frame recording filmstrips were visually inspected. Representative
recordings and hashes are retained. This is not full playback or physical-device,
IME or accessibility certification; startup frames and platform-specific audit-host
fonts are not final-layout evidence. All 171 public runtime/CSS files remain
byte-identical; public API, limits, default adapter and CI policy are unchanged.

The [comparison receipt](../artifacts/retained-checked-projection-comparison-20261106.json)
contains complete measurements. The [verification receipt](../artifacts/retained-checked-projection-verification-20261106.json)
binds source, compiled provenance, test scope and reviewed browser artifacts.

## Remaining work

Model normalization and provenance/preflight still traverse the document, and
remote/structural reads still acquire the complete shared graph. Large-document
latency, raw storage overhead, history growth, compaction semantics, migration
and safe adoption remain unfinished. The default adapter's six retention
failures, existing size overruns, full fresh release CI and wider physical-device,
IME and accessibility evidence remain open. No default switch, protocol or
acceptance-limit change, GitHub push, npm release, site publication or overall
parity promotion is performed.

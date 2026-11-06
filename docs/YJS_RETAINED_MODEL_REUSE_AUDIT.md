# Validated immutable model reuse

2026-11-06, local follow-up to `bd28559c` and the
[direct-text transaction audit](YJS_RETAINED_DIRECT_TEXT_AUDIT.md).
The retained adapter remains private and experimental. COLLAB-01 remains Partial.

## Boundary and implementation

`src/yjs/retained-document.ts` still reads and validates the shared node graph,
placements, text partitions, formats and metadata on every projection. It can
now return an already-owned immutable model node when those fresh values prove
that its type, text, normalized attributes, marks, child identities and text
bindings are unchanged. Candidates come from the store's existing model and
identity/binding maps; there is no additional persistent projection cache.

Temporary ownership tracking prevents reusing one model object for two distinct
document positions. Equal text is not an identity match. Ambiguous binding keys
disable reuse, and full binding comparisons include partition, offsets, length,
model offset and leaf identity. Paths and anchors are rebuilt from the fresh
projection, including moved branches.

Attribute and mark validators still run on freshly decoded values. Whole-node
factory invariants still run even when a previous immutable node is returned.
Mutable host attributes are ineligible. Ordered attribute comparisons preserve
fresh-factory key order and do not invoke host `toJSON` methods. Array subclasses
are not treated as equivalent to portable arrays.

Text fragments can be merged before allocating their model node. A schema with
a custom text invariant retains the old per-run factory path, so invalid runs
cannot become acceptable merely by merging. Text defaults are snapshotted before
later callbacks can mutate their source. This applies to `read(false)` as well:
that flag does not bypass factory validation.

`src/core/schema/attributes.ts` contains the exact previous `computeAttrs` and
`isDeeplyImmutable` functions extracted from `schema.ts`. Both factories and
the checked projection use that internal module. It is not exported through
the public schema barrel; the API snapshot remains unchanged. The evidence
verifier compares both extracted function texts against the baseline, allowing
only the internal export modifier and line-ending normalization.

## Regression evidence

Ten added source cases exercise unchanged/changed branches, reused source-node
identity, equal independently owned leaves, mutable host defaults, fresh
attribute and node validators, factory normalization and key ordering, array
subclasses, custom per-run text validation, mutable text-default snapshots and
malformed shared metadata after a previously successful read.

All 263 candidate cases pass. The focused suite has 279 passes and six unchanged
required default-adapter failures, 285 total. The fresh full source suite has
4,409 passes and those same six failures, 4,415 total across all 289 discovered
source files, without skips. Required failures are compared by name; neither
nonzero exit is represented as a successful release gate.

All 99 recorded browser journeys pass without retries or skips: 33 each in
Chromium, Firefox and WebKit. They exercise actual keyboard edits, marked text
replacement/deletion, both authors' history, offline structural changes, room
replacement, remote presence and 1,000-paragraph shared documents. Every journey
records its compiled runtime modules rather than silently using source imports.

Six final stage captures and six six-frame recording filmstrips were visually
reviewed. The synchronized text, retained image and peer carets agree in the
reviewed stages. A startup/loading frame and platform-specific audit-host font
differences are not final-layout evidence. This is sampled review, not full
playback or physical-device/IME certification. Six representative recordings
and twelve PNGs are retained alongside the source recordings' hashes.

All 36 compiled ESM/CommonJS Node journeys and 28 old/new interoperability
journeys pass without a DOM shim. Three paired 1,024-edit sessions per build
preserve exact documents/shared bytes through offline typing, full author-only
undo/redo and reopen, and release editor/document references after destruction.
Shared V1 state still grows from 60,805 bytes after convergence to 118,390 after
full redo; this phase does not fix history growth.

Types, production build, public API, headless/server, actual package and existing
public performance/heap checks pass. The three build-size overruns remain
failures; no limits, protocol versions, default adapter or CI policy are changed.

## Measurement scope

`artifacts/retained-snapshot-cost-20261106.mjs` creates two real editors and
retained adapters, performs two warmup edits and 64 incremental remote edits,
and deliberately holds all 65 receiving-editor immutable document snapshots.
Every saved snapshot is checked against its exact version. Both peers and an
ordinary document reference must agree; full encoded shared state must match.

The diagnostic counts unique model nodes across those snapshots, forces GC,
then clears only the saved snapshots while keeping both editors and Yjs
documents alive. Three isolated processes per build measure the difference.
This tests explicit snapshot retention, not ordinary steady-state editor memory,
bounded collaboration history or compaction. The baseline is compiled from
`bd28559c`; embedded baseline sources are checked against their actual Git blobs.

Separate three-trial local-edit measurements and a one-trial paired receiver
diagnostic keep timing evidence independent of snapshot memory. Full document
and encoded-state hashes must agree between builds. Node/placement read counts
remain unchanged: this phase reuses model allocations, not shared reads.

| Explicitly retained snapshot diagnostic | Baseline | Current |
| --- | ---: | ---: |
| Saved receiving-editor versions | 65 | 65 |
| Unique model nodes across all versions | 130,065 | 2,193 |
| Median extra memory held by saved versions, three processes | 24.44248 MiB | 0.54060 MiB |

All three current trials retain 2,193 nodes and measure 0.54060–0.54063 MiB
extra memory. All saved snapshots remain exact, and all six baseline/current
trials have identical final document and shared-state hashes.

| Paragraphs | Baseline edit median | Current edit median |
| --- | ---: | ---: |
| 1,000 | 27.88 ms | 26.19 ms |
| 5,000 | 133.44 ms | 127.17 ms |
| 10,000 | 268.69 ms | 256.90 ms |

These three-trial local diagnostics show only a modest workload-specific timing
change. They run sequentially at reduced priority on two logical processors,
not as competitive benchmarks or release latency gates. The single-trial paired
receiver diagnostic separately verifies retention of all 999/4,999/9,999 unchanged
block references in both the shared projection and receiving editor; its timing
does not establish a general speedup.

The internal helper extraction changes public chunk identities: 157 of 171
runtime/CSS paths remain byte-identical, nine existing paths change and five
chunks are renamed. Total raw bytes change from 4,010,273 to 4,010,326 (+53),
and separately gzipped file bytes from 1,065,102 to 1,065,123 (+21). CSS remains
byte-identical. The public API snapshot is unchanged, and all three existing
size overruns remain unaccepted; the aggregate ESM excess is now 76.0 KiB.

The [comparison receipt](../artifacts/retained-model-reuse-comparison-20261106.json)
contains full trials, hashes, read counts, receiver diagnostics and public-file
changes. The [verification receipt](../artifacts/retained-model-reuse-verification-20261106.json)
binds source, checks, measurements, captures and source-map/Git-blob provenance.

## Remaining work

Full shared projection and large-document editing remain expensive. History and
wire-state growth, compaction semantics, legacy migration and safe adoption are
unfinished. The six default-adapter failures, three size overruns, broader
physical-device/IME/accessibility coverage and complete fresh release CI remain
open. This checkpoint does not switch the public adapter or claim overall
ProseMirror + Tiptap parity. No GitHub, npm or website publication is performed.

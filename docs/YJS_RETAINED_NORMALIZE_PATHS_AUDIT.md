# Single-pass retained projection bindings

2026-11-06, local follow-up to `2f38d5fe` and the
[native provenance audit](YJS_RETAINED_NATIVE_PLAN_AUDIT.md).
The adapter remains private and experimental; COLLAB-01 stays Partial.

## Scope

`src/yjs/retained-document.ts` builds the identity, text and partition binding
indexes in one traversal of the fully normalized projection. A frozen numeric
path is captured there and retained with each text location; subsequent reads
can look up previous model nodes without splitting a stored string path. The
same numeric path serves partition-anchor lookup. Previously the binding walk
was followed by two complete map traversals that reconstructed numeric paths.

The private text-reuse key encodes partition identity, offset and leaf identity
with NUL separators instead of an array plus `JSON.stringify`. These shared
identities are already bounded to an alphabet that excludes NUL. The key is
local bookkeeping, never a wire value or persistent document identifier.
Duplicate candidates still become ambiguous, full binding equality is still
checked and equal text in independently owned leaves is never an identity.

For text with exactly undefined attribute specifications and no supplied
attributes, normalization uses the existing empty immutable attribute value.
Specified rules, defaults, supplied attributes and whole-node invariants retain
their normal factory processing. Changing a text schema after a successful
attribute-free read is observed by the next read. No parsed run or normalized
default cache is introduced; mutable defaults and host callbacks remain live.

The full projection, actual shared-data checks, schema delegation, native-write
proofs, observer freshness and final target-shape checks remain. This removes
repeated binding work; it does not make projection fully incremental.

## Behavioral coverage

Eight new source cases cover cursor association in both directions through
typing, movement and collaborative undo/redo in nested quotes, lists and table
cells; immutable previously returned identity paths; equal-text leaves with
colon-bearing shared identities; and new text defaults/validators installed
after a prior attribute-free read. Existing custom text validators, mutable
defaults, duplicate ownership, split partitions, host observers and malformed
shared-data cases remain required.

The first nested-undo experiment incorrectly routed local snapshot history
through the raw shared store. It failed in all six cases on the parent revision
as well. Snapshot restoration has replacement semantics; it is not Yjs selective
undo. The [collaboration guide](COLLABORATION.md#collaborative-undo-and-redo)
already prohibits mixing that local history with collaborative keystrokes.
The final tests use a real Yjs UndoManager, retain the original cursor anchors,
and assert exact typed/moved document values through undo and redo. No existing
test assertion was relaxed or converted to an expected failure.

## Verification

The focused suite has 322 passes and the same six required default-adapter
failures, 328 total, including all 306 passing retained-candidate cases. The
complete source run has 4,452 passes and those six failures, 4,458 total across
all 289 discovered files without skips. Required failures remain ordinary
failing assertions checked by name; this is not a green release suite.

Type checking, build, API, headless/server, packed-package and public performance
checks pass. The three existing raw-size overruns remain, with no capacity
increase. All 99 recorded browser journeys pass without skips or retries, 33
each in Chromium, Firefox and WebKit, using one headless worker. Each journey
verifies the actual compiled runtime. The work probe, uninstrumented timings,
compiled Node/compatibility/history checks, visual review and source-map identity
checks are completed separately below.

## Controlled measurements and visual review

The baseline is compiled from `2f38d5fe`; source maps prove its actual Git blobs
and the current source, with the same 191 modules. Three sequential trials per
size run below normal priority on two logical processors. Final model and shared
bytes/hashes agree across builds. No timing or memory acceptance limit changes.

| Paragraphs | Baseline initialization median | Current initialization median | Baseline local edit median | Current local edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 124.94 ms | 135.83 ms | 7.19 ms | 7.73 ms |
| 5,000 | 547.25 ms | 548.22 ms | 36.29 ms | 33.70 ms |
| 10,000 | 1,070.30 ms | 1,067.49 ms | 75.71 ms | 71.58 ms |

These are mixed local diagnostics. The 1k edit regresses slightly, initialization
is mixed and larger edits improve modestly. Full projection is still expensive;
these measurements do not establish general typing speed or production parity.
A separate 5k real-editor work probe reduces String.split calls from 15,000 to
zero and JSON.stringify calls from 10,043 to 43. Both functions are restored
before exact document/shared-state checks. Instrumented work counts are not
latency measurements.

All 36 compiled pure-Node ESM/CommonJS journeys and 28 old/new compatibility
journeys pass. Three paired 1,024-edit sessions per build preserve exact models,
shared bytes, full author-only undo/redo and reopening; both editors/documents
are released after destruction. Shared history still reaches 118,390 V1 bytes
after redo in that existing session fixture.

The snapshot diagnostic retains 65 exact versions with 2,193 unique model nodes
in both builds, with about 0.54060/0.54066 MiB extra memory before/after. After
clearing saved snapshots while both editors/documents remain live, measured
total memory is 42.22216 MiB before and 41.80497 MiB after. This single GC
measurement is diagnostic, not a bounded-memory certificate.

The one-trial receiver diagnostic is mixed: 31.68/124.48/265.80 ms before versus
35.07/121.70/267.42 ms after at 1k/5k/10k paragraphs. Remote acquisition still
reads the complete shared projection. The CPU profile continues to identify the
model walk, attribute processing and allocations as major work.

All 171 public runtime/CSS files are byte-identical. Six new recording
filmstrips were visually reviewed and six final stage images are compared with
the reviewed parent captures. That is sampled visual evidence, not full video
playback or physical mobile/IME certification.

Reproduction uses `artifacts/run-retained-normalize-paths-checks-20261106.ps1`,
`artifacts/run-retained-normalize-paths-probes-20261106.ps1` and
`artifacts/verify-retained-normalize-paths-20261106.mjs`. Required failure names,
module sources, exact shared/model values and public-file hashes are checked.

The [separate compaction diagnostic](YJS_RETAINED_COMPACTION_DIAGNOSTIC.md)
confirms that clearing both undo stacks does not compact live wire state. It is
research evidence for the next adoption work, not a shipped compaction feature.

## Remaining work

The six default-adapter failures remain genuine blockers. Whole-model
normalization, remote acquisition, larger document costs, history/storage
growth, compaction, legacy migration and safe replacement-adapter adoption
remain unfinished. Three raw-size overruns and complete fresh release CI remain
open. There is no default switch, representation-version change, acceptance
limit increase, GitHub/npm/site publication, or overall editor-parity claim.

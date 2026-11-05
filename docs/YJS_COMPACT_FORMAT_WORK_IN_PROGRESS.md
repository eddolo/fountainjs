# Compact retained formats — local work in progress

2026-11-05. This advances the isolated collaboration candidate; the public
adapter and website still use the existing implementation. The user requested
local commits, so nothing is pushed or published. The six default-adapter
retention failures remain ordinary required failures.

## What changed

`src/yjs/retained-text.ts` now stores each complete source format once per local
controller/style in a named Y.Map dictionary. Its insertion-owned `$f` marker
contains three safe integers: inserting client, insertion clock and style clock.
The marker stays unique even when neighboring insertions share a definition.
Definitions are immutable producer metadata outside the supplied undo scope:
undoing their first insertion must not invalidate another reference. Definitions
and references are written in the same Y.Doc transaction and saved together.
No asynchronous resolver, server request or guessed style is involved.

Logical strings remain literal wire strings. Boolean false represents an explicit
removal, avoiding a second JSON encoding and keeping literal `"false"`/`"null"`
strings distinct. The preceding private document/text codecs are refused; the
document and text tags are now `/3`, while the unchanged node tag remains `/2`.
No live room is migrated.

A CPU sample identified repeated format decoding as a hot path. Projection now
reuses a validated adjacent-run result only when the definition identity and
every explicit wire field match. Each insertion nonce is still validated.
Definition changes invalidate the projection cache; malformed/missing definitions
and changed wire keys cannot bypass validation. Dictionary and decoder caches
hold portable metadata only and are cleared when the controller is destroyed.

## Verified scope

All **129 candidate tests in four files pass**. This retains deletion, formatting,
mixed source styles, Unicode/invisibles, split/join sequences and undo/redo checks,
and adds style reuse, multiple controllers on one Y.Doc, decoded-cache invalidation,
malformed references, literal strings versus removals, and Yjs binary V2 saved
updates. V1 save/reopen tests remain. Binary update-format V2 is separate from the
private Fountain codec version.

The combined focused run executes **151 tests: 145 pass, six fail, no skips**.
All six failures are in the unchanged default-adapter acceptance file; this is
not a new full-repository unit run. TypeScript passes. The existing public-build
API and headless source checks still verify 423 declarations and 132 modules;
their implementation sources/exports are unchanged.

**48 compiled ESM/CommonJS Node journeys pass**, using the same real command,
peer-typing, author-undo, mixed deletion, cut-order and save/reopen assertions.
Browser globals are absent. Both candidate source maps match the five current
source modules. Private markers do not leak into projected model JSON, and reads
make no repair writes. No browser/IME/mobile certification is claimed.

## Diagnostic cost comparison

The same paragraph receives 1,024 single-character transactions in each candidate.
Three trials alternate execution order in one process and use the same fixed
Yjs client ID. The intended model stays exact with one native text leaf.

| Metric | Previous full-payload candidate | Compact candidate |
| --- | ---: | ---: |
| Median total edit-sequence time | 2,541.6 ms | 633.0 ms |
| Encoded shared state | 259,165 bytes | 58,619 bytes |

That is approximately four times faster and 77% less encoded state **for this
diagnostic workload**. It is not a production benchmark, comparison with the
default adapter/Tiptap, per-keystroke timing, or proof that existing performance
budgets pass. The sampler also records all trials and the 256-character workload.
The prior checkpoint's single random-client sample is a different measurement.

## Remaining adoption requirements

The candidate still walks full streams and projects the document. Compact style
references and fewer decodes improve this sample without establishing incremental
lookup/projection at large-document targets. The existing 100,000-node guards
count containers and text records, so they do not prove support for 100,000
paragraphs. Initialization complexity, bounded histories, heap release, encoded
updates and history/offline-aware dictionary/placement compaction remain required.
Unused definitions deliberately survive undo; their retention is not a compaction
or memory-release guarantee.

Selections/awareness, review anchors, structured-state overlays, provider
replacement, explicit recoverable legacy cutover, general moves/joins/custom
invariants, the original six acceptance tests and recorded browser editing
journeys remain integration work. No public adapter switch, package entry,
dependency or acceptance ceiling changed. Do not promote parity from these
candidate checks alone.

[Verification receipt](../artifacts/yjs-compact-verification-20261105.json) ·
[Diagnostic sample](../artifacts/yjs-compact-cost-20261105.json).

Reproduce the compiled candidate with
`node artifacts/build-yjs-compact-candidate-20261105.mjs`, then run
`node artifacts/yjs-format-node-probe-20261105.mjs es yjs-compact-build-20261105`
and the same command with `cjs`. The controlled sampler is
`node artifacts/sample-yjs-compact-cost-20261105.mjs`. The receipt writer names the
raw unit/type capture paths needed for regeneration. Its historical CPU trace is
optional and retained locally; reproducing that trace is not an acceptance gate.

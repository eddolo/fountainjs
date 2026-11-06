# Final retained model shape comparison

2026-11-06, local follow-up to `50842bfe` and the
[immutable model reuse audit](YJS_RETAINED_MODEL_REUSE_AUDIT.md).
The adapter remains private and experimental; COLLAB-01 remains Partial.

## Change and correctness boundary

`RetainedDocumentStore.finishChange` still performs a complete fresh shared
projection, including factory validation, before checking its result against
the intended native document. It now tries the existing `Node.eq` first. That
comparison can recognize unchanged immutable branches without materializing
two full JSON document trees.

When model equality is false, the original portable JSON comparison still runs.
This matters because equivalent attributes can have different insertion orders:
`Node.eq` compares serialized attribute order, whereas the retained bridge's
portable equality deliberately accepts equivalent object-key order. An actual
shape difference still throws the same error. No shared read, validation,
observer handling, transaction preflight or default-adapter behavior is removed.

Two new regression cases exercise that boundary. A native text edit with
reordered nested/root metadata must survive exact shared save/reopen even when
the projected and target models fail `Node.eq`. An injected shared metadata
write during the native insertion must still produce the shape-mismatch error.

## Allocation and timing diagnostics

The instrumented probe creates a real compiled editor and retained adapter,
warms up with two edits, then counts actual `Node.toJSON` calls during one edit.
It restores the prototype before checking the final document against an
ordinary editor reference. Separate uninstrumented three-trial processes measure
editing latency. Both builds use isolated deterministic client/room identities.

| Paragraphs | Baseline model-to-JSON calls per measured edit | Current calls | Baseline edit median | Current edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 4,002 | 0 | 24.89 ms | 27.37 ms |
| 5,000 | 20,002 | 0 | 125.49 ms | 127.44 ms |
| 10,000 | 40,002 | 0 | 262.22 ms | 257.13 ms |

All allocation probes and corresponding timing trials require exact final
document/shared-state hashes. The measured optimization avoids JSON tree
materialization in this eligible workload, but timing is mixed. It is not a
general typing-speed improvement, a heap-retention measurement or a production
latency certificate. Full projection remains the main architectural cost.

## Verification scope

The focused source run has 281 passes and the same six required default-adapter
failures, 287 total, including all 265 passing candidate cases. The six failures
are compared by name and remain ordinary failing assertions. The complete
source suite was not rerun for this small follow-up; the parent checkpoint
reports 4,409 passes and six failures. A fresh complete release gate remains
required; parent totals are not presented as results for this commit.

Types, production build, API, actual package, headless/server and existing public
performance/heap checks pass. Three existing size overruns remain failures. All
171 public runtime/CSS files remain byte-identical to the parent build; the
private equality change has no public API or protocol-version change.

All 99 recorded browser journeys pass without retries or skips, 33 each in
Chromium, Firefox and WebKit. The journeys cover native marked replacement,
deletion, author history, offline structural edits, remote cursor movement,
room replacement and a 1,000-paragraph shared document. Every journey verifies
the actual compiled runtime modules. Representative stage captures and sampled
recording frames are reviewed separately from the behavioral assertions. Six
final stage captures are byte-identical to the directly reviewed parent images;
the six new recording filmstrips were visually inspected. The receipt retains
both hashes for each matching stage. Startup/loading frames and platform-specific
audit-host fonts are not final-layout proof. Recording is not physical-device
or full-video certification.

All 36 compiled ESM/CommonJS Node journeys and 28 old/new interoperability
journeys pass. Three paired 1,024-edit sessions per build preserve exact model,
shared bytes, offline typing, full author-only undo/redo and reopen. Both editors
and Yjs documents release references after destruction. Shared V1 state still
grows to 118,390 bytes after full redo, so bounded-history claims remain open.

The [comparison receipt](../artifacts/retained-shape-equality-comparison-20261106.json)
contains uninstrumented trials, independent allocation counts and shared-state
checks. The [verification receipt](../artifacts/retained-shape-equality-verification-20261106.json)
binds source, compiled source-map/Git-blob provenance, checks and visual evidence.

## Remaining work

Large-document projection, long-session wire/history growth, compaction,
migration and safe adoption remain unfinished. The six public/default retention
failures, size acceptance, full fresh release CI and broader device/accessibility
evidence remain open. No adapter switch, acceptance-limit change, GitHub push,
npm release, site publication or overall parity promotion is performed.

The next architectural investigation is to separate acquisition of shared
records/partitions from model normalization. Any reuse must prove that untouched
shared data is current, handle pending outer transactions and same-origin
observer writes, and still execute the factory/schema rules. Deletion-only
changes cannot be detected by an insertion clock alone. No incremental
projection implementation or adoption approval follows from this design target.

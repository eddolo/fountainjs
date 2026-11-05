# Structural range formatting and toolbar focus

Unreleased follow-up, 2026-11-05. This checkpoint extends the
[selection foundation](SELECTION_RANGES.md); it does not certify complete command
coverage or editor parity. The
[verification record](../artifacts/structural-formatting-verification-20261105.json)
contains command results, source hashes, package provenance and remaining limits.

Subsequent full CI contradicted the targeted focus evidence: 63 browser cases
failed. The [native focus follow-up](NATIVE_FOCUS_AUDIT.md) documents the cause,
narrower restoration contract and recovery verification. The original results
below remain a historical checkpoint, not full-suite certification.

## Repairs

`src/core/commands.ts` previously bounded text-block formatting only for legacy
text selections. A mixed structural range could therefore align unrelated
paragraphs. It now intersects exact structural intervals, including empty
paragraphs and excluding a following paragraph when the range ends at its first
text offset. An image-only range cannot format neighboring text.

Heading conversion accepts directed ranges, whole-document selections and table
cell rectangles. It preserves children, portable IDs, unknown metadata and
compatible declared attributes. It omits attributes specific to the old type.
Code and media remain unchanged. Schema validation covers the completed result:
a container allowing `paragraph+ | heading+` can convert atomically, while one
requiring paragraphs rejects the complete operation. Transaction filters and
read-only state remain effective.

`src/core/transaction/set-block-type-step.ts` is an internal content-preserving
operation with an identity position map. Generic node replacement retains its
existing deletion semantics. Command-batch replay can reconstruct equal text
nodes; conversion validates their complete equality and retains the actual
current descendants, rather than restoring captured old child objects.

`src/core/schema/block-lineage.ts` records ephemeral copy/conversion provenance
in a weak map. Its symbol values hold no document references. `Node.copy` and
`Node.withAttrs` carry that provenance into immutable versions. The Yjs adapter
can then retain a shared element and its text through paragraph/heading changes,
so concurrent offline character insertions and relative selections survive.
Equal text alone does not imply node identity. No document or collaboration wire
format changes, serialized IDs or new runtime dependencies are required.

`src/view/selection-handler.ts` restores the model caret when the editing host
receives focus from an external toolbar. Browser focus defaults can otherwise
restore stale endpoints and cause the next input to land elsewhere. Genuine
pointer placement and transitions from embedded editor controls retain their
native handling. The API review proves that only two private declaration lines
were added; public method signatures are unchanged.

## Evidence and controls

The earlier CI run failed all 15 physical table-column journeys: insertion
succeeded, but typing after returning from the toolbar created a paragraph
before the table. The same unchanged journey reproduces that failure locally.
The repair exercises left insertion by pointer and right insertion by keyboard,
LTR/RTL/automatic/host-inherited direction, merged cells, physical geometry and
undo. The existing code-region and slash-command assertions also remain intact.

The formatting journey imports a document containing an outside paragraph,
identified text and a real embedded PNG. It makes native forward/backward
text-to-media selections, clicks heading and alignment controls, downloads JSON,
compares the complete expected model, undoes/redoes and inspects the reopened
reader. It obtains model evidence through downloaded files, not injected editor
APIs. Recordings and stage captures are reviewed separately from assertions;
sampled frames do not establish continuous playback review.

Actual extracted-package consumers exercise root/core ESM and CommonJS without
DOM globals, including batching, identity maps and Yjs concurrent editing plus
author undo/redo. All extracted distribution files are compared with the tested
build; source-map contents are compared with the six changed runtime sources.

## Remaining boundaries

General open-slice transport/fitting, the rest of command coverage for structural
ranges, large whole-document formatting latency, physical mobile testing, broader conversion/CommonMark fidelity and
complete fresh CI remain open. Size checks retain their existing ceilings and
report actual failures. Loaded-closure measurements exclude consumer tree
shaking and external dependencies and do not measure execution speed. Runtime
performance and memory gates remain separate. No npm or website release is
promoted by this checkpoint.

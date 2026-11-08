# Retained room recovery checkpoints

2026-11-06, local follow-up to `93f05fb0` and the
[compaction boundary study](YJS_RETAINED_COMPACTION_DIAGNOSTIC.md).
This is an internal experimental module, not a public package entry or .fjs
file format. COLLAB-01 stays Partial; the default adapter is unchanged.

## Scope and state ownership

`src/yjs/retained-checkpoint.ts` supplies `captureRetainedCheckpoint` and
`restoreRetainedCheckpoint`. Capture preserves the complete Yjs V1 update,
declared top-level root types (including empty and unnamed roots), GUID, GC
flag, original retained room identity and an explicit host schema version.
SHA-256 checks cover update bytes, the canonical base-document projection and
manifest metadata. Checksums detect corruption; they do not authenticate an
author or replace the host's access control.

Every capture reads an isolated GC-disabled copy, validates the retained room
gate and schema, and checks that validation did not write into shared storage.
The copy owns its identities and is destroyed after use. Capture never repairs
the source. After asynchronous hashing, the source's full encoded state and
root declarations must still match; deletion-only changes are caught even when
the Yjs state vector stays unchanged. Changes to GUID/GC options and destruction
also reject capture. Open caller-owned transactions are refused through the
installed Yjs `_transaction` lifecycle boundary.

Source writes made by host schema callbacks are detected, not rolled back.
Callbacks still belong to the host and must obey its intended read/validation
contract. Schema version is an explicit application label, not an inferred hash
of callback code; the application must supply the correct schema on restore.

Capture's update accessor returns an owned byte copy. Restore snapshots input
bytes and manifest fields before awaiting, rejects accessors/sparse inventories,
checks integrity and schema version, and restores only into a new isolated
Y.Doc. The returned base document is freshly validated; the original full-wire
room/CRDT identities and relative anchors survive. The manifest and its root
entries are frozen. Bounds are 64 MiB of update bytes and 1,000 named roots;
normal retained document/schema bounds remain in force.

Named maps, arrays, text, XML fragments/text and unresolved wire roots are
supported. Custom top-level shared subclasses and nested subdocuments are
refused explicitly rather than silently losing behavior or child state.
Other extension-owned data inside supported roots is archived without trying
to reinterpret it.

## Wire representability repair

### Capture after undo and redo

Redoing a quote wrap after merging another author's offline typing could
leave two adjacent Yjs array records that Yjs joins on replay. The earlier
checkpoint rejected the redone room because the full V1 encoding differed.
Capture now accepts that encoding only after splitting the combined array
records in an isolated copy and recovering the original bytes exactly. The
archive stores the replay encoding and checks that validation leaves it
unchanged. The live source is still checked against its original bytes and
root inventory after hashing. The existing checksum and restore checks apply.

The regression preserves the inserted text, quote structure, native state
vector and a relative cursor position. Saving the restored room yields the
same manifest, and the room accepts the author's subsequent undo. The test
runs with Yjs garbage collection enabled and disabled.
The previous build also opens the new archive after merge, undo and redo in
both seed directions with either GC setting. Recorded Chromium, Firefox and
WebKit journeys type the offline edit, wrap and redo the quote, save and reopen
the room, then apply a later undo. Visual review confirmed that the reopened
editor showed the quote and kept the offline text after the undo.

An additional probe found that the initial capture could silently turn an
unpaired high/low UTF-16 unit into the Unicode replacement character when Yjs
encoded it as UTF-8. The initial observation and an independently reproducible
Yjs-only oracle are retained separately; valid emoji in
that same probe survived. This was an actual fidelity defect despite the first
source/browser cases passing.

`src/yjs/retained-wire.ts` now examines actual stored string runs, names and
opaque Any values before capture and when checking stability. Concatenated text
is insufficient because it can hide separately stored bad halves. The retained
document preflight also refuses unpaired text/type names before shared writes.
There is no automatic replacement, trimming or Unicode normalization. Strings
already represented through escaped JSON metadata retain their original UTF-16
units; the dedicated metadata case proves this is not a blanket cleanup.

Opaque Any data keeps supported undefined/NaN/infinite/negative-zero numbers,
signed 64-bit bigints, binary values and dense plain data. Out-of-range bigints,
runtime behavior, accessors and sparse/non-data representations are refused
explicitly. Standard Y.ID data records returned inside relative-position JSON
are supported and tested; an initial over-restriction of that representation
was corrected before final acceptance. These checks do not certify arbitrary
host objects or hostile-input resource behavior.

## What this does not restore

This checkpoint is not an authoritative room rollback, new-room migration,
online compaction, or a writer fence. Restored same-room state can receive
later peer updates; those updates can bring later edits back. The caller must
provide the handoff/fencing policy before changing an authoritative room.

UndoManager stacks, awareness, provider connections, `Y.Doc.meta`, custom GC
filters, collection options and external comment/version/database providers are
not serialized. Queued UI/provider data outside the Y.Doc is not part of this
shared-state snapshot. The base-document digest is not an application-wide rendered
projection: consumers must reattach their extension/structured-attribute
definitions and providers. In-document media nodes and references survive;
external asset bytes are not fetched or bundled by this module.

## Evidence

All 35 checkpoint source cases pass, covering exact wire/model round trips,
opaque maps/binary values/empty roots, anchors, later updates, owned bytes,
insertion/deletion/empty-root races, active transactions, source destruction,
subdocuments, custom roots, metadata/payload corruption, accessor rejection,
schema callbacks and wire-loaded roots. The combined retained/default focused
run has 357 passes and six unchanged default failures, 363 total. The full
source run has 4,487 passes and those six failures, 4,493 total across all 290
discovered files without skips. These remain ordinary failing assertions;
the release suite is not green.

Sixteen compiled pure-Node checks pass across ESM and CommonJS, including packets
restored in both module-format directions with each runtime's own schema/Yjs
types. A technical document retains inline/display TeX source, Lean code, tables,
an extension-defined widget, root/widget metadata, media references and an
auxiliary review record. This is data fidelity, not native TeX compilation,
proof execution, or a visual paper-layout certification.

A refreshed combined 108-journey browser matrix passes, 36 each in Chromium,
Firefox and WebKit, including nine new checkpoint journeys. It runs with no skips/retries and one headless worker. The checkpoint cases use
real buttons and
native keyboard input to capture, edit the source, restore side-by-side, inspect
the earlier state, apply later same-room typing/undo, retain a host note and
relative anchor, render the retained image, and reject concurrent capture or
damaged bytes without replacing a live editor. All peers stay connected and
page errors are checked. An initial lab markup issue used multiple implicit
status regions; debug panels now use plain preformatted elements with one main
status region. No engine behavior was relaxed to pass those assertions.

Type, package, API, headless/server and public performance checks pass. The
three pre-existing raw-size overruns remain and no limit changes. This new
module is private; the 171 public runtime/CSS files remain byte-identical.
The graph contains 190 unchanged parent modules, the retained document module
with new UTF-8 representability preflight, and two new checkpoint/wire-validation
modules. The 99 existing adapter/navigation journeys are refreshed alongside
the nine checkpoint journeys.

## Larger-document diagnostic

One reduced-priority, two-logical-processor Node trial captures 1,000 paragraphs
with application IDs, combining marks and a zero-width character. Both full
document JSON and encoded wire bytes remain exact. The update is 1,927,624 bytes;
capture takes 341.87 ms and restore 235.76 ms in this local trial. Explicit-GC
samples with the source alive measure about 25.44 MiB before capture, 27.22 MiB
with the checkpoint and 41.32 MiB with the restored document also alive.
These are stage samples, not peak memory, latency acceptance, hostile-input
certification or a bounded-memory guarantee. Checkpoint work is explicit,
never attached to the typing path.

A separate four-turn GC diagnostic keeps the checkpoint alive while destroying
its source. Weak references confirm that the source editor, Y.Doc and schema
are released, and the checkpoint then restores through a fresh schema. This
checks archive ownership in that case, not general long-session memory bounds.

## Reproduction and next boundary

Use `artifacts/run-retained-checkpoint-final-checks-20261106.ps1` for the source/public
checks, `artifacts/retained-checkpoint-final-browser-20261106.config.ts` for the browser
lab, and `artifacts/retained-checkpoint-node-20261106.mjs` for compiled runtime
interchange. `artifacts/retained-checkpoint-large-20261106.mjs` is the separate
large-document diagnostic; `artifacts/retained-checkpoint-release-20261106.mjs`
checks archive ownership. `artifacts/run-retained-checkpoint-probes-20261106.ps1`
runs the compiled/diagnostic/visual probes sequentially. The verifier records source/module/runtime identity,
required failures, actual recordings, and public byte/limit invariants.

The subsequent [single-authority reference](YJS_RETAINED_ROOM_FENCING_AUDIT.md)
implements writer epochs and same-room freeze/resume with isolated update
validation. It is not durable/distributed provider enforcement or fresh-room
migration. Next work remains a persistent migration epoch/destination record,
operational fencing, auxiliary-anchor translation, offline-edit reconciliation,
declared history retention/reset, and crash/retry/rollback proof. Full
compaction, legacy migration and replacement-adapter adoption are unfinished.
There is no GitHub/npm/site publication or overall editor-parity promotion.

# Retained fresh-room candidates — 2026-11-06

This private, local work builds and verifies an isolated migration candidate from
an existing retained checkpoint. It is the next step after
[persistent writer fencing](YJS_RETAINED_PERSISTENCE_AUDIT.md), **not** an online
compaction command, authoritative destination install or default-adapter switch.
COLLAB-01 stays Partial. The six default-adapter counterexamples remain open.

The subsequent [persistent handoff audit](YJS_RETAINED_HANDOFF_AUDIT.md) adds
atomic installation, late-branch retention and rollback to the backend reference.
This candidate-only audit remains evidence for the earlier isolated scope.

## Code and ownership

`src/yjs/retained-migration.ts` imports Yjs, the schema `Node`/`Schema` types,
checkpoint capture/restore and the synchronous checkpoint-state guard, private
room validation, `RetainedDocumentStore`, retained selection helpers and
`YjsStructuredAttributeStore`. There are no view, DOM, Node filesystem, SQLite
or provider-transport imports. The module is not a public package entry.

`buildRetainedMigrationCandidate(checkpoint, schema, schemaVersion, options)`:

1. Owns and validates the source checkpoint, then restores it into an isolated
   document. No live editor/Y.Doc is accepted or modified.
2. Seeds a second isolated retained document from the exact current source model.
   It creates a new Y.Doc GUID, retained room identity, node/placement/text IDs and
   CRDT history. Application `nodeId` values and document contents remain intact.
3. Derives the engine-root inventory from that fresh seed. Every other source
   shared root, including empty roots, needs exactly one declared root migrator.
   Missing, duplicate, reserved and unclaimed roots cause refusal.
4. Runs the registered synchronous migrations, verifies unchanged document values
   and root ownership, then captures and independently restores the candidate.
5. Runs each semantic verifier with a read-only wire-state contract: any write to
   either isolated document, including an empty-root declaration or options
   change, causes refusal. This is a Yjs state guard, not a code-execution sandbox.
6. Rechecks document equality, translated references and both complete wire/root
   inventories synchronously before returning owned immutable checkpoints.

The source's document/node/text version-metadata maps reject unrecognized fields;
identity and text-owner metadata must follow their current engine contracts.
Engine-owned historical provenance is reset explicitly; the entire original
checkpoint remains in the result for recovery. This is not a byte-identical
destination or a promise to preserve the source UndoManager.

## Reference translation

`RetainedMigrationContext` exposes the isolated documents/current model plus:

- `textAnchor`: resolve a source relative position to its actual model path and
  UTF-16 offset, create a destination relative position, preserve left/right
  association and verify the final logical point. Detached/unsupported references
  fail instead of selecting a nearby point. Original source-relative positions
  are not reused in the destination.
- `selection`: restore the current logical selection and encode it using fresh
  destination identities. Cursor, forward/backward range, nested range, atomic
  node, gap, rectangular table-cell and all-document selections are tested.
- `nodeIdentity`: map an attached internal node identity through its exact current
  model path and verify that destination path after all migration work.
- `checkSelection`: verify the actual stored destination selection against its
  source logical range, rather than checking only a temporary translated value.

The helper context expires when construction ends. Translation does not attempt
to infer arbitrary references hidden in an unknown extension's JSON.

`retainedSelectionRootMigrator(name)` handles a declared Y.Map whose complete
value contract is retained selections; it verifies keys, count and logical
ranges. It is not a generic comment-thread parser.

`retainedStructuredRootMigrator(options)` copies the entire declared structured
attribute tree into new shared types, retains its JSON values, and checks both
the complete map values and schema-defined overlay. Stale/extra map entries are
not silently pruned. Application-specific embedded references require their own
root migrator. The module does not infer their meaning from object shape.

Other extensions/hosts must provide `name`, `roots`, `migrate` and `verify`.
These are trusted developer-installed callbacks, never downloaded or executed
from document contents. Unknown formats are refused. Verification is required,
but the engine cannot prove a host's arbitrary semantic verifier is correct.

## Explicit policies and missing activation

Construction requires three explicit declarations, snapshotted before any await:

```text
history:       reset-with-source-checkpoint
offline:       reconcile-before-activation
externalState: host-coordinated
```

The returned report includes the source/destination room IDs and byte sizes,
claimed auxiliary roots/owners, translation-helper counts, these policies, and
`activation: not-implemented`. It does not claim no offline edits exist, obtain
user consent, move external records, or silently discard queued old-room updates.
There is no method here to overwrite an authoritative room.

Comments currently use host `CommentsAdapter` records with logical numeric
anchors; named versions use a `VersionProvider`. They are not automatically
stored in the collaboration Y.Doc. Tests use the actual in-memory comment and
version providers: the same comment anchors work on the identical destination
model, and named version records stay unchanged. A production host still needs
its own coordinated transfer/identity/access policy. Custom CRDT-relative
external references need explicit translation.

## Source tests

`tests/yjs-retained-migration.test.ts` adds **30 cases**. Together with checkpoint,
in-memory room and persistent coordinator cases, **117 focused cases pass**.
The full source run has **4,569 passes and six failures**, no skips, across 293
files. The exact default-adapter failure names remain unchanged.
Coverage includes technical/Unicode content, root metadata and application IDs;
all stored selection variants; nested text/node references; granular structured
attributes; binary host data and empty roots; unknown roots and metadata;
detached references; mutating/async/absent verifiers; source and root-inventory
mutation; expired contexts; policy ownership; and explicit history reset.

Two actual destination editors concurrently change different nested structured
fields, converge and preserve the other author's field through undo. The fresh
room initially has no old author undo entries. An accumulated-edit fixture
produces a smaller wire candidate while the full source archive and exact model
remain available. This is a measured case, not bounded storage or a universal
compression ratio.

The initial tests exposed incorrect test calls to the existing structured
attribute API and a malformed direct-wire mutation missing format provenance.
They were corrected to use the actual API and a valid formatted text mutation;
the content guard is now exercised beyond lower-level wire rejection. Read-only
verifier and policy-snapshot cases strengthen real boundary guarantees.

## Real browser use

`tests/manual/retained-migration-real.spec.ts` runs three recorded journeys in
each of Chromium, Firefox and WebKit. All **nine pass** with one headless worker,
no retries or skips, using a compiled shared runtime graph:

1. Type 64 characters to accumulate actual edit history, create a backward native
   selection of “Alpha”, save it, build/open the fresh candidate, select the same
   phrase in the new room, edit it, undo all typed replacement characters, and
   compare exact source/destination values. The image loads; the math and Lean
   source stay in the document. Applying old-room wire through an isolated
   validator is rejected without changing the preview.
2. Add an unclaimed host root and refuse rebuilding while keeping the existing
   source and preview usable.
3. Simulate a verifier write and refuse rebuilding without replacing either view.

This is an internal candidate-preview fixture. It neither activates a server room
nor reconciles a genuinely offline client. The old-room rejection uses isolated
checkpoint validation, not a claim that the browser fixture supplies a provider
writer fence. Persistent fencing has separate evidence in its own audit.

## Capture investigation and final evidence

Visual review found a transient narrow Chromium frame during a full-page
screenshot. Added animation-frame measurements caught `innerWidth = 1` and
two-pixel panes; two Chromium journeys failed the new layout assertions.
The first plain-page control without tracing did not reproduce it. With tracing
and repeated captures, the same problem reproduced on a plain two-column page
with **no Fountain code**: one narrow frame in 242 full-page capture samples,
minimum viewport one pixel. The viewport-capture control had 168 samples, minimum
width 1,280 and no narrow frame. The raw result, browser version and reproducible
diagnostic are saved in `artifacts/retained-capture-reference-20261106.json` and
the corresponding `.mjs` script; the timing-sensitive reproduction is not a
release acceptance gate.

The final audit uses a fixed 1,440 × 1,400 CSS-pixel viewport. Each capture first
asserts that the complete document fits both dimensions, then takes a viewport
image at a checked zero scroll origin. The strict per-animation-frame pane-width and overflow assertions stay
enabled; no resize sample is ignored. All nine final journeys pass, and images
remain complete rather than clipping the math/code below the editors. This
changes only the audit's capture setup. See the upstream
[screenshot options](https://playwright.dev/docs/api/class-page#page-screenshot)
for the full-page/viewport and CSS-pixel distinction.

The final run samples 662 animation frames: minimum pane width 686 CSS pixels,
maximum horizontal overflow zero, and no rejected layout sample. Three-engine
selected-range captures and all nine sampled recording filmstrips were viewed;
the paired editor content, image, math source and Lean source remain visible.
Windows WebKit's host-font fallback still differs from Chromium/Firefox. This is
sampled desktop evidence, not complete playback or physical-device coverage.

Compiled ES and CommonJS consumers pass nine checks each (18 total), without a
DOM. The measured ES accumulated-edit case shrinks 13,876 to 8,691 encoded bytes
while retaining the source archive, exact document and translated references.
This is one case, not a general compaction ratio or latency contract.

Types, public build, API and headless checks pass; 171 public runtime/CSS files
remain byte-identical. The same three raw-size overruns remain: core ESM ~0.1 KiB,
aggregate ESM ~76 KiB and aggregate CommonJS ~59.9 KiB. No acceptance limit,
public adapter, package version or CI policy was changed.

Reproduction:

```powershell
pnpm exec playwright test --config artifacts/retained-migration-browser-20261106.config.ts
./artifacts/run-retained-migration-checks-20261106.ps1
```

## Remaining work

An authoritative handoff still needs a durable destination/rollback record,
verified source-revision CAS and crash/retry/rollback installation, host-owned
external-state coordination, actual old-client/offline edit reconciliation or
explicit retention/disposal policy, and a user/host-approved history boundary.
No old-room update may be merged directly into the fresh room. Legacy public
adapter migration, larger-room cost/storage evidence and safe adoption remain.
Full ProseMirror + Tiptap parity, fresh release CI and the existing size overruns
are not resolved by this candidate builder.

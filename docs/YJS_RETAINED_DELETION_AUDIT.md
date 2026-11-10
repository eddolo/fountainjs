# Retained collaboration — deletion and author undo

## Scope and failures reproduced on 2026-11-10

Two ordinary offline workflows could leave both retained clients in an error
state, displaying different documents after they exchanged updates.

1. Ada deletes a quote or list while Grace presses Enter inside it and types.
   Grace's new descendants remain allocated beneath the deleted ancestor.
   `RetainedNodeStore.project()` called them unattached, and the document
   projection refused the room.
2. Ada inserts a quote, shares it, and then undoes that insertion while Grace
   splits and types inside the quote offline. Native Yjs undo deleted the newly
   allocated parent map and could delete its text stream. A projection-only
   exception for missing parents would conceal corruption and would not retain
   the native storage needed by Grace's edits or Ada's redo.

The new regressions first reproduced six failures for explicit ancestor
deletion, then two failures for undoing the ancestor's insertion. Neither fix
changes the schema, converts missing records into placeholders, or reconstructs
peer text from visible strings.

## Ownership and visibility

`src/yjs/retained-nodes.ts` now distinguishes descendants of a deleted node from
genuine unattached records. Every edge in a hidden ownership chain must have a
matching child ID and placement token in the actual parent's child array. The
chain must reach an existing tombstoned ancestor. Unknown parents, missing live
references and malformed placements remain errors. This is a projection read
and makes no repair writes. Lookup results and child-reference sets are shared
within one projection to avoid repeatedly scanning the same hidden subtree.

`src/yjs/retained-adapter.ts` configures Yjs's `deleteFilter` for author undo.
`src/yjs/retained-document.ts` delegates allocation decisions to the node and
text stores.

- Undo of a newly allocated node retains its native map and child array, then
  writes the existing `deleted: true` visibility flag inside that undo
  transaction. Redo reverses the flag and restores the ordinary placement.
- Immutable node and placement identities remain allocated.
- `src/yjs/retained-text.ts` retains a newly allocated text stream and its
  initial ownership/boundary records. Author-created characters still take
  part in ordinary Yjs undo. Concurrent peer characters remain in the same
  native sequence.
- Undo of an ordinary later split still removes its boundary, allowing text to
  rejoin the original partition. There is no blanket protection for all text
  edits or boundaries.

The allocation filters use public type-parent access and relative-position
type IDs. They introduce no new use of `_item` or other private fields. The
adapter takes a shallow snapshot of the public undo/redo stack during a pop.
Yjs removes the current item before filtering and may skip empty items, so the
remaining stack length identifies the current item in that snapshot. The
snapshot is released after the operation. This also replaces the adapter's
earlier dependency on `currStackItem` for selection metadata and redundant undo
handling.

No persisted format version or new record field is required. Native
allocations intentionally survive undo; this repair does not solve long-lived
room storage growth. Existing pool bounds and explicit room compaction still
apply. The temporary history snapshot costs one reference per current history
entry during an undo or redo.

## Evidence

`tests/yjs-retained-deleted-ancestor.test.ts` adds eleven regressions covering
quotes, nested quotes and lists, both delivery orders, both fixed client-ID
precedence orders for explicit deletion, offline Enter and typing, the
deleting author's undo/redo, and the hidden author's independent undo/redo.
It captures and reopens a checkpoint while the branch is hidden, then proves
the reopened client sees the peer text when the branch is revealed. Original
native map and stream objects retain their identity. Three malformed-ownership
cases prove the orphan rejection remains active.

The six focused files passed **384 tests on Yjs 13.6.32** after the allocation
fix. The adapter and new regression files then passed **81 tests** after the
public-API and history-metadata adjustment. TypeScript also passed. A later
independent provider-initialization guard changes lifecycle fixture setup;
final integrated validation and recorded browser journeys are coordinated by
the main change and must be reported separately from these checkpoints.

```powershell
pnpm exec vitest run tests/yjs-retained-adapter.test.ts tests/yjs-retained-document.test.ts tests/yjs-retained-nodes.test.ts tests/yjs-retained-text.test.ts tests/yjs-retained-checkpoint.test.ts tests/yjs-retained-deleted-ancestor.test.ts --maxWorkers=1 --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

## Yjs compatibility evidence

An isolated alias to installed Yjs 13.6.0 ran the same source tests without
changing the repository dependency. Its configuration is
`artifacts/retained-ancestor-min-yjs-20261110.config.mjs`.

The first adapter-only comparison exposed four existing failures from the
adapter's `currStackItem` dependency, which does not exist in that release.
After replacing that dependency, all **81 adapter and new ancestor tests**
passed on both 13.6.0 and 13.6.32.

Broader 13.6.0 diagnostics nevertheless finished with **375 passes and nine
failures**. Three were lifecycle fixtures concurrently affected by the new
provider guard. The remaining differences were:

- Two redo-wrap checkpoint cases require `getItemCleanStart`, which 13.6.0 does
  not export.
- That release lacks `Doc.isDestroyed`, so an asynchronous checkpoint capture
  did not reject destruction during hashing.
- One deterministic text/style sequence applied an unwanted strong mark.
- One text-only remote projection used the full read instead of the required
  fast path.
- The bigint fixture cannot construct its test value because old Yjs rejects
  it earlier; this is a fixture/version difference, not permission to accept
  unsupported data.

The unreleased default-adapter adoption therefore selects **Yjs 13.6.32 as the
tested support floor**. It does not claim 13.6.0 parity or weaken the semantic,
checkpoint, or performance assertions to retain the earlier package range.
The main change updates that range and runs integrated validation on the
selected version.

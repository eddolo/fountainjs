# Retained collaboration compaction boundary

2026-11-06, local diagnostic using the compiled retained adapter after the
[single-pass binding change](YJS_RETAINED_NORMALIZE_PATHS_AUDIT.md).
No production history policy, GC setting, transport or migration API changes.

## Experiment

`artifacts/retained-compaction-diagnostic-20261106.mjs` drives real core editors
and retained adapters in pure Node with two offline authors. One author inserts
128 or 1,024 characters while another inserts a character into the original
text. Synchronization, complete author-only undo and redo retain exact document
JSON, root metadata, an image and application-assigned node IDs.

The script then inspects the private UndoManager for research purposes, clears
the left and right history separately, reopens the encoded state in another
document, and independently seeds the final JSON into a genuinely fresh room.
It verifies that clearing actually removes undo/redo and leaves document values
unchanged. This private inspection is not a supported application API.

| Local edits | After full redo, V1 bytes | Both histories cleared | Wire reopened | Fresh room from final JSON |
| --- | ---: | ---: | ---: | ---: |
| 128 | 17,108 | 17,108 | 13,167 | 3,342 |
| 1,024 | 118,510 | 118,510 | 85,372 | 4,238 |

Clearing both histories does not reduce the live encoded state in these cases.
Reopening wire state permits some GC, but active insertion provenance remains:
132/1,028 text-delta operations still exist after reopening, versus two in the
freshly seeded document. V2 encoding is also recorded in the JSON evidence;
using V2 alone is not treated as compaction or a transport change.

The fresh room preserves exactly the tested portable document values and
application node IDs, with empty history. It creates new room/CRDT identities.
It does not preserve relative anchors, pending offline operations, historical
undo, or arbitrary auxiliary extension maps. Therefore this experiment does not
prove a lossless migration of a complete collaborative application.

An old-room update is deliberately merged into a sacrificial copy of the new
room. The adapter rejects the conflicting room gate, retains its last editor
snapshot and does not touch the authoritative fresh room. The sacrificial Yjs
document has nevertheless received conflicting data; an error is not a network
writer fence. Old updates must never be sent to the new authoritative room.

## Required design before adoption

- The [internal same-room recovery checkpoint](YJS_RETAINED_CHECKPOINT_AUDIT.md)
  now retains source state, version, identity and integrity digests. A migration
  epoch/destination record and authoritative rollback/handoff policy remain.
- Fence old writers at the provider/server boundary before authoritative
  handoff. Presence counts or the client-side format gate are insufficient.
  The [single-authority reference](YJS_RETAINED_ROOM_FENCING_AUDIT.md) now rejects
  stale/frozen writes before reading bytes and verifies exact-revision same-room
  recovery. Distributed/durable enforcement and fresh-room migration remain open.
  The later [SQLite coordinator](YJS_RETAINED_PERSISTENCE_AUDIT.md) persists these
  barriers and uses cross-process CAS on a local file. Multi-host operations and
  fresh-room candidate/anchor/offline migration are still unfinished.
- Translate or preserve every supported auxiliary map and anchor: comments,
  structured attributes, versions and extension-owned state. Report unsupported
  state explicitly. Application node IDs alone do not preserve all anchors.
  The [isolated candidate builder](YJS_RETAINED_MIGRATION_CANDIDATE_AUDIT.md) now
  translates declared relative selections/references and structured maps, refuses
  unclaimed roots and verifies host-provider continuity on the identical model.
  It does not activate a destination or coordinate external/offline state.
- Reconcile pending offline edits, or obtain an explicit policy for their
  disposal; never silently drop them.
- Make history retention/reset a declared host/user policy. Do not periodically
  clear history merely to satisfy a memory or wire-size test.
- Verify crash/retry/rollback during handoff, stale writers, mixed clients,
  schema differences and concurrent checkpoint attempts before exposing a
  migration or compaction command.

The private retained adapter remains experimental and COLLAB-01 stays Partial.
This is boundary evidence for that work, not delivery of online compaction,
bounded storage, history-preserving migration or production adoption.

Reproduce after building the audit runtime:

```powershell
node artifacts/retained-compaction-diagnostic-20261106.mjs cursor-overlay-build-20261106 retained-compaction-diagnostic-20261106 128,1024
```

The result is `artifacts/retained-compaction-diagnostic-20261106.json`.

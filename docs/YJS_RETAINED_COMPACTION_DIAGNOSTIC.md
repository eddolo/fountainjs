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

## Guarded live-checkpoint compaction

The local SQLite handoff reference accepts `minimumBytesSaved` on
`RetainedRoomHandoff.migrate`. Set a positive whole-byte threshold alongside the
existing explicit history and offline policies. The authority builds a candidate
from the exact frozen revision, checks the original and replacement checkpoint
sizes, and installs the smaller room atomically with the source archive only
when it meets the threshold. The threshold is part of the durable receipt and
must match when retrying the same operation ID.

`insufficient-savings` leaves the original room frozen and creates no archive.
The host can abort that exact ticket to resume the same room and writer epoch.
The browser reference does this on a confirmed refusal. A lost acknowledgement
still goes through the original receipt replay path.

The live room starts with fresh CRDT identities and empty author undo. An old
writer's edits can be retained in a separate source branch. The same handoff
supports rolling back to that branch or the frozen source while archiving the
replaced room. The byte threshold covers the live checkpoint. The archives
still consume disk space, and the host still needs an archive retention policy.
COLLAB-01 remains Partial.

### Monitoring live checkpoint headroom

`readLiveCheckpointCapacity(roomKey)` reads the saved epoch, revision, phase,
canonical checkpoint bytes and remaining headroom from SQLite metadata alone.
Use it to flag a room for compaction before approaching the checkpoint limit.
The default limit is 64 MiB. Set `maxLiveCheckpointBytesPerRoom` to a lower
positive byte count on each authority process to enforce an earlier ceiling.
Compression affects stored bytes but does not increase canonical headroom.

A growing write or replacement beyond the ceiling returns
`live-checkpoint-capacity`. The host keeps the pending client draft and can
recheck or increase capacity before retrying. An existing oversized room can
still freeze, reopen, or install a smaller checkpoint. A rollback that would
grow the live checkpoint beyond the cap is refused before the archive changes.
The compaction preflight's `destinationBytes` can be compared with the limit
while the room remains writable. The saved revision can change before freeze,
so the authority checks the limit again at the actual write.

151 focused source tests passed. Recorded Chromium, Firefox and WebKit
journeys refused a live edit at the limit, kept the editor draft visible, and
saved it exactly once after a retry with more capacity. The Chromium refusal
and saved captures were visually inspected.

Review of an overlapping-edit experiment found that replacing a whole paragraph
can re-anchor an offline insertion to its start. The retired branch still
contains the text, but its placement can differ from the writer's local copy.
The guarded compaction journey checks exact recovery for independent edits in
different paragraphs.

For overlapping edits, the same-format SQLite reference now lets the writer
save the original checkpoint separately before attempting a merge. The host
passes a stable draft ID to `saveRetiredDraft`. The authority checks the old
room identity, document checksum and complete update, and keeps the supplied
wire bytes. Retrying the same checkpoint and ID returns the saved copy. A
different checkpoint with the same ID is refused. The copy survives a merge
failure and SQLite reopen. The browser offers a read-only choice between that
draft and the merged retired branch. This gives the author the source needed
for manual reconciliation. Automatic placement for overlapping edits and
archive retention policy remain open.

The SQLite host example can also preview an identifiable plain paragraph from
the saved draft alongside its current version and apply an author-written
replacement. It verifies that the handoff destination is still the active
room and uses the same epoch, revision and compare-and-swap checks as other
room writes. Unsaved editor changes prevent applying from the demo. A newer
server revision requires reviewing again, and refreshing the review keeps any
replacement text the author already entered. The draft remains read only and
available for later comparison. Manual typing handles a single unformatted
text run in each version. For formatted paragraphs, the author can preview and
use the saved text runs and marks in one action. The operation keeps the live
paragraph's attributes, position in the tree and identity, even if the live
paragraph has moved into a quote. The previews keep links visible and disable
navigation. The applied paragraph retains its saved link destinations. The
review now also offers a local Fountain editor seeded from either version so
an author can combine wording and formatting. The authority accepts one
paragraph of text runs and schema-validated marks and refuses embedded nodes
and invalid links. A stale review keeps the composition while reloading the
current and archived previews. Host authorization governs who can preview and
apply.

The placement review can restore a saved paragraph move within the document
or into an existing container. It identifies the target parent and immediate
neighbors by their stable node IDs. Missing or duplicate anchors, changed
anchor order or ambiguous gaps refuse the move. The standard move command
relocates the live paragraph, keeping newer text, formatting and retained
identity, and the authority checks the exact reviewed revision. Restoring
inline widgets, rebuilding a deleted container, reconciling multiple blocks
at once, automatic overlapping placement and archive storage policy remain
open.

Placement recovery passed 201 focused source tests and the 24-journey desktop
handoff suite. A focused rerun of the move passed in Chromium, Firefox and
WebKit. The browser verifies that the live update stays bold after moving into
the quote. The source suite also covers a move back to the document root,
stale revisions, missing anchors and native identity on both moves. Captures
and recordings are under `artifacts/retained-placement-review-browser-20261107/`.

Formatted recovery passed 200 focused source cases and 18 recorded browser
journeys across Chromium, Firefox and WebKit. The browser applies bold and
italic with keyboard shortcuts and verifies the formatting on the live
document after recovery. The source suite also checks saved links, live
alignment and retained identity after moving the paragraph into a quote.
Captures and recordings are under
`artifacts/retained-formatted-review-browser-20261107/`.

Combined review passed 200 focused source cases and the 21-journey desktop
browser suite. Chromium, Firefox and WebKit each preserved the local italic
and bold runs after a stale review and applied the edited paragraph after
refreshing. Source tests reject invalid links and embedded nodes without a
room write. Captures and recordings are under
`artifacts/retained-combined-review-browser-20261107/`.

Paragraph review passed 75 focused source cases and the 15-journey desktop
handoff suite. A final focused rerun passed in Chromium, Firefox and WebKit.
The browser records an unsaved-edit refusal, a stale server revision, a fresh
review that preserves the proposed text, and an accepted replacement that
keeps the saved draft available. Captures and recordings are under
`artifacts/retained-reviewed-recovery-final-20261107/`.

The exact-draft change passed 74 focused source tests and 15 recorded desktop
browser journeys, including an injected merge failure in each browser. The
SQLite test reopens the original bytes from a new connection and uses a writer
admitted with a different local Yjs GUID. Browser recordings and captures are
under `artifacts/retained-exact-offline-draft-final-20261107/`.

Verification on 2026-11-07 passed 103 focused source cases and 12 recorded
Chromium, Firefox and WebKit journeys. In the Firefox capture, 25 native
paragraph replacements increased the retained history before compaction took
the live checkpoint from 11,647 to 8,257 bytes. The demo shows the original
room still active after a refusal, the smaller room after an accepted switch,
and the offline draft intact in the retired branch. It also checks that new
edits in the smaller room can be undone. Recordings and screenshots are under
`artifacts/retained-guarded-compaction-verified-20261107/`.

Reproduce after building the audit runtime:

```powershell
node artifacts/retained-compaction-diagnostic-20261106.mjs cursor-overlay-build-20261106 retained-compaction-diagnostic-20261106 128,1024
```

The result is `artifacts/retained-compaction-diagnostic-20261106.json`.

## Cold SQLite archive storage

The Node 24 SQLite reference stores a gzip copy of an archived checkpoint when
the update is at least 1 KiB and compression saves bytes. This applies to
frozen sources, destinations, updated retired branches, and exact saved drafts.
Live rooms and original cross-format edit batches use raw storage by default.
The reader accepts existing
raw rows and bounds decompression by the original manifest length and the
checkpoint size limit.
The handoff verifies the same original checkpoint digest after decoding.

A local probe replaced the first paragraph repeatedly, then restored its
original text before compaction. It inspected SQLite BLOB lengths and reopened
the archive, comparing the recovered checkpoint bytes with the original.

| Replacements | Raw source | Stored source | Raw destination | Stored destination |
| ---: | ---: | ---: | ---: | ---: |
| 128 | 53,087 B | 8,035 B | 3,923 B | 878 B |
| 512 | 204,546 B | 29,184 B | 3,919 B | 880 B |

These are checkpoint payload sizes. SQLite pages, indexes, and WAL files use
additional space. New and older raw rows can coexist. Upgrade all processes
sharing the reference database before enabling archive writes from the updated
repository. Older versions cannot open compressed rows. Hosts still need
retention and backup policies for recovery archives.

Verification covered 120 focused source tests, 16 compiled Node handoff
checks, and 36 recorded Chromium, Firefox, and WebKit handoff journeys.
The browser review included the smaller live room, the read-only recovery
copy, and cross-format rollback preserving the edits from both rooms.

### Measuring room storage

The SQLite reference's `readStorageUsage(roomKey)` returns the saved revision
and the stored bytes for the live checkpoint, recovery archives (including
retired branches), exact offline drafts, and original cross-format edit batches.
A single SQL statement measures the BLOB lengths without restoring or
decompressing checkpoints. A missing live room returns no report. The
loopback demo scopes the read to its existing session.

Open **Room storage** in the handoff demo and select **Check stored bytes**.
In the Firefox compaction and recovery run, the saved live checkpoint used
8,367 bytes. One recovery archive and one saved draft used another 10,592 bytes,
for 18,959 stored payload bytes. This separates the live compaction result from
the storage kept for recovery. The report excludes SQLite file overhead and
does not apply a retention policy.

### Limiting recovery writes per room

Set `maxRecoveryBytesPerRoom` in the SQLite repository options to cap the
combined stored payload size of a room's handoff checkpoints, retired branches,
saved drafts and original cross-format batches. Use the same limit on every
process that writes recovery records to the database. The option accepts a
non-negative byte count and is off by default.

The repository checks the projected size inside the write transaction. A change
that would exceed the limit returns `recovery-capacity` and rolls back the whole
operation, including any attempted live-room switch. Existing data and exact
saved replays remain readable. If an administrator already froze the room, the
freeze remains in effect. The host can retry with available capacity or abort
the freeze. For a refused offline save, the host should keep the unsent draft
available until it can be stored.

The limit counts stored BLOB payloads. Live checkpoints, SQLite file and WAL
overhead, and deletion or archival policies remain separate host concerns.

148 focused checks passed, including competing saves from two SQLite
connections at the exact limit. Three recorded Chromium, Firefox and WebKit
journeys verified a refused offline save and its later retry. The Firefox
captures show the draft in the offline editor before the retry and in the
retired archive afterward, with the active document intact.

### Compressing archived offline operations

Set `compressRecoveryBatches: true` on the SQLite writer to compress original
cross-format edit batches when it saves space. The database records the original
byte length and decompresses within that bound. Exact recovery and retry checks
still use the original bytes and SHA-256. Storage reporting and the per-room
recovery cap count the compressed BLOB.

Opening an existing database adds a nullable metadata column. Old raw rows
stay readable alongside compressed rows. Updated readers can read either kind
even with the write option off. Upgrade all readers before enabling compressed
writes, because older binaries expect raw BLOBs.

152 focused source checks passed, including a previous-schema reopen, mixed
raw and compressed rows, exact retry, and a rejected decompression bound.
In three recorded Chromium, Firefox and WebKit journeys, a 7,718-byte update
with repeated text used 702–703 stored bytes. The archive returned all original
bytes and the active room kept its original content. The Chromium capture
was visually checked. Compression ratios depend on the update contents.

### Smaller private identities

New retained node, text and placement identities use a base-36 representation
of the complete controller UUID and a base-36 counter. Previously stored IDs,
room gate IDs, application node IDs and wire format versions keep their
existing meanings. Fresh migration candidates use the same allocator.

The compiled Node comparison used the same Yjs client ID, controller UUID
and document fixture in both builds. It measured the canonical V1 update
without archive compression.

| Workload | Previous | Compact |
| --- | ---: | ---: |
| Fresh document with 240 paragraphs | 426,112 B | 361,948 B |
| Growth from 128 moves in a six-paragraph document | 63,800 B | 51,832 B |

Both builds kept the same number of private identities and the same portable
document. Mixed-version pairs started from each build, moved a paragraph while
the other author typed offline, exchanged updates, independently undid and
redid the edits, and reopened the resulting checkpoint in the other build.
The comparison passed in ESM and CommonJS. All 390 focused source tests and
nine recorded Chromium, Firefox and WebKit handoff journeys passed. The
declaration snapshot changes reflect two private adapter fields.
These measurements concern structural metadata. Per-keystroke text provenance
and the need for a long-session compaction policy remain.

### Why styled insertions keep their explicit marks

An experiment removed the explicit mark fields from new insertions and kept
only the insertion marker's reference to the original style. The previous 332
focused tests passed. A differential matrix of 2,160 pairs of offline insert
and format operations then found 270 cases where the projected styles differed.
For example, removing bold from the first character could also strip bold from
an offline insertion immediately after it. The existing explicit mark shields
that insertion in both delivery orders. The regression test fails on the
smaller encoding and passes on the retained encoding.

The retained encoding passed 334 focused source checks and six recorded
Chromium, Firefox and WebKit workflows covering offline bold, native
replacement and deletion, and author-local undo. The Chromium merge was
visually checked.

The trial used 47,567 V1 bytes instead of 85,374 for 512 insertions that
alternated between plain text and a long link style. It saved no bytes for
plain typing and 138 bytes for 1,024 insertions in a single link style. This
records a rejected optimization. The existing live wire is still in use.

Another probe kept the existing marks and compared gzip level 1 on the same
V1 state and on a Yjs V2 transcode. The 512-insertion samples used 9,082 versus
1,919 stored bytes for plain text, 12,091 versus 2,511 for alternating bold,
and 12,767 versus 2,891 for alternating links. Each sample converted back to
the exact original V1 bytes. These are controlled storage measurements. A
production codec would still need bounded decoding and exact-byte verification
before it could preserve the current checkpoint contract.

### Optional compression for live checkpoints

The SQLite reference can store live checkpoints with the same bounded gzip
codec. Enable it with
`new SQLiteRetainedRoomRepository(path, Date.now, { compressLiveCheckpoints: true })`.
It attempts compression for checkpoints of at least 4 KiB and keeps the raw
bytes if compression gives no saving. Updated readers accept both forms and
restore the canonical update before the authority validates or serves it.
Upgrade every reader before enabling compressed writes on a shared database.

The loopback handoff demo enables compression and shows both the canonical
checkpoint size and the stored size. Compaction thresholds still compare
canonical bytes. The Firefox workflow reported 7,340 canonical bytes and
1,658 stored live bytes after switching rooms. A Node probe saved the same
typed checkpoints through two SQLite authorities and verified that their
reopened update bytes and document models matched.

| Single-character edits | Raw live checkpoint | Stored compressed |
| ---: | ---: | ---: |
| 128 | 8,716 B | 2,874 B |
| 256 | 15,756 B | 4,943 B |
| 512 | 30,235 B | 9,112 B |

This measures the stored checkpoint payload. Shared Yjs history still grows
and keeps the same wire format. Compression adds synchronous codec work to
checkpoint reads and writes. The probe does not establish a large-room latency
budget or total database disk savings.

The source checks cover 156 cases, including exact reads across independent
connections and a return to raw storage on the next write. The 36 recorded
Chromium, Firefox and WebKit journeys cover retained and cross-format
migration, rollback, and offline draft recovery with compression enabled.

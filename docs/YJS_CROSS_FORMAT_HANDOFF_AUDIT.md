# Cross-format collaboration handoff audit

Namespace follow-up (2026-11-07): [explicit destination mapping](YJS_NAMESPACE_MIGRATION_AUDIT.md)
adds differently named source/destination rooms, binds replay and rollback to the
mapping, and retains older same-name archives. The compatible-name scope below
describes the earlier checkpoint; nested fragments and safe adoption remain open.

Date: 2026-11-07. Local, private implementation; no public adapter switch or
publication. This follows the [legacy conversion](YJS_LEGACY_MIGRATION_AUDIT.md)
and [retained handoff](YJS_RETAINED_HANDOFF_AUDIT.md) audits.

Compatible named legacy XML rooms can now move to the retained representation
through one persistent authority. Installation archives the frozen source and
initial destination in the same SQLite transaction that changes the live row.
Rollback archives accepted replacement-room edits before restoring the explicitly
selected frozen original or pending source branch. This does not repair the six
known default-adapter concurrency failures or automatically merge document edits
between the two protocols.

## Implementation and ownership

| File | Responsibility and imports |
| --- | --- |
| `src/yjs/document-room.ts` | Platform-neutral authority over legacy/retained checkpoint unions. Imports Yjs, schema types, the legacy checkpoint decoder, retained checkpoint/update validation and shared coordinator metadata validation. Owns epoch/protocol checks, isolated update validation, generation CAS, freeze, explicit recovery and abort. |
| `src/yjs/cross-format-handoff.ts` | Administrative migration/rollback and late-update recovery. Imports the document authority helpers, legacy candidate builder, retained policy/options snapshots and checkpoint digest helper. Requires a repository capable of atomic live/archive and branch/raw-batch commits. |
| `src/yjs/retained-room-coordinator.ts` | Shares the existing coordination metadata invariants; its retained-only entry still rejects legacy checkpoint records. |
| `src/yjs/retained-handoff.ts` | Exposes the existing policy snapshot internally for reuse; policy behavior is unchanged. |
| `examples/backends/retained-sqlite.ts` | Node 24+ `node:sqlite` reference. Both protocols use the existing live-room table. Separate cross-format archives and raw-batch tables retain recovery evidence. Ordinary CAS cannot change protocol. |

The actual native XML root identity, not the document GUID, identifies a legacy
room. Retained rooms use their native room ID. A schema-valid foreign update or
XML-root replacement is rejected in isolation. Room namespace and lineage must
match; epochs and generations additionally fence writes validated before freeze,
abort/refreeze, protocol replacement and rollback. Wrong epoch/protocol and frozen
writers are rejected before their update byte getter is read.

All writers must pass the authority. A provider that writes directly to shared
Yjs state bypasses these guarantees. Protocol labels, operation UUIDs and host
receipts are not authorization. The host must authorize administrative actions
and actually coordinate external systems. The required history policy explicitly
resets local history while archiving source state; UndoManager stacks and
awareness are not serialized.

## Durable recovery behavior

### Retrying a save before migration

If the server saved a legacy edit but the writer lost the reply, retrying the
same update returns the saved revision when the verified native checkpoint is
unchanged. This preserves an existing migration rehearsal for that exact
revision. The acknowledgement still checks the row generation. If another
connection freezes or changes the room while the retry is being verified,
the writer receives a revision conflict and keeps its local edits.

The browser journey drops a successful legacy save response, retries the save
and upgrades to retained storage. It checks that only the original save and
the migration advance the revision. The new live editor, the server checkpoint
and the retired legacy archive all contain the same edited document.
The six focused source suites passed 196 tests, and 12 recorded handoff
journeys passed across Chromium, Firefox and WebKit. The Chromium capture was
visually checked. The public build's 180 runtime and CSS files match the
previous build byte for byte.

### Migration receipts and offline recovery

Stable operation UUIDs make acknowledgement retry idempotent. A historical
receipt returns current state and cannot reinstall a superseded destination.
Old retained-only and cross-format operations share an operation-ID collision
guard. A rollback pins both the live generation and selected archive generation,
so a concurrently changed pending branch requires a deliberate retry.

Late updates are decoded with their retired source protocol and applied only to
that source branch. They never silently enter the new live room. The exact
accepted update bytes and SHA-256 are inserted in the same transaction as branch
replacement. A failed insert rolls both back. Raw recovery verifies the checksum
and returns owned bytes; it remains possible when the merged branch wire is
corrupt, provided archive metadata and the raw record remain valid.

An exact retry looks up the saved batch within the same archive. The authority
checks the writer epoch, revision, checksum and bytes before acknowledging it.
A second writer can race the same batch and receive the already committed
archive state. Distinct bytes still require a successful branch comparison.
The SQLite digest index is additive. Older archives with duplicate receipts
keep their original revision numbers and raw records.

The namespace demo saves the exact outgoing offline batch in IndexedDB
before sending it. If the acknowledgement is lost, a reload can retry those
same bytes. Newer edits remain in the offline editor and are archived by the
next explicit save. The active room keeps its own document.

This follow-up passed 143 focused source tests and 12 recorded journeys in
Chromium, Firefox and WebKit. The lost-reply journey distinguishes the
initial migration archive entry, the retried offline batch and the later
draft, which is only added after its own save.

Keeping original bytes matters: the known legacy concurrency bugs can hide an
offline edit in the merged projection. A raw archive preserves accepted
operations for explicit recovery; it is not a semantic conflict-resolution fix.
Updates rejected as invalid or belonging to a different room remain the caller's
responsibility and are not acknowledged as retained.

The browser fixture retains pending active-editor bytes before replacing its
view after an ambiguous migration acknowledgement. Same-epoch/historical replay
merges server wire into the existing view instead of discarding a newer unsaved
draft. This is an in-memory test client, not a crash-persistent client outbox.

## Evidence

### Exact writer drafts after a format switch

`CrossFormatRoomHandoff.saveRetiredDraft` keeps a full writer checkpoint in
SQLite independently of the frozen source, merged retired branch and raw
operation log. It accepts legacy drafts after migration and retained drafts
after rollback. The host supplies the retired archive, writer epoch and a
stable draft ID. The authority verifies the original namespace, protocol and
native room identity, including the root of an embedded legacy document. A
retry with the same ID and checkpoint returns the saved copy. A changed
checkpoint needs a new ID. These copies count toward the room's recovery cap.

The loopback demo can save an offline writer's exact draft and open it in the
read-only archive pane. It also saves a changed outgoing editor before
replacing its view. If that save is interrupted, the source editor stays
mounted, and retry uses the locally saved draft ID. The new active room and
the retired branch keep their own documents and revisions. SQLite tests
reproduce a legacy branch merge that hides the offline text and verify that
the independent copy still opens with that text intact.

All 178 focused tests and 12 recorded Chromium, Firefox and WebKit journeys
passed. The recorded cases include a lost save reply followed by a reload,
newer unsaved typing, and recovery of an outgoing editor after migration or
rollback. Visual review confirmed the saved draft, newer offline text, and
active document in their separate panes.

The demo uses the existing same-tab IndexedDB session and loopback authority.
The host still owns authentication, cross-device draft discovery and storage
retention.

### Review a legacy paragraph after migration

The text recovery reference can compare a paragraph from an exact legacy
draft with the paragraph carrying the same stable ID in the active retained
room. It verifies the retired writer epoch and that the migration archive
leads to the active room. A manual replacement becomes a new edit in the
current paragraph and keeps its live position, attributes and surrounding
blocks. The active epoch and reviewed revision must still match at write time,
including for a no-op. The exact draft stays independently readable.

In the loopback demo, save the exact offline draft, choose **Review saved
paragraph**, compare the text and apply a combined version. The demo requires
local edits to be saved first and asks for a fresh review if the live revision
changed. The recorded Chromium, Firefox and WebKit journeys verify both
refusals, a successful apply, and the unchanged archived draft. The SQLite
test also verifies that review can apply inside a live quote. This workflow
covers identifiable text-only paragraphs. Other node types and automatic
cross-format reconciliation remain open.

The shared browser CI runs this review alongside two exact-draft reload
journeys for migration and rollback. It retains the traces and videos. npm
release staging requires this same CI on the tagged commit.

### Earlier handoff evidence

- **40 new source cases / 236 focused cases pass.** They cover actual legacy and
  retained clients, both rollback choices, undoing rollback, competing writers,
  operation replay, root identity, corruption, owned asynchronous inputs,
  granular widget state and transactional raw recovery.
- **18 compiled ESM/CommonJS process checks pass**, with five child processes
  per module format and no browser DOM. Termination before transaction commit,
  after migration, after late-batch commit and after rollback exercises reopen
  and durable retry. A competing prevalidated writer cannot overwrite migration.
- **Nine recorded Chromium/Firefox/WebKit journeys pass**, using the compiled
  adapters and a real HTTP/SQLite authority on private port 4195. Keyboard/pointer
  editing covers offline changes, old-writer rejection, accepted retained edits,
  both rollback choices, lost acknowledgement, pending typing before reconnect,
  historical replay with an unsaved draft, image loading and read-only archives.
- Complete source has **4,688 passes / six unchanged failures / no skips** across
  296 discovered files. Types, declaration/public build, API and headless checks
  pass. All 171 public runtime/CSS files remain byte-identical to the baseline.
- The same three raw-size overruns remain: core ESM about 0.1 KiB, aggregate ESM
  76.0 KiB and aggregate CommonJS 59.9 KiB. No acceptance limits change.

The [verification receipt](../artifacts/cross-format-verification-20261107.json)
records source/build hashes, exact ordinary failures, process results, browser
attachments and curated visual artifacts. Visual review covers all nine sampled
filmstrips and selected complete 1440 × 1400 stage screenshots, not full playback,
physical-device or assistive-technology certification. Continuous measurements
check viewport/pane containment. The figures load; math and Lean intentionally
use source presentation. Windows WebKit's outer host font fallback differs.

## Remaining work

Compatible top-level named XML rooms are covered. General fragment namespace and
nested-fragment locator mapping remain open. No automatic external coordination,
cross-format semantic reconciliation, default-adapter adoption or production
deployment is claimed. The six default concurrency failures remain release gaps.

Each wire packet is bounded at 64 MiB, with separate metadata bounds. Total
archive/raw-log growth is not bounded by this reference; pruning, production
compaction, large-room throughput/heap and full release CI remain open. The
SQLite example uses WAL/FULL on a local file and is not a shared-network or
multi-host deployment. Metadata-only ordinary CAS avoids an unnecessary second
full-wire copy, without establishing a per-keystroke performance guarantee.

Reproduction (heavy commands run serially, headless, one browser worker):

```powershell
node artifacts/build-cross-format-20261107.mjs
node artifacts/prepare-cross-format-audit-20261107.mjs
node artifacts/cross-format-process-20261107.mjs es
node artifacts/cross-format-process-20261107.mjs cjs
pnpm exec playwright test --config artifacts/cross-format-browser-20261107.config.ts
node artifacts/curate-cross-format-20261107.mjs
./artifacts/run-cross-format-checks-20261107.ps1
node artifacts/verify-cross-format-20261107.mjs
```

COLLAB-01 remains Partial. This checkpoint is migration/recovery infrastructure,
not completion of the editor parity goal.

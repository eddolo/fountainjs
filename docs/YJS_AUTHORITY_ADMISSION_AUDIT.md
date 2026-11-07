# Authority-bound retained admission — 2026-11-07

The private retained adapter now binds checkpoint admission to the authoritative
room key, active phase, protocol, epoch, revision and native identity before the
provider starts. Reconnect refuses a different epoch even when the native room
identity is unchanged, preserving the pending client document for explicit recovery.

This work also fixes a reconnect history bug: importing a refreshed checkpoint
through the adapter's local origin made remote changes undoable by the author.
Imports now use the existing untracked repair origin. Author undo removes the
local edit while preserving refreshed remote text; redo restores the local edit.
Both checkpoint-only and authority-bound admission have regressions for this.
The public default XML adapter's six concurrency failures remain separate.

## Implementation and imports

- `src/yjs/retained-admission.ts` retains its Yjs/core-schema/checkpoint/wire
  dependencies and adds a type-only import of `DocumentRoomSnapshot`. It owns
  the admission configuration before awaits and checks exact snapshot metadata
  fields before checkpoint byte access. Frozen/foreign/incompatible snapshots,
  malformed epochs and revisions, a pinned epoch change and a cached lower
  admission revision are refused. Staged candidates expose their verified native
  identity for the binding; no alternative text-based identity heuristic is used.
- `src/yjs/retained-adapter.ts` imports the owned configuration and metadata
  reader. Authority admission awaits an explicit host binding callback with an
  immutable lease and the session's abort signal. It checks the visible draft
  again afterwards and installs only against the unchanged staged source.
  Retired callbacks cannot install a document or start a newer session's provider.
  The accepted lease stays pinned across disconnect/reconnect; adopting another
  epoch requires an explicit fresh adapter/session. Checkpoint imports use the
  repair origin in both admission modes, preserving existing author history.
- `src/yjs/document-room.ts` adds `DocumentRoomAdmission` and a read-only
  `CoordinatedDocumentRoom.admit()` method using the existing checkpoint validators.
  It owns request metadata before repository awaits, checks key/epoch/protocol/
  phase/namespace and minimum known revision, validates native identity, then
  checks the persisted generation again after asynchronous checkpoint validation.
  It does not create/unfreeze/rotate a room or modify its generation, revision or
  wire state. The generic server boundary supports legacy and retained protocols;
  the retained client still refuses legacy snapshots rather than auto-migrating.

The private host contract is:

```ts
admission: {
  schemaVersion: 'my-schema-1',
  authority: {
    key: 'project:paper',
    bind: async (lease, signal) => {
      await transport.checkAdmission(lease, signal)
      transport.bindSession(lease)
    },
  },
  load: signal => transport.loadRoomSnapshot(signal),
}
```

The host's endpoint authorizes access and calls `room.admit(lease)`; its transport
routes every subsequent write through the existing epoch/phase fence. A successful
read-only admission is a point-in-time check, not a reservation that prevents a
later freeze. The returned snapshot can be newer than the initial load: a real
provider must validate/apply that catch-up state before reporting initial sync
complete. The HTTP reference does this with the same isolated preparation and
an untracked origin, holding document/lease/signal references for that session.
Epoch values are consistency metadata, not credentials or permissions.

## Evidence

All 29 new source cases and 189 focused cases pass. The initial twenty-two cases
run against source archived from `d4568dcb`: all twenty-two fail there. A separate
negative control copies the current source and changes only checkpoint installation
from the repair origin back to the local origin: both reconnect undo cases fail.
The other twenty-seven cases are intentionally unselected in that control. A
verifier checks the archived source blobs and the complete control-source copy.

Twelve compiled ESM/CommonJS Node checks use actual SQLite connections without
`document` or `window`. They cover immutable binding, remote-refresh undo/redo,
frozen metadata before byte access, freeze between load and binding, actual
epoch rotation with unchanged native identity, read-only admission and stale
requests. Source cases additionally cover owned async options, typing/cancellation
during binding, lower cached revisions, request ownership and a generation change
during validation. Legacy server admission preserves both default and Unicode
top-level fragment names and exact checkpoint bytes.

Fifteen recorded Chromium/Firefox/WebKit journeys use the compiled HTTP/SQLite
authority and actual editors. They exercise initial freeze refusal/unfreeze;
freeze between loading and binding; stale writer rejection after an actual
freeze/prepare/commit epoch rotation; explicit new-session choice while retaining
the old draft; remote-refresh author undo/redo and combined save; and newer
binding acknowledgements caught up before the provider reports connected. The
last case also proves initial catch-up creates no author undo entry.

Two initial browser failures were completion-observation errors: a new join was
clicked before asynchronous session replacement finished, and a peer model was
checked while its refresh was still validating. Saved failure snapshots show
the pending join or eventual converged models. The journeys now wait for the
actual completion states; their content and retention assertions remain intact.
The original report and two captures are retained separately from the final run.
Visual review also found that the fixture's zero capture timeout grouped Undo
per character, letting a substring assertion accept a partial local-word removal.
The final fixture uses a normal 500 ms typing group and requires exact equality
with the saved remote-only document after Undo; Redo and combined save still
require both complete author bursts. The final recordings use this stronger check.

Visual review covers final contact sheets for all fifteen journeys, sampled
epoch/history filmstrips and selected full stage captures. It checks frozen and
stale-session messages, retained draft visibility, exact surviving text, figures,
reader output and containment. Math intentionally uses source presentation.
This is sampled video/frame review, not full playback, physical mobile/IME or
assistive-technology certification.

Exact full-suite results, open failures, public byte invariants and artifact hashes
are in the [verification receipt](../artifacts/yjs-authority-admission-verification-20261107.json).
Complete source has 4,802 passes and the same six failures across 301 files,
without skips. Types/build/API/headless pass. All 173 public runtime/CSS files
are byte-identical. The same raw-size overruns remain: core ESM 0.1 KiB,
aggregate ESM 77.4 KiB and aggregate CommonJS 61.1 KiB; limits are unchanged.

## Remaining work

The transport is a loopback HTTP reference with explicit save/refresh, not a
deployed WebSocket service. Authorization, consistent first-room provisioning,
live transport operations, durable pending-draft persistence/reconciliation,
multi-host admission and production archive/history/compaction costs remain
host integration or adoption work. The demo's previous-session draft copy is
in memory; it is not a durable draft archive or automatic cross-epoch merge.
Nested fragment locators and safe public replacement adoption remain open.

No public adapter switch, package export, acceptance-limit change, publication
or COLLAB-01 promotion occurs. The six default failures, three existing size
overruns, complete fresh release CI and overall parity remain unfinished.

Reproduction (serial heavy work, one headless browser worker):

```powershell
./artifacts/run-yjs-authority-admission-browser-20261107.ps1
./artifacts/run-yjs-authority-admission-checks-20261107.ps1
node artifacts/verify-yjs-authority-admission-20261107.mjs
```

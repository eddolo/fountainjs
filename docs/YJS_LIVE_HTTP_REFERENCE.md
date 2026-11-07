# Live HTTP reference for retained collaboration

The [host provider](../examples/backends/retained-http-provider.ts) connects after
the existing authority admission and binding steps. It sends native Yjs deltas
relative to the last accepted server state vector, with one request at a time.
An edit made during a request stays pending for the next exchange. Incoming
checkpoints pass through the retained adapter's validated merge before the
provider advances the revision. The private `pollRetained` read returns no
checkpoint if the room revision is unchanged. It still checks the active phase,
protocol, epoch, namespace and native identity. Writes use the existing fenced
SQLite authority.

## Idle reads and presence checks

The SQLite host projects the room metadata separately from the checkpoint BLOB.
Unchanged polls and presence checks use that projection. Presence can be read
while the client is behind without loading a document that the presence response
would discard. A changed-document poll still reads and validates the checkpoint.
The final admission generation check also reads metadata alone, so a freeze
committed by a second connection still invalidates a receipt under verification.
Repositories without the optional metadata reader use their existing full read.

A two-connection SQLite test performed 64 unchanged polls and 64 presence
checks from a behind client with zero full checkpoint reads. A changed poll
performed one. Separate checks verified freeze and epoch refusal and a freeze
between full checkpoint validation and the final generation check. The browser
scenario pauses document catch-up in one tab while a live selection arrives,
then releases catch-up and verifies the caret remains on the selected text.
The metadata-read audit passed 106 focused tests and 24 recorded journeys
across Chromium, Firefox and WebKit. Visual review confirmed the selection on
both revisions. The build produced identical bytes in all 180 top-level runtime
and CSS files. The declaration audit records the optional internal header method
and the presence fence in the room-authority declarations.

## Incremental receipts

After initial admission, the [HTTP receipt codec](../examples/backends/retained-http-delta.ts)
can send a smaller Yjs delta with the authoritative manifest. The client uses
its last accepted server checkpoint as the base, separately from its live
document and unsent edits. It reconstructs the exact bytes in an isolated Y.Doc,
checks the length and checksum, and passes the result through the existing
checkpoint and merge validation. A missing or incompatible base requests one
fresh full receipt through the same authority fence. A write still needs an
acknowledgement at a newer revision. Empty replies leave the edit recoverable
locally. Initial joins, small savings and unsupported bases use full receipts.

In the recorded 49-paragraph fixture, the full checkpoint response body was
160,496–160,624 bytes. Both the write acknowledgement and the peer's read response were
1,699 bytes for the same small edit, about 99% smaller. The numbers measure
uncompressed JSON response bodies for this fixture. The test also corrupts the
base identifier, checks the single full fallback, and verifies the text in the
peer editor and server reader.

The incremental receipt audit passed 21 recorded journeys across Chromium,
Firefox and WebKit, 36 focused codec, presence and authority tests, and type
checks. The browser cases include local recovery after an empty acknowledgement.

An established transport keeps the editor and its native local history mounted
through a transient request failure. On a stale epoch or frozen room the
transport stops. The editor can keep saving a local recovery draft. Switching
editors cancels the old transport, including a request waiting to merge. Retrying
a native update after a lost reply preserves one copy of the edit. The current
server may record an extra revision for the retry.

Each established document request has a five-second default deadline, including
a full-checkpoint fallback. An expired request is aborted and its late reply is
ignored. Transient network errors, deadlines and revision conflicts retry with
jitter and an increasing delay capped at eight seconds. Local typing remains
available without restarting that wait. A verified response resets the backoff.
Initial admission is a separate host operation.

The recorded failure cases hold a write reply after its server commit, type
again while the request waits, and release the stale reply after the retry has
saved both notes. The demo reader shows the last confirmed server snapshot
while a response is pending. A separate case releases two writes together,
observes a real SQLite revision conflict, and verifies each author's text
appears once in both editors and in the saved document.

## Presence

The host [presence reference](../examples/backends/retained-http-presence.ts)
uses the existing retained awareness interface and editor renderer. The authority
issues a separate opaque token for each bound tab. Its presence lease is scoped
to the room key and epoch, and its display id is assigned by the server. Peers
send only ephemeral state. Repeated unchanged heartbeats leave the rendered
overlay alone, and moving a selection does not advance the document revision.

The provider makes at most one presence request at a time, separately from edit
exchange. The reference sends a heartbeat at most once per 350 ms, expires a
silent peer after 2.5 seconds, and attempts an immediate leave when explicitly
disconnected. It drops cached peer cursors when the transport stops. A delayed
leave from a retired epoch cannot clear a new room's presence. The registry is
bounded to 64 presence leases per room and 16,384 UTF-16 code units of JSON per peer
state. An unused lease is reclaimed after two minutes of silence, after which
that tab needs a new admission to publish presence again.

The broader deadline audit also caught a cursor ordering race. When the throttle
window had elapsed but the queued timer had yet to run, either adapter could
send a new selection and then send an older queued one. Publishing now clears
the pending timer. The regression tests reproduce the old order by moving the
clock past the throttle window before running the timer.
The fixed build passed 99 focused tests and all 30 recorded journeys across
Chromium, Firefox and WebKit, with zero retries or skips. Type checks passed.
Build, declaration, headless and packed-package checks passed. The same four
raw-size gates remain over their existing limits.

## Recorded browser proof

```powershell
pnpm exec playwright test --config artifacts/yjs-live-http-20261107.config.ts
```

For the six default-adapter structural cases, the live fixture also has a
separate recovery matrix. It uses the retained adapter and SQLite transport.
An author types inside `Alpha` while offline, waits for the IndexedDB save,
and reloads. Another author wraps the paragraph in a quote or one of three
list kinds, applies a partial bold mark, or splits it with the browser's Enter
key. Resuming the same session sends the preserved edit. The test compares both
editor models and both server readers, including the image and root metadata.
It then exercises structural undo and redo from the other author and checks
that the recovered typing stays in the saved document.

```powershell
pnpm exec playwright test --config artifacts/yjs-live-structural-20261107.config.ts
```

This matrix extends the earlier in-memory and packed-package evidence to actual
transport and reload. All 18 recorded journeys passed across Chromium, Firefox
and WebKit, without retries or skips. The retained adapter passed 46 source
tests. The separately rerun default XML matrix still reports its six structural
failures and 16 passes. Existing rooms still require a safe migration before
using retained collaboration. Review included the recovered screenshots from
all three engines and sampled frames of the paragraph split. Firefox briefly
showed the earlier tab's presence after reload while its old lease expired.
Recordings, traces and images are in `artifacts/yjs-live-structural-browser-20261107/`.

### Live editing after upgrading a saved legacy room

The same six journeys can start from a legacy Yjs document saved to SQLite.
The author clicks **Upgrade saved legacy room**, which archives the frozen
source and installs a retained room through the cross-format handoff. The
browser first rehearses the saved legacy revision and passes that exact epoch
and revision to the freeze request. If the revision advances, the freeze is
refused and the room stays writable. The browser checks that the old epoch
can no longer write before starting either
live session. Both writers then use the existing HTTP provider, IndexedDB
recovery and the same structural editing and author undo/redo checks.

Each journey verifies that the archived source and its initial replacement
have identical model digests, including the figure and document metadata.
After reload and synchronization, both editors and their server readers agree.
The active room keeps the migration destination's epoch and native identity
while its revision advances. The retired legacy branch stays at its original
revision.

```powershell
$env:FOUNTAIN_LIVE_MIGRATED='1'
try { pnpm exec playwright test --config artifacts/yjs-live-structural-20261107.config.ts --workers=1 }
finally { Remove-Item Env:FOUNTAIN_LIVE_MIGRATED }
```

This exercises one explicitly upgraded room with the retained adapter. The
public XML adapter still needs the six concurrency cases resolved for hosts
that continue to use it. The loopback session and operation controls are test
fixtures. The migration history policy starts a fresh author undo stack.

All 18 upgraded-room journeys passed across Chromium, Firefox, and WebKit,
with no skips or retries. Visual review covered the recovered quote, split,
and partial-bold results. Each test attaches the durable migration record
with both formats, the model digests, and the final live revision. Recordings
and screenshots are in `artifacts/yjs-live-migrated-structural-browser-20261107/`.
The rehearsal follow-up reran all 18 journeys and verified that the freeze
request matched the exact saved epoch and revision returned by the check.
Those recordings are in `artifacts/yjs-migration-preflight-live-final-20261107/`.
All six direct-retained Chromium journeys and the type checks also pass.
The rerun against the default XML adapter still reports 16 passes and the same
six concurrency failures.

The reference browser host now releases presence on ordinary navigation or
reload. On `pagehide` it disconnects the current editor and sends the small
leave request with `keepalive`. A page stored in the back/forward cache keeps
its session. If a browser cannot deliver the leave request, the existing
heartbeat expiry still clears the stale cursor. A separate browser journey
checks that the server rejects the old presence token after reload, the
observer clears the old selection, and a fresh join restores the new selection
without writing a document revision. The reload, explicit-leave and expiry
journeys passed in Chromium, Firefox and WebKit, nine passes with no retries
or skips. Recordings, traces and the Firefox before/after/rejoin review are in
`artifacts/yjs-peer-reload-server-verified-20261107/`.
All six Firefox offline structural recovery journeys also passed after the
lifecycle change, including autosave, reload, rejoin and author undo/redo.

The tests open the [two-author browser fixture](../artifacts/yjs-browser-draft-fixture-20261107.html?live)
against a real loopback HTTP and SQLite authority. They cover automatic exchange,
offline typing against a peer's quote wrap, a dropped reply after a committed
write, and a retired writer's saved draft after reload. The presence scenarios
use keyboard selection, explicit leave, interrupted heartbeats and room rotation.
All 15 recorded Chromium, Firefox and WebKit journeys passed with one worker
and zero retries or skips. The presence and authority suites passed 34 focused
tests. Type checks passed.
Visual review initially found a backward caret at the wrong end of the range.
The view now supplies directed anchor and focus positions to collaboration for
its ordinary backward text selections. Editing commands keep their normalized
text selection. The browser scenario reverses the native endpoints with the
same selected text, checks the rendered caret at each edge, and checks the
backward caret again after the other author inserts text ahead of the range.
The direction repair passed all 15 recorded journeys again and 159 focused
selection and collaboration tests. Build, type, API, headless and packed-package
checks passed. The default structural matrix reproduces its six prior failures.
Four raw-size gates remain over budget. The direction repair adds approximately
0.9 KiB aggregate ESM and 0.8 KiB CommonJS to the preceding build.
The preceding transport-only checkpoint passed 78 focused authority,
provisioning and handoff tests, eleven Chromium recovery regressions, and the
build, packed-package smoke and headless checks. Its declaration audit records
the internal polling method in the ESM and CommonJS room-authority declarations.

## Verifying that a write was saved

An advancing revision can belong to another author. Before clearing a pending
write, the client checks that the full or reconstructed server checkpoint
includes the sent Yjs clocks and deletion ranges. This applies to the full
poll fallback after a corrupted delta as well as to ordinary write receipts.
If the checkpoint lacks the edit, the client keeps it queued and retries with
the existing backoff. The checkpoint still passes the existing room identity
and integrity checks before it can update the editor. Checking deletion ranges
can require decoding the full checkpoint on a write acknowledgement.

The recorded browser regression drops Ada's first write, lets Grace advance
the room, then returns a corrupt delta to Ada. It checks that both editors and
the persisted reader eventually show both authors' edits. Inserting text and
deleting a character run as separate journeys. Both regressions reproduce in
Chromium before the fix. The recovery and surrounding transport checks passed
15 recorded journeys across Chromium, Firefox and WebKit. The Chromium editor
and server-reader captures were inspected for both edits.

```powershell
pnpm exec playwright test --config artifacts/yjs-live-http-20261107.config.ts --workers=1 --grep 'corrupt write receipt|delta is corrupted|reply is lost|no acknowledgement' --output artifacts/yjs-write-receipt-recovery-20261107
```

## Deployment boundaries

This reference uses periodic HTTP polling. The server still
validates full checkpoints when it delivers changed document state, and the
client retains an accepted checkpoint and reconstructs full bytes for validation.
The metadata projection avoids materializing the BLOB in Node. SQLite physical
page reads and multi-client CPU and memory at production scale remain unmeasured.
Presence uses a separate SQLite table on the same local database. Bind and
cursor writes check the active room header in the same transaction. An
unchanged cursor can read peers in a read-only transaction until its one-second
renewal is due. Cursor changes, clearing a cursor, and due renewals start a
separate write transaction and check the room and token again. These requests
read room metadata alone and keep the document checkpoint and revision intact.
Separate connections use the same cursor state, limits and expiry rules. A
cursor stops displaying 2.5 seconds after its last persisted heartbeat.
Its token can resume until the two-minute lease expires. Subsequent binds
reclaim expired rows and prior epochs. An explicit leave clears only its token
and epoch.

With eight steady peers exchanging presence every 350 ms for 60 rounds,
SQLite recorded 160 presence row updates across 480 requests. A separate
connection can hold the writer lock while an unchanged heartbeat reads peer
state. The freeze-race test changes the room between read and write and checks
that the pending cursor write is refused. These are controlled local checks.
This change passed 23 focused source tests, the 12 recorded presence journeys
across Chromium, Firefox and WebKit, and the separate-process probe. Updated
captures and recordings are in `artifacts/yjs-sqlite-presence-read-browser-20261107/`.

Shared SQLite presence passed 20 focused source tests and 12 recorded
Chromium, Firefox and WebKit journeys. The browser checks the two connection
routes, native selection, explicit leave, reload, expiry, rotation and a
receiver behind the current revision. The compiled process probe
`node artifacts/yjs-sqlite-presence-process-20261107.mjs` starts separate Node
processes to publish and clear the same cursor without changing the document.
Recordings and the visual review are in
`artifacts/yjs-sqlite-presence-verified-20261107/`.

A real host must authenticate the actor and supply or verify display identity.
This is a single-machine SQLite reference. Multi-host presence, production
heartbeat load, ongoing expired-row cleanup and storage retention policy remain
open.
The loopback session token is test infrastructure. The default Yjs adapter still
has six known structural failures. This reference remains unreleased.

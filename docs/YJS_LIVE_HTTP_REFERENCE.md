# Live HTTP reference for retained collaboration

The [host provider](../examples/backends/retained-http-provider.ts) connects after
the existing authority admission and binding steps. It sends native Yjs deltas
relative to the last accepted server state vector, with one request at a time.
An edit made during a request stays pending for the next exchange. Incoming
checkpoints pass through the retained adapter's validated merge before the
provider advances the revision. The private `pollRetained` read returns no
checkpoint if the room revision is unchanged. It still checks the active phase,
protocol, epoch, namespace and native identity. Changed revisions return a
verified checkpoint. Writes use the existing fenced SQLite authority.

An established transport keeps the editor and its native local history mounted
through a transient request failure. On a stale epoch or frozen room the
transport stops. The editor can keep saving a local recovery draft. Switching
editors cancels the old transport, including a request waiting to merge. Retrying
a native update after a lost reply preserves one copy of the edit. The current
server may record an extra revision for the retry.

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

## Recorded browser proof

```powershell
pnpm exec playwright test --config artifacts/yjs-live-http-20261107.config.ts
```

The tests open the [two-author browser fixture](../artifacts/yjs-browser-draft-fixture-20261107.html?live)
against a real loopback HTTP and SQLite authority. They cover automatic exchange,
offline typing against a peer's quote wrap, a dropped reply after a committed
write, and a retired writer's saved draft after reload. The presence scenarios
use keyboard selection, explicit leave, interrupted heartbeats and room rotation.
All 15 recorded Chromium, Firefox and WebKit journeys passed with one worker
and zero retries or skips. The presence and authority suites passed 34 focused
tests. Type checks passed.
Visual review found an existing direction gap. When the author selects text
backward, the remote highlight covers the right text but the caret is painted
at the end of the range. `src/view/selection-handler.ts` keeps ordinary backward
direction in view-local state and publishes a normalized text `Selection`.
The retained adapter therefore receives ordered endpoints. The presence channel
preserves the selection it receives. Direction needs a separate editor fix.
The preceding transport-only checkpoint passed 78 focused authority,
provisioning and handoff tests, eleven Chromium recovery regressions, and the
build, packed-package smoke and headless checks. Its declaration audit records
the internal polling method in the ESM and CommonJS room-authority declarations.

## Deployment boundaries

This reference uses periodic HTTP polling with fixed delays and sends a full
validated checkpoint for each changed server revision. Polling, checkpoint
validation, full checkpoint responses and SQLite reads have not been load-tested
for large rooms or many editors. Presence is process-local. A real host must
authenticate the actor and supply or verify their display identity. The reference
has no deployed process, deadline for document requests, multi-host presence
distribution, load evidence, or production retention and compaction policy.
The loopback session token is test infrastructure. The default Yjs adapter still has six known structural
failures. This reference adds no public package entry and remains unreleased.

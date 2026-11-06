# Retained room writer fencing — 2026-11-06

This local, private reference establishes a single-authority writer boundary for
the experimental retained adapter. It does not switch the default adapter,
implement fresh-room compaction, or certify an operational collaboration service.
COLLAB-01 remains Partial; its six ordinary default-adapter failures remain open.

## Owning code and imports

- `src/yjs/retained-room-store.ts` imports runtime `yjs`, the `Schema` type from
  `../core/schema`, and capture/restore/types from `./retained-checkpoint`.
- `src/yjs/retained-checkpoint.ts` now also returns its validated, immutable
  manifest from restore. The store uses that owned snapshot instead of rereading
  caller-controlled metadata after asynchronous validation.
- Neither module is exported by `src/yjs/index.ts` or a public package entry.
  The store imports no DOM, view, provider, filesystem or networking API. It uses
  Web Crypto through the checkpoint implementation and UUIDs for epochs/tickets.

## Authority contract

`FencedRetainedRoom.open(checkpoint, schema, schemaVersion)` verifies a checkpoint
in isolation, captures an owned version, and starts a new random writer epoch at
revision zero. `snapshot()` returns a frozen version/phase/checkpoint record;
checkpoint byte access returns copies. No mutable authoritative Y.Doc is exposed.

`write({ epoch, update })` checks authority lifetime, epoch and phase **before
reading the update field**, copying bytes or invoking Yjs decoding. It applies
the owned bytes only to an isolated restored document, checks the retained
projection, wire fidelity and room identity, then commits using a private
generation comparison. A concurrent write, freeze, abort, resume or close makes
an already-running validation ineligible to commit. Accepted writes advance the
revision; rejected writes preserve the authoritative checkpoint.

The reference accepts complete update batches. Yjs updates that leave unresolved
struct or deletion dependencies are rejected with an explicit retry requirement;
they are not silently acknowledged or discarded. Malformed and different-room
updates also leave the authority intact. The provider must retain unacknowledged
edits, retry conflicts, and resend complete shared state when dependencies are
missing. There is no request-ID deduplication protocol; an accepted duplicate
batch can advance the revision without changing document values.

## Freeze and same-room recovery

1. `freeze({ epoch, revision })` compares the exact current revision, prevents
   subsequent writes, and returns an immutable capability tied to this authority.
2. `prepareResume(ticket)` restores and verifies the frozen checkpoint without
   altering it. Concurrent preparations of that same ticket share one capability.
3. `commitResume(ticket, prepared)` synchronously advances revision and writer
   epoch, resumes writes and invalidates both capabilities. The checkpoint and
   internal room identity remain identical.
4. `abort(ticket)` preserves checkpoint, epoch and revision but invalidates work
   started before the freeze, including validations that finish after abort.
5. `close()` rejects new and in-flight work. Reopening the saved checkpoint starts
   another writer epoch; old-epoch requests are refused before their bytes are read.

Tickets are private object-identity capabilities, not network credentials. A host
RPC layer would keep them on the authority and map authenticated administrative
requests onto them; copying a ticket to another authority does not authorize it.

Same-room recovery does not reset CRDT identities. An offline editor's retained
update can therefore be explicitly retried after reconnecting under the new
epoch. Recorded tests verify this for actual editor typing and subsequent undo,
with the image and opaque host binary/review data intact. This is not evidence
that old-room updates can be applied to a freshly seeded room.

## Verification scope

`tests/yjs-retained-room-store.test.ts` adds 26 pure-Node cases: owned snapshots,
accepted edits/auxiliary state, rejection before update access, malformed and
different-room data, unresolved insert/delete dependencies, input ownership,
freeze CAS, asynchronous write invalidation, preparation races, copied/foreign
tickets, concurrent writes with explicit retry, offline edits, close/reopen and
mutable caller metadata. Together with the existing checkpoint suite, the focused
run passes 61 cases.

The complete source run has **4,513 passes and six failures**, no skips, across
291 discovered files. The exact six default-adapter failures match the preceding
checkpoint: offline typing against quote/bullet/ordered/task wrapping, partial
marks and paragraph splitting. They remain ordinary failing assertions.

`tests/manual/retained-room-store-real.spec.ts` runs three recorded real-editor
journeys in each of Chromium, Firefox and WebKit, with one headless worker:

- Type, send, freeze, type while frozen, reject without reading bytes, prepare,
  commit, reject stale epoch, reconnect, resend, and undo/send the offline edit.
- Prepare then abort a freeze and submit the retained edits on the original epoch.
- Reject malformed wire data, then accept subsequent actual typing while both
  editor instances remain mounted and connected.

All nine pass without retries or skips. The fixture imports a compiled four-entry
ES runtime graph, not project TypeScript. Video, trace, result JSON, runtime-module
attachments and stage screenshots are retained. This is a browser-local authority
fixture, not a deployed server or a physical-device test.

Visual review of the initial recordings exposed a weak undo assertion: with
`captureTimeout: 0`, one undo removes one typed character, and merely checking
that the entire pending word was absent accepted a partial undo. The final
journey undoes all seven pending characters and compares the exact pre-freeze
document. No editor-history behavior was changed to make the test pass.
Viewed evidence includes three-engine stale-stage captures and initial nine
sampled recording filmstrips, then the strengthened run's three handoff filmstrips
and exact-undo final screenshots. Pending text remains visible only in the writer
until accepted; final views agree and retain the image. WebKit's Windows host-font
fallback differs from the other engines; editor content remains readable. This
is sampled visual inspection, not complete video playback.

Reproduction:

```powershell
pnpm exec playwright test --config artifacts/retained-room-store-browser-20261106.config.ts
./artifacts/run-retained-room-store-checks-20261106.ps1
```

The latter runs types, the complete source suite, public build/API/headless/size
checks, compiled ES/CommonJS Node probes and visual curation sequentially with
reduced CPU priority. Expected nonzero exit codes do not constitute acceptance:
the receipt must verify the exact six existing default failures and the unchanged
three size overruns. The full source suite and release gates are not green.

Compiled ES and CommonJS Node consumers pass eight checks each (16 total) without
`document`, `window`, jsdom or another fake DOM. The public build, API and headless
boundary checks pass. All 171 public runtime/CSS files match the preceding
baseline byte-for-byte. Size enforcement still reports exactly the existing core
ESM overrun (~0.1 KiB), aggregate ESM (~76 KiB) and aggregate CommonJS (~59.9 KiB);
no budget, public adapter or package version was changed.

## Limits and remaining migration work

This is an in-memory, one-process, one-authority reference. Authentication,
authorization, transport framing, durable storage, distributed compare-and-swap,
cross-process fencing, failover ownership and resource/rate controls remain host
work. An epoch is a consistency version, not a secret or an access permission.
Opening a second authority does not revoke the first one: the host must retire
the previous authority and route all writers exclusively to the current one.
The subsequent [persistent coordinator](YJS_RETAINED_PERSISTENCE_AUDIT.md) adds
local SQLite CAS across processes, persistent barriers and latest-handoff replay.
It does not turn this in-memory class into a distributed authority or implement
multi-host deployment/fresh-room migration.

Staged writes restore/capture/hash full checkpoints. This is intentionally an
explicit batch reference and has not met a production per-keystroke latency or
large-room throughput contract. A provider integration must preserve these checks
while avoiding this cost on the interactive typing path. The 64 MiB encoded-update
bound is not a hostile-input memory or CPU guarantee.

Still required before actual migration/compaction: a durable source/destination
and epoch record, a validated fresh-room candidate, translation/preservation of
all supported auxiliary state and relative anchors, pending offline-edit
reconciliation, explicit history policy, interrupted commit/failover/rollback
tests against persistent storage, and legacy/client-version adoption. The current
reference resumes exactly the frozen room; it offers no method to install an
arbitrary replacement checkpoint or silently drop history.

The [checkpoint audit](YJS_RETAINED_CHECKPOINT_AUDIT.md) and
[compaction diagnostic](YJS_RETAINED_COMPACTION_DIAGNOSTIC.md) remain applicable.

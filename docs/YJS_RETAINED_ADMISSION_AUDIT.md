# Retained-room client admission — 2026-11-07

The private retained adapter can now validate an authoritative existing-room
checkpoint before it starts a live provider. An empty joining client does not
seed its own competing document. This is an opt-in internal adoption boundary;
the public default XML adapter and its six concurrency failures are unchanged.

## Implementation

`src/yjs/retained-admission.ts` imports Yjs, core schema types, the existing
checkpoint wire primitives and capture/validation functions, retained document
projection and wire portability checks. It validates the supplied schema version,
manifest, hashes, namespace, native room identity and complete shared dependencies.
It stages the authoritative update together with any existing client wire state
in an isolated Y.Doc, preserving the client's garbage-collection setting. Same-room
offline operations merge; independent room identities, legacy roots and conflicting
shared-root kinds are refused without changing either original document.

The prepared result exposes an immutable model and a one-use synchronous install.
Install checks the client's exact wire bytes, declared-root inventory, GUID and
GC setting against the staged source. A client changed during asynchronous
validation cannot receive the stale candidate. Unknown auxiliary roots are kept
and checked by the existing full-wire portability contract, not silently removed.

`src/yjs/retained-adapter.ts` imports that preparation function and adds a private
`RetainedYjsCollaborationExtensionOptions.admission` contract:

```ts
admission: {
  schemaVersion: 'my-schema-1',
  load: async signal => fetchAuthorizedRoomCheckpoint(signal)
}
```

The host callback returns a `RetainedCheckpoint`, not a document mutation or
permission to seed. Its schema version and loader are owned before any await.
Without this option, existing isolated local/offline initialization is unchanged.
With it, the order is load → validate/stage → check draft → install → attach the
editor/awareness → connect provider. No provider or presence subscription starts
while checkpoint admission is pending. Undo/redo cannot modify an earlier shared
session during this wait.

The first pending editor model remains the baseline across cancellation, failure
and retry. If the author changes it while waiting, a differing shared model is
refused: the visible draft and original client wire stay intact. Repeating the
join does not quietly redefine that draft as a disposable template. The host can
inspect/export it, reconcile deliberately, or explicitly choose the shared model
before retry. A draft already equal to the merged shared result can join safely.
This is local draft preservation, not automatic merging or durable draft storage.

Disconnect, destruction and adapter replacement abort the loader signal. A late
response or failure from a retired request cannot install a document, revive an
old session or disconnect a newer one. Transport failures after successful
admission retain the validated document and follow the existing cleanup/retry
lifecycle.

## Evidence and scope

All 26 new source cases and 92 focused cases pass. The initial eighteen cases
also run against source archived from `b0af7a48`: two pass and sixteen fail.
The later eight cases cover invalid contracts, owned options, transport failure,
stale installation, conflicting root types and actual legacy source preservation.
All twelve compiled ESM/CommonJS Node checks pass with no `document` or `window`.

Nine recorded Chromium/Firefox/WebKit journeys use actual editors, loopback HTTP
and the compiled Node/SQLite authority. They show two delayed empty clients
joining one authoritative room, editing and saving without duplicate seeds;
pending draft refusal and explicit selection of the shared document; and
cancellation, a late response and explicit reconnect. Saved content is rendered
through a separate read-only editor, not inferred from status labels. Images
load; math intentionally uses source presentation in this admission fixture.

Visual review covers final-state contact sheets for all nine journeys, six
sampled join/draft filmstrips, and selected full 1440 × 1200 captures of a draft
refusal, saved edits and cancellation. Continuous layout sampling checks pane
width and horizontal containment. The recordings include intentional editor
teardown after the final captures. This is not full playback, physical-device
input or assistive-technology certification.

The complete suite, exact open failures, public byte invariants and artifact
hashes are recorded in the [verification receipt](../artifacts/yjs-admission-verification-20261107.json).
Complete source has 4,773 passes and the same six failures across 300 files,
without skips. Types/build/API/headless pass. All 173 public runtime/CSS files
remain byte-identical. The same raw-size overruns remain: core ESM 0.1 KiB,
aggregate ESM 77.4 KiB and aggregate CommonJS 61.1 KiB; limits are unchanged.

## Remaining adoption work

The host must provision a room once through a consistent authority and authorize
the snapshot request. Its provider must have automatic connection disabled until
the adapter starts it. The callback must return an already initialized room;
there is no fallback to local seeding on rejection or an absent room. This batch
does not implement distributed first-writer election or silently pick between
independent offline seeds. Existing independent-seed diagnostics still refuse
conflicting roots and preserve both sources.

Snapshot epoch/revision admission to an actual live transport, frozen-room access,
reconnect after an authority epoch change, pending-draft persistence/reconciliation,
production storage/history growth and compaction, nested fragment locators and
safe public replacement adoption remain unfinished. The example uses explicit
HTTP save/refresh; it does not certify a WebSocket deployment. No default switch,
package export, acceptance-limit change, publication or COLLAB-01 promotion occurs.

Reproduction (serial heavy work, one headless browser worker):

```powershell
pnpm exec vitest run tests/yjs-retained-admission.test.ts tests/yjs-retained-adapter.test.ts tests/yjs-history-policy.test.ts --maxWorkers=1
pnpm exec playwright test --config artifacts/yjs-admission-browser-20261107.config.ts
./artifacts/run-yjs-admission-checks-20261107.ps1
./artifacts/run-yjs-admission-baseline-20261107.ps1
node artifacts/verify-yjs-admission-20261107.mjs
```

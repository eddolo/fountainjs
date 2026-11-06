# Persistent fresh-room handoff and rollback — 2026-11-06

This private backend reference extends the [verified migration candidate](YJS_RETAINED_MIGRATION_CANDIDATE_AUDIT.md)
with an actual atomic destination installation. It retains the source and late
old-room edits, and can roll back while archiving accepted destination edits.
It is local and experimental. COLLAB-01 stays Partial: the public/default
adapter still has six failing concurrent-edit counterexamples.

The subsequent [legacy conversion audit](YJS_LEGACY_MIGRATION_AUDIT.md) adds
old-format recovery and verified conversion candidates. This handoff still
requires retained source records; it is not yet a cross-format installation API.

## Boundaries and code

`src/yjs/retained-handoff.ts` imports schema types, retained checkpoint types,
candidate construction/options, persistent coordinator record validation and
repository types, and isolated room update/checkpoint validation. It imports no
DOM, view, filesystem, SQLite or HTTP module. No public entry exports it.

`RetainedRoomHandoff` requires an exact, unprepared freeze ticket and a stable
operation UUID. Candidate construction remains server-owned: callers cannot
submit an unchecked destination checkpoint for installation. Migration options,
root declarations, ticket fields and host policy are owned before the first
storage await. Unclaimed auxiliary roots and failed semantic verifiers still
refuse migration without replacing the frozen source.

The host explicitly selects `reset-with-source-archive` history and
`retain-retired-room-branches` offline policy, and supplies a coordination receipt.
That receipt is a host assertion, **not authentication, proof of user consent,
or proof that external systems actually coordinated**. Administrative access,
external comments/assets/providers, client acknowledgement/reconnection and
informed history reset remain application responsibilities.

`examples/backends/retained-sqlite.ts` imports Node's `DatabaseSync`, coordinator
and handoff types, and checkpoint manifest types. The existing live table stays
compatible; an additive strict archive table records immutable source and
initial destination checkpoints. Its separately mutable late-update branch
initially aliases the stored source bytes, then gets its own bytes on first write.
The example requires local Node 24+ SQLite storage; it is not a multi-host or
shared-network-filesystem implementation.

## What commits together

The extended repository's `installWithArchive` must atomically compare the live
generation, replace the live record and insert its recovery archive. The SQLite
example uses one `BEGIN IMMEDIATE` transaction, parameterized writes and full
synchronous WAL commits. An archive insertion error rolls back the preceding
live update. A failed generation comparison installs neither half.

The live record gets a new writer epoch and incremented revision. The recovery
archive keeps the exact frozen source, complete initial destination, operation
identity, host policy and migration report. The report describes candidate
construction; its `activation: not-implemented` field is not a live-room status.
The handoff result and authoritative snapshot describe the actual installation.

An operation retry reads its durable archive instead of rerunning the switch.
Later accepted edits remain current. A historical receipt returns `current:
false` if its destination epoch has been superseded; it cannot reactivate that
destination. A thrown error or lost response after commit is ambiguous until
the same operation UUID is retried.

## Offline edits and rollback

Normal writes still reject stale epochs before accessing update bytes.
`retainLateUpdate` instead validates a batch in the archived source's CRDT room
and commits it into that archive's branch with a separate generation CAS.
It never applies those operations to the fresh room. Invalid, foreign-room or
dependency-incomplete batches are refused, and a branch race requires explicit
retry. Source and initial destination archives remain unchanged.

Rollback offers two explicit choices: the frozen original or the retained
old-room branch. The selected archive must belong to the current room lineage.
The archive generation is pinned in the same installation transaction, so late
branch changes after validation prevent a stale rollback. Before replacing the
current room, the transaction archives its complete accepted checkpoint too.
Both prior writer epochs remain fenced; even restoration of an old CRDT room
uses a new writer epoch.

This makes old and new changes recoverable; it does **not** semantically merge
conflicting edits across distinct CRDT rooms. Late arrivals after rollback still
need host reconciliation. Local `UndoManager` stacks, awareness, provider
queues, external assets and application databases are not serialized by these
checkpoints. Archive retention/pruning and large-room resource policy are open.

## Verification

The source tests in `tests/yjs-retained-handoff.test.ts` use actual retained
editors, checkpoint codecs, independent SQLite connections and real SQL
transactions. They cover original/destination ownership, freeze/policy guards,
unknown data refusal, archive insertion failure after the live update, competing
installations, late-branch CAS/retry, both rollback choices, a branch change
during rollback, stored corruption and durable/historical operation replay.

All **31 new cases / 148 focused cases pass**. The complete source suite has
**4,600 passes and six unchanged failures**, no skips, across 294 discovered
test files. Type checking, the public build, API snapshot and headless import
gates pass. All **171 public runtime/CSS files remain byte-identical** to the
prior baseline. The same three size overruns remain: core ESM about 0.1 KiB,
aggregate ESM 76.0 KiB and aggregate CommonJS 59.9 KiB. No limits change.

The compiled process harness runs both ESM and CommonJS without `window`,
`document` or a fake DOM. It terminates workers after migration/rollback commits,
reopens SQLite and retries lost acknowledgements. Another writer process holds
an already validated old generation through migration and then fails its CAS.
A separate storage oracle kills an uncommitted SQL live-row update before any
archive insert; this proves SQLite rollback, not deterministic interruption at a
particular production JavaScript instruction.

All **16 compiled process checks** pass (eight each for ESM and CommonJS), using
four child processes per format.

The recorded browser fixture uses the actual compiled Node/SQLite authority over
a test-only loopback HTTP transport. Chromium, Firefox and WebKit exercise:

1. Offline OLD edits, fresh-room installation, stale-writer refusal, separate old
   branch retention, accepted NEW edits, rollback to OLD with NEW archived, and a
   superseded receipt. The archive reader also rejects real attempted typing.
2. Explicit rollback to the frozen original while keeping both branch histories
   recoverable.
3. A deliberately destroyed HTTP response after a committed migration, receipt
   replay without a second installation, and subsequent real typing/save.

The transport has fixed actions, same-origin loopback checks, ephemeral test
sessions and request bounds. It is not a deployable security/authentication
example. Recorded editor interactions use pointer/keyboard controls; model reads
and server snapshots verify the resulting content independently.

Screenshots use complete 1440 × 1400 fixed-viewport captures, with no scrolling
or full-page resize. Per-frame measurements enforce pane width and horizontal
containment. Visual review samples screenshots and recording filmstrips; it is
not full video playback, physical-device or assistive-technology certification.
Host font fallback differs in Windows WebKit. Archive readers correctly hide
editing-only caption controls. Math and Lean here use source presentation; this
audit does not claim new KaTeX rendering or live Lean-provider certification.

Reproduction:

```powershell
node artifacts/build-retained-handoff-20261106.mjs
node artifacts/retained-handoff-process-20261106.mjs es
node artifacts/retained-handoff-process-20261106.mjs cjs
pnpm exec playwright test --config artifacts/retained-handoff-browser-20261106.config.ts
node artifacts/curate-retained-handoff-20261106.mjs
./artifacts/run-retained-handoff-checks-20261106.ps1
node artifacts/verify-retained-handoff-20261106.mjs
```

The evidence receipt records the exact test totals, unchanged default failures,
package checks, compiled source hashes and reviewed visual artifacts. Public
adapter adoption, semantic offline reconciliation, legacy conversion, production
compaction/storage costs, three size overruns and complete fresh release CI
remain open. No publication or overall parity claim is made.

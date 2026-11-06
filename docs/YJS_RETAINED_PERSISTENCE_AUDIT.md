# Persistent retained-room coordination — 2026-11-06

This local, private work extends the [in-memory fencing reference](YJS_RETAINED_ROOM_FENCING_AUDIT.md)
with persistent compare-and-swap and a Node/SQLite implementation. It remains
reference backend work for the experimental retained adapter. COLLAB-01 stays
Partial; no public adapter switch, backend deployment or package publication.

## Boundaries and imports

- `src/yjs/retained-room-coordinator.ts` imports only the `Schema` type, checkpoint
  types and private room validation/error helpers. It defines
  `RetainedRoomRepository` and `CoordinatedRetainedRoom`; it has no DOM, filesystem,
  Node, network or SQLite imports.
- `src/yjs/retained-room-store.ts` now shares its existing checkpoint/update codec
  boundaries with the coordinator. Isolated validation, missing-dependency
  rejection, room identity checks and update ownership remain in one place.
- `examples/backends/retained-sqlite.ts` is the Node-only implementation. It
  imports `DatabaseSync` from `node:sqlite` and private type-only contracts. It
  uses a host-selected local database file; there is no browser dependency and
  no request-controlled path or execution facility.
- These modules are not exported from the public package. The SQLite example
  requires the tested Node 24 runtime; it is not a new dependency of web bundles.

## Persistent record and atomicity

The authoritative record holds a logical room key, writer epoch, document
revision, independent random CAS generation, active/frozen phase, freeze and
preparation IDs, latest resume receipt, and the complete checkpoint. Revision
counts accepted writes/resumes. Generation changes on **every** transition,
including freeze, prepare and abort; an abort returning to the same epoch/revision
cannot allow a validation from before the freeze to commit.

The repository must supply owned reads and atomically persist the full record:

```text
read(key) -> owned record or missing
create(record) -> created / already exists
compareAndSwap(key, expectedGeneration, replacement) -> committed / conflict
```

SQLite stores metadata and checkpoint bytes in a single strict-table row.
Initialization uses `INSERT ... ON CONFLICT DO NOTHING`. Every transition uses
one parameterized `UPDATE ... WHERE room_key = ? AND generation = ?`; metadata,
generation and BLOB change in the same statement. A zero-row result is a conflict,
never acknowledgement of an update. WAL and `synchronous=FULL` are selected;
the busy wait is bounded at one second and errors propagate for host retry.
The table bounds encoded wire state at 64 MiB and metadata JSON at 2,097,152
characters. A checkpoint exceeding the repository's metadata bound is refused
without truncation; these limits do not certify decoded memory or CPU use.

Each operation rereads the persistent record. Incoming writer epoch and phase
are checked before accessing the request's update field or decoding its Yjs
bytes. The request is then copied, validated in isolation, and committed only
against the observed generation. A different authority can invalidate the work
while it is validating; no per-process cache can override the persistent CAS.
The storage read itself loads the saved checkpoint BLOB; this is not a claim of
metadata-only I/O for rejected writers.

## Recovery and acknowledgement loss

Freeze and preparation persist separately. Starting another process never
implicitly unfreezes a room or changes its epoch. An authorized administrative
caller can use `recoverFrozen(expectedEpochAndRevision)` to recover the exact
persisted ticket and any completed preparation, then prepare, abort or resume.

Resume revalidates the frozen checkpoint before changing epoch. The same atomic
record update also saves a completion receipt identifying the source revision,
source/target epochs, freeze ID, preparation ID and checkpoint digest. If the
commit succeeded but its response was lost, retrying that exact latest handoff
returns the committed epoch/current snapshot without rotating again. Later
accepted writes remain intact. An old receipt cannot reactivate a newer freeze
or supersede a later handoff. This is bounded latest-handoff recovery, not an
unbounded administrative audit log.

Writer-update acknowledgement loss is different: the host retains and retries
unacknowledged Yjs batches. Reapplying the same Yjs update preserves its semantics,
but may advance the request revision. There is no request-ID exactly-once service.

## Tests and real processes

`tests/yjs-retained-room-coordinator.test.ts` adds 26 cases using actual temporary
SQLite files and independent connections. They cover initialization/ownership,
schema/key refusal, real editor updates and host binary state, stale/frozen
input rejection before byte access, malformed/foreign/incomplete updates, freeze
races, post-validation CAS fencing, connection restart, persistent preparation,
foreign/stale administrative tickets, preparation races, completion replay,
two-editor conflict/retry, offline same-room reconciliation and stored corruption.
Together with checkpoint/in-memory store cases, all **87 focused tests pass**.
The complete source run has **4,539 passes and six failures**, no skips, across
292 discovered files. The six failures match the previous default-adapter
counterexamples exactly; none is skipped or converted into an expected failure.

`artifacts/retained-coordinator-process-20261106.mjs` uses compiled ES modules and
six actual child Node processes, not a mocked repository or jsdom. Its eight
checks establish:

1. Two writer processes reach the CAS boundary with the same generation; exactly
   one SQL commit succeeds and the other gets an explicit conflict.
2. Retrying the rejected batch retains both actual editor changes and convergence.
3. Terminating a process with an uncommitted SQLite transaction leaves the prior
   authoritative row intact when read again.
4. Termination after durable freeze leaves the room frozen and writers rejected.
5. Termination after preparation retains recoverable tickets and preparation.
6. Termination after committed resume leaves the new epoch authoritative; old
   writer requests are rejected without accessing their update getter.
7. Replaying the completed handoff does not rotate again or replace content.
8. Closing/reopening the database retains converged document values, opaque
   binary/review state and the committed epoch.

The uncommitted transaction is a deliberate SQLite rollback oracle; it does not
claim deterministic termination inside an individual repository `UPDATE`, disk
power-loss certification, replication, or a deployed network-provider test.

The worker harness initially passed a schema specification where a runtime
`Schema` was required. The corrected worker constructs the actual engine schema;
the original error was not suppressed or accepted as a race result. IPC commands
are queued across module loading so test coordination cannot lose an early input.

## Reproduction

```powershell
pnpm exec vitest run tests/yjs-retained-room-coordinator.test.ts tests/yjs-retained-room-store.test.ts tests/yjs-retained-checkpoint.test.ts --maxWorkers=1
pnpm exec tsc --noEmit
node artifacts/build-retained-coordinator-20261106.mjs
node artifacts/retained-coordinator-process-20261106.mjs
./artifacts/run-retained-coordinator-checks-20261106.ps1
```

The final script runs the complete source suite, public build/API/headless/size
checks, the existing nine recorded room-store browser regressions, compiled
ES/CommonJS SQLite consumers, and visual curation sequentially with reduced CPU
priority. The browser fixture still uses the in-memory reference; it verifies
the shared codec extraction, not browser-to-SQLite transport or server security.

Final compiled ES/CommonJS consumers pass eight checks each (16 total). All nine
recorded browser regressions pass across Chromium, Firefox and WebKit with one
headless worker, no retries or skips. Three-engine handoff filmstrips and exact-
undo final screenshots were viewed: pending text remains separate until accepted,
then both editors agree and the image remains present. This is sampled visual
inspection, not complete playback, physical-device testing or persistent transport
coverage. Evidence is in `artifacts/retained-coordinator-visual-20261106`.

Types, public build, API and headless checks pass. All 171 public runtime/CSS files
remain byte-identical to the preceding public baseline. Three unchanged raw-size
overruns remain: core ESM ~0.1 KiB, aggregate ESM ~76 KiB and aggregate CommonJS
~59.9 KiB. No size ceiling, public adapter, package version or CI policy changed.

## Remaining production and migration work

SQLite coordination here is cross-process on one machine with one local database
file. Multi-host/fault-domain storage, replication, network-filesystem behavior,
authentication/authorization, protocol framing, tenant access, rate/resource
limits, backups and operational deployment remain host/backend work. Freeze,
recovery and completion IDs are administrative capabilities and must not be
included in public reader responses. Epochs are not credentials.

Validation still restores/captures/hashes complete checkpoints per explicit
batch. No per-keystroke latency, large-room throughput or bounded-memory claim
is made. SQLite synchronous calls belong off a latency-sensitive service event
loop in a production integration. The encoded-update size bound does not prove
hostile-input CPU/memory bounds.

This resumes the same room and preserves its CRDT identity. Actual compaction
still needs fresh-room candidate/destination installation, translation of all
supported auxiliary maps and relative anchors, explicit pending-offline and
history policies, rollback/reconciliation across old and new rooms, legacy
migration and safe replacement-adapter adoption. It does not fix the six
ordinary default-adapter failures or complete ProseMirror + Tiptap parity.

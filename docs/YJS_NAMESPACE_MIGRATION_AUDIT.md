# Explicit legacy namespace migration — 2026-11-07

Client follow-up: [retained checkpoint admission](YJS_RETAINED_ADMISSION_AUDIT.md)
validates an authoritative snapshot before a joining client starts its provider,
preserving pending local drafts. Epoch-bound transport and public adoption remain
open; the namespace evidence below describes its own earlier checkpoint.

The private migration path can now archive and convert named top-level XML rooms
whose names are not valid retained storage namespaces. The host supplies an
explicit `destinationRoom`; the source is never silently renamed or replaced.
This extends the [cross-format handoff](YJS_CROSS_FORMAT_HANDOFF_AUDIT.md), not the
public adapter's wire format or default implementation.

## Boundaries and imports

- `src/yjs/legacy-checkpoint.ts` imports the existing wire-string preflight.
  Source names may contain spaces, Unicode, punctuation or prototype-like text,
  up to the existing 1,000-unit root-name bound. Explicitly selected empty named
  roots also round-trip. Unpaired UTF-16 is refused without normalization.
- `src/yjs/legacy-migration.ts` adds `LegacyMigrationOptions.destinationRoom` and
  an owned options snapshot. A retained target must satisfy its existing ASCII
  namespace bounds. An incompatible source requires an explicit target; compatible
  names retain the existing default unless the host deliberately supplies an alias.
  The report records both names. The original full-wire checkpoint remains intact.
- `src/yjs/cross-format-handoff.ts` binds archived mapping metadata to the actual
  source/destination checkpoints and binds operation replay to the selected target.
  Rollback additionally checks the current namespace against archived lineage.
  Older same-namespace archives without the new report fields still replay.

References are translated against native shared identities, not text matching.
Explicit auxiliary-root ownership and semantic verifiers remain mandatory.
Source roots that collide with the target's core inventory are rejected; nothing
is overwritten or omitted. Structured maps can retain an explicitly configured
`mapName` across the change. The target adapter must use that same configuration.

The administrative authority's logical key is separate from the document's
fragment name. No source name is used as a filesystem path or SQL expression.
The same live-row/archive transaction, epoch fencing, late-update raw receipts,
branch CAS and rollback rules continue to apply across different namespaces.
Late batches remain in their original codec and original namespace.

## Evidence

**28 new source cases / 264 focused cases pass.** The same new tests run against
source archived from `aee2b0e7`: three pass and 25 fail there. Coverage includes
spaces/Unicode/punctuation, explicit empty roots and maximum-length names,
invalid targets, owned asynchronous options, native references, structured state,
root collisions, exact selected-source reads, both rollback choices, undoing
rollback, replay binding, corrupted mapping metadata and older archive recovery.

**18 compiled ESM/CommonJS process checks pass**, using five child processes per
format. Actual namespace assertions accompany the legacy → retained → legacy
protocol assertions. Termination before commit and after migration/late-batch/
rollback commits verifies persistent recovery and retry through SQLite.

**12 recorded Chromium/Firefox/WebKit journeys pass** with actual editors and
the compiled HTTP/SQLite authority. A Unicode source maps to `mapped-paper`;
an author-selected `review-copy` is separately edited and saved. Invalid target
input is refused before freeze. Offline edits, both rollback choices, lost
acknowledgement, typing before reconnect, historical replay and read-only archives
retain their existing contracts. The active and archived namespace values are
checked against actual checkpoint metadata, not only labels.

Visual review covers final-state contact sheets for all 12 journeys, sampled
migration/mapping filmstrips and selected complete 1440 × 1400 stage captures.
Continuous layout sampling checks containment. This is not full playback,
physical-device/IME or assistive-technology certification. Figures load; math
and Lean intentionally use source presentation in this migration fixture.

Full-suite counts, source/build hashes, archived baseline provenance, process
results and public-runtime invariants are in the
[verification receipt](../artifacts/yjs-namespace-verification-20261107.json).
The complete source run has 4,747 passes and the same six default-adapter
failures across 299 files, without skips. Types, build, API and headless checks
pass. All 173 public runtime/CSS files remain byte-identical. The same three
raw-size overruns remain: core ESM 0.1 KiB, aggregate ESM 77.4 KiB and aggregate
CommonJS 61.1 KiB. Acceptance limits and the six required regressions are unchanged.
No publication, acceptance-limit change or public retained-adapter adoption occurs.

## Embedded legacy documents

Pass the integrated `Y.XmlFragment` as the sixth argument to
`captureLegacyCheckpoint` when the editor document lives inside a shared map
or array. The room name still names the migration and supplies the default
structured-attribute namespace. The manifest checksums the fragment's native
Yjs identity along with the complete source wire update. Array index changes
therefore do not redirect restore or later writes. Missing, foreign, deleted
and replaced handles fail closed. Existing top-level checkpoints retain their
original manifest shape. Readers that predate the optional fragment field must
be upgraded to open new embedded checkpoints.

Each host root still needs an explicit migrator and verifier, including the
container around the selected document and any unrelated top-level document.
The research-folder example carries its title and the new retained namespace
into a folder record. The original embedded XML, original folder, and late
legacy edits stay in the source archive, and rollback reopens the same native
fragment for further editing. The host owns the folder-to-document reference
mapping. Use an explicit destination when the selected room name is invalid or
would collide with a host root.

The three focused source suites passed 120 cases. The full namespace browser
suite passed 15 recorded journeys in Chromium, Firefox and WebKit, including
three embedded-document handoffs against SQLite. The recordings and screenshots
are in `artifacts/yjs-nested-fragment-full-browser-20261107/`. Visual review of
the Firefox migration and rollback captures confirmed that the offline draft
and the retained edits appeared in their expected panes. Build, types, API,
headless and packed-package smoke checks passed. The four raw-size overruns
remain with their existing limits.

## Edits while reconnecting after a protocol switch

The HTTP/SQLite browser reference previously saved the old editor's Yjs update,
then waited for the replacement room's admission. An edit made during that wait
could disappear when the old view was replaced. A held admission reply reproduced
the problem in Chromium while the new room was already active on the server.

Immediately before mounting a validated replacement, the reference checks the
mounted source editor, its immutable model, and its complete Yjs update against
the copy it sent to the retired branch. The byte check includes deletions that a
state vector can miss. If the source changed, its view stays editable and the
staged document is destroyed. Retry uses the same migration or rollback operation
UUID, archives the newer source state, and opens the already committed room.

The recorded cases use keyboard input during the held reply. One inserts text
during a migration. The other deletes a character during rollback. Both compare
the server document, active editor, and retired archive after retry. The source
remains in the mounted browser editor during this window. Crash-persistent
cross-format draft recovery and production deployment remain open.

All 21 recorded namespace journeys pass across Chromium, Firefox and WebKit,
and all 120 focused source tests pass. The Chromium capture shows the unsent
insertion in the still-editable source. The Firefox capture shows the deletion
in the retired archive beside the reopened legacy document. The fix is in the
loopback host reference and leaves the default collaboration adapter in place.

## Remaining work

Production costs, archive/raw retention and compaction, external coordination
and safe adoption remain open.
The six ordinary default-adapter concurrency failures and full editor parity are
not resolved by namespace mapping. COLLAB-01 stays Partial.

Reproduction uses an archived baseline without changing the working tree:

```powershell
New-Item -ItemType Directory -Force artifacts/yjs-namespace-baseline-20261107
git archive --format=tar --output=artifacts/yjs-namespace-baseline-20261107.tar aee2b0e7 src
tar -xf artifacts/yjs-namespace-baseline-20261107.tar -C artifacts/yjs-namespace-baseline-20261107
pnpm exec vitest run --config artifacts/yjs-namespace-baseline-20261107.config.ts --maxWorkers=1 --reporter=json --outputFile=artifacts/yjs-namespace-before-20261107.json
node artifacts/prepare-yjs-namespace-20261107.mjs
node artifacts/build-yjs-namespace-20261107.mjs
node artifacts/yjs-namespace-process-20261107.mjs es
node artifacts/yjs-namespace-process-20261107.mjs cjs
pnpm exec playwright test --config artifacts/yjs-namespace-browser-20261107.config.ts
node artifacts/curate-yjs-namespace-20261107.mjs
./artifacts/run-yjs-namespace-checks-20261107.ps1
node artifacts/verify-yjs-namespace-20261107.mjs
```

Heavy commands run serially, headless, with one browser worker. The test-only
loopback transport is not production authentication or a deployed room service.

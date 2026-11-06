# Retained collaboration adapter — local work in progress

2026-11-06. This checkpoint integrates the isolated retained storage with the
actual Fountain collaboration lifecycle. It does **not** switch the public
adapter, add a package export, migrate a room, or update the website. All work
remains local at the user's request. The six required failures in
`tests/yjs-document-range.test.ts` remain visible and unchanged.

Follow-up: the cursor-navigation regression recorded at this checkpoint is
addressed in the [cursor overlay audit](COLLABORATION_CURSOR_OVERLAY_AUDIT.md).
The historical 21-pass/three-failure browser receipt below is not the follow-up
result. Storage adoption and the six default-adapter failures remain open.

The subsequent [move, cost and label audit](YJS_RETAINED_MOVE_AND_LABEL_AUDIT.md)
fixes a newly exposed move/peer-insertion ownership defect and redundant sibling
validation. Its actual-adapter diagnostic still measures roughly 1.24 seconds
per edit at 500 paragraphs, so the candidate remains unsuitable for adoption.

The later [fresh-read performance audit](YJS_RETAINED_READ_PERFORMANCE_AUDIT.md)
addresses repeated global scans and unchanged-group work, and fixes a pending
transaction cache defect. Its controlled 500-paragraph diagnostic is 42.84 ms
median per edit. Adoption, larger-document and long-session requirements remain
open; the earlier timings above describe their historical checkpoint.

## Implementation and boundaries

`src/yjs/retained-adapter.ts` implements `CollaborationAdapter` using the existing
`createCollaborationExtension` lifecycle. It handles local transactions, remote
projection, author undo/redo, provider replacement/disconnection, awareness
throttling and granular structured attributes. It imports the existing portable
engine, collaboration API, retained store/selection helpers, and
`YjsStructuredAttributeStore`; it requires no DOM implementation.

`src/yjs/retained-selection.ts` retains text, directional range, node, cell, gap
and all-document selections. Text uses Yjs relative positions. Structural
boundaries use retained parent/neighbor identity and explicit association.
Reverse indexes in `retained-document.ts` hold portable IDs/paths rather than
old document snapshots. This avoids scanning the model separately for every
bookmark; it does not make the underlying full document projection incremental.

Structured-attribute reconciliation uses attribute-only engine steps. Replacing
the entire projected document during reconciliation originally rebuilt a widget
identity and duplicated its record. The regression now checks concurrent nested
field changes and author-only undo/redo through the actual adapter.

New rooms carry an explicit retained-format gate. Existing legacy rooms,
unknown formats, a changed room identity, and concurrent independent room
initializations are refused with their shared bytes preserved. No heuristic
winner or automatic migration is applied. A compatible provider/server handshake
and separate protocol rooms remain necessary: older published clients cannot be
made to honor a guard added only to this checkout.

## Two repairs in the existing engine/adapter

- `src/core/transaction/replace-node-step.ts` keeps a copied block owner's
  opening/closing positions and identical prefix/suffix children when computing
  its map. Retention requires explicit `Node.copy`/`withAttrs` lineage and actual
  child object identity. A newly constructed equal-looking node/text is still a
  replacement. This fixes an inner gap jumping out of a quote when a copied
  quote receives another child. Local history and exact position maps are tested.
- `src/yjs/index.ts` refuses local writes when its shared roots contain an
  unfamiliar element. Previously a remote protocol error did not prevent the
  legacy adapter subsequently writing over that room. The test preserves both
  the shared fragment and state vector after such an attempted write. An
  unsynchronized local draft may still be editable; the guard is not access
  control or retroactive protection for older clients.

## Verification

The complete source run reports **4,298 passed, six failed, zero skipped
(4,304 total)**. All six failures are the known default-adapter retention cases.
The focused candidate/mapping run passes **165 tests across six files**, including
32 adapter lifecycle cases and four copied-owner mapping cases. TypeScript and
the public package build pass.

The adapter tests exercise all six offline typing versus quote/list/mark/split
cases in both exchange orders, author history, all selection families,
awareness, granular attributes, provider replacement, retired callbacks,
throttling and protocol/initialization conflicts. These are behavioral tests
through real editors, not just manually invoking the storage pools.

The compiled ESM and CommonJS probes pass **24 Node.js journeys**, without
`document`, `window`, jsdom or another DOM substitute. A compiled adapter must
share its engine runtime: duplicate
selection classes and collaboration runtime maps from separately bundled engines
would make such a probe invalid. The canary build therefore uses one multi-entry
module graph, with no change to the public package exports.

The recorded browser run has **21 passed and three failed** across Chromium,
Firefox and WebKit, headless with one worker. The passing journeys use native
typing/selection and toolbar actions for all six concurrency scenarios, author
undo/redo, blank-line insertion/deletion, backward selection, a room switch
without remounting the views, and actual JSON download/reopen. Each preserves
the image and document metadata. This is an internal two-editor fixture, not a
public demo or physical mobile/device certification.

All three failures are the same new required native-navigation regression:
three right-arrow presses from the beginning reach offset two when a remote
cursor widget splits the text. Diagnostic attachments capture the native DOM
endpoint and actual model selection **before** Enter. Enter then correctly
splits that offset, so this must not be misreported as lost shared characters.
The independent split journey approaches from End/Left, verifies offset three
before Enter, and retains the exact expected `AlXp` / `ha` split, undo and redo.
The original navigation expectation stays a normal failing test, with no skip,
retry, softened assertion or claim that adoption is complete.

Representative screenshots were actually inspected for retained quote/media,
the correct two-paragraph split and reopened Planning content. Videos/traces and
the native-caret diagnostics are saved under the dated artifact paths. The
test server disables repository file watching; watching the large accumulated
artifact tree prevented the initial private server from starting within its
timeout. User development servers and visible browser windows were untouched.

Public API verification passes across 423 declarations; the headless boundary
passes across 132 modules. Package consumers, server runtimes including workerd,
TypeScript/Svelte/Angular checks, and the existing public performance/heap gates
pass. These public performance checks do not certify the experimental adapter.
The unchanged size gate remains red: core ESM is approximately 0.1 KiB over its
limit, aggregate ESM 67.8 KiB over, and aggregate CommonJS 53.2 KiB over. No size
or other acceptance limit was changed.

The receipt is `artifacts/retained-adapter-verification-20261106.json`, including
source/report hashes, exact failing cases, 189 current source-map modules and
hashes for all 24 browser recordings. Representative images and one short
recording accompany the checkpoint; the remaining raw videos/traces and complete
unit JSON remain local. Reproduction:

```text
node artifacts/build-retained-adapter-20261106.mjs
node artifacts/retained-adapter-node-20261106.mjs es
node artifacts/retained-adapter-node-20261106.mjs cjs
pnpm exec playwright test --config artifacts/retained-adapter-browser-20261106.config.ts
```

The browser command currently exits nonzero for the three required cursor
regressions. The full unit command likewise exits nonzero for its six existing
default-adapter regressions. Neither result is a green release gate.

## Work still required before adoption

The experimental adapter is not production-ready merely because focused
concurrency examples pass. Required work includes incremental projection and
lookup costs, large-document limits, memory/history/dictionary compaction,
arbitrary composed structural operations, schema/provider interoperability,
explicit migration/room negotiation, and broader browser input/IME/mobile
coverage. Existing public size-budget overruns must remain reported rather than
silently increasing ceilings. Public parity, release and completion status are
unchanged.

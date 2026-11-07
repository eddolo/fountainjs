# Default Yjs history policy — 2026-11-07

The public XML adapter now honors `addToHistory: false` when publishing a local
transaction. It uses its existing untracked repair origin for that work instead
of recording everything as an authored edit. This closes a gap identified by the
[preceding appended-repair audit](COLLABORATION_APPENDED_REPAIR_AUDIT.md).

Previously, undo could remove an explicitly history-neutral imported text prefix
or review metadata, and a reviewer could get an undo entry merely for assigning
stable IDs to a remote duplicate. A metadata update between two grouped typing
transactions could also be undone with the typing. Eight required source cases
covering these four workflows failed before this repair.

## Follow-up: native shortcuts and caret restoration

The standard history commands now use author-local history when the active
adapter implements the operation. The React toolbar uses those same commands.
The DOM view handles Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y after the host's
keyboard hooks. Native history input also goes through the standard commands.
Editors without adapter history still use local snapshot history.

Both Yjs adapters now restore the bookmark from the stack item Yjs actually
applies. This matters when a peer supersedes a newer operation and Yjs skips
it. The inverse stack item receives the original before/after bookmarks,
which keeps the caret available on repeated undo and redo. The four changed
declaration hashes remove two private fields in both module formats.

The focused source suite passes 190 cases. Six recorded two-author journeys
pass in Chromium, Firefox and WebKit for both protocols. They use keyboard
shortcuts, check the native caret after each operation, and type at the
restored position. Both panes show the follow-up character in the expected
place in the inspected WebKit retained capture. Three more recorded journeys
exercise native non-collaborative split/undo/redo in those engines.

A separate built-package reproduction still finds a retained undo step with no
visible text change. Author A inserts X, then Y as a separate edit. Author B
deletes Y. The first author undo reports success and moves the caret, leaving
the text unchanged. The next undo removes X. Redo repeats the extra invisible
step after restoring X. This remains open alongside the six default structural
concurrency failures and the two aggregate size failures.

## Implementation

`src/yjs/index.ts`, `YjsCollaborationAdapter.onLocalUpdate`, reads the transaction's
existing history flag. Ordinary authored work keeps `localOrigin` and selection
bookmarks. Neutral work uses `repairOrigin`, is not placed in `pendingHistory`,
and does not generate a history-after selection. The existing `Y.UndoManager`
already tracks only the local origin; no new shared root, wire format, protocol,
configuration option or public declaration is introduced.

The [shared lifecycle repair](COLLABORATION_APPENDED_REPAIR_AUDIT.md) continues to
separate incoming remote state from locally appended maintenance and preserve
authored intent in composed notifications. Therefore an authored duplication or
divider remains undoable even when ID/trailing-paragraph repairs are appended
to it; a separately received repair does not become the reviewer's authored work.

## Verification

`tests/yjs-history-policy.test.ts` adds 20 cases through the actual public and
private retained factories. Both exchange orders, history-neutral metadata and
text, remote ID maintenance, grouped typing, peer edits, local appended repairs,
undo and redo are covered. Before the fix 12 pass/eight public-adapter cases fail;
after it all 20 pass. The **99-case focused suite passes** without changing old
expectations or suppressing the six known default concurrency failures.

**18 recorded Chromium/Firefox/WebKit journeys pass** through the compiled public
XML adapter with real editor views. Six workflows per engine cover duplicate-ID
repair, an editable ending after a divider, offline typing, locally authored
maintenance, neutral review metadata and neutral imported source. The latter two
use pointer actions plus actual keyboard typing and undo/redo; exact documents,
peer convergence, ID integrity and undo availability are checked.

Visual review covers final-state contact sheets for all 18 journeys, six sampled
metadata/import recording filmstrips and selected complete stage screenshots.
The audited 1440 × 1200 layouts fit without page overflow; native WebKit button
fonts differ. This is sampled video evidence, not full playback, physical mobile
or assistive-technology certification. This fixture inserts a sample text prefix;
it does not claim document-format importer fidelity.

The Node checks import the actual built `fountainjs-editor`, `/node-ids` and
`/yjs` public package entries in ESM and CommonJS, without a fake DOM. They test
seven collaboration/history workflows per format, including remote and local
maintenance. They are built-entry consumers, not an npm publication or an
independently installed tarball claim.

Complete source/build counts, current ordinary failure names, public-file hashes,
package-entry checks and size measurements are recorded in the
[verification receipt](../artifacts/yjs-history-policy-verification-20261107.json).
The full source run has **4,719 passes / six unchanged failures / no skips**
across 298 discovered files. Types, build, API and headless checks pass. All 14
built-public-entry Node cases pass. Only `dist/yjs.js` and `dist/yjs.cjs` change,
by 94 and 79 raw bytes respectively; the other 171 public runtime/CSS files are
identical. The three existing budget categories remain over limit: core ESM about
0.1 KiB, aggregate ESM 77.4 KiB and aggregate CommonJS 61.1 KiB.
No size limits change. This remains local and unreleased.

## Remaining work

This fixes default-adapter history ownership. It does not repair the six separate
offline typing versus quote/list/mark/split failures, adopt the private retained
representation, or finish provider admission/migration, fragment mapping,
production storage/performance and release verification. COLLAB-01 remains
Partial and overall editor parity remains unfinished.

Reproduction, with heavy jobs run serially and one headless browser worker:

```powershell
node artifacts/prepare-yjs-history-policy-20261107.mjs
node artifacts/prepare-yjs-history-policy-node-20261107.mjs
pnpm exec playwright test --config artifacts/yjs-history-policy-browser-20261107.config.ts
node artifacts/curate-yjs-history-policy-20261107.mjs
./artifacts/run-yjs-history-policy-checks-20261107.ps1
node artifacts/yjs-history-policy-node-20261107.mjs es
node artifacts/yjs-history-policy-node-20261107.mjs cjs
node artifacts/verify-yjs-history-policy-20261107.mjs
```

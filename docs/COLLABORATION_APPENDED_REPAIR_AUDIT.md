# Collaboration appended-repair audit — 2026-11-07

Running the unchanged public collaboration suites against the private retained
adapter exposed a real integration defect: stable-ID repair changed the visible
editor but did not converge back to a peer without that extension. The shared
collaboration layer rebroadcast the complete incoming remote transaction plus
appended repairs, while the retained adapter already owned the incoming state.
Its provenance check correctly refused that stale starting document.

The repair now crosses the adapter boundary as only its actual appended steps,
starting from the incoming transaction's resulting document/selection. Exact
step-object prefix checks prevent guessing which part was remote. The same
boundary handles document replacement, multi-step remote transactions and nested
remote dispatch; the inbound transaction is released in `finally`.

## Code and history semantics

- `src/extensions/collaboration-core.ts` imports the existing core `Transaction`
  at runtime, scopes the current inbound transaction around dispatch, and builds
  the repair-only `CollaborationLocalUpdate`. A normal remote update still is
  not rebroadcast. No public type/API signature is added.
- `src/core/editor.ts` preserves whether any contributing document transaction
  requests history in a composed subscriber notification. A history-neutral
  appended repair must not erase the original author's history intent. Plugin
  state/history still processes the original transactions individually.
- `src/yjs/retained-adapter.ts` uses its existing untracked repair origin for
  `addToHistory: false` work. A remote repair therefore creates no reviewer undo
  entry; a local user action with appended maintenance stays one undoable action.

The first five regressions failed before the remote-prefix fix. Honoring neutral
history then exposed two further local-author regressions: a duplicate or divider
with appended maintenance became non-undoable. The composed notification fix
addresses those without recording independently received remote repairs.

The original public XML adapter still has its own origin/history implementation;
this audit does not certify that it honors every explicit history-neutral update.
Its six known offline-concurrency failures also remain ordinary test failures.

## Evidence

Eleven new source cases cover repair bases/selections, nested and multi-step
remote dispatch, normal remote non-rebroadcast, stable-ID convergence in both
exchange orders, history-neutral metadata retention, and local duplicate/divider
undo/redo with repairs. The **130-case focused suite passes**.

**14 compiled ESM/CommonJS Node checks pass**, with `window`, `document`,
`DOMParser`, `HTMLElement` and `MutationObserver` absent. These use the actual
retained adapter, model, ID/trailing extensions, undo/redo and shared wire state.

**12 recorded Chromium/Firefox/WebKit journeys pass** using two compiled real
editor views. Keyboard/pointer use verifies duplicated IDs converging, author
and reviewer history, independent offline typing, remote divider/trailing-caret
repair and local actions with appended ID/trailing maintenance. One peer lacks
the repair extensions, so a local-only visual repair cannot satisfy the checks.
Exact model equality, connected status and ID integrity are checked throughout.

Visual review covers all 12 sampled recording filmstrips and selected complete
1440 × 1200 stage screenshots. It is not full playback or physical-device/AT
certification. Layout checks cover pane widths, page containment and full viewport
height. Native WebKit button fonts differ; the content and controls remain visible.
Image captions themselves accept editable text, so the trailing-block scenario
uses a genuinely atomic divider rather than assuming a figure is non-editable.

The complete source/build outcome and measured public runtime changes are in the
[verification receipt](../artifacts/retained-repair-verification-20261107.json).
Complete source has **4,699 passes / six unchanged failures / no skips** across
297 discovered files. Types, public/declaration build, API and headless checks
pass. The three remaining size overruns are core ESM about 0.1 KiB, aggregate ESM
77.3 KiB and aggregate CommonJS 61.0 KiB. No limits change.

The first declaration build changed the import's type/value form in two public
declaration files. Keeping the original type import and a separate internal
constructor alias restores the existing API snapshot. All 11 private audited
runtime/CSS files and 173 public runtime/CSS files are byte-identical before and
after that declaration-only repair. The tested behavior is therefore unchanged;
current source maps match the repaired imports. The initial failed API log and
before/after runtime hashes remain part of the evidence.

The public collaboration boundary changes; this batch does not claim identical
public runtime bytes to the preceding commit, a default-adapter switch, acceptance-limit changes or a
release. API declarations remain unchanged.

## Adoption diagnostic and remaining work

The same 43 public test cases run unmodified through a test-only replacement of
the adapter factory/class. Before this fix 35 pass/eight fail; afterwards **36
pass/seven fail**, including the repaired stable-ID case and all six offline
counterexamples that still fail through the ordinary default export.

The seven diagnostic failures remain visible: five access the old XML tree
representation, one expects the old configuration error wording, and one expects
simultaneous independent initialization to choose a convergent winner. The
retained implementation currently refuses conflicting initialization instead of
discarding either source. Existing wire assertions must be kept with legacy
coverage and paired with genuine retained equivalents; a default switch cannot
be justified by removing assertions or relabelling that behavior as equivalent.
Some old identity checks compare absent XML children under the diagnostic; their
passes alone are not retained-identity evidence. Dedicated retained-ID tests and
the recorded workflows supply that separate evidence.

Provider initialization/admission, general fragment mapping, large-room/remote
costs, history/storage growth and safe adoption remain open. The six ordinary
default failures, current size overruns, complete release CI and overall parity
remain unfinished. The retained adapter stays private and unpublished.

Reproduction (serial heavy jobs; headless one-worker browser):

```powershell
pnpm exec playwright test --config artifacts/retained-repair-browser-20261107.config.ts
node artifacts/retained-repair-node-20261107.mjs es
node artifacts/retained-repair-node-20261107.mjs cjs
node artifacts/curate-retained-repair-20261107.mjs
./artifacts/run-retained-repair-checks-20261107.ps1
node artifacts/verify-retained-repair-20261107.mjs
```

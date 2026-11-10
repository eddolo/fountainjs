# Native selection and metadata updates

Audit date: 2026-11-10. Browser evidence uses the public collaboration demo with
the ordinary `fountainjs-editor/yjs` adapter.

## Confirmed failure

The Firefox journey `keeps offline text through partial bold in the public
collaboration demo` intended to move two characters into `Edit either side...`
and type `X`. It produced `EXdit...` instead of `EdXit...`, before formatting or
merging the offline documents.

A bounded recorded diagnostic reproduced the failure on its third attempt.
`artifacts/yjs-public-selection-diagnostic-20261110/attempt-2.json` records the
second ArrowRight at approximately 1059 ms. At 1060 ms the native selection was
already at offset 2 when Fountain called `Selection.removeAllRanges()`. The
`applyDOMSelection` / `SelectionHandler.sync` / `EditorView.onStateChange` stack
then reapplied offset 1. The subsequent keyup and text input used that restored,
incorrect offset. The matching trace and video are in the same artifact folder.

This was an editor race, not evidence that Firefox failed to move the caret.
An awareness update can dispatch forced plugin metadata between the browser's
native movement and the event which captures it into Fountain's model. The view
previously queued model-to-DOM selection synchronization for every state update,
including metadata whose content DOM and document selection had not changed.

## Repair boundary

`src/view/view.ts` now leaves native selection alone for metadata and overlay-only
updates. Document changes and explicit selection transactions still synchronize
the model selection to the view.

When metadata changes inline decorations, the view captures any pending native
selection before replacing its DOM and restores the selection synchronously.
Native captures in `src/view/selection-handler.ts` carry internal
`fountain$selectionFromDOM` transaction metadata, which distinguishes captured
selection from an explicit command. Their selection sync is immediate and
preserves equivalent native DOM ranges, including the nested transaction emitted
by capture before decoration rendering. A keydown handler can therefore update
decorations before the browser performs
its default arrow movement without leaving a queued stale selection to undo
that movement afterward. Completing this synchronous restoration invalidates any
older queued reconciliation which it has already fulfilled. The same provenance
fix also handles a native caret already ahead of the model when the next keydown
captures it, before that key's default movement.

Required queued command/document reconciliation survives an intervening
metadata update when the current document and logical selection still match.
A newer document or logical selection cancels the stale reconciliation.
Reconciliation ownership is claimed before reentrant NodeView/render hooks, so
a newer selection dispatched by one of those hooks wins over the outer update.
If focus moves to an external control before reconciliation, the view defers the
command caret until focus returns instead of reclaiming focus or the DOM range.
A passive inline redraw preserves an existing pending command before completing
its synchronous reconciliation; it does not create new focus intent by itself.

`requestDOMSync()` remains an ownership hint, not proof that metadata should
reset a selection: native keydown handling sets that hint before the browser
has performed its default movement.

## Regression evidence

`tests/selection-view.test.ts` exercises:

- Metadata after native movement and during keydown, for forward carets and
  backward ranges, preserving the native Range object and subsequent insertion.
  A separate case starts keydown with the native caret already ahead of the model.
- Inline decoration updates after native movement and during keydown. The
  latter independently reproduced `EXdit...` before synchronous restoration; an
  additional case covers an earlier queued command already completed by that
  restoration.
- Explicit selection and document edits followed by overlay-only or inline
  decoration metadata in the same task.
- Focus moving to an external button between a command and overlay-only or
  inline-decoration metadata, followed by returning focus to the editor.
- A custom NodeView selection hook dispatching a newer selection synchronously,
  which must win over the outer view update.
- A collaboration-style subscriber publishing presence metadata before the view
  receives a document-change notification, without interpreting stale DOM paths
  against the new document.

The targeted suites (`selection-view`, `view-native-selection`, and `view`)
passed all 105 tests after the repair, including 16 new deterministic regressions.
The two selection-specific suites account for 56 of those tests. The public
browser journey's native keyboard helper and text assertions were not changed.
The rebuilt browser evidence below extends these deterministic checks.

This audit concerns selection ownership during plugin metadata and decoration
updates. It does not resolve or reclassify the separately documented intermittent
Firefox migration-fixture cold-start delay.

## Rebuilt-browser follow-up: nested presence before rendering

The first rebuilt public matrix passed seven Chromium cases, then the offline
quote case froze during the real toolbar click. The matrix was interrupted;
those partial results are not a passing matrix. Evidence remains under
`artifacts/selection-public-browser-final-20261110/`.

A single headless Chromium diagnostic reproduced the freeze. CDP paused the
actual page and recorded 5,177 synchronous stack frames in
`artifacts/selection-quote-hang-20261110/paused-stack.json`. The repeating chain
was `onStateChange` -> native `capture` -> dispatch -> collaboration
`onLocalSelection` -> `setPresences` -> metadata dispatch -> `onStateChange`.
The outer quote transaction had changed the model, while an earlier
collaboration subscriber published metadata before the view rendered that new
document. Capturing the still-old DOM paths against the new document repeatedly
redispatched selection and presence.

The view now tracks the immutable document actually reconciled into its DOM.
Passive native capture and immediate native restoration require that identity
to match the notification's document. The identity is updated after DOM
reconciliation and before post-render NodeView hooks. The deterministic
subscriber-order regression reproduced repeated stale captures before this
guard and now requires zero, the correct quote selection, and a correct
subsequent insertion.

`pnpm build` completed successfully after the guard. The unchanged real public
Chromium quote journey then passed in 2.9 seconds (one worker, headless), including
offline editing, wrapping, merging, and both authors' undo behavior. Its trace,
video, and screenshot are under
`artifacts/selection-quote-smoke-20261110/`.

## Combined verification

The complete source run passes **5,134 tests in 318 files**, with no failures or
skips. Types, public declarations, ESM/CommonJS package consumers, headless
boundaries, size checks and the website build pass.

The public three-engine matrix records **57 passes, two existing clipboard
skips and one Chromium fixture-startup failure**. Its trace records
`ERR_NO_BUFFER_SPACE` fetching `src/pages/index.ts` before the editor exists.
The unchanged isolated page-boundary journey subsequently passes in 1.8 seconds.
The original caret failure and all six offline-edit scenarios pass in every
engine. This is not a clean first-run result, nor a repair of the distinct
previous Firefox migration-startup observation.

The separate native-selection matrix records 39 passes and three paragraph-join
assertion failures. Saved snapshots show exact `Alpha BetaBridge` model content;
the additional DOM text is the fixture's intentional non-editable `Remote`
widget. The corrected assertions independently verify model content, rendered
content excluding only view widgets, and retained widget state. Those three
unchanged keyboard journeys and three existing decoration journeys pass in the
subsequent six-case run. Native backward selection, external control focus,
paragraph geometry, page gaps, IME guards and 100,000-block editing all pass.

All **45 default-adapter browser journeys** also pass across Chromium, Firefox
and WebKit. The Firefox partial-bold merge capture, sampled recording frames,
and deleted-ancestor restoration capture were visually inspected. Recordings
and screenshots do not establish physical-device or real-IME certification.

The CommonJS aggregate allowance rises by 0.75 KiB to 1,415 KiB for the measured
1,414.9 KiB build. Other size and runtime limits are unchanged. Runtime/heap
performance checks were not repeated for this view-only follow-up; the preceding
foundation checkpoint's results remain scoped to that checkpoint. Full release
CI and production qualification are still required.

Results and exact source hashes: `artifacts/selection-verification-20261110.json`.

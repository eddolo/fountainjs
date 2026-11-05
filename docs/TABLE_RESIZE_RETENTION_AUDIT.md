# Table resize focus and retained positions

Unreleased follow-up, 2026-11-05. Parent commit:
`252509009058fb974a7d9b8fb2c1d84632cd6923`.
No npm or website release is certified by this checkpoint.

The remaining headless matrix in
[CI run 42090626543](https://github.com/eddolo/fountainjs/actions/runs/42090626543/job/127467375835)
passed 894 cases and failed the same resize journey in Chromium, Firefox and
WebKit. The preceding native preflights passed. The unchanged journey reproduces
locally; no assertion was relaxed to recover it.

## Owning boundaries

`src/extensions/nodes/table-cell-view.ts`: focusing the separator now establishes
an actual `CellSelection` unless that cell already owns a cell selection. An
ordinary text or gap selection can project into the same cell; that contextual
lookup does not establish semantic cell ownership. A native event trace showed
this distinction after undo/redo and before the pointer resize.

`src/view/selection-handler.ts`: a gesture stopped by a NodeView remains owned by
that view until document `pointerup` or `pointercancel`. The pointer can leave
the narrow handle before release. Capturing unrelated native endpoints at that
release could replace the model selection. A new pointer gesture cancels an old
deferred toolbar focus intent; later keyboard placement remains available.

`src/core/table-commands.ts`: resizing is an attribute-only operation with an
identity position map. A private `ResizeTableColumnStep` recreates affected rows
in one pass, preserving content and replaying correctly in command batches.
The previous full-table replacement reported content as deleted and could move
cell/text/node selections to a gap. Generic replacement keeps its deletion
semantics. The resize command validates the final document and reports a filter
rejection; valid no-op widths keep the existing handled result.

## Verification scope

The three unchanged recorded browser journeys now pass through keyboard width
adjustment, pointer drag, native handle focus, accessible value announcements,
cell selection and exact document undo. Six stage captures show the 310 px
commit and restoration to 275 px. Visual review complements focus assertions;
screenshots alone do not prove keyboard ownership.

Nine added unit cases check separator focus from text/gap projections,
pointer-up/cancel lifecycle and keyboard handoff, all-position retention for
cell/text/node selections, filtering and atomic command-batch history. The
earlier focused runs failed the corresponding semantic-focus, gesture-ownership
and table-metadata cases. None were marked expected-to-fail or skipped.

The declaration review compares all 423 declaration files with the parent:
only a private `nodeViewPointerActive` field appears in the two selection-handler
declarations. Public signatures do not change in this follow-up. Runtime
dependencies, document/collaboration formats and acceptance limits are unchanged.

The verification record retains intermediate failures, final command results,
package/source provenance and remaining limits. Full fresh CI remains required.
The separate unfinished structural/history work still has required collaboration
and independent-deletion failures and is not included or certified here.

All 4,061 unit tests in 276 files pass, as do types, API, headless, package,
workerd, performance and retention checks. The 63-case recovery rerun and 27
additional table/control/RTL cases pass. Two existing platform clipboard skips
remain. The actual local tarball passes 24 Node consumer checks without DOM
globals, and its 881 distribution files match the tested build. Six source-map
entries match the three repaired runtime sources exactly.

Six stage captures and twelve sampled recording frames were visually reviewed;
this is not continuous playback or physical-device certification. Static root
closure growth is 774 raw / 169 gzip bytes; core is 588 / 132 bytes. DOCX, Yjs
and server HTML closures are unchanged. These measurements do not measure speed
or apply consumer tree shaking. Existing size checks remain red with unchanged
ceilings. [Verification record](../artifacts/resize-retention-verification-20261105.json).

# Retained positions through splits and local history

Unreleased work in progress, 2026-11-05. This is not release certification.
The original wrapping/collaboration work and these changes remain separate from
the committed [focus repair](https://github.com/eddolo/fountainjs/pull/22).

## Structural wrapping and native direction

`src/core/block-range.ts` resolves actual selected block owners, including media
and empty blocks, and excludes a following paragraph reached only at offset
zero. Quote/list wrapping uses `RestructureChildrenStep`: retained subtrees keep
their structural positions; added/removed container tokens get ordinary maps.
Replay binds captured retained references to the actual equal descendants of
the replay document, preserving metadata and untouched objects.

The recorded conversion-lab journeys found that native backward legacy text
selections became forward when wrapping changed their paths. Selection direction
was tied to equality with the old path-based selection. `SelectionHandler`
now maps that direction through the actual transaction only while it matches
the mapped range; fresh explicit selections do not inherit unrelated direction.
Ignored native events during pending model sync do not erase that ownership.
Four backward quote/list tests failed before this repair; all eight forward/
backward cases pass. The starting browser fixture explicitly contains a caret
paragraph after its final image, avoiding unrelated Ctrl+End materialization
after the baseline download.

## Confirmed repairs and evidence

`src/core/transaction/split-node-step.ts` splits the actual source text and its
ancestors. It reports only the newly inserted closing/opening structural tokens:
two units for an ordinary text-block split, four for a list-item split. Existing
characters and outside content survive. `src/core/commands.ts` uses this operation
for paragraph/heading/list splits, validates the completed container, and returns
transaction-filter rejection correctly. Generic replacement remains a deletion.

`tests/split-block-retention.test.ts` checks all old positions with both
associations, marks, retained node objects, task state, batching, exact history,
schema rejection and filtering. Nine of ten cases failed before the repair;
all ten pass afterward. A full source-suite checkpoint after this repair passed
4,078 tests and failed only the six already required Yjs cases (4,084 total).
That checkpoint predates the subsequent history changes described below.

`tests/split-comment-retention.test.ts` additionally found that a comment spanning
the split became orphaned on undo. Local history restored a document snapshot
using a blanket replacement map. Four comment ranges now remain attached through
split/undo/redo using recorded map sequences, including the range spanning the
new paragraph boundary.

## Exact compound mappings and compatibility

`Step.getMaps?()` optionally supplies a complete map sequence for an indivisible
operation. `Transform` appends that sequence and offers it to its existing
`onStepApplied` hook as an optional fourth positional mapper; the original third
`StepMap` parameter remains available. `Transaction` maps selection through the
complete sequence. `mapSelection` accepts the existing `PositionMapper` contract.

The method is optional so older custom step objects implementing just `apply`
and `getMap` remain valid. An integration test checks that original contract.
Another checks an exact deletion/insertion boundary where collapsing several
maps into one replacement triple would give the wrong association. Command-batch
replay of undo and redo preserves the sequence too. Declaration review checks
all 423 existing files: eight declarations contain these compatible mapping
changes; two DOM selection-handler declarations add an internal mapping hook.

`src/extensions/plugins/history.ts` stores inverse maps in weakly keyed,
persistent chains. Chain values contain positional maps, not model snapshots or
document references. Extending an input group is constant-time; restoration
traverses iteratively. A 2,000-insertion grouped-typing case checks exact undo and
comment retention. A built-engine retention probe performs 2,000 edits across
1,000 blocks with 32 bounded history groups and with one long group. All 36
sampled discarded roots are collected; exact undo and the established live/
released heap allowances pass. This scoped probe does not certify every host
plugin or collaborative history implementation.

## Independent text changes

An additional required test found that an independent insertion marked
`addToHistory: false` could disappear when undo restored an earlier snapshot.
Insertion rebasing now updates both undo and redo snapshots and their maps.
It preserves placement on either side of a split, text inserted inside an older
command's insertion, multiple history entries, and several independent insertions
in one transaction. Explicit `fountain$preserveHistoryGroup` appends remain part
of their owning undo group.

`src/core/transaction/rebase-insertion.ts` derives positional changes from
retained source intervals, without string matching or per-character allocation.
`tests/insertion-rebase.test.ts` compares it against a labelled-token oracle over
all small insertion/deletion/replacement boundaries, disjoint changes and a
ten-million-unit compact-range case. Retained source labels must survive without
being deleted and recreated; equal-looking output alone cannot pass that check.

The preceding focused checkpoint passed 35 cases and failed a required deletion:
split `Alpha` into `Al` / `pha`, independently delete `p`, then undo the split.
The old snapshot fallback restored `Alpha` instead of `Alha`.

`src/core/transaction/rebase-deletion.ts` now propagates deletion only through
retained source intervals. Target units inserted by an older command are not
silently included in a bounding deletion range. Snapshot projection removes
only actual text units, preserves structure/attributes/marks, and checks that
every requested unit was covered. A replacement rebases its deletion and then
its insertion in their correct coordinate spaces. Both undo and redo histories
are updated. Unsupported operations still use the existing fallback; this does
**not** establish general preservation of arbitrary unrecorded operations.

The expanded focused matrix passes all 48 cases in five files. It includes the
original deletion failure, empty suffixes, replacements, deletion after undo,
multiple history entries and mixed independent steps. A labelled-token oracle
checks small deletion/replacement boundaries, disjoint changes and compact
ten-million-unit maps. A separate actual-editor matrix verifies undo/redo for
every small independent deletion overlapping an earlier text replacement.
The implementation handles same-leaf `ReplaceTextStep` edits, including
`InsertTextStep`; structural, cross-block and other custom independent steps
remain outside that repair's scope.

The final source run passes 4,133 tests and fails the six required Yjs cases
(4,139 total / 282 files). Types, API, headless, package, workerd and performance/
retention checks pass. Actual local tarball consumers pass 28 root/core ESM/CJS
cases without DOM globals, and all 891 distribution files match the tested build.

Chromium, Firefox and WebKit pass 24 forward/backward wrapping workflows and
six native split/history scenarios. Complete JSON exports, undo/redo, reopened
readers and loaded image data are checked. Both recorded journeys are included
in ordinary browser CI. Thirty-six representative stage captures and twelve
sampled frames from three wrapping recordings were reviewed; continuous playback
and physical-device certification are not claimed.

Static root closure growth over the resize checkpoint is 12,841 raw / 4,001
gzip bytes, without consumer tree shaking. This is not a speed measurement.
Existing core-facade and aggregate size failures remain red; ceilings and runtime
dependencies are unchanged. The six Yjs retention failures still require a
representation repair; no storage migration has been implemented. Fresh full
CI remains required. [Verification](../artifacts/structural-history-verification-20261105.json).

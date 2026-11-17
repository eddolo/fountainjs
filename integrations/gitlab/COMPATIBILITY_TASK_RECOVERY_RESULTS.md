# Matched task recovery, reader controls and command intent — 2026-11-17

Two actual original GitLab CE 19.5.3/Fountain workflows produce **48 parity and
eight improvement checks**, with zero regression, shared limitation or incomplete
outcome. The eight improvements are repeated observations of one scoped-command
behavior. They are not eight separate capabilities. Both scoped gates pass;
overall GitLab/application acceptance remains unfinished.

## Equivalent workflows

Both sides receive identical fresh issue descriptions, first as ordinary Markdown
and then inside an explicit automatic-direction container. Each document has a
checked populated leaf task to remove, an untouched parent with a checked nested
task, bold text, a final unchecked task and a paragraph to replace.

Actual keyboard selection/deletion clears and removes the populated task; two
undo and two redo actions verify both structural and text recovery. The author
then types `/close`, saves normally and reopens. A reopened editor checkbox is
clicked, undone, redone and saved. Finally the real GitLab reader checkbox is
clicked, its persisted task counts are inspected, and the editor is reopened again.
No private editor API or direct document mutation performs these actions. API
writes only establish fresh fixtures; subsequent API calls inspect persisted data.

The fixture declares different command intent before either run:

| Profile | Required command outcome | Original | Fountain |
| --- | --- | --- | --- |
| Top-level active command | Close the issue and consume the command | Closed, text consumed | Closed, text consumed |
| Text inside the direction container | Keep the issue open and retain literal text | Closed, text consumed | Open, text retained |

Both editors pass populated **leaf checklist-item** deletion and recovery. This
is not deletion of a GitLab work-item record or of a parent task with descendants.
Nested neighbors, marks and completion states survive. Reopened editor checkboxes
and live reader checkboxes are visible/enabled and work in both profiles on both
sides. Backend counts progress from four tasks/one complete to four/two complete,
then four/three complete after the reader click. The final reload preserves them.

Fountain's scoped source contains an ordinary `dir="auto"` container with
`\/close`, and the reader displays `/close`. The root control proves that host
commands were not globally disabled: it genuinely closes the other test issue.
The same issue states persist through checkbox edits and the reader update.

This comparison is against the declared literal-container requirement. It proves
the pinned editor-plus-host workflow outcome, not a generic Tiptap defect or the
original editor's precise intermediate Save payload. The original final API source
has a plain container, no command text and a Closed state; those are observations,
not an isolated attribution to one internal layer.

## Visual review and checks

Original PNG bytes were inspected for both reader command outcomes, the removed
scoped task on both editors, native scoped reader content and its reopened editor,
and the native reopened root control. The task is gone without losing its nested
neighbors; reader checkboxes and the 3-of-4 completion display match API data.
The original container case visibly shows Closed and no `/close`; Fountain shows
Open and the literal line. The root control visibly shows Closed. The accurate
native integration-incomplete warning remains; no conversion-error alert appears.

All **1,437 GitLab integration tests across 56 files** and strict TypeScript pass.
The 69 focused comparison/readiness cases also pass. Production editor/codec code
is unchanged from the preceding `22899c18` repair; this checkpoint verifies that
repair's command/reader boundary through actual application effects. No dependency,
public API, package version, capacity limit or backend configuration changed.
This is not a fresh full-root/browser-matrix/upstream/hosted CI or release result.

## Startup failures are separate evidence

Original attempt 1 failed during `gitlab-ctl reconfigure` while restarting the
Nginx log service (exit 1, OOM false), before reaching any editor. Its exact
instruments and failure report remain retained. Native attempt 1 also exited
before authentication/editor use. Neither failure contributes an editor score.

The private runner now observes terminal container state and fails promptly on
confirmed exit/death instead of spending the remaining readiness timeout. It still
requires a running, healthy container and a real HTTP 200 response, retains the
300-second startup deadline and its polling intervals, and never restarts a
container itself. Its sanitized observations include state/health/exit code only.
Unit cases verify healthy-plus-HTTP readiness, immediate terminal failure and the
unchanged timeout behavior when a live service remains unavailable.

After each confirmed terminal attempt, an explicit fresh immutable attempt ran
against the same task-owned volumes/configuration. The final matched pair is
**original-2 versus fountain-2**, using identical fixtures, instruments, browser,
actor, pinned backend and resource caps. No server repair overlay was introduced.

## Evidence and reproduction

- [Final comparison](../../artifacts/gitlab-compatibility/task-recovery-20261117/comparison-1/report.md)
- [Original observations](../../artifacts/gitlab-compatibility/task-recovery-20261117/original-2/report.json)
- [Fountain observations](../../artifacts/gitlab-compatibility/task-recovery-20261117/fountain-2/report.json)
- [Validation and source/screenshot hashes](../../artifacts/gitlab-compatibility/task-recovery-20261117/validation.json)
- [Prior-corpus interpretation replay](../../artifacts/gitlab-compatibility/task-recovery-20261117/prior-corpus-replay.json)
- [Collector](../../scripts/audit-gitlab-compatibility-task-recovery.mjs)
- [Fixture](fixtures/compatibility-task-recovery.json)
- [Read-only startup gate](../../scripts/gitlab-deployment-readiness.mjs)

Use the [guarded deployment instructions](COMPATIBILITY_RESULTS.md#reproduce), a
fresh run ID and `--suite task-recovery` for each editor, then compare their actual
reports. Never overwrite a failed attempt, invent missing observations or repair
an unsuccessful UI action with an API write. The reader persistence wait records
an unsuccessful update as a false outcome; the comparator then rejects it. Keep
credentialed traces/video/session storage out of retained artifacts.

Remaining work includes parent/subtree deletion, reader context-menu operations,
not-applicable state, other command/permission contexts, multi-line/fenced/Unicode
and bidi mixtures, rapid input, mobile/other engines, concurrent users and restart.
Boundary task text is trimmed after controls are removed, so this is not a raw
whitespace/byte-integrity claim. Earlier Applied-history and blank-line suggestion
limitations remain open. No overall parity percentage or release claim is promoted.

The [reader-menu follow-up](COMPATIBILITY_TASK_MENU_RESULTS.md) adds 54 parity
checks for duplicate-target disable/restore/delete, not-applicable retention through
rich editing and authored strike preservation. Heading/prose observer corrections
are retained separately; no product improvement is credited to representation differences.

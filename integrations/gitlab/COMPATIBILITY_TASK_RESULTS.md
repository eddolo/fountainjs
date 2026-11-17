# Matched task editing and Save repair — 2026-11-17

The completed original GitLab CE 19.5.3/Fountain pair yields **22 parity and four
improvement checks**, with zero regression, shared limitation or missing outcome.
The four improvements concern one empty-task Enter behavior; they are not four
independent features. Both scoped gates pass. Overall GitLab acceptance remains open.

## Real workflow and result

The same pinned backend, actor, fixtures, Linux Chromium build and instrument
exercise checkbox toggling, undo/redo, nested tasks and bold text, Enter to create
an empty task, visible row height, typing, selecting/deleting its text, Backspace
to remove the empty task, removal undo/redo, then explicit Enter twice to exit the
list and type a paragraph. Normal Save and fresh rich-editor reopen complete it.
API calls create fixtures, inspect persisted data and probe rendering; they never
substitute for editing actions. No private editor commands or synthetic clipboard
payloads are used by the paired browser collector.

Both editors preserve the checked states, nested task and marks through the common
editing steps. The first new task is a physically separate visible row: 22.40625px
in the original and 25.90625px in Fountain. The different heights are not a score.
The pinned original adds another empty task on the empty-task Enter step; its final
paragraph becomes a sixth task. Fountain exits into a plain paragraph, retaining
four tasks. GitLab's actual saved `task_completion_status` independently reports
6 tasks / 2 complete versus 4 tasks / 2 complete. Reopened content matches those
outcomes. This is one settled profile per side, not a frequency or stress claim.

The fixture counts empty prose paragraphs and checks task text, completion,
nesting, marks, caret ownership, actual selected text and Save reachability.
Task text removes generated controls and trims boundary whitespace; this corpus
is not an exact whitespace, byte-integrity or Unicode conformance proof.

## Native Save blocker found and repaired

Before the repair, Fountain's visible final document was correct but Save was
blocked. The core correctly retained a shared automatic reading-direction context
when exiting the rendered list. The private GitLab codec rejected that
`direction_scope`, so its conversion-error guard refused to submit stale source.
The negative report and red-alert screenshots show that the initial source stayed
unchanged. The core was not rewritten and the submission guard was not bypassed.

Actual GitLab renderer probes ruled out accepting generic HTML blindly:
Fountain data attributes and bare checkbox inputs are stripped. An ordinary
`<div dir="auto">` containing Markdown retains the task controls and their source
positions. The adapter now emits that representation and imports a bounded plain
direction container. Nested unsupported content and external grouping metadata
still fail conversion. Scoped slash text is escaped outside fences so it cannot
be promoted to a host command; fenced code and explicit root commands retain their
existing behavior. That additional boundary has unit coverage; an actual host
command/permission matrix remains separate work.

The guarded installer updated the 28 owned files, and the actual pinned GitLab
frontend rebuilt successfully. The repaired candidate then passed real Save and
reopen with zero browser errors. Original PNG bytes were visually inspected for
new empty rows, list exit and reopened tasks/prose. A magnified read of the
unchanged reopened PNG confirms all four native checkbox controls are visible;
no checkbox-display defect was found. The red conversion error is absent in the
successful captures. The generic integration-incomplete warning remains accurate.

No public engine code, API, dependency, package version, size acceptance limit,
backend implementation or server repair overlay changed.

## Earlier experiments remain visible

- `task-editing-20261117/original-1`: unpaced original-only discovery. DOM caret
  placement and subsequent actions diverged; no comparative claim is made.
- `task-ready-20261117`: removal diagnostic. Its final paragraph expectation was
  unjustified: Backspace removes the empty item into the preceding task. The final
  workflow explicitly performs list exit before typing the paragraph. The two
  diagnostic records are not scored as shared limitations or improvements.
- `task-lifecycle-20261117/original-1`: editor outcomes were recorded, but a reopen
  helper incorrectly required the expected four checkboxes as a loading condition.
  Six were present. The helper now waits for document readiness, leaving task count
  as a compared outcome. The failed original attempt is retained.
- `task-lifecycle-20261117/fountain-1`: genuine pre-fix Save failure, retained.
- `task-lifecycle-20261117/fountain-2`: startup failed before editor use. The
  container exited 1 during Sidekiq log-service reconfiguration, OOM false. No
  backend change was made to bypass it. The confirmed terminal attempt is retained.
- Final pair: **original-2 versus fountain-3**, matching fixtures and instruments.

These corrections prevent collector mistakes, infrastructure failures and
unmatched observations from becoming product-comparison claims.

## Evidence and reproduction

- [Final comparison](../../artifacts/gitlab-compatibility/task-lifecycle-20261117/comparison-1/report.md)
- [Original observations](../../artifacts/gitlab-compatibility/task-lifecycle-20261117/original-2/report.json)
- [Fountain observations](../../artifacts/gitlab-compatibility/task-lifecycle-20261117/fountain-3/report.json)
- [Validation, source and screenshot hashes](../../artifacts/gitlab-compatibility/task-lifecycle-20261117/validation.json)
- [Captured sanitizer responses](fixtures/direction-live-html.json)
- [Earlier-corpus interpretation replay](../../artifacts/gitlab-compatibility/task-lifecycle-20261117/prior-corpus-replay.json)
- [Task collector](../../scripts/audit-gitlab-compatibility-tasks.mjs)
- [Task fixture](fixtures/compatibility-tasks.json)

All **1,426 GitLab integration tests across 55 files** pass with two workers.
The final focused policy/service regression run passes 62 cases and strict
TypeScript passes. The empty-task serialization regression failed before the fix.
The previous full-root check belongs to the preceding public CSS checkpoint; this
private adapter change does not claim a newly rerun full-root/browser/hosted suite.

Follow the [guarded deployment instructions](COMPATIBILITY_RESULTS.md#reproduce),
using a fresh immutable run ID and `--suite tasks` on each editor. Compare the two
reports with `scripts/compare-gitlab-compatibility.mjs`. Preserve failed attempts;
never replace a failed observation with an API write or discard it after a retry.
Credentialed traces/video/session storage are not retained; this pair uses PNG
captures and exact persisted source/API receipts.

Remaining scope includes rapid input, whole nonempty-task deletion/selection,
not-applicable-state lifecycle, reordered/nested structures, RTL/bidi mixtures,
IME/mobile/other engines, reader-mode checkbox interaction, permission/command
matrices, concurrency/restart and broader application acceptance. The earlier
shared Applied-history and blank-line suggestion limitations remain open. No
overall roadmap percentage or publication claim is promoted by this checkpoint.

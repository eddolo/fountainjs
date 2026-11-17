# Matched reader checklist menus and third-state retention — 2026-11-17

Two real original GitLab CE 19.5.3/Fountain profiles verify **54 parity checks**,
zero improvements, regressions, shared limitations or incomplete outcomes. Both
scoped gates pass. These are correlated requirements in two workflows, not 54
independent features or overall application acceptance.

## Workflow and observed behavior

The same pinned backend, actor, Linux Chromium, instruments and fixture content
are used sequentially. One input is plain Markdown; the other places the list in
an explicit automatic-direction container. Both have two items named `Repeated
task`: a root item with authored strikethrough and a nested pending item.

Actual reader menu actions target only the nested duplicate. The workflow:

1. Opens the real rich editor, appends a marker and saves normally.
2. Hovers the nested reader item and uses **Disable list item**.
3. Reloads and reopens rich editing while that item is not applicable, appends
   another unrelated marker, saves, and returns to the reader.
4. Uses **Enable list item**, then **Delete** on that same nested item.
5. Reloads and reopens again to verify the final document.

Both implementations preserve the intended categorical states, nesting, prose,
bold and authored strike. The not-applicable state survives rich editing as
`[~]`, without turning generated decoration into authored strike. Restore makes
only that item pending; Delete removes only its source line. The other identically
named root item remains pending and retains its authored strike throughout.

Exact API source before/after each menu operation confirms that only the intended
marker character or leaf line changes. The receipt records the actual target text,
depth and source position. Backend task totals are 3 with one complete while the
item is disabled, 4/1 after restoration and 3/1 after deletion. Both issues remain
Open. API writes create the fixture only; editing, menus and Save use actual UI
controls. The APIs inspect persisted state and never repair an unsuccessful UI step.

This is removal of a nested leaf checklist item, not deletion of a GitLab work-item
record, parent/subtree deletion or conversion into a child work item.

## Fair observation and retained earlier attempts

The initial original attempt saved the authoring change but stopped at an incorrect
reader-heading readiness check. GitLab appends an anchor with an accessible name,
so an exact heading-role lookup did not match although the heading was visible.
Recorded diagnostics prove the reader root exists, its heading text is correct,
and the old exact-name query returns zero. The corrected gate checks rendered
heading text in the actual reader container; it is not an accessibility assessment.

The second original attempt completed both menus, but its observer counted prose
only inside `p` elements. The original can render text after a raw HTML container
as orphan flow text. That text was visible, and its absence from the graph was an
observer error. The final observer normalizes equivalent visible flow text while
preserving paragraph order and explicit blank paragraphs. Captured original DOM
fixtures and focused tests lock in that correction. No score is claimed from the
earlier missing graph value, and no product code was changed to force matching DOM.
This text observation does not prove identical DOM roles, spacing or accessibility.

Those attempts and exact instruments are retained. The accepted pair is
**original-3 versus fountain-1**, with unchanged document/state requirements.

## Verification and visual evidence

All **1,452 GitLab integration tests across 57 files** and strict TypeScript pass.
The focused policy/observer suite passes 81 cases. The observer's typed DOM tests
use the existing test environment; no dependency or type-check suppression for
jsdom was added. This checkpoint changes private audit scripts, fixtures, tests
and documentation only. The editor runtime remains the preceding verified repair.

Original PNG bytes were visually inspected for both scoped menus, the disabled
native editor, retained/reenabled native reader and final reopened document, plus
the original plain reader and native plain final document. The context menu visibly
belongs to the nested duplicate. Generated inactive decoration and authored strike
remain distinct; after restoration only the authored strike remains. Final reload
shows the nested item gone and the root duplicate/other content intact. The native
integration-incomplete warning remains accurate; there is no conversion-error alert.

- [Final comparison](../../artifacts/gitlab-compatibility/task-menu-20261117/comparison-1/report.md)
- [Original observations](../../artifacts/gitlab-compatibility/task-menu-20261117/original-3/report.json)
- [Fountain observations](../../artifacts/gitlab-compatibility/task-menu-20261117/fountain-1/report.json)
- [Validation/source/screenshot hashes](../../artifacts/gitlab-compatibility/task-menu-20261117/validation.json)
- [Captured reader DOM](fixtures/task-reader-live-dom.json)
- [Prior-corpus interpretation replay](../../artifacts/gitlab-compatibility/task-menu-20261117/prior-corpus-replay.json)
- [Collector](../../scripts/audit-gitlab-compatibility-task-menu.mjs)
- [Fixture](fixtures/compatibility-task-menu.json)

Use the [guarded deployment instructions](COMPATIBILITY_RESULTS.md#reproduce),
a fresh immutable run ID and `--suite task-menu` for each editor. Compare their
actual reports with `scripts/compare-gitlab-compatibility.mjs`. Keep failed attempts
and observer corrections separate from completed comparisons. Credentialed traces,
video and session storage are not retained.

Public runtime/API, dependencies, package version, backend configuration, resource
caps and size/performance acceptance limits are unchanged. This is not a fresh
full-root/browser-matrix/upstream/hosted CI or release result.

Remaining work includes parent/subtree deletion, conversion to child items,
keyboard menu navigation, other roles, concurrent editors/restart, wider source
formats and Unicode/bidi content, mobile/other engines and full layout/accessibility
acceptance. Boundary text is trimmed after generated controls are removed; raw
whitespace/byte retention across rich canonical export is not claimed. Earlier
Applied-history and blank-line suggestion limitations remain open. No overall
parity percentage or publication claim changes.

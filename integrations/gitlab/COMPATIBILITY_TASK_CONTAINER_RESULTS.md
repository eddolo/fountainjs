# Quoted/container child-task conversion — 2026-11-17

The accepted GitLab CE 19.5.3/Fountain pair records **63 parity and 41 improvement
checks across 104 requirements**, with zero regressions, shared limitations or
incomplete outcomes. Environment, collection, regression and scoped feature gates
pass. The pair is **original-3 / fountain-3**, interpreted by comparison-1. These
are correlated requirements in four workflows, not 104 independent features or
full GitLab acceptance.

## What now works

The actual reader Convert to child item action preserves technical source when a
checklist is inside a quote, two nested quotes, a quote within a parent task, or
a quote sharing its opening line with an ordinary parent list item. The tested
workflow edits and saves the parent, opens the real conversion menu, creates a
real Task, reloads and resaves the parent, and reopens the child. Read-only backend
queries verify source, task totals and the correct parent identity. API writes
create fixtures only; the tested actions use normal UI controls.

Children receive the title `Convert this item`, without quote/list syntax. Their
prose, bold text, link and relative Python indentation survive. A literal
`- [ ] literal source` inside a Python string remains code, never a new checkbox.
The remaining nested checklist stays in its parent quote/list, promoted by one
level. An ordinary enclosing list opener is retained when it shared the target's
first source line. Parent markers outside the quote remain outside after Save.

The original host extraction leaks quote/list prefixes into titles and moves
nested checklist content into children. The deeply quoted example becomes a code
block containing literal Markdown. These are pinned GitLab integration findings;
they do not establish a general Tiptap or ProseMirror engine defect.

Two improvement checks concern **preexisting** Fountain import/Save preservation
of the inline enclosing-list task depth. GitLab's actual renderer preserves that
structure too, while its original rich editor flattens it on Save. Those two
checks are not attributed to the newly changed extraction helper.

## Small boundary repair

`services/task_body_extractor.js` accepts the real rendered list item's
`data-sourcepos` column. A bounded prefix parser separates parent quote/list
containers from task-owned source. It removes only the parent prefix and active
structural indentation, keeps code indentation and inner authored quotes, and
retains an inline enclosing-list opener when removing the target. The helper
remains pure string processing, usable in Node without a DOM.

`services/task_conversion_patch.mjs` passes the source position and consumes the
resulting title and optional retained prefix at exact guarded host boundaries.
The version-14 installer still owns 30 files. No public engine API, dependency,
stylesheet, package version or acceptance budget changed. No release was made.

Read-only renderer responses are retained in `renderer-1.json`; the regression
fixture includes the actual HTML and independently extracted source positions.
Unit coverage includes nested containers, CRLF, lazy continuation, authored inner
quotes and literal checkbox-looking code. Unknown/custom prefixes and tabbed
outer-container prefixes keep the legacy host path and its limitations. They are
not covered by this fidelity claim; tab/source-column ambiguity remains open.

## Evidence quality

The pre-repair pair (original-3 / fountain-2) records 62 parity, two improvements,
one regression, 31 shared limitations and eight divergent-failure outcomes. The
eight contribute to the incomplete summary because the sides failed differently,
not because the collectors omitted observations. The native regression was
inline-container parent task counts after resaving. Raw findings and the exact
pre-repair production inputs remain retained.

Original-2 stopped after three completed cases because its readiness check
incorrectly required formatted prose in the malformed deep-quote result. The
corrected check waits for representation-neutral editor text and then evaluates
formatting separately. Original-3 completed all four. Original-1 and fountain-1
exited during GitLab startup before sign-in (exit 1, OOM false). No timeout,
acceptance requirement or backend behavior was relaxed. Instruments and failures
remain archived; failed attempts contribute no improvement claims.

The semantic comparison's exact collector is archived in `semantic-instrument`.
A later **native-only fountain-4** visual follow-up collapses Similar items through
normal UI controls, scrolls the code into view, and verifies its rectangle against
the viewport and every clipping ancestor. All four code blocks are fully visible.
Its graph snapshots, child source/title and parent links match fountain-3 exactly.
This follow-up has no new matched-comparison score because the capture instrument
changed. The full code-prefill PNGs were visually inspected, alongside selected
saved-parent/reopened-child PNGs and the original malformed child.

## Verification and remaining work

- **1,500 integration tests / 58 files**, two workers, and strict TypeScript pass.
- GitLab's **26 checklist-helper tests** and lint pass against the installed repair.
- Native runtime and GitLab frontend builds pass; two existing Rspack warnings remain.
- All **13 prior corpora** retain exact summaries and gate outcomes under replay,
  including earlier red results. These are interpretation replays, not new browser runs.
- Runtime input hashes, all 30 installed file hashes, exact log bytes and selected
  screenshot bytes are checked and retained in the validation receipt.

The pinned backend, root actor and Linux Chromium configuration are matched.
Other roles, platforms, unsupported container prefixes, broader UI polish and
full application acceptance remain open. Investigate the recurring cold-start
reconfiguration exits separately; the editor audit did not repair the backend.
GitHub push and hosted CI await CLI sign-in. The incomplete-integration warning
remains accurate.

- [Accepted invariant table](../../artifacts/gitlab-compatibility/task-containers-20261117/comparison-1/report.md)
- [Raw original observations](../../artifacts/gitlab-compatibility/task-containers-20261117/original-3/report.json)
- [Raw repaired observations](../../artifacts/gitlab-compatibility/task-containers-20261117/fountain-3/report.json)
- [Native visual follow-up](../../artifacts/gitlab-compatibility/task-containers-20261117/visual-followup-checks.json)
- [Validation receipt](../../artifacts/gitlab-compatibility/task-containers-20261117/validation.json)

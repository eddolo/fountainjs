# Source-preserving GitLab child conversion repair — 2026-11-17

The accepted real GitLab CE 19.5.3/Fountain pair records **66 parity and 14
improvement checks across 80 requirements**, with no regressions, shared limitations
or incomplete results in this corpus. Both scoped gates pass. The accepted pair
is **original-3 / fountain-2**, interpreted by comparison-2. These are correlated
requirements in four workflows, not 80 independent features or global GitLab acceptance.

| Workflow | Parity | Improvement |
| --- | ---: | ---: |
| plain-conversion | 17 | 3 |
| scoped-conversion | 17 | 3 |
| ordered-conversion | 15 | 5 |
| nested-conversion | 17 | 3 |

## Repaired behavior

The reader's actual Convert to child item action now preserves the relative
indentation of technical source when creating a child Task. For example:

```python
def identity(value):
    return value
```

The four-space indent survives the untouched creation prefill, exact persisted
child description and reopened child editor. The original loses it in each
profile. The native frontend also strips the full ordered marker from an item
numbered `10.`; the original creates a child titled `10. [ ] Convert this item`.
Those source/title differences account for all 14 correlated improvement checks.
Their owner is GitLab's frontend extraction utility, not a demonstrated defect
in Tiptap's underlying document engine.

Both implementations create real Task records with the correct parent identity,
promote the remaining nested checkbox as intended, preserve the siblings, bold
text and link, and keep parent issues Open. The nested-target case preserves its
outer checklist parent and correct child depth. Every parent is reloaded, edited
again through the real rich editor, saved normally, and reloaded again. Actual
backend task counts, source and read-only hierarchy queries verify the result.
Fixture creation is the only API write; the tested workflow uses actual UI controls.

The earlier native extra paragraph after a terminal direction container is
repaired in the private host adapter. A terminal editable text block already
provides a caret. Tables, lists and atomic endings retain the normal exit repair,
and authored empty paragraphs are never deleted. The unchanged strict DOM graph
now passes after both reloads; no generic blank-paragraph normalization was added.

## Implementation and ownership

`services/task_body_extractor.js` removes only structural list indentation using
tab-stop columns. It retains code whitespace, trailing spaces and invisible code
points, recognizes fenced/indented source so checkbox-looking code is not promoted,
and recognizes CRLF fences without rewriting the technical source's line endings.
Ordered marker/title support covers the bounded marker form used by the parser.
The pinned helper is transformed by `services/task_conversion_patch.mjs`; the
original source fixture and every replacement boundary are guarded.

Quoted/custom prefixes outside the verified list cases stay on GitLab's existing
extraction path, including its existing limitations. A compatibility test confirms
that this change does not newly reject them. They are **not** covered by the source-
preservation claim above and still need dedicated fidelity work.

`services/footnote_boundary.ts` extends the existing host caret adapter to terminal
direction containers with a directly editable final text block. The public engine's
trailing-block policy remains unchanged. Unit controls retain repairs after lists,
tables and atomic blocks, preserve authored blanks, and verify typing, Enter and
undo/redo inside the container. Enter/undo/redo controls are unit coverage; the real
browser corpus verifies typing, Save and reload, not every keyboard/platform case.

The version-14 installer owns 30 frontend files. It checks the exact pinned source,
existing owned-file hashes, symlinks and installation paths before writing. Its
restore smoke test returned the original utility byte-for-byte and removed only
the owned helper; reinstall succeeded. No backend, public API, dependency, package
version, stylesheet, acceptance budget or published distribution was changed.

## Observation quality and excluded attempts

Comparison-1 is explicitly **excluded**. Three original reload snapshots were taken
while the description was still loading. The retained plain screenshot visibly
shows skeletons and a spinner, while persisted source is intact. These were not
three Fountain wins. The corrected collector waits for the exact saved marker or
child prose before reading either editor. Task/code results are then inspected
separately, so the readiness gate does not assume those results are correct.
The original collector, production-candidate inputs, reports and images are retained.

Original attempt 2 exited during GitLab reconfiguration before sign-in, with
exit code 1 and OOM false. It produced no editor observations. Only a fresh attempt
was made after the terminal exit was confirmed; no timeout or acceptance limit was
relaxed and no backend repair was applied.

Initial malformed unit fixtures and a fence-state mistake caught during lint
cleanup were corrected before the accepted browser pair. Diagnostic logs remain
retained. The final focused regressions, full affected suite and upstream checks
all pass; no failed attempt is relabeled as successful product evidence.

## Verification and limits

- **1,485 integration tests / 58 files** pass with two workers; strict TypeScript passes.
- GitLab's own **26 checklist-helper tests** and lint pass against the final install.
- Native runtime and GitLab frontend builds pass; Rspack retains two existing warnings.
- All twelve historical corpora keep their exact classifications and gate outcomes
  under interpretation replay, including the old red conversion audit. Replays
  are not fresh browser runs.
- Raw source/API receipts, immutable comparison inputs, content-readiness receipts,
  original PNG bytes, installer/build hashes and exact log archives are retained.
- Selected PNGs from the accepted pair were visually inspected. Native prefills
  show the corrected title and visible code indentation; reopened children retain
  it, and scoped/nested parents retain their structure after resaving. The nested
  prefill's code falls below the initial modal viewport because Similar items is
  expanded; its code is visible and reviewed in the reopened child. No claim is
  made that every item fits into one screenshot.

The same pinned backend, root actor, Linux Chromium, browser configuration and
fixture definitions are used sequentially. Other roles, browsers, arbitrary
Markdown/quoted-container fidelity, full UI polish and broader application
acceptance remain open. The native incomplete-integration warning remains accurate.
GitHub push/hosted CI still await CLI sign-in; no release was made.

- [Accepted comparison](../../artifacts/gitlab-compatibility/task-conversion-repair-20261117/comparison-2/report.md)
- [Original observations](../../artifacts/gitlab-compatibility/task-conversion-repair-20261117/original-3/report.json)
- [Native observations](../../artifacts/gitlab-compatibility/task-conversion-repair-20261117/fountain-2/report.json)
- [Validation/source/image hashes](../../artifacts/gitlab-compatibility/task-conversion-repair-20261117/validation.json)
- [Excluded loading-state comparison](../../artifacts/gitlab-compatibility/task-conversion-repair-20261117/comparison-1/EXCLUDED.md)
- [Loading-state diagnosis](../../artifacts/gitlab-compatibility/task-conversion-repair-20261117/reload-readiness-diagnosis.json)
- [Historical replay](../../artifacts/gitlab-compatibility/task-conversion-repair-20261117/prior-corpus-replay.json)
- [Fixture](fixtures/compatibility-task-conversion.json)
- [Collector](../../scripts/audit-gitlab-compatibility-task-conversion.mjs)

Use a fresh immutable run ID with the guarded runner and `--suite task-conversion`
for both sides. This evidence closes the demonstrated source/title and extra-
paragraph gaps in these workflows; it does not declare the full integration finished.

Follow-up: [quoted/container conversion repair](COMPATIBILITY_TASK_CONTAINER_RESULTS.md)
verifies the separately recorded four-case corpus. Historical results above remain
unchanged; broader application acceptance is still open.

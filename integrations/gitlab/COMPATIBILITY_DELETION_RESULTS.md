# Matched GitLab deletion suggestion results

## November 19 follow-up

Four merge requests per editor exercised an empty replacement, a newline, deletion of two middle lines, and a replacement containing U+00A0, a tab and U+3000. Both backends retained the exact posted Markdown and applied each deletion in one commit. The two-line case left both neighboring lines intact. Fountain reopened the three original characters in rich editing. Stock GitLab reopened them as space, tab, space. Fountain required consent before proposing either whitespace-only deletion. GitLab still removes the target lines on Apply, even if the author intended a blank line. [52 parity and eight improvements on Chromium 151](../../artifacts/gitlab-compatibility/range-whitespace-20261119/comparison-3/report.md).

[Attempt one](../../artifacts/gitlab-compatibility/range-whitespace-20261119/comparison-1/report.md) exposed Fountain rejecting the saved Unicode proposal on reopen and stock losing its suggestion block after clearing it before insertion. Attempt two used a single browser text insertion over the verified selected range. Its [first scoring](../../artifacts/gitlab-compatibility/range-whitespace-20261119/comparison-2/report.md) expected a closing Markdown fence on the same line as nonempty text. The corrected comparison used the same immutable browser receipts, checked the rich-input characters independently, and required the newline preceding the closing fence.

## November 16 baseline

Run: 2026-11-16, `deletion-keyboard-20261116`. Same pinned GitLab CE 19.5.3
backend/image, Chromium build, project/default head, actor, fixture and collector
hashes on both sides. The native frontend is the declared difference. No server
repair overlay or editor engine change was introduced for this audit.

[Machine-readable comparison](../../artifacts/gitlab-compatibility/deletion-keyboard-20261116/comparison-1/report.json)
and [complete invariant table](../../artifacts/gitlab-compatibility/deletion-keyboard-20261116/comparison-1/report.md).
This is a separate two-scenario pair from the [first source-handoff corpus](COMPATIBILITY_RESULTS.md);
the older results and their unmet requirements remain unchanged.

## Actual workflows

Both sides start from `old();\nkeep();\nlast();\n` on a fresh isolated source
branch. Select line 1 in actual Rapid Diffs and insert a suggestion through the
rich editor. Wait the same declared 1500 ms before editing. Propose either:

- empty replacement source, `""`;
- one literal newline as the entire replacement source, `"\n"`.

The original driver clicks the editable code source, uses Home/Shift+End,
verifies the browser selection is exactly `old();`, deletes it with Backspace,
and presses Enter for the newline case. The Fountain driver uses its actual
Edit suggestion dialog. Neither invokes an editor command/model API or writes
a note through REST. Consent presence and action disabled state are measured.

Inspect source mode without repairing its output, add only a prose marker, post
normally, verify exact saved Markdown and untouched source repository, reload,
reopen rich editing and inspect source again. Cancel that inspection without
saving. Apply the saved proposal through GitLab's normal custom-message control,
then verify the exact resulting file and a single child commit of the seed.
API calls set up fixtures and inspect results; all proposal writes/application
use the real UI. Both create exactly `keep();\nlast();\n` when applied.

## Observed outcomes

| Classification | Invariant outcomes |
| --- | ---: |
| Parity | 26 |
| Improvement | 4 |
| Regression | 0 |
| Shared limitation in these declared deletion invariants | 0 |
| Missing/inconclusive | 0 |

The four improved checks concern three behaviors, with explanation checked in
both scenarios:

1. **Explicit effect explanation.** The original displays its suggestion diff.
   Fountain additionally explains in words that the target lines will be deleted;
   whitespace source explicitly says it will not produce blank lines.
2. **Affirmative whitespace-deletion intent.** Fountain's Apply deletion action
   is disabled until the visible checkbox is selected. The original accepts the
   directly edited whitespace proposal without that extra confirmation.
3. **Exact source after reopening.** Both initially save the one-newline source
   exactly. Reopening it through the original rich editor and switching to source
   presents an empty replacement; Fountain retains the newline. The inspection
   is canceled, so this finding does not claim that the already saved source was
   overwritten in this workflow.

All remaining checks have parity, including exact initial editing/saving, offsets,
no early repository writes, application to only the intended line, one apply
commit, and Applied metadata immediately after that commit.

The regression gate and candidate acceptance **for this deletion fixture** pass.
This does not close meaningful blank-line replacement: the unchanged stock
backend still deletes whitespace-only suggestions. It does not close Applied
history through prose-only editing, which fails in the separate matched corpus.
No overall GitLab parity, global editor acceptance or release approval follows.

## Reproduce

Use the prepared isolated Linux runtime/assets in [runtime instructions](runtime/README.md).
The task application must be stopped before mode switching. Choose a fresh ID;
collectors refuse to overwrite evidence and preserve backend volumes. Run modes
sequentially against the same pinned setup:

```sh
PAIR_ID=deletion-example-20261116
node scripts/run-gitlab-compatibility.mjs --editor original --run-id "$PAIR_ID" --suite deletions
node scripts/run-gitlab-compatibility.mjs --editor fountain --run-id "$PAIR_ID" --suite deletions
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$PAIR_ID/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$PAIR_ID/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$PAIR_ID/comparison-1"
```

Omitting `--suite` retains the original `suggestions` fixture. Comparison policy
keeps source preservation distinct from an equivalent destructive file effect.
A missing or differently failing observation remains unclassified.

## Evidence and limits

- [Original observations](../../artifacts/gitlab-compatibility/deletion-keyboard-20261116/original-1/report.json)
- [Fountain observations](../../artifacts/gitlab-compatibility/deletion-keyboard-20261116/fountain-1/report.json)
- [Pinned source and actual packaged server provenance](../../artifacts/gitlab-compatibility/deletion-keyboard-20261116/source-provenance.json)
- [Retained generic-fill discovery](../../artifacts/gitlab-compatibility/deletion-20261116/original-1/report.json), excluded from paired classifications. It failed to clear the intended source and produced an extra block in the second case. Physical screenshot inspection caught the problem; the corrected driver verifies actual browser selection.
- [Original corpus replay with the extended comparator](../../artifacts/gitlab-compatibility/switch-20261116/comparison-3/report.json): unchanged 20/12/0/4 outcomes across 36 checks.

Actual screenshots were inspected for original/native deletion drafts, native
warning/disabled checkbox state, and the reopened source fields. Exact saved
Markdown and repository bytes provide newline/commit evidence. No credentialed
traces, video or storage state are retained. Fresh verification: 1381 integration
tests across 54 files, including 17 comparison-policy tests, and strict
TypeScript pass. The task deployment is stopped after collection.

Only one Linux Chromium run per scenario is covered. This corpus uses a
single-line target and one newline; it does not establish multiline/range-change,
all-Unicode whitespace, repeated/concurrent/role, mobile, Firefox/WebKit or matched
restart behavior. The prior native Unicode predicate/undo/restart tests are
separate evidence, not an original-editor comparison. No runtime/public API,
capacity, version, publication, website marketing or overall parity row changes.

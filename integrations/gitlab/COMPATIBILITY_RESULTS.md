# Matched GitLab editor compatibility results

First paired run: 2026-11-16. Candidate editor source: `95c5cea1`;
GitLab CE 19.5.3 / source `0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf`.
The upstream dependency lock pins Tiptap core/PM/Vue to 2.27.3. Both active editor
roots were observed in the real UI, separately from that source provenance.

[Machine-readable comparison](../../artifacts/gitlab-compatibility/switch-20261116/comparison-2/report.json)
and [complete invariant table](../../artifacts/gitlab-compatibility/switch-20261116/comparison-2/report.md).

## What was compared

The packaged original GitLab frontend and the native Fountain asset overlay ran
sequentially against the same stock GitLab image and task backend volumes. No
server repair overlay was used on either side. Browser build, viewport, locale,
actor/permissions, project/default head, server-file hashes, backend configuration,
fixture declaration and collector code hashes match. The asset selector/mount and
active editor implementation are the declared differences.

Four matched scenarios cover ordinary text and a three-line selection containing
literal backslash-n, actual U+E000, U+200B and trailing spaces. Each input has two
predefined profiles: no artificial delay before requesting a source switch, and
a 1500 ms settling delay before the switch. Both observe the first visible source
value and its value after another 1500 ms. Timing records identify entry into the
switch action, not completed pointer latency or a performance benchmark.

The immediate profile ends after the handoff. The settled profile continues
through a visible source edit, comment posting, reader reload, real repository
application, and prose-only editing of the applied discussion. Fresh fixtures on
independent source branches prevent one side from consuming the other's changes.
The original output is never corrected before saving/applying.

## Observed outcomes

| Classification | Invariant outcomes |
| --- | ---: |
| Parity | 20 |
| Improvement | 12 |
| Regression | 0 |
| Shared limitation | 4 |
| Missing/inconclusive | 0 |

These are 36 checked outcomes across four scenarios, not 36 independent features.
The improvements primarily concern two underlying problems:

1. **Rapid rich-to-source handoff.** The original editor visibly contained the
   inserted suggestion but exposed an empty Markdown field when switched without
   the declared settling delay. It remained empty after the observation window.
   Fountain retained the replacement text and offsets in these matched runs.
2. **Source transport collision.** Rapid Diffs represents literal backslash-n as
   U+E000. The original rich editor prefills from that lossy transport; its saved
   proposal and applied repository file changed the literal sequence to U+E000.
   Fountain's raw-file prefill preserved both original values distinctly through
   saving and real application. Zero-width text and trailing spaces remained exact.

The ordinary settled workflow has equivalent saved source, target offsets,
repository effects and prose edits. Both implementations clear the Applied flag
and replace the suggestion record after an unchanged proposal receives a prose-only
comment update. These are verified shared limitations in the host workflow;
application history remains an unmet requirement. The stock REST control from the
previous checkpoint supports the server attribution but was not used instead of
an original-editor UI run in this comparison.

No regressions were observed in this corpus. The regression gate passes for the
recorded pair. Absolute feature acceptance remains false because the shared
application-history requirements fail. Broader editor capability/readiness is
tracked separately from these outcomes.

## Subsequent matched corpus

The [deletion pair](COMPATIBILITY_DELETION_RESULTS.md) adds two real workflows
and 30 checks: 26 parity, four improvement, zero regression. It verifies explicit
effect explanation, whitespace consent and exact source reopening. It does not
close the shared history failure in this first corpus or add blank-line
replacement support to the stock backend.

The [posted-review pair](COMPATIBILITY_REVIEW_RESULTS.md) subsequently adds
21 parity checks for source/range editing, undo/redo and exact save/reopen/apply.
It leaves the Applied-history failure above open.

The [rich clipboard pair](COMPATIBILITY_CLIPBOARD_RESULTS.md) adds 84 parity
checks with recorded caret/clipboard preconditions and visible capture guards.
Its earlier timing-sensitive anomaly is retained without a superiority claim.

The [directed partial-selection pair](COMPATIBILITY_PARTIAL_RESULTS.md) adds
four paced keyboard/pointer cases, with explicit document-ready evidence and
semantic caret-wrapper handling. Rapid-input failures remain separate/open.

## Reproduce

Use the matching Linux Docker environment and the prepared native source/assets
from the [runtime instructions](runtime/README.md). Run from the repository root
with its dependencies and Playwright browser installed. Stop the isolated task
application first; the guarded runner refuses to replace a live deployment. It
preserves backend volumes and stops only its own application after each run.

Choose a fresh run ID; output directories are immutable and cannot be overwritten.
For example, in a Linux shell:

```sh
PAIR_ID=compatibility-20261116-example
node scripts/run-gitlab-compatibility.mjs --editor original --run-id "$PAIR_ID"
node scripts/run-gitlab-compatibility.mjs --editor fountain --run-id "$PAIR_ID"
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$PAIR_ID/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$PAIR_ID/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$PAIR_ID/comparison-1"
```

Do not run the editor modes in parallel against this shared application. A failed
collector preserves its report/screenshots and exits nonzero; inspect the failure
before using an explicit new attempt. Comparison requires both real reports and
leaves missing, mismatched or different failures unclassified. It exits nonzero
on a regression or incomplete comparison. Its zero exit is a scoped compatibility
result, not overall product acceptance or a release approval.

## Evidence and limits

- [Original observations](../../artifacts/gitlab-compatibility/switch-20261116/original-1/report.json)
- [Fountain observations](../../artifacts/gitlab-compatibility/switch-20261116/fountain-1/report.json)
- [Pinned source/package provenance](../../artifacts/gitlab-compatibility/switch-20261116/source-provenance.json)
- [Earlier discovery run](../../artifacts/gitlab-compatibility/suggestions-20261116/original-1/report.json), retained separately and excluded from pair classifications.

Screenshots were physically reviewed for the empty/retained handoff and the
distinct/collided replacement source; exact API payloads and repository contents
provide the character-level evidence. Credentialed traces/video/session storage
are not retained. Current scoped checks: 1377 integration tests across 54 files,
including 13 interpretation-policy tests, and strict TypeScript pass. This adds
no engine runtime change; the previous 555 native upstream tests remain the
runtime baseline, not a newly rerun suite for these audit-only changes.

This is one matched Linux Chromium run per scenario, not a frequency/stress claim,
a Firefox/WebKit/mobile result, a general latest-Tiptap benchmark or a matched
cold-restart/role/concurrency result. The [suite plan](COMPATIBILITY_SUITE_PLAN.md)
retains the wider workflow requirements. No overall parity row, public API,
capacity limit, package version, publication or website marketing claim changes.

The [caret-ready cross-paragraph pair](COMPATIBILITY_CROSSBLOCK_RESULTS.md)
adds 188 parity and 16 improvement checks across four workflows. The improved
checks concern one plain-text separator-loss behavior. The first native run's
Save-obstructing link popup was repaired and verified in fresh real workflows;
its negative evidence remains retained. This does not close the Applied-history
failure above or establish wider GitLab/Tiptap acceptance.

The [rectangular table pair](COMPATIBILITY_GRID_RESULTS.md) adds 42 parity checks
after repairing a visually confirmed native selection-paint regression. Initial
semantic-only success and negative evidence remain retained. Three desktop
engines pass the dedicated pixel regression; wider table/platform scope remains.

The [matched task lifecycle](COMPATIBILITY_TASK_RESULTS.md) adds 22 parity/four
improvement checks after repairing a native list-exit Save blocker. The four
improvements concern one empty-task Enter behavior. Prior diagnostic/collector
and startup failures remain retained; wider task/role/platform coverage remains.

The [matched recovery follow-up](COMPATIBILITY_TASK_RECOVERY_RESULTS.md) verifies
populated leaf-item deletion, reopened/reader checkbox updates and actual command
effects. It adds 48 parity/eight correlated improvement checks for one scoped
literal-text boundary, with a working active-root control. Wider task/role/platform
coverage remains; original/native startup failures are retained separately.

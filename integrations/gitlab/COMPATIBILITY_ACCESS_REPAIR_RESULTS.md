# Revoked-save draft retention repair — 2026-11-17

The final accepted **original-1 / fountain-2** pair records **24 parity and seven
improvement checks across 31 requirements**, with no regressions, shared failures
or incomplete outcomes. Matched collection, scoped feature acceptance and the
separate UI feedback gate pass. These are correlated checks for two access
workflows, with one draft-loss repair; they do not establish full GitLab parity.
The historical red audit remains unchanged.

## Verified behavior

A real non-admin Developer first saves a description normally, then types an
unsaved ` Pending review.` suffix. Root downgrades that same project member to
Guest while its editor stays open. The actual Save response returns HTTP 200,
empty error lists and `userPermissions.updateWorkItem: false`; the backend keeps
the previously saved description. The original editor closes and loses the draft.

The native integration now shows: “You no longer have permission to edit this
description. Your draft has been kept.” The form remains open with the exact
pending source, formatting, link and Python indentation. After root restores
Developer access, normal reload/Edit recovers the existing autosaved draft;
Save and reopen preserve that exact source. No missing text is retyped or injected.
The returned authority is true on the restored Save. Selected actual screenshots
show the failure message with the pending draft and the reopened saved result.

The same non-author Guest description restrictions, denied REST update and private
anonymous UI/API refusal continue to pass. Guest comment access remains outside
the read-only description claim. The task-owned account ends with Guest access.

## Two small host changes

`services/save_authority_patch.mjs` guards the pinned parent
`work_item_detail.vue` acknowledgement before clearing the draft or closing the
form. It captures whether the submitted operation contains a description and
checks explicit returned authority. Authorized empty/normalized source follows
the existing success path. A new attempt clears the previous update warning.
It does not compare raw draft text to server-normalized Markdown. Missing legacy
authority metadata keeps the existing behavior; general silent-no-op detection,
atomic locking and offline recovery are not established by this bounded guard.

The prepared `work_item_description.vue` child previously advanced its saved
baseline on submission, before acknowledgement. Keeping the failed form open
exposed a false “someone edited” warning when unchanged server text arrived.
The baseline patch removes that premature assignment. Actual new editing sessions
still establish their baseline, and genuine remote edits still produce conflicts.
Backend authentication, authorization and mutation behavior are unchanged.

Both transformations require exact unique source boundaries. The pinned parent
and previously verified prepared child/test fixtures are checksummed. Version 16
of the installer owns 32 files and refuses unknown edits, paths or symlinks.
Rollback restored the parent to its exact pinned bytes and the child to its exact
prepared bytes; reinstall passed. Earlier version-15 parent-only rollback evidence
is retained separately. The private editor bundle is byte-for-byte identical to
the red baseline. Public engine/API code, dependencies, version, CSS and acceptance
budgets are unchanged.

## Why the first green comparison was insufficient

The first native candidate passed all 31 data-retention requirements, but full
alert receipts and PNG review exposed the spurious conflict. Comparison-1 remains
retained with that limited semantic result. The separate `access-feedback.mjs`
gate correctly rejects it: the draft survives, yet `noFalseConflict` is false.
The final candidate passes both comparison-2 and feedback-after-fix. No raw result
was overwritten or silently relabeled, and the extra feedback check adds no parity
score. The earlier red access corpus also retains its seven shared failures.

A fresh **native-only two-session positive control** verifies genuine conflicts
still disclose exact read-only remote source, retain the local draft, and support
both discard and explicit overwrite followed by normal fresh-session Save/reload.
Both flows pass with no browser errors. This is additional functional evidence,
not another matched-original score. Selected actual control PNGs were inspected.

## Regression and validation evidence

- **1,531 integration tests / 60 files**, two workers, and strict TypeScript pass.
- **187 upstream component tests / two suites** and lint pass. Three parent
  regressions failed before the guard; the child unchanged-server regression
  failed before removing the premature baseline update. Existing genuine-conflict
  cases still pass.
- Twenty-one focused host/baseline/feedback tests cover revoked empty/text drafts,
  authorized normalization, retry, existing errors, unchanged server text and
  genuine remote changes. Policy checks reject a misleading conflict even when
  data retention passes.
- Native builds pass with two existing warnings under unchanged resource limits.
  All 16 older corpora keep exact classifications/gates under interpretation
  replay. Replay is not a new browser run.
- Exact raw logs, immutable comparisons, returned authority/source receipts,
  selected original PNG bytes, build/installed hashes and both rollback smokes
  are retained in the validation receipt.

An initially broad retry assertion selected an unrelated stack-trace widget; the
retained diagnostic shows its text. The final test checks disappearance of the
specific permission warning. A guarded generator refused an unformatted test
edit, then accepted ordinary formatter output. A later Python test-preparation
syntax error wrote no tests; an outer shell continued with only the old 13-test
subset. That result is explicitly excluded as new coverage in the preparation
notes; corrected preparation and the final 21/187/1,531 checks supply the evidence.
No acceptance requirement or budget was relaxed.

The matched backend/image, root provisioner, actual non-admin account, private
project, fixture, Linux Chromium 151 and 1280x900 configuration remain fixed.
The heavy task container is stopped after each run, capped at two CPUs/4 GiB.
Other roles/author exceptions, full membership removal, concurrent role changes,
offline/late/racing saves, other engines/mobile and full application acceptance
remain open. The incomplete-integration warning remains accurate. GitHub push and
hosted CI still await CLI sign-in; no release was made.

- [Final matched comparison](../../artifacts/gitlab-compatibility/access-repair-20261117/comparison-2/report.md)
- [Final UI feedback gate](../../artifacts/gitlab-compatibility/access-repair-20261117/feedback-after-fix/report.json)
- [First candidate feedback failure](../../artifacts/gitlab-compatibility/access-repair-20261117/feedback-before-fix/report.json)
- [Genuine-conflict controls](../../artifacts/gitlab-compatibility/access-repair-20261117/genuine-control.json)
- [Final rollback smoke](../../artifacts/gitlab-compatibility/access-repair-20261117/restore-smoke-final/checks.json)
- [Validation receipt](../../artifacts/gitlab-compatibility/access-repair-20261117/validation.json)
- [Historical red audit](COMPATIBILITY_ACCESS_RESULTS.md)

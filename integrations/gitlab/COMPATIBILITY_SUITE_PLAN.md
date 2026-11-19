# GitLab paired compatibility and regression suite

## Current acceptance boundaries

| Area | Verified on the pinned local deployment | Still open |
| --- | --- | --- |
| Issue description and discussion | Both save orders, isolated formatting and undo histories, independent saved records. 44 matched checks on each browser. [Current Chromium build](../../artifacts/gitlab-compatibility/confirmed-review-rollback-20261119/comparison-1/report.md) · [Firefox 153](../../artifacts/gitlab-compatibility/composer-firefox-20261119/comparison-1/report.md) · [WebKit on the earlier build](../../artifacts/gitlab-compatibility/composer-webkit-20261119/comparison-2/report.md) | Other host surfaces and devices. |
| Concurrent issue editing | The returning Developer can inspect both drafts and explicitly discard or overwrite. [18 matched checks](../../artifacts/gitlab-compatibility/offline-conflict-20261119/comparison-2/report.md). When another change arrived, the open disclosure updated. Both builds retained the losing draft during overlapping saves. [31 further checks](../../artifacts/gitlab-compatibility/issue-races-20261119/comparison-5/report.md). | GitLab returned HTTP 500 on the competing issue update in both builds. |
| Immediate Save and rollback | The active Fountain build retains the last edit. Stock can reopen the same issues and discussions and save from Markdown. [Immediate Save](../../artifacts/gitlab-compatibility/immediate-save-20261119/comparison-1/report.md) · [Rollback](../../artifacts/gitlab-compatibility/dual-composer-20261119/comparison-8/report.md) | Stock rapid rich-text Save lost the final edit in both Chromium and WebKit. [Timed WebKit rollback](../../artifacts/gitlab-compatibility/composer-webkit-20261119/comparison-2/report.md) Removing the Ruby footnote overlay retained the working cached rendering of issue #494. Regenerating its HTML restored the stock repeated-reference defect. [Reproduction and both build receipts](runtime/README.md#reproduce-rollback-with-the-footnote-renderer). Deployment at production scale remains open. |
| Merge-request reviews | Three posted suggestions were expanded symmetrically, shrunk to the anchor, or extended on one side. The file and commit were verified after undo, redo, save, reload and application. [63 matched checks](../../artifacts/gitlab-compatibility/review-ranges-20261119/comparison-2/report.md) | Applied history is lost on prose-only edits. |
| Simultaneous review confirmations | On the four-thread profile, two distinct reviewers confirmed one suggestion. Both editors produced one direct commit with the successful reviewer’s message, the exact file and the same Applied note after reload. Fountain also verified the saved suggestion and showed Applied to the second reviewer before reload. [13 matched checks](../../artifacts/gitlab-compatibility/review-feedback-20261119/comparison-3/report.md) | Stock still shows a Git reference error and a stale Apply control until reload. On the earlier [two-thread profile](../../artifacts/gitlab-compatibility/two-reviewers-20261119/comparison-2/report.md), both requests timed out and neither committed. |
| Stale review targets | Both editors protected changed and deleted targets, including a deletion with an identical line elsewhere. The newer file, branch head, note and suggestion ID survived reload. [52 matched checks including visible refusals and the absence of an Applied badge](../../artifacts/gitlab-compatibility/review-feedback-stale-20261119/comparison-3/report.md) | Two live discussions only identified a file change. Both editors applied a suggestion after an insertion shifted its line, but refused a live review when the line itself moved to the end of the file. [16 relocation checks](../../artifacts/gitlab-compatibility/relocated-target-20261119/comparison-1/report.md). |

On this GitLab revision, `app/services/notes/update_service.rb` calls
`note.suggestions.delete_all` and recreates the records in `update_suggestions`.
A prose-only edit can therefore clear the Applied flag and replace the suggestion
ID on both editors. Preserving that ID across the ordinary Save requires a change
to the GitLab persistence path. [Matched observations](COMPATIBILITY_RESULTS.md).

The local deployment uses GitLab CE 19.5.3. Browser and mobile coverage, additional roles, hosted deployment and the outstanding workflows below remain part of flagship acceptance.

## Earlier matched runs

The first matched original-editor/Fountain source-handoff and application/
prose-edit runs completed 2026-11-16. Four scenarios yield 20 parity, 12 improvement,
zero regression and four shared-limitation outcomes across 36 invariants. Absolute
feature acceptance remains false. [Results and reproduction](COMPATIBILITY_RESULTS.md).
A second matched deletion pair adds 26 parity/four improvement outcomes across
30 checks in two scenarios, with zero regression. [Deletion results](COMPATIBILITY_DELETION_RESULTS.md).
A third matched posted-review pair verifies 21 parity checks for source/range
editing, undo/redo and save/reopen/application. [Review results](COMPATIBILITY_REVIEW_RESULTS.md).
A fourth matched clipboard fixture verifies 84 parity outcomes with explicit
caret/clipboard preconditions and visible captures. Earlier apparent clipboard
wins fail the hardened evidence gate; a timing/selection anomaly remains open.
[Clipboard results](COMPATIBILITY_CLIPBOARD_RESULTS.md).
A fifth corpus verifies 188 parity checks across four paced keyboard/pointer
forward/backward partial selections. Document-loaded receipts and semantic
empty-wrapper handling prevent false claims from earlier observations. Rapid
input remains open. [Directed selection results](COMPATIBILITY_PARTIAL_RESULTS.md).
A sixth corpus verifies 188 parity and 16 improvement checks across four
caret-ready cross-paragraph selections. It repairs a reproduced native link
popup obstructing Save, and demonstrates retained plain-text separation where
the pinned original flattens it. Earlier inadequate profiles remain archived.
[Cross-paragraph results](COMPATIBILITY_CROSSBLOCK_RESULTS.md).
A read-only [capture diagnostic](CAPTURE_DIAGNOSTIC_RESULTS.md) corrects an
earlier mistaken blank-frame assessment using unchanged PNG pixels and twelve
original/native captures. It adds no compatibility score or superiority claim.
Earlier native journeys/API controls remain separate single-sided evidence.

## Comparison contract

Run equivalent user workflows against the original GitLab editor and the native
Fountain replacement. Use the same pinned GitLab CE 19.5.3 image/source revision,
backend implementation, configuration, users/roles and fixture content. Reuse the
actual GitLab application and persistence layer; do not substitute a recreated
website, fake server response or direct document-state injection for UI actions.
API calls may establish fixtures and verify saved results. Record their role.

The existing deployment already provides the required split:

- `runtime/compose.yaml` starts the pinned stock GitLab image with its packaged
  original frontend, persistent task-owned backend volumes and port 5080.
- `runtime/compose.frontend.yaml` adds the verified native frontend asset mount
  and `ENABLE_RSPACK` asset selector. The replacement is built from the matching
  source and mounted read-only; the backend image stays the same.
- `scripts/audit-gitlab-product-baseline.mjs` and the native audit harness provide
  existing authentication, isolation and fixture-verification building blocks.

Inspect actual container image digest, server mounts, application version and
active editable DOM root for each run. The `fountainReplacementInstalled` field
in the upstream pin describes the baseline manifest; it is not live editor proof.
Require the original editable root for the baseline and the native Fountain root
for the candidate within the tested form.

Every matched suite must verify editor build identity before exercising its
fixture. The preflight opens the real issue editor in an isolated browser context.
It checks the GitLab version and pinned image, records the deployed frontend
manifests, and compares the browser's JavaScript response digests against the
deployed asset files. For Fountain, the installed host component and its loaded
runtime each supply their own build fingerprint. The runtime build record names
the package version and source revision. The host fingerprint also covers the
prepared integration files, including the runtime and CSS.

Both input reports carry the expected and observed identity. The comparison
checks those receipts again and prints the identities above its results. A
missing identity, a mismatched digest, or an unexpected editor disqualifies
the entire pair. Older reports remain historical evidence. Rerun their workflows
before making a comparison claim under the current gate.

Switch deployments only after the task application has stopped. Preserve its
backend volumes and never touch unrelated containers. A server repair overlay
must be identical on both sides or the result is not a matched editor comparison.
Declare asset selection as an intentional frontend difference; server features,
permissions and policy must not change between sides. Start with the stock server.

### Reproduce an issue or merge-request comparison

Use the pinned Linux deployment from the [runtime guide](runtime/README.md#reproduce-the-frontend-deployment-and-rollback).
Run from the Fountain checkout with the test container stopped. Choose
`quick-save` for click timing, `reconnect` for a single author retrying, or
`offline-conflict` for two authors editing the same description. Use `composers` for independent descriptions and comments, `stale-reviews` for changed and deleted targets, and `relocated-reviews` for intact lines shifted or moved within a file. Select `concurrent-reviews` to have the fixture owner and a project Developer independently confirm the same posted suggestion.

```sh
suite=quick-save
run_id="$suite-$(date -u +%Y%m%d-%H%M%S)"
node scripts/run-gitlab-compatibility.mjs --suite "$suite" --run-id "$run_id" --editor fountain
node scripts/run-gitlab-compatibility.mjs --suite "$suite" --run-id "$run_id" --editor original
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$run_id/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$run_id/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$run_id/comparison"
```

The quick-save suite records trusted keydown and click events and inspects the
paragraph at click time. The reconnect suite requires the actual description
mutation to fail with the browser offline. Both suites read back the saved
issue from GitLab and reopen it in the browser. The two-author fixture keeps a
Developer’s rich draft open after a failed offline Save. The issue author edits
in Markdown in another session and saves. The API must return that exact text
while the Developer browser is still offline. Each resolution has a fresh issue,
a recording after sign-in and an independent read of the final saved description.

Use `suite=concurrent-issues` for writes after an open conflict and for overlapping issue submissions. In the first two cases, the issue author reopens the saved issue, checks its first edit, and makes a second Markdown save while the Developer is reading the conflict. The collector checks the persisted second edit before recording the disclosure and the explicit discard or overwrite. The third case uses two rich-text drafts and two ordinary Save clicks. Both actual browser request intervals must overlap. The comparator checks each response, the persisted description, the other author's visible draft and warning, and an independent reader.

The concurrent review fixture opens two signed-in browser sessions and gives each reviewer
a distinct commit message. It checks that both confirmed the same suggestion and that the
two browser request intervals overlapped. After both responses, and again after both
reviewers reload, it compares the complete file, commit parent, commit message, note ID
and Applied state. A run missing either response cannot establish the concurrency result.

## Equivalent data and actions

Use one versioned fixture declaration per workflow. Include original Markdown,
raw repository file contents, binary asset digests, diff anchors/ranges and
permissions. Validate these before the first interaction on both sides.

Each side gets a fresh isolated fixture created from that same declaration.
Do not run the second side on a repository/comment mutated by the first side.
Generated record IDs and timestamps may differ and must be mapped explicitly;
source text, asset bytes, document structure, line ranges and permissions may not.
Compare hashes of the fixture inputs and retain each side's setup receipt.

Express the shared workflow as user intent and required state transitions. Use
small editor-specific drivers for actual visible controls, typing, selection,
clipboard and mode switching. A missing control is an observed capability/UX
outcome, not permission to replace the workflow with an API write. Where a source
editing fallback is legitimate, record the fallback and additional actions.
Keep application data setup and post-action API/file verification outside drivers.

Use the same browser build, viewport, operating environment and fonts. Retain
screenshots after transitions finish, inspect them, and compare intended content,
clipping, selection and action state. Pixel equality is not required between two
different editor designs. Include native/browser failures rather than retrying
until only a successful screenshot remains. Never retain credentials, session
storage, CSRF headers or credentialed traces/video.

## Classification per invariant

A workflow may contain several independently classified requirements; do not
hide a regression behind a broad feature-level success label.

| Classification | Required evidence |
| --- | --- |
| Parity | Both observed runs satisfy the same invariant with equivalent saved/application semantics. |
| Improvement | Fountain satisfies a predefined invariant or measurable UX/performance criterion that the original demonstrably fails, under matched conditions. |
| Regression | The original satisfies an invariant and Fountain fails it. |
| Shared limitation | Both observed runs fail the same invariant under the same triggering conditions; retain the unmet product requirement. |

If either side is missing, the environments differ, or the failures cannot be
meaningfully matched, leave `classification` null and mark the comparison pending
or inconclusive. Do not infer a completed pair from an API control, a unit test,
a feature list or a likely common backend cause.

Keep comparison classification separate from absolute feature acceptance.
A shared limitation is not a supported feature. Parity on a destructive or lossy
behavior does not close the desired reliability requirement. An improvement in
one substep does not establish that Fountain is globally better than Tiptap.

## First real workflow set

1. Suggestion source integrity: actual diff selection containing literal
   backslash-n, genuine U+E000, zero-width text and trailing whitespace; insert,
   save, reopen and apply. Compare exact source and resulting file/commit.
2. Posted suggestion editing: change source/range, undo/redo, save/reopen, then
   apply. One symmetric expansion is now matched through both actual UIs, with
   no early source commit. The November 19 follow-ups above add shrinking, asymmetric extension and a changed-line conflict. The later deletion run above covers removed targets. The relocation run above covers an insertion and an explicit line move. The simultaneous confirmation run above covers two reviewers acting on the same suggestion.
3. Empty and whitespace source: separately compare preserved Markdown, intended
   file effect, warnings/confirmation and actual application. Stock GitLab's
   whitespace-only source becomes deletion. The matched empty/one-newline UI
   pair now verifies explicit explanation, affirmative whitespace consent and
   source reopening. Wider ranges/Unicode and meaningful blank-line replacement
   remain separate requirements.
4. Prose-only editing of an applied proposal: compare suggestion IDs/application
   metadata and source commit before/after. The original-editor UI pair now
   verifies the same lost Applied flag/recreated identity on both sides. The
   earlier stock API control remains separate attribution evidence.
5. Whole-document rich clipboard and a short cross-mark partial fragment now
   have matched UI fixtures, including keyboard/pointer direction. Cross-paragraph and rectangular body-cell transfers now also have matched
   fixtures and retained visual controls. Ownership and external-app-specific imports remain. Extend table, task-state, media,
   source-switching, review and persistence journeys, followed by permissions,
   concurrency and additional browser/mobile profiles.

Current API controls and negative blank-line receipts must remain visible.
Do not erase the failed intended blank-line application or label reset when
classifying editor compatibility.

## Reproducible evidence and gating

Use immutable run directories containing candidate/source/image/browser hashes,
fixture checksums, each side's actual actions, sanitized errors, exact saved
Markdown, API metadata, asset/file bytes or digests, repository commits and visual
evidence. Keep original and Fountain results side by side with structured deltas
and per-invariant classifications. Preserve failed and incomplete runs.

The paired runner must not silently change acceptance limits, omit failed
features, replace real interactions with model calls or fabricate baseline data.
Fail the regression gate on verified regressions; keep new/unexplained failures
and incomplete required pairs visible. Preserve existing engine/security/source/
performance gates independently. Define any known-limitation policy explicitly,
without converting an unmet feature requirement into a pass.

Implemented: guarded stock/native deployment selection, shared fixture corpus,
real editor-specific drivers, immutable original/candidate receipts, strict
per-invariant comparison and separate regression/feature gates. The original
handoff discovery is retained; predefined immediate and settled profiles run
identically on both sides. The comparator refuses environment/input/instrument
mismatches, missing editor proof and unobserved outcomes.

Next: extend matched workflows to wider deletion ranges/whitespace inputs, clipboard wrapped-line/Unicode/merged-cell/ownership
workflows plus rapid-input profiles, tables/tasks/media and then roles/concurrency,
additional browsers/mobile and matched restart. Keep the shared Applied-history
failure open. Add repeated profiles before making frequency/performance claims.
No broad superiority claim or release promotion follows from this initial corpus.

The [table follow-up](COMPATIBILITY_GRID_RESULTS.md) retains an initial semantic
pass that missed visible stray selection paint, followed by a repair and fresh
42-check matched pair. Continue requiring visual controls alongside semantic
checks; scoped parity alone does not establish complete application acceptance.

The [matched task lifecycle](COMPATIBILITY_TASK_RESULTS.md) adds 22 parity/four
improvement checks after repairing a native list-exit Save blocker. The four
improvements concern one empty-task Enter behavior. Prior diagnostic/collector
and startup failures remain retained; wider task/role/platform coverage remains.

The [matched recovery follow-up](COMPATIBILITY_TASK_RECOVERY_RESULTS.md) verifies
populated leaf-item deletion, reopened/reader checkbox updates and actual command
effects. It adds 48 parity/eight correlated improvement checks for one scoped
literal-text boundary, with a working active-root control. Wider task/role/platform
coverage remains; original/native startup failures are retained separately.

The [reader-menu follow-up](COMPATIBILITY_TASK_MENU_RESULTS.md) adds 54 parity
checks for duplicate-target disable/restore/delete, not-applicable retention through
rich editing and authored strike preservation. Heading/prose observer corrections
are retained separately; no product improvement is credited to representation differences.

The [child-task conversion audit](COMPATIBILITY_TASK_CONVERSION_RESULTS.md) records
25 parity, one strict native UI-structure difference and six shared-loss checks.
Both create real linked children, but code indentation is lost by a shared host
helper. The extra native paragraph needs caret-provenance qualification. Neither
gate passes; these findings remain open rather than being relabeled as parity.

The [verified repair follow-up](COMPATIBILITY_TASK_CONVERSION_REPAIR_RESULTS.md)
closes the demonstrated source/title and extra-paragraph gaps with a fresh matched
pair: 66 parity / 14 improvement checks across four workflows. The historical red
report above remains unchanged as evidence of the earlier candidate. An intervening
premature-loading comparison is excluded; broader conversion fidelity remains open.

Follow-up: [quoted/container conversion repair](COMPATIBILITY_TASK_CONTAINER_RESULTS.md)
verifies the separately recorded four-case corpus. Historical results above remain
unchanged; broader application acceptance is still open.

The [matched two-session conflict audit](COMPATIBILITY_CONFLICT_RESULTS.md) verifies
draft retention, current-version disclosure, explicit discard/overwrite and fresh
editing with the same root account. Other actors/roles, offline and late/racing
updates, and simultaneous submits remain open.

The [matched non-author access audit](COMPATIBILITY_ACCESS_RESULTS.md) now verifies
Guest/anonymous boundaries and exposes shared pending-draft loss after live edit
permission revocation. Feature acceptance remains red; repair the host Save
acknowledgement/draft-clearing path and rerun before promoting this workflow.

The [verified revoked-save repair](COMPATIBILITY_ACCESS_REPAIR_RESULTS.md) keeps
the draft, explains revoked authority and avoids a false conflict. Its fresh
matched and independent feedback gates pass; genuine-conflict controls also pass.
Historical red results above remain unchanged; broader acceptance remains open.

# GitLab paired compatibility and regression suite

## Current acceptance boundaries

| Area | Verified on the pinned local deployment | Still open |
| --- | --- | --- |
| Issue description and discussion | Both save orders, isolated formatting and undo histories, independent saved records. 44 matched checks on each browser. [Emoji repair build on Chromium 151](../../artifacts/gitlab-compatibility/emoji-composer-rollback-20261119/comparison-2/report.md) · [Review-feedback build on Chromium 151](../../artifacts/gitlab-compatibility/confirmed-review-rollback-20261119/comparison-1/report.md) · [Firefox 153](../../artifacts/gitlab-compatibility/composer-firefox-20261119/comparison-1/report.md) · [Unicode repair build on WebKit 26.5](../../artifacts/gitlab-compatibility/unicode-composer-rollback-20261119/comparison-2/report.md) | Other host surfaces and devices. |
| Concurrent issue editing | The returning Developer can inspect both drafts and explicitly discard or overwrite. [18 matched checks](../../artifacts/gitlab-compatibility/offline-conflict-20261119/comparison-2/report.md). When another change arrived, the open disclosure updated. Both builds retained the losing draft during overlapping saves. [31 further checks](../../artifacts/gitlab-compatibility/issue-races-20261119/comparison-5/report.md). | GitLab returned HTTP 500 on the competing issue update in both builds. |
| GitLab service restart | On Chromium 151, both save orders retained the issue description and bold comment in the API and a fresh reader after each editor deployment restarted. All 46 checks passed on GitLab CE 19.5.3 and Fountain `7c85ae01`. [Builds, restart times and issues](../../artifacts/gitlab-compatibility/composer-restart-20261119/comparison-3/report.md) | Production topologies, abrupt host failure and recovery of unsaved drafts. |
| Immediate Save and rollback | The active Fountain build retains the last edit. Stock can reopen the same issues and discussions and save from Markdown. [Immediate Save](../../artifacts/gitlab-compatibility/immediate-save-20261119/comparison-1/report.md) · [Rollback](../../artifacts/gitlab-compatibility/dual-composer-20261119/comparison-8/report.md) | Stock rapid rich-text Save lost the final edit in both Chromium and WebKit. [Timed WebKit rollback on issues #522–525](../../artifacts/gitlab-compatibility/unicode-composer-rollback-20261119/comparison-2/report.md) Removing the Ruby footnote overlay retained the working cached rendering of issue #494. Regenerating its HTML restored the stock repeated-reference defect. [Reproduction and both build receipts](runtime/README.md#reproduce-rollback-with-the-footnote-renderer). Deployment at production scale remains open. |
| Merged-cell clipboard | Horizontal and vertical two-cell spans survived external rich paste, internal paste, history and save/reopen in both editors. Fountain retained blank TSV slots in plain text. [42 matched checks](COMPATIBILITY_GRID_RESULTS.md#merged-cell-clipboard-and-save) | Header-source selection, nested content and clipboard ownership across widgets. |
| Wrapped clipboard selections | Both pointer directions and a GitLab emoji shortcode were exercised through copy, external rich paste, cut, undo/redo, save and reopen. [150 checks](../../artifacts/gitlab-compatibility/wrapped-clipboard-20261119/comparison-4/report.md) | Clipboard ownership across custom nodes, bidirectional text, IME, physical touch and named external applications. |
| Merge-request reviews | Three posted suggestions were expanded symmetrically, shrunk to the anchor, or extended on one side. The file and commit were verified after undo, redo, save, reload and application. [63 matched checks](../../artifacts/gitlab-compatibility/review-ranges-20261119/comparison-2/report.md) | Packaged GitLab loses Applied history on prose-only edits. See the optional shared backend profile below. |
| Deletion suggestions | Four cases cover two adjacent middle lines, an empty proposal, a newline, and two Unicode spaces around a tab. Fountain preserved the exact Unicode on rich reopen. Both editors produced the expected surviving file lines and one child commit. [60 matched checks](../../artifacts/gitlab-compatibility/range-whitespace-20261119/comparison-3/report.md) | Applying a whitespace-only proposal still removes the target. Preserving an intentional blank line requires a change to GitLab’s application semantics. |
| Batch review | Both editors queued two independent proposals, removed and restored the first, then applied both in one commit. After a competing edit, GitLab refused the batch. Both reviewers could remove the outdated proposal and apply the surviving one while retaining the competing file change. The fresh reader and API verified both suggestion IDs, badges, exact file and commit ancestry. [41 matched checks on Chromium 151](../../artifacts/gitlab-compatibility/review-batch-20261119/comparison-3/report.md) | Revoked reviewer permissions, overlapping ranges and other browsers and devices remain open. |
| Multi-file review | Both editors applied different suggestions to line one in two identically named files in a single commit. Dismissing the confirmation left the queue intact and sent no apply request. When the backup file changed first, both refused the batch, then applied only the surviving suggestion. The third identical file retained its original bytes and commit throughout. [50 matched Chromium checks and build identities](../../artifacts/gitlab-compatibility/multi-file-20261119/comparison-4/report.md) | The separate live-refresh case below covers a confirmation closed before submission. |
| Open confirmation during a live file change | Both editors kept the two suggestions queued and sent no apply request. The updated Fountain reader displayed GitLab’s reason and the removal instruction on the affected note. After removal the instruction disappeared. Both editors then saved only the surviving change. [28 parity checks and two checks of the new feedback on Chromium 151](../../artifacts/gitlab-compatibility/live-review-20261119/comparison-2-1/report.md) | Other browsers and types of invalidation. |
| Simultaneous review confirmations | On the four-thread profile, two distinct reviewers confirmed one suggestion. Both editors produced one direct commit with the successful reviewer’s message, the exact file and the same Applied note after reload. Fountain also verified the saved suggestion and showed Applied to the second reviewer before reload. [13 matched checks](../../artifacts/gitlab-compatibility/review-feedback-20261119/comparison-3/report.md) | Stock still shows a Git reference error and a stale Apply control until reload. On the earlier [two-thread profile](../../artifacts/gitlab-compatibility/two-reviewers-20261119/comparison-2/report.md), both requests timed out and neither committed. |
| Stale review targets | Both editors protected changed and deleted targets, including a deletion with an identical line elsewhere. The newer file, branch head, note and suggestion ID survived reload. [52 matched checks including visible refusals and the absence of an Applied badge](../../artifacts/gitlab-compatibility/review-feedback-stale-20261119/comparison-3/report.md) | Two live discussions only identified a file change. Both editors applied a suggestion after an insertion shifted its line, but refused a live review when the line itself moved to the end of the file. [16 relocation checks](../../artifacts/gitlab-compatibility/relocated-target-20261119/comparison-1/report.md). |

The [first completed multi-file comparison](../../artifacts/gitlab-compatibility/multi-file-20261119/comparison-3/report.md) recorded an important timing difference. When the backup file changed, stock submitted the queued pair and GitLab returned HTTP 400. On Fountain the open confirmation disappeared and the backup control became disabled before the click. The page showed that the line had changed. Both retained the competing edit, kept the active and standby files intact and allowed the reviewer to apply the active suggestion separately. The live-refresh case above waited for the discussion update on both Chromium runs. It reproduced the closing confirmation on both stock and Fountain and verified the new feedback on Fountain. The stock comparison used attempt 2 after a Gitaly logger restart failed during the [first local cold start](../../artifacts/gitlab-compatibility/live-review-20261119/original-1/report.json). The separate stock badge reading in this attempt sampled the page while the suggestion widget was loading. The collector now waits for either the Apply control or the Applied badge. To replay the earlier observation in a separate checkout, apply the [previous reader check](../../artifacts/gitlab-compatibility/multi-file-20261119/comparison-3/original-reader-check.patch). Its collector hash matches both earlier reports.

On this GitLab revision, `app/services/notes/update_service.rb` calls
`note.suggestions.delete_all` and recreates the records in `update_suggestions`.
A prose-only edit can therefore clear the Applied flag and replace the suggestion
ID on both editors. Preserving that ID across the ordinary Save requires a change
to the GitLab persistence path. [Matched observations](COMPATIBILITY_RESULTS.md).

The opt-in [history deployment](runtime/README.md#reproduce-suggestion-history-across-comment-edits) retains IDs on both editor builds. The [first complete history comparison](../../artifacts/gitlab-compatibility/review-history-20261119/comparison-3/report.md) identified a separate visibility regression in the Fountain integration. Its authenticated API and browser observations cover adding a neighbor, swapping proposals, rejecting an ambiguous duplicate, correcting a refused draft, editing proposal text and range, and changing the target branch.

The [rebuilt native integration and matched control](../../artifacts/gitlab-compatibility/review-history-20261119/comparison-reloaded/report.md) pass all 46 checks on Chromium 151. Both inputs used the same browser, fixture, collector hashes, GitLab revision, backend services, project, actor and data volumes. The [separate stock cold start](../../artifacts/gitlab-compatibility/review-history-20261119/original-4/report.json) exited before sign-in. The completed comparison identifies the successful stock attempt 3 and candidate attempt 4. For a byte-identical rerun from this revision, apply the [archived collector diff](../../artifacts/gitlab-compatibility/review-history-20261119/comparison-3-4/exact-collector.patch) in a separate checkout. It restores the two collection files to the SHA-256 values in both reports. The current driver additionally verifies commit IDs during rollback.

After removing the repaired services and Fountain frontend, packaged GitLab reopened the four original notes on merge requests !148, !149, !152 and !153. The reader badges, note bodies, proposal IDs, application flags, eligibility, file bytes and branch heads matched the repaired records. The database still pointed each surviving Applied suggestion to its original application commit. [Stock rollback observations](../../artifacts/gitlab-compatibility/review-history-stock-20261119/original-1/report.json).

The packaged-service control reproduced the history loss on both editor builds. In one stock observation, the first API read returned the new comment body alongside suggestion 1532 marked Applied. After reload, GitLab returned suggestion 1533 with the flag cleared. The final comparison scores the post-reload rows. It records 29 matching successes and 17 shared unmet checks on packaged services, compared with 46 matching successes on the repair. [Packaged-service comparison](../../artifacts/gitlab-compatibility/review-history-stock-20261119/comparison-reloaded/report.md).

The [immediate batch-authoring attempt](../../artifacts/gitlab-compatibility/review-batch-20261119/comparison-immediate-handoff/report.md) stopped on stock GitLab in both cases. The second proposal appeared in rich text, then the Markdown field was empty when the reviewer switched immediately. Fountain completed that sequence. The comparison remains incomplete. The recorded batch workflow edits the second proposal in rich text and verifies its exact source before posting it.

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
`offline-conflict` for two authors editing the same description. Use `composers` for independent descriptions and comments, `stale-reviews` for changed and deleted targets, and `relocated-reviews` for intact lines shifted or moved within a file. Select `concurrent-reviews` to have the fixture owner and a project Developer independently confirm the same posted suggestion. Use `batch-reviews` to author two suggestions on distinct lines, queue and remove them, and apply both with one commit message. A second case changes the target branch after the confirmation has opened. The collector records the actual batch request, both notes, the complete file and the branch commit before and after reload. In the stale case a separate reader checks the refusal while the reviewer keeps the queue open. The reviewer then removes the outdated proposal and explicitly confirms the surviving one. The post-sign-in recording for each local run is `batch-review.webm` beside its raw report. For a byte-identical replay of the single-file batch attempt 3 from commit `2b61739d`, append one LF to `scripts/audit-gitlab-batch-review.mjs` in a disposable checkout. That trailing blank line was removed during the final diff check. The other 27 collector files at that commit match the recorded hashes.

Use `--suite multi-file-reviews` with the same run ID and attempt number for `--editor original` and `--editor fountain`. The fixture creates `clients/active/config.js`, `clients/backup/config.js` and `clients/standby/config.js` with identical bytes. The reviewer annotates line one of the active file, replaces line one of the backup file and leaves standby untouched. The collector reads all three files at the observed commit SHA, records their last-changing commits and checks the paths in the commit diff. It also dismisses the first confirmation with Escape before submitting. In the competing-edit case, only the backup file changes before the reviewer submits the batch.

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
   source reopening. Two middle lines and the mixed Unicode whitespace fixture now also have a matched pair. Preserving blank lines in the applied repository file remains open.
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

The runner opens a fixed private audit issue to verify the actual browser bundle before collecting any workflow. It compares the issue ID and source digest across both runs. Each workflow then verifies its own active editor. This keeps a failure to open a particular document visible in that workflow. A failed build check disqualifies the run from comparison.

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

Next: extend matched workflows to clipboard ownership across custom nodes and additional Unicode
workflows plus rapid-input profiles, tables/tasks/media and then roles/concurrency,
additional browsers/mobile and deployment beyond the local single-container profile. Keep the shared Applied-history
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

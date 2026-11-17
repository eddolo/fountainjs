# GitLab paired compatibility and regression suite

Status: first matched original-editor/Fountain source-handoff and application/
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
for the candidate within the tested form. Record frontend manifest/build hashes.

Switch deployments only after the task application has stopped. Preserve its
backend volumes and never touch unrelated containers. A server repair overlay
must be identical on both sides or the result is not a matched editor comparison.
Declare asset selection as an intentional frontend difference; server features,
permissions and policy must not change between sides. Start with the stock server.

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
   no early source commit. Shrinking/asymmetric/stale/concurrent ranges remain.
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
5. Whole-document rich clipboard now has one matched fixture; partial selections,
   cell grids, ownership and external-app-specific imports remain. Extend table, task-state, media,
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

Next: extend matched workflows to shrinking/asymmetric/stale source ranges,
wider deletion ranges/whitespace inputs, clipboard partial/cell-grid/ownership
workflows, tables/tasks/media and then roles/concurrency,
additional browsers/mobile and matched restart. Keep the shared Applied-history
failure open. Add repeated profiles before making frequency/performance claims.
No broad superiority claim or release promotion follows from this initial corpus.

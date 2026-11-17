# Matched GitLab posted source/range review

Collected 2026-11-16–17 as `review-20261116`. The stock original frontend and
Fountain replacement ran sequentially with matching GitLab CE 19.5.3 image,
packaged server hashes, backend configuration/volumes, Chromium build, actor,
project/default head, fixture and collector hashes. No backend repair overlay
or editor runtime change was added for this comparison.

[Comparison JSON](../../artifacts/gitlab-compatibility/review-20261116/comparison-1/report.json)
and [all 21 invariant outcomes](../../artifacts/gitlab-compatibility/review-20261116/comparison-1/report.md).

## Workflow and result

Both start from a fresh branch containing:

```js
before();
old();
after();
keep();
```

Use actual Rapid Diffs line 2 to insert a suggestion, post it normally with a
prose marker, reload, then edit the posted note. Replace its source with two
lines containing literal backslash-n and genuine U+E000. Expand the target from
line 2 to lines 1–3 without changing that edited source. Undo the complete range
adjustment while preserving the source; redo it. Save, reload, inspect rich and
source views, cancel the inspection without rewriting, and apply normally.

The original uses actual source keyboard selection and its line-start/line-end
buttons. Fountain uses its source/range dialog and Load original file. The driver
reads browser selection and DOM-rendered ranges; it never calls either editor's
model/command API. REST creates independent fixtures and verifies note/file/commit
results; it does not author, edit or apply the proposal.

**21 parity outcomes; zero improvement, regression, shared-limitation or missing
outcomes in this declared corpus.** Both retain exact source/range through the
review, undo/redo, source-mode handoff and save/reopen. Prose stays unchanged;
editing creates no source commit. Application replaces only the three intended
lines with the two-line proposal, retains `keep();` and its final LF, and creates
one child commit of the fixture seed. Applied metadata is present immediately
after this commit.

The original needs two Undo actions for its two range-button edits; Fountain
needs one for its dialog application. Both replay with the matching Redo actions.
Every intermediate snapshot is retained. These counts are diagnostics, not a
performance/ergonomics comparison or an extra improvement classification.

The regression gate and candidate acceptance **for these 21 fixture invariants**
pass. The earlier matched Applied-history failure concerns a subsequent prose-only
edit of an already applied proposal; it is not retested or repaired here. The
stock whitespace-as-deletion behavior and wider programme requirements remain.

## Reproduce

Use the [prepared Linux runtime/assets](runtime/README.md) with the isolated task
application stopped. Choose a fresh run ID; directories cannot be overwritten.
Run the modes sequentially against the same backend:

```sh
PAIR_ID=review-example-20261117
node scripts/run-gitlab-compatibility.mjs --editor original --run-id "$PAIR_ID" --suite reviews
node scripts/run-gitlab-compatibility.mjs --editor fountain --run-id "$PAIR_ID" --suite reviews
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$PAIR_ID/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$PAIR_ID/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$PAIR_ID/comparison-1"
```

The shared fixture declares 1500 ms source settling/observation windows and
700 ms history boundaries. Undo has a bounded four-action observation loop and
records every state; the required source/range is compared independently of
whatever state the driver actually reaches. A correct final file cannot hide an
undo/source/range failure. Omitting `--suite` still selects the first source
fixture; `--suite deletions` selects the separate deletion corpus.

## Evidence and limits

- [Original UI observations](../../artifacts/gitlab-compatibility/review-20261116/original-1/report.json)
- [Fountain UI observations](../../artifacts/gitlab-compatibility/review-20261116/fountain-1/report.json)
- [Pinned source and packaged server provenance](../../artifacts/gitlab-compatibility/review-20261116/source-provenance.json)
- Extended-comparator replays retain the earlier [20/12/0/4 source/history results](../../artifacts/gitlab-compatibility/switch-20261116/comparison-4/report.json) and [26/4/0/0 deletion results](../../artifacts/gitlab-compatibility/deletion-keyboard-20261116/comparison-2/report.json) unchanged.

Original/native rich, reopened source, range-dialog and Applied reader screenshots
were physically inspected. Exact saved Markdown/API/file bytes supply code-point
and repository evidence; the private-use character has no portable glyph promise.
No credentialed video/traces/storage state are retained. Fresh verification is
1383 integration tests / 54 files, including 19 comparison-policy tests, and strict
TypeScript. The task deployment is stopped after collection.

This is one Linux Chromium posted-review case with a single anchor and a symmetric
range expansion. It does not establish shrinking/asymmetric ranges, stale or
concurrent diff updates, all source syntax, roles/mobile/other browsers, repeated
runs, matched restarts or complete GitLab parity. Prior single-sided checks remain
separate. No engine runtime, API, capacity, version, release or website marketing
change is introduced by this audit.

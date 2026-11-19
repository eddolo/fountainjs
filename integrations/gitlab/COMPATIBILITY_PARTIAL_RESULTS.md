# Matched GitLab directed partial-selection results

## Wrapped text and GitLab emoji, November 19

Three Chromium 151 workflows on GitLab CE 19.5.3 passed 150 matched checks. They covered dragging forward and backward across a wrapped release note, plus opening the same passage with GitLab's emoji shortcode. The copied text contained a decomposed accent, a skin-tone emoji joined with U+200D, bold and a link. Actual pointer selections crossed three visual lines in stock and four in Fountain. Both retained the exact selected characters, formatting and link through external rich paste, cut, undo, internal paste, redo, Save and reload. The external target was a separate browser editable field. The native and stock builds both identified themselves on private audit issue #528. [Matched report with build identities](../../artifacts/gitlab-compatibility/wrapped-clipboard-20261119/comparison-4/report.md) · [Backward selection](../../artifacts/gitlab-compatibility/wrapped-clipboard-20261119/fountain-4/pointer-backward-selected.png) · [Reopened result](../../artifacts/gitlab-compatibility/wrapped-clipboard-20261119/fountain-4/pointer-forward-reopened.png).

The [earlier Fountain run](../../artifacts/gitlab-compatibility/wrapped-clipboard-20261119/comparison-3/report.md) stopped at rich-editor startup for all three documents. The adapter now unwraps the verified textual GitLab emoji without splitting the surrounding formatting. On the shortcode input, GitLab stored both occurrences as shortcodes. Fountain retained the original shortcode and saved the newly pasted character as Unicode. The visible documents reopened equivalently. Custom image emoji, bidirectional text, IME composition and touch selection need separate coverage.

To reproduce, run `scripts/run-gitlab-compatibility.mjs --suite wrapped` with a fresh shared `--run-id` for `--editor original` and `--editor fountain`, then compare the two reports using the [runtime guide](runtime/README.md#reproduce-the-frontend-deployment-and-rollback).

## Short single-line selections, November 17

Collected 2026-11-17 as `partial-ready-20261117`. Stock original and Fountain
frontends ran against matching pinned GitLab CE 19.5.3 image/server sources,
backend configuration/volumes, Chromium build, actor, project/default head,
fixture and collector hashes. No server overlay or engine runtime change was
introduced for this comparison.

[Comparison JSON](../../artifacts/gitlab-compatibility/partial-ready-20261117/comparison-1/report.json)
and [complete invariant table](../../artifacts/gitlab-compatibility/partial-ready-20261117/comparison-1/report.md).

## Four actual workflows

| Input | Selection direction |
| --- | --- |
| Keyboard | Forward |
| Keyboard | Backward |
| Mouse drag | Forward |
| Mouse drag | Backward |

Each independently created issue contains a heading, a paragraph authored as
`Start **critical** [linked](https://example.com/reference) tail.`, and a separate
`Paste here.` paragraph. Select exactly `critical linked` across the bold/plain/
link boundaries. Actual browser selection text, direction and focus are recorded.

Keyboard selection uses Home/End, arrows and Shift. Mouse selection uses actual
mouse down/move/up. Off-document DOM Range reads locate the text endpoints and
measure direction; no range is assigned to the browser or editor selection.
The fixture declares a 20 ms keyboard action delay and 700 ms input settling.
These are paced interaction profiles, not typing-latency or rapid-input tests.

Initialize the real clipboard with a distinct sentinel, then copy through Ctrl+C
so stale data cannot produce a false pass. Paste into a separate generic rich
field and inspect the fragment's exact text, bold content, link label and href.
Return, select the same directed fragment, cut with Ctrl+X, inspect the remaining
source and clipboard, then undo the cut. Click the destination, verify its caret,
press End/Enter and verify the new empty paragraph before Ctrl+V. Undo and redo
paste, save through GitLab, reload and reopen rich editing.

REST creates fixtures and verifies saved results. It does not perform selection,
copy, cut, paste, history or description save. Initial/reopened snapshots wait for
the document heading to be visible inside the verified active editor; those
readiness receipts are required independently by the comparison gate.

## Results and interpretation

**All four workflows have parity: 188 checked outcomes, zero improvements,
regressions, shared limitations or missing outcomes in this corpus.** Each case
has 47 correlated checks; these are not 188 independent features.

Both retain the requested selection direction and exact selected/copied text.
External/internal paste preserves the bold substring and linked label/target.
Cut removes the intended fragment, leaving the two original adjacent spaces;
undo restores the source and marks. Paste undo/redo and saved reopening retain
the intended document. Unrelated heading/content and other structure remain
unchanged. Both regression and candidate acceptance gates pass **for this fixture**.

Fountain's raw cut snapshots contain an empty bold-content observation where the
original has none. The semantic comparison removes exact empty strings from the
bold-content list: no marked characters remain. It does not require identical
caret-wrapper markup or either engine's AST. All nonempty observations remain,
including zero-width text; a dedicated policy test rejects U+200B left as marked
content. Prose is checked independently. Whitespace-only emphasis and arbitrary
Unicode selections beyond this short ASCII fixture are not established here.

## Retained negative/inadequate evidence

- The [first unpaced original run](../../artifacts/gitlab-compatibility/partial-20261117/original-1/report.json)
  captured the intended DOM selections but some rapid keyboard cuts removed a
  different substring; all cases then failed the destination-caret guard. There
  is no matching Fountain run for that profile and no superiority claim. Its
  exact collector/fixture is archived with recorded SHA-256 values. Rapid-input
  reliability remains a separate investigation.
- An earlier paced pair took one original reopen snapshot before content arrived;
  the following heading-waited screenshot showed the saved content. Its
  [hardened comparison](../../artifacts/gitlab-compatibility/partial-paced-20261117/comparison-2/report.json)
  remains incomplete with eight missing document-readiness receipts. The apparent
  reopen improvements do not pass the evidence gate. Its raw observations and
  exact collector/fixture are retained.

Neither these observer repairs nor the paced result claim that the earlier
rapid-input behavior was fixed. Reproduction archives map each original repository
path to its SHA-verified bytes. Use an isolated checkout to restore an older
instrument. Never replace observations with expected values or rerun silently
until only successes remain.

## Reproduce and limits

Use the [prepared Linux runtime/assets](runtime/README.md), with the isolated
application stopped before switching modes. Choose a fresh ID; output directories
are immutable. Run the two sides sequentially against the same backend:

```sh
PAIR_ID=partial-example-20261117
node scripts/run-gitlab-compatibility.mjs --editor original --run-id "$PAIR_ID" --suite partial
node scripts/run-gitlab-compatibility.mjs --editor fountain --run-id "$PAIR_ID" --suite partial
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$PAIR_ID/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$PAIR_ID/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$PAIR_ID/comparison-1"
```

[Original observations](../../artifacts/gitlab-compatibility/partial-ready-20261117/original-1/report.json),
[Fountain observations](../../artifacts/gitlab-compatibility/partial-ready-20261117/fountain-1/report.json),
and [source/package/server provenance](../../artifacts/gitlab-compatibility/partial-ready-20261117/source-provenance.json)
are retained with selected screenshots. Original/native backward selection, cut,
external fragment and saved/reopened views were physically inspected. Exact DOM,
clipboard and API records provide direction/semantic evidence; images alone do
not prove selection direction. Fresh checks: 1393 integration tests / 54 files,
including 29 comparison-policy tests, and strict TypeScript. All four earlier
accepted corpora replay unchanged. The isolated application is stopped.

Only one Linux Chromium run per case is covered. Multiline/cross-block selection,
Unicode grapheme/bidi/IME behavior, cell grids, custom-node/annotation ownership,
external Word/Docs imports, roles, repeated/rapid/concurrent input, mobile/touch,
other browsers and matched restart are not proved by this pair. Shared Applied
history and meaningful blank-line replacement remain unmet requirements. No
engine runtime/API/capacity/version/publication/website claim changes.

# Matched GitLab rich clipboard workflow

Collected 2026-11-17 with the same pinned GitLab CE 19.5.3 backend/image,
server sources/configuration/volumes, browser, actor, project/default head,
fixture and collector hashes. The native frontend is the declared difference.
No server repair overlay or editor runtime change was introduced.

Authoritative pair: `clipboard-ready-20261117`.
[Comparison JSON](../../artifacts/gitlab-compatibility/clipboard-ready-20261117/comparison-1/report.json)
and [per-invariant table](../../artifacts/gitlab-compatibility/clipboard-ready-20261117/comparison-1/report.md).

## Workflow

An API-created issue supplies identical Markdown fixtures: heading, bold/italic,
link, inline code, blockquote, a header/body table with bold cell text, pending and
completed tasks, and fenced code containing literal backslash-n plus genuine
U+E000. Actual description editing opens the required original/native DOM root.
The API supplies initial data and inspects saved results; it never performs the
copy, paste, cut, history or description save.

1. Select the whole document through actual keyboard input; verify the selected
   text includes its heading and final paragraph. Copy with Ctrl+C; read the real
   plain/HTML clipboard payloads.
2. Paste with Ctrl+V into a separate plain textarea and generic rich browser
   contenteditable. Inspect plain transfer and ordinary rich semantics.
3. Return to the description, click its final paragraph, press End/Enter and
   verify a collapsed, focused caret in the new empty paragraph. Record that the
   clipboard still matches the original copy, then paste the document after itself.
4. Undo and redo that paste with keyboard shortcuts. Cut the complete duplicated
   document to the actual clipboard, verify the editor is empty, and paste it back.
5. Save through the real GitLab control, inspect the API record, reload and reopen
   rich editing. Verify the duplicated document survives.

The classifier independently checks headings, prose, bold, italic, links, inline
code, quotes, table cell roles/content, task checked states and fenced source at
each internal phase. External rich checks cover ordinary semantics; generic
contenteditable is not required to implement interactive task widgets. Clipboard
plain-token retention, actual HTML payload, exact external plain transfer, and
observed append caret/clipboard preconditions are separate invariants.

A fence renderer may own one final LF; only that one terminator is excluded from
the rendered code comparison. Every other code character, including literal
backslash-n and the private-use character, is compared exactly. Prose labels
ignore boundary whitespace and mark tags normalize strong/b and em/i. This is
semantic compatibility, not literal AST equality or original Markdown byte retention.

## Results

**84 parity outcomes; zero improvement, regression, shared-limitation or missing
outcomes in this declared fixture.** The matched environment, regression gate
and candidate fixture acceptance pass. Both append a second complete copy,
restore the original with one Undo, restore both with Redo, cut to an empty
editor, paste both copies back, and retain their tested semantics after saving
and reopening. External plain transfer equals the actual copied payload;
ordinary external rich semantics match the declared fixture.

This does not close general clipboard/product acceptance. The earlier anomalous
baseline run remains unresolved; the hardened runner verifies cursor/clipboard
readiness rather than claiming that an engine timing problem was repaired.

These are correlated assertions over one composite workflow, not independent
feature wins. The controlled external field is not Microsoft Word, Google Docs
or another application's importer. Its unstyled appearance is expected; no
pixel-identical layout, font or portable private-use glyph claim is made.

## Retained discoveries

The first structural pair reached all original 82 content/protocol checks, but
oversized element screenshots could capture the wrong scroll region. It is
[retained with the hardened gate incomplete](../../artifacts/gitlab-compatibility/clipboard-20261117/comparison-2/report.json),
not used as proof of complete visual QA.

A second visible-capture pair retained one copy on the original where two were
expected, while Fountain retained two. Forty correlated checks mechanically
classified as improvements; the original did append correctly in a subsequent
single-sided read-only selection probe. No causal/frequency or superiority claim
is approved from that anomaly. Its [hardened comparison](../../artifacts/gitlab-compatibility/clipboard-visible-20261117/comparison-2/report.json)
is incomplete because both sides lack the now-required append precondition
receipts. The exact older collector is archived beside that pair; its instrument manifest
maps each SHA-verified archive to its original repository path for reproduction
in an isolated checkout. The
[selection probe](../../artifacts/gitlab-compatibility/clipboard-selection-20261117/original-1/report.json)
is separate diagnostic evidence, not a substitute for a matched original run.
Keep the timing/selection anomaly open for stress/repetition investigation.

The current driver records actual selection after click/End/Enter, waits for the
intended caret before pasting and verifies the clipboard. It does not repair a
document, set an editor selection through model APIs, synthesize paste events or
retry failed workflows until they pass. Visible heading/table/code captures
require their targets fully in the viewport. Original failed/inadequate evidence
is retained rather than overwritten.

## Reproduce and limits

Use the [prepared Linux runtime/assets](runtime/README.md), with the isolated
application stopped before mode switching. Choose a fresh ID; outputs cannot be
overwritten. Modes must run sequentially against the same backend:

```sh
PAIR_ID=clipboard-example-20261117
node scripts/run-gitlab-compatibility.mjs --editor original --run-id "$PAIR_ID" --suite clipboard
node scripts/run-gitlab-compatibility.mjs --editor fountain --run-id "$PAIR_ID" --suite clipboard
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$PAIR_ID/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$PAIR_ID/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$PAIR_ID/comparison-1"
```

Clipboard permissions are identical and restricted to the task's local origin.
Snapshots come from rendered DOM and system clipboard data, without model calls.
The runner stops only its isolated application after each side and retains volumes.

Actual original/native pasted and reopened viewport screenshots were physically
inspected, alongside external rich/plain transfer screens. Exact DOM graphs,
clipboard payloads and saved API records provide semantic/code-point evidence.
[Original observations](../../artifacts/gitlab-compatibility/clipboard-ready-20261117/original-1/report.json),
[Fountain observations](../../artifacts/gitlab-compatibility/clipboard-ready-20261117/fountain-1/report.json),
and [pinned source/package/server provenance](../../artifacts/gitlab-compatibility/clipboard-ready-20261117/source-provenance.json)
are retained with selected screenshots. Fresh verification: 1387 integration tests
across 54 files, including 23 comparison-policy tests, plus strict TypeScript.
The isolated deployment is stopped. Earlier source/history, deletion and review
corpora replay unchanged under the final comparator.

One Linux Chromium fixture is covered. Partial/backward selections, merged-cell
pastes, images/attachments, footnote/comment ownership, external-app-specific
imports, other roles/browsers/mobile and concurrency are not established by this
pair. Earlier single-sided tests remain separate. Shared Applied-history loss,
stock whitespace deletion, wider product acceptance and publication remain open.
No engine runtime/API/capacity/version/release or website marketing change is
introduced by this audit.

# Matched GitLab cross-paragraph clipboard results

Collected 2026-11-17 as `crossblock-caret-20261117`. Original GitLab CE 19.5.3
and the native Fountain frontend use the same pinned image/backend, task volumes,
server sources, actor, project/default head, fixture, collector and Chromium
151.0.7922.34 build. The native frontend is the declared difference; no backend
repair overlay is mounted. [Provenance and checks](../../artifacts/gitlab-compatibility/crossblock-caret-20261117/source-provenance.json).

[Comparison JSON](../../artifacts/gitlab-compatibility/crossblock-caret-20261117/comparison-1/report.json)
and [all invariant outcomes](../../artifacts/gitlab-compatibility/crossblock-caret-20261117/comparison-1/report.md).

## Workflows and results

Four fresh issues exercise keyboard and actual mouse drag selections, each
forward and backward, from within one paragraph into the next. The selected
fragment contains bold text and a link:

```text
Start [critical tail.

Next linked] end.
```

Selection direction, focus and exact DOM text are recorded. Keyboard profiles
first verify that the real caret is in the intended paragraph and reaches its
Home/End boundary before movement. Off-document Range reads measure coordinates;
no DOM selection or editor model is assigned. Input uses a declared 20 ms key
delay and 700 ms settling; this is not a rapid-input benchmark.

Copy and cut use the actual clipboard, initialized with a sentinel. Paste into
a generic rich field and a real textarea; inspect exact paragraph text, bold
content, link label/target and plain-text separation. Undo the cross-paragraph
cut, paste into a verified empty paragraph, undo/redo paste, then save through
GitLab and reload/reopen. API calls establish fixtures and inspect saved data;
they do not perform editing, selection, clipboard, history or Save actions.

**188 parity outcomes and 16 improvement outcomes, with zero regression,
shared-limitation or missing outcomes across 204 checks.** Both comparison and
candidate acceptance gates pass for this corpus. The checks are correlated;
this is not evidence for 204 independent features or 16 independent improvements.

The improved outcomes all concern one underlying behavior. The original editor
copies/cuts the fragment's plain text as `critical tail.Next linked`; the actual
textarea paste has the same missing separator. Fountain writes
`critical tail.\nNext linked`, retaining separation. Copy, cut, pre-paste payload
and external plain paste are checked in each of the four selection profiles.
Both preserve rich paragraph boundaries, bold/link semantics, cut/paste history
and saved reopening. These results concern this pinned GitLab integration,
not every Tiptap version or host application.

## Reproduced and repaired Fountain UI defect

The initial native run exposed a link-action popover covering GitLab's Save
button after pasted-link undo/redo. Normal pointer clicks timed out; the
[retained failure capture](../../artifacts/gitlab-compatibility/crossblock-20261117/fountain-2/keyboard-forward-failure.png)
shows the obstruction. The native component now places actions above their link.
The fresh fixture checks the actual Save-button hit target before a normal
click, and every case saves/reopens successfully. No forced clicks, popup
removal, DOM mutation or extra dismissal actions bypass this requirement.

The final original/native backward-selection, external-paste, pasted-link and
reopened captures were physically inspected. The repaired popup remains visible
and Save is clear. Original keyboard reopen captures show the saved content,
but the original backward-mouse reopen frame is blank despite its loaded-heading
and semantic DOM receipts. Retain that frame as an unresolved paint/capture
anomaly, not a Fountain improvement. The 204 outcomes cover the declared DOM,
clipboard, persistence and hit-target invariants; they do not certify that
anomalous visual frame. A follow-up must distinguish capture readiness from
original-editor paint behavior. DOM/clipboard/API receipts provide direction
and semantic proof that screenshots alone cannot provide.

## Observation contracts and retained inadequate runs

Browser selection text, clipboard text and root HTML `textContent` are distinct
representations. For this two-nonempty-paragraph fixture, one LF or one blank
line expresses the plain-text boundary. Missing separators, extra empty lines,
CR, invisible alterations and other character changes remain different.
Paragraph text is compared exactly; only ASCII HTML-formatting whitespace
outside paragraph elements is ignored. Other outside text is explicitly checked.
No Fountain/CommonMark/ProseMirror AST equality is required.

- [Initial pair](../../artifacts/gitlab-compatibility/crossblock-20261117/comparison-1/report.json): native Save is blocked. The instrument also equates DOM selection's two LFs with clipboard bytes and mistakes exporter formatting whitespace for document text. Its four apparent text regressions are not accepted product regressions; the genuine Save obstruction is retained. [Exact instrument/archive](../../artifacts/gitlab-compatibility/crossblock-20261117/initial-instrument/manifest.json).
- [First semantic pair](../../artifacts/gitlab-compatibility/crossblock-ready-20261117/comparison-1/report.json): native cases complete, but original backward keyboard input selects different text before copy. Without pre-movement caret receipts, the suite is incomplete and its apparent selection improvement is not endorsed. [Exact instrument/archive](../../artifacts/gitlab-compatibility/crossblock-ready-20261117/instrument/manifest.json).
- The first original preflight lacked the required Linux headless Chromium binary. Its [failed receipt](../../artifacts/gitlab-compatibility/crossblock-20261117/original-1/report.json) remains separate. Installing the locked browser binary changes no editor expectations.

The final caret-ready profile does not establish that the earlier timing anomaly
was fixed. Keep rapid/repeated input investigation open. Never overwrite these
runs or rerun silently until only successes remain.

## Reproduce and remaining scope

Use the [prepared pinned runtime](runtime/README.md), stopped before each switch.
The [collected fixture bytes](../../artifacts/gitlab-compatibility/crossblock-caret-20261117/fixture-collection-bytes.json)
are retained as Base64 with their SHA-256 so Git newline normalization cannot
invalidate the old receipt. The committed LF fixture has identical parsed JSON.
Choose a fresh ID; the runner and comparator refuse existing output directories:

```sh
PAIR_ID=crossblock-example-20261117
node scripts/run-gitlab-compatibility.mjs --editor original --run-id "$PAIR_ID" --suite crossblock
node scripts/run-gitlab-compatibility.mjs --editor fountain --run-id "$PAIR_ID" --suite crossblock
node scripts/compare-gitlab-compatibility.mjs \
  --original "artifacts/gitlab-compatibility/$PAIR_ID/original-1/report.json" \
  --fountain "artifacts/gitlab-compatibility/$PAIR_ID/fountain-1/report.json" \
  --output "artifacts/gitlab-compatibility/$PAIR_ID/comparison-1"
```

Fresh checks: **1404 integration tests / 54 files**, including 40 comparison-policy
tests, strict TypeScript and the rebuilt real GitLab frontend. The five earlier
accepted corpora [replay unchanged](../../artifacts/gitlab-compatibility/crossblock-caret-20261117/prior-corpus-replay.json);
that replay is interpretation evidence, not fresh browser execution.
The isolated application is stopped. No package API, capacity limit, dependency,
version, registry publication or marketing claim changes.

This covers two adjacent, single-line ASCII paragraphs in Linux desktop Chromium.
Wrapped lines, graphemes/bidi/IME, empty blocks, table grids, annotations/custom
node ownership, external Word/Docs, roles, repeated/rapid/concurrent input,
other browsers, mobile/touch and matched restart remain. Shared Applied-history
retention and meaningful blank-line replacement remain unmet requirements.
No full GitLab parity or release approval follows from this corpus.

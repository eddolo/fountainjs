# Matched rectangular table clipboard results — 2026-11-17

Two real issue-description workflows ran against GitLab CE 19.5.3 with its
original Tiptap editor and the Fountain replacement. The same pinned backend,
fixture, actor, browser and collector were used sequentially. The deployed
editor and frontend assets differ deliberately; the backend was not replaced.

The final result is **42 parity checks, zero improvements, regressions, shared
limitations or incomplete checks**. These are correlated invariants in two
workflows, not 42 independent capabilities. Both scoped gates pass. This does
not establish complete GitLab compatibility or a general Tiptap advantage.

## What was exercised

Actual forward and backward Shift-click selections copy/cut a 2×2 body-cell
rectangle from a three-column table. The third column must remain untouched.
Real system clipboard copy/paste is checked in a separate browser textarea and
rich editable field, then pasted into a second table that must grow a row.
Undo/redo, ordinary Save and a fresh rich-editor reopen must preserve exact
cell roles, geometry, paragraph text, bold, links and surrounding prose.
A source paragraph in the unselected column must keep byte-identical PNG pixels
through copy and cut selection. The external fields are generic browser controls,
not evidence of Word, Google Docs or other application-specific compatibility.

API calls only create/inspect fixtures and confirm persistence. Editing uses real
pointer, keyboard and clipboard actions, not private editor commands, synthetic
clipboard events or direct model injection. See the [collector](../../scripts/audit-gitlab-compatibility-grid.mjs)
and [fixture](fixtures/compatibility-grid.json).

## A real visual regression found and fixed

The initial pair passed 38 semantic checks, but visual review showed that
Fountain's linear DOM selection also painted text in the unselected third column.
Correct clipboard data did not make that presentation acceptable. The initial
observations, instruments and negative screenshots remain retained separately.

The repair scopes native selection-paint suppression to a focused Fountain view
with existing selected-cell markers. The markers already paint the intended
whole-cell rectangle. No transaction, selection mapping, clipboard or history
algorithm changed. Ordinary text selection paints again after leaving cell mode.
Four adjacent identical CSS declarations were combined into comma selector lists
with their original selectors/specificity. Net stylesheet growth is five bytes:
91,242 → 91,247, below the unchanged 91,264-byte limit. No acceptance limit changed.

A separate real-browser pixel regression failed in Chromium before the repair.
With the same assertions, Chromium, Firefox and WebKit all pass: both pointer and
keyboard cell selection leave the outside paragraph unchanged; ordinary text
selection is a positive control. The before capture changed 3,051 outside pixels;
after the repair all six outside-region checks change zero pixels. Recorded
videos and traces remain local, and screenshot hashes are retained.

The native GitLab stylesheet was installed with its guarded installer and the
actual frontend rebuilt before the fresh matched pair. Final native forward and
backward selection, cut, destination paste, external transfer and reopen captures
were visually inspected from their original PNG bytes, along with original-editor
selection/reopen controls. The third column remains unpainted and the destination
has the intended four body cells. This supports scoped parity, not superiority.

## Verification and retained evidence

- [Final comparison](../../artifacts/gitlab-compatibility/grid-paint-20261117/comparison-1/report.md)
- [Original observations](../../artifacts/gitlab-compatibility/grid-paint-20261117/original-1/report.json)
- [Fountain observations](../../artifacts/gitlab-compatibility/grid-paint-20261117/fountain-1/report.json)
- [Initial semantic-only comparison](../../artifacts/gitlab-compatibility/grid-transfer-20261117/comparison-1/report.md)
- [Initial instrument snapshot](../../artifacts/gitlab-compatibility/grid-transfer-20261117/initial-instrument/manifest.json)
- [Public pixel evidence](../../artifacts/cell-range-paint-pixel-evidence-20261117.json)
- [Validation and source hashes](../../artifacts/gitlab-compatibility/grid-paint-20261117/validation.json)
- [Earlier-corpus interpretation replay](../../artifacts/gitlab-compatibility/grid-paint-20261117/prior-corpus-replay.json)

`pnpm run check --maxWorkers=2` exited zero: build, API/package contracts,
server/headless runtimes, Markdown/math references, DOCX interoperability,
unchanged size/performance budgets, TypeScript/Svelte/Angular checks and all
**6,861 unit tests across 400 files** passed. The targeted recorded desktop
browser journey passed three projects with one worker and no retries. This is
not a rerun of the full browser matrix or hosted release CI.

Reproduce using fresh immutable run IDs and the guarded deployment described in
[the suite instructions](COMPATIBILITY_RESULTS.md#reproduce): run each editor with
`node scripts/run-gitlab-compatibility.mjs --editor original|fountain --run-id NEW_ID --suite grid`,
then compare the two report files with `scripts/compare-gitlab-compatibility.mjs`.
Run sequentially against the stopped isolated application. Never overwrite a
failed attempt or reuse a semantic-only result as visual acceptance.

## Merged-cell clipboard and Save

Chromium 151 compared Fountain `7c85ae01` with the packaged editor on GitLab CE 19.5.3. Both editors copied horizontal and vertical two-cell spans, pasted rich tables into an external editable surface, cut and restored the source, and pasted into a smaller table. Undo, redo and reopening the saved issue retained the geometry, bold text and link. The neighboring unselected cell retained its appearance.

All 42 checks completed. The 34 parity checks include the reopened geometry. The eight improvements measure one plain-text difference at four observation points across two fixtures. Fountain retained the empty TSV slot covered by a merged cell. Stock omitted its tab, shifting the position of following cells in the vertical-merge case.

The initial Fountain run stopped before Save when a table screenshot missed full visibility by a fraction of a pixel. A separate codec test using real GitLab preview HTML reproduced a conversion failure after editing another paragraph. The repair emits GitLab-supported HTML for merged text tables and retains pipe Markdown for ordinary tables. Stored column widths still produce a conversion issue. The final browser runs centered each table before applying the original full-visibility check on both builds.

[Matched results and builds](../../artifacts/gitlab-compatibility/merged-grid-20261119/comparison-2/report.md) · [Initial incomplete run](../../artifacts/gitlab-compatibility/merged-grid-20261119/comparison-1/report.md) · [GitLab preview samples](fixtures/merged-grid-live-html.json). Reproduce with the paired runner, a fresh run ID and `--suite merged-grid`.

## Merged header and linked body cell

On GitLab CE 19.5.3 in Chromium 151, the author selected a header spanning two columns and the two body cells beneath it. Both editors preserved the header role, span, bold text and Runbook link in a separate rich browser field and in the destination table after saving and reopening. Cut and undo restored the source. Paste, undo and redo preserved the adjacent cells and untouched last row. Fountain retained the trailing tab representing the second header column in plain text. Stock omitted it. The four improvement checks observe that one difference during copy, cut, before paste and in the external plain-text field. The other 17 checks matched. [Results and build identities](../../artifacts/gitlab-compatibility/header-grid-20261120/verified/report.md)

Reproduce with `--suite header-grid --browser chromium` on each editor using the paired runner above.

## Paste into LibreOffice Writer

The optional `--writer-paste` run adds a native Linux Writer process to the merged-header workflow. Chromium copies the real GitLab selection on a private X11 display. Writer uses its Paste command, saves an ODT, closes it, and reopens it. The collector reads the Writer cells, bold text and link destination before and after reopening. It reads the merged span from the saved ODT and captures Writer’s window. The test uses a fresh Writer profile for each run.

On the pinned Chromium 151 and GitLab CE 19.5.3 builds, Writer 24.2.7.2 reopened a native table from each editor. Both retained the exact cell text, bold emphasis, Runbook hyperlink and two-column span. Writer displayed a borderless table and left repeating header rows disabled in both ODTs. All nine Writer checks matched. Across the whole run, 26 checks matched and four recorded the same plain-text tab advantage described above. The final screenshots wait for the reopened page to paint. An earlier fixed-delay capture on stock showed only the Writer canvas. [Matched build report](../../artifacts/gitlab-compatibility/writer-header-grid-20261120/comparison-2/report.md) · [Fountain ODT](../../artifacts/gitlab-compatibility/writer-header-grid-20261120/fountain-2/writer-paste.odt) · [Stock ODT](../../artifacts/gitlab-compatibility/writer-header-grid-20261120/original-2/writer-paste.odt).

With Chromium and the pinned GitLab installation prepared, install the Ubuntu packages `xvfb`, `xauth`, `libreoffice-writer`, `python3-uno` and `python3-pil`. Run the two editors sequentially from the checkout:

```sh
run="writer-paste-$(date +%s)"
for editor in fountain original; do
  xvfb-run -a node scripts/run-gitlab-compatibility.mjs --suite header-grid --writer-paste --browser chromium --editor "$editor" --run-id "$run" || exit 1
done
dir="artifacts/gitlab-compatibility/$run"
node scripts/compare-gitlab-compatibility.mjs --original "$dir/original-1/report.json" --fountain "$dir/fountain-1/report.json" --output "$dir/comparison"
```

## Paste from LibreOffice Writer into a GitLab issue

Writer 24.2.7.2 authored a table with a two-column header, bold text and a hyperlink. On an isolated X11 display, Chromium 151 pasted the native clipboard into issues #663 and #664. Each editor then undid and redid the paste, saved the issue and reopened it. The collector compared the text of each cell with Writer’s own document model, including leading and trailing whitespace. It also checked the issue API and GitLab reader. [Original ODT](../../artifacts/gitlab-compatibility/writer-import-20261120/fountain-2/writer-source.odt) · [Writer window](../../artifacts/gitlab-compatibility/writer-import-20261120/fountain-2/writer-source.png) · [Reopened Fountain issue](../../artifacts/gitlab-compatibility/writer-import-20261120/fountain-2/writer-import-reopened.png)

Fountain build `44219116` saved Writer’s HTML formatting indentation as a newline and four tabs inside each cell. A standalone clipboard regression reproduces this outside GitLab. Build `56b722e7` removes the Writer-generated prefix while retaining intentional content. The original report’s cell collector trimmed whitespace, but its stored issue Markdown records the defect. [Before repair](../../artifacts/gitlab-compatibility/writer-import-20261120/fountain-1/report.json) · [Repaired issue](../../artifacts/gitlab-compatibility/writer-import-20261120/fountain-2/report.json)

All eight Fountain checks passed. Five matched stock. Three observed the same difference at paste, redo and rich reopen. Stock’s editable cell paragraphs ended in an extra space at each stage. Both saved issues displayed the correct text in the reader. These checks cover a native Writer table on the pinned Linux Chromium and GitLab CE 19.5.3 builds. [Matched report and build identities](../../artifacts/gitlab-compatibility/writer-import-20261120/verified/report.md) · [Stock issue](../../artifacts/gitlab-compatibility/writer-import-20261120/original-2/report.json)

To repeat this direction, use the runner and comparison commands above with `--suite writer-import` in place of `--suite header-grid --writer-paste`.

## Author and edit a table in an issue description

Run the paired runner above with `--suite table-authoring`. In the rich editor, insert a two-row, three-column table, type all six values, insert and delete rows and columns, merge and split two headers, then delete the table. Undo, redo and undo again before saving. Read the stored issue through the API, reload the reader and reopen the rich editor.

On Fountain build `bd3995d3` the header retained two paragraphs after splitting, but the GitLab adapter refused to save them. [Failed Save](../../artifacts/gitlab-compatibility/table-authoring-20261120/fountain-5/report.json) · [Browser screenshot](../../artifacts/gitlab-compatibility/table-authoring-20261120/fountain-5/table-interrupted.png). Build `c088660e` exports that cell with two HTML paragraphs. Its codec test reimports the serialized table and compares its entire document tree. The browser comparison checks cell roles, spans, text and position. Fountain preserved the blank paragraph authored with Enter before table insertion, while stock consumed it. The table comparison does not grade this surrounding spacing.

In Linux Chromium 151 all 16 Fountain checks passed on the pinned deployment. Fourteen matched stock. At both undo observations following deletion, Fountain restored the latest split header immediately. Stock showed the earlier merged header at those observations, although its saved table reopened split. [Matched report](../../artifacts/gitlab-compatibility/table-authoring-20261120/paired/report.md) · [Fountain reopened](../../artifacts/gitlab-compatibility/table-authoring-20261120/fountain-7/table-reopened.png) · [Stock reopened](../../artifacts/gitlab-compatibility/table-authoring-20261120/original-7/table-reopened.png).

## Checklists inside merged issue tables

Run the paired issue workflow above with `--suite merged-table-tasks`. It opens an existing release checklist, checks “Verify backup”, adds “Filed.” to the paragraph below the list, and saves. The API records the Markdown. The reader and reopened rich editor are checked for both merged spans, the surrounding cell text and all three labelled task states.

All five checks matched stock in Chromium 151. Fountain `4c32cdb2` and stock GitLab retained both merged spans, labels, paragraph edits and all three task states in the editor and reader. The first Fountain export added 32 pixels of row height by wrapping simple cell text in paragraphs. After the fix, the two 669 × 260 reader screenshots had identical RGB pixels. [Matched builds and checks](../../artifacts/gitlab-compatibility/merged-cell-tasks-20261121/final/report.md) · [Fountain reader](../../artifacts/gitlab-compatibility/merged-cell-tasks-20261121/fountain-3/saved-checklist.png) · [Stock reader](../../artifacts/gitlab-compatibility/merged-cell-tasks-20261121/original-2/saved-checklist.png)

For a checklist inside an HTML table, leave a blank line on each side of a Markdown task list within the cell. The GitLab CE 19.5.3 renderer also supports an isolated `[x]` in a pipe-table cell. Inside a raw HTML cell the same marker renders as literal text, and a raw checkbox input disappears. When an author merges cells containing standalone checkboxes, Fountain retains the draft and explains the two choices. Undo the merge to keep the pipe table, or click a cell and choose **Table actions → Convert table checkboxes to checklist items**. Conversion applies to the active table. It keeps the checkbox values and leaves their labels editable. [Seven renderer examples](fixtures/merged-task-cell-renderer.json)

### Recover standalone checkboxes after merging cells

Run `--suite table-checkbox-recovery` on the original and replacement editors. The release-gate fixture has three columns and separate checked, pending and not-applicable states. The author edits the issue status, selects two checkbox cells and merges them.

On GitLab CE 19.5.3 in Linux Chromium 151, Fountain `5cb44f52` kept the draft open when Save was attempted before conversion. The saved issue still contained its original Markdown. The author converted the checkboxes, undid and redid that conversion, then saved. Issue #715 reopened with one two-column cell containing both tasks, the neighboring pending item and the edited status. Stock issue #714 kept the task states and status text, but its merged cell became two cells again on Save. Three checks matched. The two improvements measure the same merge surviving in the reader and reopened editor. This result covers unaligned cells in an issue description. [Matched results and builds](../../artifacts/gitlab-compatibility/table-checkbox-recovery-20261121/verified/report.md) · [Recovery message](../../artifacts/gitlab-compatibility/table-checkbox-recovery-20261121/fountain-1/merge-recovery.png) · [Fountain reader](../../artifacts/gitlab-compatibility/table-checkbox-recovery-20261121/fountain-1/saved-checkboxes.png) · [Stock reader](../../artifacts/gitlab-compatibility/table-checkbox-recovery-20261121/original-1/saved-checkboxes.png)

## Centered and right-aligned issue checkboxes after a merge

Use `--suite table-checkbox-recovery --aligned-checkboxes` on each editor with the same run ID. Each issue starts with three checkbox states in separate cells. The author edits the issue status, merges two cells, saves, reloads the reader and reopens the rich editor. The Fountain run also attempts Save before conversion and checks the original Markdown, then converts, undoes and redoes. The collector measures each checkbox center relative to its cell and retains the saved reader screenshots.

On pinned GitLab CE 19.5.3, Linux Chromium 151 recorded eight parity checks and eight improvement checks for Fountain `0f7b324c`. Both readers positioned the controls according to the authored alignment. Stock split the merged cell on Save and showed its rich-editor controls on the left. Fountain retained the merge, all three states, the edited prose and the requested placement through reopen. In a 419 CSS pixel merged cell, the final reader placed the centered control at 213.5 px and the right-aligned control at 394.5 px. Visual inspection confirmed a tick for checked, a dash for not applicable and an empty box for pending. [Matched builds and checks](../../artifacts/gitlab-compatibility/aligned-checkboxes-20261121/final/report.md) · [Centered reader](../../artifacts/gitlab-compatibility/aligned-checkboxes-20261121/fountain-3/center-saved-checkboxes.png) · [Right-aligned reader](../../artifacts/gitlab-compatibility/aligned-checkboxes-20261121/fountain-3/right-saved-checkboxes.png).

On [Firefox 153](../../artifacts/gitlab-compatibility/aligned-checkboxes-firefox-20261121/verified/report.md) and [WebKit 26.5](../../artifacts/gitlab-compatibility/aligned-checkboxes-webkit-20261121/verified/report.md), the same Fountain build passed all 16 checks per engine. Both completed stock runs kept the merge, and their checkbox controls were left-aligned in the editor and reader. Each pair recorded ten parity checks and six improvements. The [first stock WebKit attempt](../../artifacts/gitlab-compatibility/aligned-checkboxes-webkit-20261121/original-1/report.json) timed out opening the table merge menu in the centered case. The matched comparison used a complete retry with the same fixture. The saved [Firefox](../../artifacts/gitlab-compatibility/aligned-checkboxes-firefox-20261121/fountain-1/right-saved-checkboxes.png) and [WebKit](../../artifacts/gitlab-compatibility/aligned-checkboxes-webkit-20261121/fountain-1/right-saved-checkboxes.png) readers showed distinct checked, not-applicable and pending controls. These were Linux desktop browser runs.

The [earlier matched run](../../artifacts/gitlab-compatibility/aligned-checkboxes-20261121/before-reader-fix/report.md) found two reader regressions even though the source retained its alignment. GitLab pins Markdown list checkboxes to the left gutter. The replacement's issue-reader stylesheet keeps controls and labels together in explicitly aligned cells. A later [screenshot before the paint fix](../../artifacts/gitlab-compatibility/aligned-checkboxes-20261121/fountain-2/right-saved-checkboxes.png) caught a missing tick and dash after positioning passed. The original source and geometry receipts are retained. The packaged stock reader has its own styles after rollback. Cells mixing different paragraph alignments still require a richer serialization path. This issue comparison does not establish collaborative wiki behavior or physical-device input.

## Remaining scope

Complex overlapping spans, Unicode/IME, nested content, ownership rules, rapid input, other
external applications, permissions/concurrency, physical mobile devices and
matched restart remain separate requirements. The earlier shared Applied-history
failure and blank-line suggestion limitation remain open. No overall roadmap
percentage, release version or public marketing claim is promoted by this result.

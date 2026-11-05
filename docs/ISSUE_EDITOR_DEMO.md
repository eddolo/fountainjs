# Issue-editor workflow demo

Open [the workflow lab](https://eddolo.github.io/fountainjs/issue-editor.html).
It is an unofficial GitLab-style issue-description workflow, not a GitLab clone,
integration, affiliation or claim of full GitLab Flavored Markdown compatibility.
It is featured above the ten environment integrations in the gallery and in the
[real-world workflow hub](https://eddolo.github.io/fountainjs/workflows.html).

## Ownership and APIs

- The host React form owns the issue title, mode buttons, local files and errors.
  No API submission, accounts, automatic storage or online issue creation exists.
- `StarterKit` supplies schema and editing plugins. `FountainComposer` supplies
  a configurable toolbar and browser view. Tables use contextual controls.
- Create one `Schema`, call `MarkdownImporter.parseWithSource(source, schema)`,
  then create `EditorState` with that same schema and parsed document. Pass that
  state to `useFountain`. Source snapshots compare typed nodes: reconstituting
  them in a different schema instance can lose provenance even before an edit.
- `MarkdownExporter.exportWithSource(editor.state.doc, snapshot)` produces
  `markdown`, `preservation` and `losses`. Show those results, not a hard-coded
  fidelity badge. Raw source is displayed in a textarea, never as live HTML.
- Leaving the raw view reparses with `editor.state.schema` and applies
  `editor.createTransaction().replaceDocument(parsed.document)`. A rejected
  update leaves raw source available. Only accepted parsing replaces provenance.
- The visual editor stays mounted when changing modes, retaining history.
  The reader mounts a separate `editable: false` editor without author tools.
  This is a presentation distinction, **not server-side authorization**.
- The host `imageUpload` adapter accepts raster files up to 2 MiB and reads
  them as data URLs. There is no upload server. A real product supplies storage,
  authentication, durable URLs and an appropriate asset policy. Imported remote
  images and followed links may access the network: this is not a sandbox.
- Download/open use local Markdown files, bounded to 8 MiB on import. The issue
  title is not Markdown content and stays host-owned. JSON metadata/history and
  arbitrary extensions are not preserved by claiming Markdown is a native format.

## Export checks and long drafts

Full Markdown serialization runs when the author chooses **Check Markdown
export**, opens source, or downloads from the visual/reader surface. It does not
run during document rendering or each keystroke. The diagnostics show **Not
checked for this draft** until a result exists for the current immutable document,
source snapshot and table option. A different document/snapshot/option hides the
old result and warnings. A title-only change does not invalidate a document report.
Every requested structured export uses the editor's current state; it does not
reuse an older report for download. Export errors remain visible in the host form.

Raw mode has a separate unapplied text buffer. Its check button is disabled and
its download saves that buffer without converting it. Opening Visual editor or
Reader preview applies a successfully parsed update before returning to structured
editing. Reports do not claim to describe uncommitted raw edits.

The author and reader opt into the existing viewport renderer above 250 top-level
blocks. The complete document remains in the model; only the visible window and
selection endpoints mount in the DOM. The demo does not claim that every block is
mounted, that browser-native find can search unmounted content, or that a 100k
benchmark ran on this page. The editor's document search and explicit full-document
exports operate on the model. Applications can choose full rendering instead when
needed by their accessibility, capture or native-DOM workflows.

The native document-boundary path now uses that full model for Ctrl+Home/End and
Mac-style Command+Up/Down, with Shift retaining the native selection anchor.
It reuses existing focus targets, endpoint pinning and selection mapping, respects
plugin handlers/embedded controls/composition, and supports read-only readers.
The public view signatures are unchanged; the API review compares the two changed
declarations against the actual parent archive and removes only the added private
handler line before requiring exact equality.

`tests/browser/issue-input-journey.ts` imports a 5,000-paragraph draft through the
real file control and types native keys. Its observer wraps the actual loaded
public exporter and delegates unchanged; requested exports are positive controls.
It records before-input-to-two-animation-frame samples without treating them as
paint/INP certification or imposing timing allowances. The journey checks zero
exports during typing/import, checks at explicit actions, native first/last edits,
full expected-model/source equality after download/reopen, raw-buffer download,
virtual reader navigation, and invalidation of real pipe-table warnings before a
fresh HTML compatibility notice. This does not suppress legitimate export warnings.

The nonempty contentDOM pointer path acquires root focus with `preventScroll`
before native placement, when the root owns the event and no embedded control
owns focus. A recorded regression returns from the far model caret through the
host title and inserts/deletes at the clicked first paragraph. An earlier Firefox
journey inserted at the old last paragraph; the exact intermittent browser cause
is not proven. Three repeated Firefox journeys and the final three-engine matrix
pass the strengthened native focus check. This is scoped evidence, not a general
Firefox or physical mobile certification.

Local verification: 3,898 unit tests in 266 files; twelve recorded desktop
journeys; 45 captures plus six sampled frames per recording reviewed; a separate
production Chromium writing/download/reopen journey; 244 actual-packed-package
checks through root/core ESM/CommonJS without a fake DOM. Full current-head CI and
aggregate size review remain open. The first final performance run failed one
server-HTML timing limit; an isolated unchanged rerun passed, with both retained.
See `artifacts/issue-input-verification-20261104.json` for measurements and limits.
The production recording shows a long blank startup before the editor renders.
Startup profiling remains open; successful writing/file handoff is not startup
responsiveness certification.

## Optional site fonts

The demo site's eight shared startup modules call `loadSiteFonts()` explicitly.
The font stylesheet uses inactive screen media until its load event, then applies
the original Manrope/DM Mono typography. The system font stack renders while the
request is pending or unavailable. This is website setup, not an editor/core
import, and it adds no dependency to the published library.

The production pending-font journey types before releasing an intercepted font
stylesheet, then checks that the stylesheet applies and content survives. Video
and trace record that pending phase; the screenshot is taken after release since
Firefox's screenshot API itself waits for `document.fonts.ready`. Actual external
fonts and startup timings are measured separately. The earlier blank-start
finding is addressed within this scope; physical devices, all network conditions
and general production startup certification remain unproven.

## Table handoff policy

The **Table export** selector exposes the existing `tableFormat: 'pipe' | 'html'`
export option. Pipes remain the default for compatibility. Choose HTML tables
before switching to source or downloading when your table has no header, mixed
header/data roles, merged cells, or multiple blocks per cell. Supported HTML
table structure is retained; arbitrary metadata and all CSS are not guaranteed.
The compatibility warning remains visible because other Markdown readers must
support HTML tables too.

`issue-markdown-policy.ts` supplies a `parseHTMLBlock` adapter to every source/file
import in this workflow. It accepts table/definition-list-root blocks whose schema
projection contains only tables or definition lists, using `ServerHTMLImporter.parse`; unrelated raw HTML stays
inert. There is no HTML injection or script execution. This is a host policy, not
a change to Fountain's default Markdown importer. Supported table links/images
still have the normal URL/network boundaries described above.

The toolbar also supports [definition lists and glossaries](DEFINITION_LISTS.md):
insert a list, add term/description pairs, edit each entry, delete/undo, and reopen
the downloaded HTML-bearing Markdown in the reader. This is the same local file
handoff, not a new account or server integration.

Unchanged captured source remains exact even if the export selector changes:
the option governs regenerated tables, not a forced whole-file conversion.
The selector is disabled while editing raw source, since download saves that
buffer verbatim. Reopening a file is an undoable document replacement.

`tests/issue-markdown-tables.test.ts` checks this actual host policy in pure Node.
`tests/browser/issue-table-handoff-journey.ts` checks pasted headerless/mixed/merged
cells, multiple paragraphs, rendered bold weight, source switching, file download,
reopen/undo/redo and desktop/narrow reader views. Its paste event exercises the
clipboard payload handler, not an operating-system clipboard permission audit.

## Try it

1. Switch to Markdown source. Notice the tilde code fence, double underscores,
   and the `[host-docs]` definition immediately before the last paragraph.
2. Return to the visual editor and edit the reproduction paragraph only.
3. Undo/redo, then inspect source: safely mapped untouched blocks retain their
   original source. Changed blocks are regenerated, not byte-preserved.
4. Edit the environment table in raw mode and open Reader preview.
5. Download the draft, reopen it, toggle a task and undo that change.
6. Insert an image using the toolbar's local image control. Inspect its preview,
   alt text and exported Markdown before storing anything in a real product.

Root reference definitions, whether standalone or directly before content,
survive unrelated visual edits and block moves/deletions. Supported native nested
list/quote edits also retain shared container definitions. Other ambiguous or
unsupported mappings can still require canonical export after an edit.
Exact untouched-document source preservation does
not mean Fountain understands all syntax. See [the full contract](MARKDOWN_SOURCE.md).

For a literal-text round-trip check, put `Keep \~literal\~ and writer\@example.com.`
in the Markdown source tab, switch to Visual editor, and add ordinary text before
it. Download/reopen the draft or switch back through source: the visible tildes
must remain text, and the address must remain unlinked. The regenerated Markdown
contains protective escapes; actual links still use explicit link syntax. The
recorded `markdown-literal-journey.ts` also checks undo/redo and reader preview.

To test literal line endings, enter `Incident timeline&#10;# not a heading` in
the source tab. The visual editor should show two lines inside one paragraph,
not create a heading. Edit the first line, download/reopen the draft and check
the reader. `markdown-newline-journey.ts` verifies exact characters and displayed
line positions, including multiline code, history and a narrow reader viewport.
See [literal text line endings](MARKDOWN_SOURCE.md#literal-text-line-endings-versus-markdown-line-breaks)
for how these differ from Markdown soft breaks and structural hard-break nodes.

The diagnostics count the actual document's top-level blocks. This page does
**not** run 100k-block benchmarks, collaboration, pagination or Node/Bun/Deno/
Workers; it labels those as inactive/unmeasured instead of presenting checkmarks.
Those capability demos and deployment evidence remain separate work.

The `markdown-escape-journey.ts` regression edits a regex containing a literal
backslash and pipe inside a table code cell, with escaped literal tildes inside
a strikethrough cell. Undo/redo, source switching, download/reopen and the reader
must preserve both cells without creating a third column or losing formatting.

Implementation: `examples/react-app/src/IssueEditor.tsx`,
`issue-example.ts`, `issue-editor.css`, and `issue-main.tsx`.
Shared browser journey: `tests/browser/issue-editor-journey.ts`; recorded entry:
`tests/manual/issue-editor-audit.spec.ts`. Desktop browser tests run the same
journey; a narrow viewport check is emulation, not physical-device certification.

The code language label is metadata, separate from editable source. Clicking or
tapping it enters the beginning of that code block, while ordinary source clicks
and backward Shift-click retain their native positions. The label handler runs
on pointer-down so Firefox cannot first restore a stale heading caret and remove
the click target. `markdown-code-labels-journey.ts` checks the native caret before
typing, unchanged headings, undo/redo, actual download/reopen and desktop/narrow
reader views; mobile projects use a real emulated touch tap for label entry.

`tests/browser/nested-sibling-range-journey.ts` uses real pointer placement and
forward/backward Shift-click to replace text and an intervening image inside
quotes, list items and table cells. It checks actual Markdown downloads, exact
source on undo, redo, reopening and reader preview. Within one cell, Shift-click
extends text; across cells it selects a rectangular cell range. This is bounded
coverage: ranges crossing ancestor containers and structural document endpoints
remain open. The offscreen text selection journey also retains an intermittent
Chromium download-event timeout for investigation; passing retries alone do not
establish its reliability.

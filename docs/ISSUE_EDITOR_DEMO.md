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
survive unrelated visual edits and block moves/deletions. Container definitions and other
ambiguous mappings, can still force canonical export after an edit.
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

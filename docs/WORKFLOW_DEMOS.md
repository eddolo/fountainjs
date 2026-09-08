# Real-world workflow demos

Open the [workflow hub](https://eddolo.github.io/fountainjs/workflows.html),
linked prominently above the [ten integration demos](https://eddolo.github.io/fountainjs/demos.html).
The gallery answers “how do I integrate this?”; these workflows answer “what can
someone actually do with it?” Every example links to its implementation guide.

These are unofficial, independently styled examples, not affiliated products,
connected accounts, compatibility certifications, or claims to replace a whole
application. They use no copied product assets. GitLab documents its
[Tiptap/ProseMirror content editor](https://docs.gitlab.com/development/fe_guide/content_editor/);
Doist publishes its [Tiptap-based Typist editor](https://github.com/Doist/typist).
Those facts motivate the workflows, not a claim that these pages benchmark the
original products or reproduce every feature.

## Issue descriptions

[GitLab-style issue editor](https://eddolo.github.io/fountainjs/issue-editor.html):
visual/Markdown switching, source-retention diagnostics, tables, local images,
download/reopen and a separate reader. See [its API guide](ISSUE_EDITOR_DEMO.md).

## Task briefs

[Todoist-style task workspace](https://eddolo.github.io/fountainjs/task-workflow.html):
three sample tasks, a rich description per task, task switching, due date and
completion controls, adding tasks, reader preview, and Markdown download/reopen.

### Ownership and lifecycle

- `TaskWorkflow.tsx`: React owns task IDs, titles, due dates, completion and which
  task is active. These are ordinary host fields, not an extra Fountain schema.
- Each keyed `TaskPane` creates a Fountain editor through `useFountain`, using
  `StarterKit.schema`, its plugins and a parsed Markdown document. The pane stays
  mounted while hidden, so each task retains its own document and undo/redo history.
  `useFountainState` observes accepted document transactions.
- This deliberately small demo allows at most 20 tasks. A production list with
  thousands of tasks should retain inactive model/state separately and mount
  only active views; this demo is not a virtualization benchmark.
- `FountainComposer` supplies the editing surface and configured toolbar. Common
  prose, lists, quotes, code and marks are exposed without media/table creation
  controls. Imported supported structures still belong to the document.
- `TaskReader` mounts a separate `editable: false` view of a JSON snapshot.
  Switching back reveals the original author view and history. This is a UI
  mode, **not access control**; enforce permissions in the host/backend.
- Markdown export uses `MarkdownExporter.exportWithReport`. The warning count is
  computed from the current document, with details shown when applicable. This
  task example uses canonical Markdown, not the issue demo's source snapshots.
- Opening a file (up to 2 MiB) uses `MarkdownImporter.parse` with the active
  editor's schema and `replaceDocument` in an undoable transaction. Rejected
  imports show an error and do not intentionally replace the draft.
- Download saves **only the description**. Task metadata and histories are not
  Markdown; there is no silent assertion that a `.md` file is a workspace backup.
  Drafts remain in this tab until navigation/reload. No server, account, online
  submission, automatic local storage or Todoist API is connected. Imported
  images and followed links can access external hosts.

### Try the whole journey

1. Edit the launch brief and format text. Switch to the technical-review task.
2. Edit that description, return to the launch brief, and undo/redo. The other
   task must retain its own changes.
3. Set a date and completion, then add a new task with its own description.
4. Open Reader preview; the text remains visible but cannot be typed into.
5. Download a description, change it, and reopen the downloaded file in that
   task. Undo the file replacement to recover the newer draft.
6. Follow Workflows back to the hub, or 10 demos/Developers to the integration
   documentation. Download before navigating away.

Implementation: `examples/react-app/src/TaskWorkflow.tsx`, `task-main.tsx`,
`workflows-main.tsx`, `workflows.css`; Vite emits both HTML entry points.
Automated browser journey: `tests/browser/product-workflow-journey.ts`;
recorded entry: `tests/manual/product-workflow-audit.spec.ts`.
Browser emulation is not physical-device certification.

Verified 2026-09-08: this full discovery/task journey passed in Chromium, Firefox
and WebKit. A separate Chromium run recorded video and desktop/390px screenshots;
the editor, reader, mobile layouts and recording overview were visually inspected.
Evidence is retained locally under `artifacts/workflow-hub-20260908-recorded/`
and `artifacts/workflow-hub-20260908-crossbrowser/`. Full `pnpm check` passed
1,344 tests / 110 files, and the production `/fountainjs/` website build passed.
This is current development-site evidence; it does not retroactively change the
published `0.4.0-beta.1` package or certify every operation in the original products.

## Next workflow candidates

Keep new examples end-to-end: a document/review workspace (pages, comments and
handoff), a block knowledge page, and an academic document using the existing
math/proof labs. Do not advertise them as working product recreations before
their full journeys and exports are verified. Notion and Google Docs are UX
references, **not claims that those products run Tiptap/ProseMirror**.

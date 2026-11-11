# GitLab application integration

This is the integration work area, not a finished replacement or a flagship
application. The current website issue-description example is a smaller workflow
lab and does not satisfy this project's acceptance criteria.

The target is FountainJS in a real GitLab application, using GitLab's actual
accounts, projects, storage, uploads, authorization, issue/MR/wiki workflows and
collaboration services. These services remain real GitLab services. Recreating
their controls with local-only state does not meet the requirement.

## Inspected upstream contract

`upstream.json` pins a GitLab source commit, not an assumed current release.
Reproduce the source-backed inventory with:

```sh
node scripts/audit-gitlab-editor-contract.mjs
```

The audit fetches five immutable upstream files, records their byte counts and
SHA-256 digests, parses the Vue component's props/events/methods/watchers/slots
and its host contract, and inventories the exported editor extensions. It reads
upstream source; it does not execute downloaded code. Its report is evidence
about the interface to implement, not a passing integration test.

GitLab's content editor uses `@tiptap/vue-2`. Fountain's Vue 3 binding cannot
simply be substituted. A Vue 2 lifecycle bridge can mount Fountain's DOM view;
it must implement the inspected GitLab component contract and use the actual
host services. GitLab's Tiptap extensions and collaboration-provider object
also require explicit adapters, not acceptance followed by silent ignoring.

Inspect these upstream files through the pinned source links in the report:

- `content_editor/components/content_editor.vue`: public props, change events,
  focus, loading, Markdown replacement/history, accessibility and slots.
- `vue_shared/components/markdown/markdown_editor.vue`: actual host mode
  switching, templates, input events, draft ownership and editor references.
- `content_editor/services/create_content_editor.js`: asynchronous GitLab
  Markdown rendering, asset resolution, serialization and collaboration.
- `content_editor/extensions/index.js`: the feature inventory, including
  GitLab references, code suggestions, quick-action-related behavior, diagrams,
  uploads, frontmatter, footnotes, table operations and specialized content.

## Implemented integration primitive

`components/fountain_editor_surface.vue` is a real Vue 2.7 Options API component
which mounts the public Fountain `EditorView`. The application owns its editor
model. Removing/recreating the view retains that model's document and undo
history. Runtime `editable` changes update the existing outer view and refresh
its controls. A refused mode change removes the view and reports an error;
switching back can recover without losing the document. This is interaction
state, not backend authorization.

The isolated tool workspace pins GitLab's Vue 2.7.16 runtime and SFC compiler.
It does not add Vue 2 to Fountain's public dependencies or replace its Vue 3
binding. Build the package, then exercise the compiled component with:

```sh
pnpm build
pnpm audit:gitlab-bridge
```

On Linux, native clipboard verification uses a real X11 display:

```sh
GDK_BACKEND=x11 xvfb-run --auto-servernum pnpm audit:gitlab-bridge --headed
```

The November 11 local result is five of six cases passing on Windows: Chromium
and Firefox pass both journeys; WebKit passes refusal/recovery but its native
copy to an external textarea receives empty text. A separate plain HTML control
reproduces the Windows result. The same two component journeys pass in Linux
WebKit on Xvfb, including exact external copy; its independent control passes
too. No assertions, timeouts or skips were changed to obtain the Linux pass.
Initial WSL runs exposed a separate first-click timeout while Wayland remained
available; selecting X11 explicitly resolves it in the recorded run. This does
not establish the precise Windows browser/OS cause or certify physical Safari.
The required hosted CI job retains all six executions and uploads evidence.

[Evidence and remaining boundaries](../../artifacts/editability-integration-20261111.json).

This component is **not** GitLab's complete `ContentEditor` contract: it does not
yet replace its Markdown service, extension/toolbars, upload handling,
collaboration provider or host draft/template behavior. No GitLab backend has
been started or verified. Those integrations and the requirements below remain
necessary before describing the product as ready.

## Full application completion requirements

1. Run a version-pinned GitLab instance and original editor; retain baseline
   data, browser recordings and upstream test results.
2. Implement the complete component and host contract with explicit lifecycle,
   selection/history, loading/failure recovery and read-only behavior.
3. Preserve GitLab Markdown and rendering semantics. Exercise existing content
   as well as newly authored documents. Unknown syntax must not disappear or
   be silently reinterpreted. Cover mentions/references, quick actions, math,
   diagrams, code suggestions, frontmatter, tables, tasks and media.
4. Use real authenticated GitLab APIs for creating, saving, reopening and
   updating issues, MR descriptions, discussions and wiki pages. Exercise the
   existing product's boards and project navigation over those real records.
5. Verify real uploads, links/references, templates, drafts, permissions,
   concurrent users, reconnect/conflicts, keyboard input, mobile and accessibility.
6. Run applicable upstream tests on the replacement. Add native browser journeys
   and visually review the original/replacement outcomes. Persistence must
   survive browser reload and service restart.
7. Demonstrate proposed Fountain improvements with working product features and
   measured evidence. Source fidelity, large documents, structured references,
   review and conversion are candidates, not superiority claims yet.
8. Deliver reproducible installation, configuration, migration/rollback,
   extension/provider contracts and developer documentation. Build the public
   showcase from this working integration and its verified capabilities.

Do not mark this integration complete from a familiar-looking page, an interface
inventory, passing isolated Fountain tests, or a service double. Do not expose
unimplemented actions as working product features. Keep real backend credentials
in host configuration, outside shipped browser assets and source control.

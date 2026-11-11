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

The audit fetches eight immutable upstream files, records their byte counts and
SHA-256 digests, parses the Vue component's props/events/methods/watchers/slots
and its host contract, inventories the exported editor extensions, and records
the document/deserializer/asset service imports and class methods. It reads
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
- `content_editor/services/content_editor.js`: document loads, template/history
  behavior, change suppression, and coordinated collaborative seeding.
- `content_editor/services/gl_api_markdown_deserializer.js`: actual GitLab
  render callback, quick-action handling and ProseMirror/DOM conversion.
- `content_editor/services/asset_resolver.js`: canonical URLs, references,
  placeholders, diagram rendering and quick-action explanations.
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

The initial November 11 surface result is five of six cases passing on Windows: Chromium
and Firefox pass both journeys; WebKit passes refusal/recovery but its native
copy to an external textarea receives empty text. A separate plain HTML control
reproduces the Windows result. The same two component journeys pass in Linux
WebKit on Xvfb, including exact external copy; its independent control passes
too. No assertions, timeouts or skips were changed to obtain the Linux pass.
Initial WSL runs exposed a separate first-click timeout while Wayland remained
available; selecting X11 explicitly resolves it in the recorded run. This does
not establish the precise Windows browser/OS cause or certify physical Safari.
The required hosted CI job retains these cases and the additional lifecycle
journey below, and uploads evidence.

[Evidence and remaining boundaries](../../artifacts/editability-integration-20261111.json).

This component is **not** GitLab's complete `ContentEditor` contract: it does not
yet replace its Markdown service, extension/toolbars, upload handling,
collaboration provider or host draft/template behavior. No GitLab backend has
been started or verified. Those integrations and the requirements below remain
necessary before describing the product as ready.

## Serialized-content lifecycle

`services/serialized_content.ts` implements the non-collaborative document
lifecycle over the actual public Fountain editor. It requires an explicit
codec implementing the host dialect; it does not quietly use ordinary Markdown
as GitLab Markdown. Initial/reopened loads establish a clean undo baseline;
template replacement is undoable. Whole-document transactions preserve root
attributes. Host change subscribers receive actual edits, not initial loads,
selection-only updates or interaction-mode changes.

Newer loads cancel older ones, which settle as `superseded` even if a renderer
ignores cancellation. An intervening document edit causes a typed conflict
instead of overwriting the newer work, including edits followed by undo. Active
rendering errors and refused/invalid document replacements remain explicit.
Disposal cancels pending work and releases subscriptions; the host owns and
destroys the editor separately. A collaboration adapter prohibits this local
replacement route. GitLab's elected seeding/replacement protocol must be adapted
before collaborative Markdown initialization is supported.

Eleven focused tests use the built public package in Node without jsdom. The
recorded Vue 2 journey uses the real ordinary Fountain Markdown importer/exporter
to exercise loads, typing, template application, quote/heading rendering,
undo/redo, reopening and change notifications. It intentionally does not certify
the GitLab dialect or service implementation. The expanded Windows profile is
eight passes/one retained WebKit clipboard failure; Linux WebKit on explicit
X11/Xvfb passes all three cases. Recorded Windows/Linux frames and the detailed
heading/template states receive visual review.

[Lifecycle evidence](../../artifacts/gitlab-serialized-content-integration-20261111.json).

## Rendered-resource and reference resolver

`services/asset_resolver.ts` implements GitLab's six resolver operations:
canonical-to-display URLs, iframe source/provider data, placeholders, reference
expansions, quick-action explanations and diagram image URLs. The host supplies
its actual `renderMarkdown` callback and label-description localizer. Credentials,
HTTP/CSRF handling, project context, permissions and provider authorization stay
in the application. The resolver does not create its own network client or
substitute the public REST endpoint for the internal preview callback.

The implementation uses the existing pinned `parse5` 8.0.1 dependency and the
public Fountain URL gate. It has no browser `document`, fake DOM, script
execution or layout dependency. It reads inert parsed data without fetching
links/images. Canonical input is retained as the safe fallback when URL lookup
fails; references, placeholders and diagrams use their explicit empty fallback.
An optional issue callback distinguishes rendering failure, invalid response
and unsafe returned URL without logging source text or provider error details.

The cache is per resolver/project context, coalesces concurrent identical
requests and evicts failures for retry. Defaults are 100 LRU entries and 4 MiB
of retained UTF-8 request/HTML strings; the HTML/input envelope is bounded at
1 MiB, with 50,000-node/128-depth inspection limits. These are string/structure
bounds, not a measured total-heap guarantee or a concurrency limit. Clearing or
disposing cancels tracked requests, including in-flight requests already evicted
from the LRU. Callers settle even if their provider ignores the optional signal;
the provider must forward that signal to cancel the underlying transport too.
Create a new resolver when project/auth context changes.

`fixtures/service-html.json` now contains twenty-two expression-free literals extracted
from the pinned upstream test module. The extraction script records source and
license hashes and never executes upstream code. The accompanying
`fixtures/GITLAB-LICENSE.txt` retains its copyright/license notice. Refresh with
`node scripts/update-gitlab-service-fixtures.mjs`.

The full unit suite passes 5,348 tests in 329 files and root TypeScript passes.
Thirty-seven focused Node cases cover the eight upstream reference kinds,
suffix expansion, wiki/repository/upload/proxy URLs, embeds, placeholders,
localized quick-action labels, diagram fences, LRU/byte bounds, retry,
cancellation, unsafe URLs, malformed envelopes and structural/UTF-8 limits.
The browser-targeted production bundle compiles at 196,701 raw bytes including
parse5 and the URL gate; it is a private integration prototype, not added bytes
in the shipped Fountain engine. This is not a browser user journey or a running
GitLab service check.

The attempted unauthenticated public Markdown render returns HTTP 401. GitLab's
[API documentation](https://docs.gitlab.com/api/markdown/) requires authentication.
The actual host callback normalizes `html`/`body` and carries quick-action
metadata from its preview route. Neither the public endpoint nor local HTML
fixtures establish that complete contract. Authenticated host-service use,
document conversion/source retention and end-to-end application verification
remain required. No public product/showcase action is added from this fixture
test evidence.

[Resolver evidence](../../artifacts/gitlab-asset-resolver-integration-20261111.json).

## GitLab-rendered document codec

`services/markdown_codec.ts` converts the actual host renderer's `body` through
the public DOM-free HTML importer. `createGitLabSchemaSpec(base?)` adds typed
references and placeholders, plus distinct canonical/display URL attributes on
images and links. It uses Fountain's model and transactions, not ProseMirror or
literal AST compatibility. Register the explicit schema before using this codec
with `SerializedContentController`. The host still supplies its real renderer.

The public `MarkdownSourceSnapshot.capture(source, document)` now binds source
after external conversion. It validates the document without running Fountain's
Markdown parser over a different dialect. It deliberately infers neither source
positions nor frontmatter. The codec retains exact source for an unchanged
document (and provenance-verified automatic caret repair), but edited output is
currently canonical. Untouched-block source retention after edits is unfinished.
Snapshots are import-local, not a persisted source/asset package format.

Current evidence and remaining conversion work:

| Content | Current behavior and limit |
| --- | --- |
| Basic rendered paragraphs/headings/lists/tables | Uses the existing model/importer; this is not full GitLab Flavored Markdown conformance. |
| Issue/MR/user/label/commit paragraph | Typed references keep original syntax separately from visible text and display URLs. Native edits/delete/undo preserve the tested source tokens. Labels retain background color with a contrasting foreground. Broader reference-kind/expansion document cases still need explicit coverage. |
| Repository/upload/proxy images and links | Canonical addresses survive unrelated edits, including tested nested-list/table/linked-image cases. Lazy-loading GIF/proxy addresses are not written back as source. This is address/structure proof, not authenticated asset loading or image visual fidelity. |
| Missing canonical image carrier | Untouched source remains exact; edited export reports the missing mapping and refuses silent URL substitution. Recovering the actual address from source is unfinished. |
| Placeholders | Resolved visible value remains separate from the original placeholder token. |
| Homogeneous nested task lists | Checkbox state comes from the item's own input, not a checked descendant. Mixed task/bullet lists, task-table cells and inapplicable tasks need dedicated adapters. |
| Highlight/underline/subscript/superscript | Ordinary text exports the actual GitLab HTML dialect (`mark`, `u`, `sub`, `sup`). Custom highlight colors, certain combined code/atom formatting and authored layout require an explicit retained representation. |
| Math, diagrams, frontmatter, review suggestions, footnotes, embeds, TOC and other specialized GitLab renderers | Known markers are reported before flattening. Their source-aware GitLab adapters remain required, even when Fountain already has a corresponding native feature. |
| Quick actions | A preview response containing command metadata is refused until a dedicated document/source adapter is implemented. Source is retained; nothing is executed by the codec. |
| Error/recovery and host workflow | Typed import/export issues are available. Complete host error presentation/source-mode recovery, provider/auth context, uploads, collaboration and the full application are still required. |

The new native journey uncovered an engine caret defect: a native parent edge
after an inline atom was incorrectly mapped to preceding text. Firefox also
places End inside the uneditable atom's display text. The engine now maps those
exact edges structurally while leaving native controls/interior positions alone.
Regression cases fail before the repairs and pass afterward. Native typing,
deleting the final reference and undo pass in all three desktop engines. The
expanded profile is 11 passes/one existing Windows WebKit clipboard failure;
Linux WebKit on explicit X11/Xvfb passes all four journeys. Captured states were
visually reviewed; this private fixture is not the running GitLab product.

The source-capture API changes two declaration hashes. Its implementation and
the caret repair measure about 1,455,787 aggregate CJS bytes, 571 more than the prior
runtime. Aggregate capacity changes from 1421.25 to 1421.75 KiB; individual
entries, ESM, CSS, latency and heap ceilings remain unchanged. Earlier archives
are stale. Final packed consumers/hosted CI and publication are still required.

[Codec and caret evidence](../../artifacts/gitlab-codec-integration-20261111.json).

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

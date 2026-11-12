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

`subscribeChange` now reports a discriminated result: `{ status: 'ready',
markdown }` or `{ status: 'error', error }`. An export error does not undo the
already applied edit and must not throw through the editor's remaining view
notifications. The host must clear its current serialized value and prevent
submission on an error; it must not save the last successful string as the
current document. `getSerializedContent()` still throws on conversion failure.
Undo can restore a serializable document. A successful explicit load establishes
a new baseline silently, so its caller must refresh the serialized value and
clear its error state. Host callback exceptions remain application errors;
they are not misreported as converter failures.

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

The later conversion-recovery audit finds and repairs both interrupted view
notifications and unintended navigation from editable reference atoms. Install
`createGitLabReferenceNavigationPlugin()` from `plugins/reference_navigation.ts`
with the GitLab schema/view: ordinary left clicks stay in the draft, while
modified clicks and read-only link use remain browser navigation. This is a
view interaction policy, not authorization or a replacement router.

Four recovery cases and seven reference-interaction cases pass alongside the
existing lifecycle/codec cases (54 focused tests). The earlier full unit run
passes 5,393 tests/333 files, before the seven added navigation cases; root
TypeScript subsequently passes with all new code. Nine compiled Windows native
journeys pass across Chromium/Firefox/WebKit, and all five Linux WebKit/Xvfb
journeys pass, including native external copy. Recorded refusal, continued
typing, undo and explicit reload states receive visual review. The initial
Windows run's accidental-navigation failures and a Firefox context-teardown
timeout are retained; no assertions or timeouts are weakened. This establishes
the scoped component recovery behavior, not real GitLab saving or source-mode
recovery in the complete application.

[Recovery evidence](../../artifacts/gitlab-export-recovery-20261111.json).

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
| Math | The source-backed adapter below covers tested dollar, legacy backtick, inline display and fenced forms, plus retained KaTeX annotations. It reuses native editable math nodes. Additional metadata, delimiter collisions and table-sensitive source still require explicit retention. |
| Diagrams, frontmatter, review suggestions, footnotes, embeds, TOC and other specialized GitLab renderers | Known markers are reported before flattening. Their source-aware GitLab adapters remain required, even when Fountain already has a corresponding native feature. |
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

## GitLab math adapter

`services/math.ts` connects GitLab's renderer carriers to Fountain's existing
`inline_math`/`math_block` nodes. `createGitLabSchemaSpec(base?)` supplies the
native defaults and preserves math node views/renderers already registered in
the base schema. Keep using the public native source controls and math commands;
the adapter does not introduce a second editing engine or a ProseMirror schema.

The adapter retains TeX and syntax separately: `$x$`, legacy ``$`x`$``, display
`$$x$$` within prose, and fenced `math` blocks. Rendered KaTeX requires exactly
one retained TeX annotation; glyph text alone is not accepted as source. Known
inline render wrappers use that annotation too, including GitLab's generated
`math-content-inline` wrapper. When a bare rendered KaTeX span no longer carries
its original delimiter kind, edited output uses the legacy form. Fenced
code controls are removed only from the recognized renderer-owned wrapper.
Unrelated edits preserve the tested TeX form; unchanged documents still return
their exact source through the import-local snapshot. Native math source edits
participate in normal undo/redo. Before a following digit, inline dollar math
uses the same legacy-delimiter fallback as GitLab's pinned serializer.

For a visual renderer, supply the existing caller-owned KaTeX adapter. Inline
display syntax needs document context so its TeX display style is retained:

```ts
import { CoreExtension, composeExtensions, createMathExtension, createKaTeXRenderer } from 'fountainjs-editor';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { createGitLabSchemaSpec } from './services/markdown_codec';

const renderMath = createKaTeXRenderer(katex);
const math = createMathExtension({
  documentRenderer: (latex, context) => renderMath(latex, {
    ...context,
    displayMode: context.displayMode || context.node.attrs.gitlabMathSyntax === 'display',
  }),
});
const kit = composeExtensions([CoreExtension, math]);
const schema = createGitLabSchemaSpec(kit.schema);
// Create the host editor with schema and kit.plugins, plus reference navigation.
```

This uses `createKaTeXRenderer`'s denied-trust boundary. KaTeX remains a host
dependency; no renderer is fetched or installed by a document. Without a supplied
renderer, the native view shows literal TeX with source editing. A complete
`.tex` project/importer is a separate feature.

Malformed/oversized/ambiguous math reports `math-source`. Edited syntax collisions,
extra accessible/semantic/layout metadata and math that could break a Markdown
table produce explicit export issues. The original document/source is retained;
these refusals remain missing conversion capabilities, not parity completions.

`scripts/update-gitlab-math-fixtures.mjs` extracts ten actual upstream
Markdown/rendered-HTML rows and one KaTeX annotation fixture from the pinned
tests, with five source-file hashes (including the actual browser renderer) and
the retained GitLab license. It parses
whitelisted expression-free AST literals without executing upstream code.

Final verification passes 5,437 unit tests/335 files, including 37 math cases;
the focused GitLab set passes 91 cases and root TypeScript passes. Fifteen
compiled Windows journeys pass before the final annotation/description guards,
and a fresh three-engine math journey passes after those guards. All six current
Linux WebKit/Xvfb component journeys pass, including native external copy. The
Windows external-copy failure remains open and is outside the fifteen-case
profile. The targeted math cases overlap the broader profile. Final Firefox
inline/display/block states and Linux block rendering receive visual review;
recordings are retained. This is still private component/service-boundary
evidence, not a running GitLab application or a new combined release gate.

[Math verification and limits](../../artifacts/gitlab-math-integration-20261112.json).

## Full application completion requirements

### Prepared host Markdown handoff patch

`patches/0001-guard-markdown-handoff.patch` changes the actual pinned GitLab host
and rich-editor component, with upstream Jest regressions. The host's change
observer is debounced: reading only its cached Markdown when unmounting the
rich editor can drop the latest edit. The patched parent first calls the child
component's `getSerializedContentForHandoff()`, then publishes that current
string before changing mode. Empty content is valid. Conversion/readiness
failure leaves the rich document mounted and the previous draft untouched.
Restored editing-mode preferences use the same guard.

The original GitLab child checks loading, composition and unapplied source
replacement before calling its existing serializer. Collaborative state is
read from the current model rather than a lagging Markdown prop. The Fountain
surface supplies the same handoff method using an optional trusted-host
`readSerializedContent` callback and native composition tracking. Its callback
must also enforce host loading/replacement state. No ProseMirror compatibility
layer is added to Fountain.

The parent-gate and autosave paths remain the real GitLab paths. The cumulative
patch also includes the submission changes described below. It does not replace
storage, authentication or permission checks. Full source-mode recovery is not
certified by these isolated checks.

Check and apply the reviewed patch to a clean checkout at the exact pin:

```sh
git -C /path/to/pinned/gitlab apply --check /absolute/path/to/0001-guard-markdown-handoff.patch
git -C /path/to/pinned/gitlab apply /absolute/path/to/0001-guard-markdown-handoff.patch
```

After editing the patched checkout, refresh its reviewable patch and method
fixtures with `node scripts/capture-gitlab-handoff-contract.mjs /path/to/pinned/gitlab`.
Capture refuses an unpatched checkout or empty diff before replacing outputs.

The capture requires the pinned HEAD, records original/patched source hashes,
compiles the two SFC templates with the isolated Vue 2.7 compiler, and parses the
upstream Jest additions. The patch is checked against a separate baseline index
at the pin and against the edited working tree in reverse. The selected-method fixtures are
test-only code used by the isolated regression/native page; they are not the
full GitLab component or runtime-evaluated code for a production application.
The upstream Jest suite still needs its full dependency/runtime environment;
parsing the additions is not an executed upstream-test result.

The complete local unit suite passes 5,452 cases/336 files; fifteen handoff
cases plus controller regressions pass all thirty focused cases. Root types pass.
The broader Windows component profile passes 24 selected journeys, excluding the
retained native external-copy failure; nine final handoff journeys pass in the
three desktop engines after the final fixture/composition-control changes.
All nine current Linux WebKit/Xvfb component journeys pass. These profiles
overlap. Source/reopen/refusal/undo frames receive visual review and recordings
are retained. Composition-event cases cover the root and native math source
control synthetically; they do not certify physical IME/mobile input. A separate
baseline worktree proves that capture refuses an unpatched source tree without
overwriting the prepared patch or fixtures.

[Handoff evidence and remaining host work](../../artifacts/gitlab-handoff-integration-20261112.json).

### Prepared current-document submission patch

The cumulative patch now changes the actual `MarkdownEditor.getValue()` facade,
native form binding, legacy `IssuableForm.handleSubmit()` and draft-clear click
binding. It includes a private first-party `submission.js` helper, vendored
unchanged into the pinned application. Native submits synchronously read all
editors and publish their current values into the actual form fields before
collection. Facade reads return current content without publishing fields or
writing drafts. Conversion, readiness or composition refusal prevents transport.

The legacy handler reads hidden rich-editor inputs as well as textareas, checks
the fresh content for sensitive tokens, then revalidates after that asynchronous
check. It refuses changed content and duplicate pending attempts. Cancellation
or failure retains the current safe draft; a conversion failure never restores
an older cached value over a newer draft. Submit clicks no longer clear drafts
before validation. Explicit discard actions retain their previous behavior.

For native navigation, cleanup means submission has started, not that the server
accepted it. Custom AJAX transports must use the fresh facade/prepare interface
and acknowledge acceptance explicitly before draft cleanup. Arbitrary custom
handlers bypassing both that interface and the native submit event still need
adoption and verification. Actual HTTP rejection, authentication, permissions,
storage and full-application lifecycle remain unverified by this patch.

The final full unit suite passes **5,472 cases in 338 files**; 35 focused cases
and root TypeScript pass. The current Windows component profile passes 33
journeys across three desktop engines, excluding the retained Windows WebKit
external-copy failure. All 12 current Linux WebKit/Xvfb journeys pass, including
external copy. These profiles overlap and remain private integration tests:
the browser page collects real `FormData` into an in-memory transport observer,
not GitLab's server. Composition events are synthetic. Refusal/recovery screens
receive visual review and recordings are retained. Three upstream Jest files
parse and both SFC templates compile; the upstream suites are not yet executed.
The paused full-unit attempt was interrupted intentionally; the resumed run is
the authoritative complete result.

[Submission evidence and limits](../../artifacts/gitlab-submission-integration-20261112.json).

A [pinned real GitLab baseline environment](runtime/README.md) is now prepared
for product testing. Its packaged release and the earlier source-audit commit
are different pins; source matching and actual replacement testing are required.

### Remaining full application acceptance

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

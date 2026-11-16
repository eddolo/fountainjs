# Native GitLab document service

`content_editor.ts` composes Fountain's native starter extensions, math, GitLab
schema/Markdown codec, reference navigation and asset resolver. It owns the
Fountain model and its history. It does not expose a Tiptap or ProseMirror editor.
GitLab owns rendering requests, authentication, uploads, persistence and policy.

```ts
const content = new GitLabContentEditor({
  renderMarkdown: host.renderMarkdown,
  describeLabels: host.describeLabels,
  renderMath: host.renderMath,
  onListenerError: host.reportError,
});
await content.setSerializedContent(savedMarkdown);
const view = new EditorView(container, content.editor, {
  ariaLabel: 'Issue description',
});
```

These host functions are real application adapters. The service does not create
network clients, credentials or substitute render responses. `extensions` accepts
native Fountain extensions; legacy Tiptap definitions are rejected. Unsupported
option names, including a legacy collaboration provider, are rejected before
creating a model. A native collaboration/session adapter remains required.

## Current content and recovery

The status is `unloaded`, `loading`, `ready`, `error` or `destroyed`.
`getSerializedContent()` refuses an initial or pending load and a failed source
replacement. It never returns an older cached document as if it represented
failed input. Changes to selection or interaction mode do not mark a document
dirty. Initial/reopen loads reset history; deliberate template replacements with
`addToHistory: true` remain undoable.

Subscribe to `subscribeChange()` for a current Markdown value or an explicit
conversion error. A host must block saving on an error; there is no fallback
Markdown value. `subscribeStatus()` reports transitions rather than every read,
so a ready-state listener can read the document without recursive notification.
Failing listeners are isolated from later editor subscribers and reported through
`onListenerError`; the latest failure is available as `listenerError`.

An unsuccessful replacement retains the visible document and the rejected source
in `recovery`. The author can retry that source or explicitly choose
`keepCurrentDocument()`. That action validates and publishes the current document
while keeping rejected source available for host inspection. The native component
shows it in a read-only source panel before and after explicit recovery, for as
long as the editor remains open. Retry preserves the original replacement's
history policy; failed loads keep the browser surface read-only. User edits during
a load are preserved and cause a conflict instead of being overwritten by a late
response. Superseded loads cannot change the newest request's status. Disposal
cancels pending loads, removes subscriptions, destroys the owned model and clears
retained recovery/error references.

## Asynchronous Markdown insertion

`pasteMarkdown(source)` uses the same real host renderer/codec as document loads,
then inserts at the captured native selection. Requests run in invocation order.
Native position maps follow unrelated typing while rendering; overlapping edits,
unlocated semantic changes and out-of-order/reentrant host notifications refuse
the insertion rather than overwrite content. The rejected source remains in
`insertionRecovery`. Disposal and document replacement cancel queued requests.

While `pendingInsertions` is nonzero, status is `loading` and serialization is
refused. The author can continue typing. The candidate insertion is serialized
inside a native command batch before committing; conversion errors and host
filters roll the batch back. Each successful paste is one undo step.

The native component connects GitLab's `CONTENT_EDITOR_PASTE` event and a real
browser-clipboard **Paste Markdown** button. Rejected source is inspectable in a
read-only textarea with an explicit retry action. A later successful paste clears
the recovery alert. This is Markdown insertion, not certification of arbitrary
HTML/Word clipboard content or of the unfinished saved-reply picker.

## Native attachment insertion

Supply `uploadAttachment(file, { signal, reportProgress })` when creating the
service. The application must upload through its authenticated host client and
return the server's authoritative Markdown. Call `content.uploadAttachment(file)`
from the toolbar or `EditorView.handleFiles`. The native GitLab component uses its
CSRF-aware Axios wrapper, instance file-size limit and a same-origin upload
endpoint. Files stay outside document state and history.

The insertion captures the native selection and typing marks before uploading, shares the ordered
Markdown queue and maps the target through unrelated edits. Conversion and
serialization must succeed before the document transaction commits. One successful
file insertion is one undo step. Server storage is separate: undo/cancellation
does not delete a previously uploaded binary from GitLab.

`subscribeUploads()` exposes frozen status/progress snapshots. Completed and
cancelled entries release File handles; failed files remain available for
`retryUpload(id)` or explicit `cancelUpload(id)`. A retry reuses completed upload
Markdown if only rendering/insertion failed; it does not upload the binary twice.
That Markdown is copyable in failed snapshots. Late results/progress from aborted
tasks are ignored, and disposal cancels remaining tasks. The queue is bounded.
`availableUploadSlots` reports remaining capacity (zero after disposal). The native
component preflights a complete selected batch before starting any task, refusing
it visibly if it will not fit. It includes already pending/failed entries and
allows a smaller subsequent selection without disturbing existing uploads.

Saving and host change publications refuse pending insertions and unresolved
failed files. Removing the last failed file republishes the intact current draft,
so the host can save immediately without switching editor modes. Pending tasks
cancel on document replacement; failed retained tasks require an explicit decision.
Persistent recovery across navigation, server orphan cleanup, every media type,
every collaboration/rebasing case and native OS drop on all browsers remain
separate acceptance work.

## Native text-link editing

`beginLinkEdit(changed?)` opens one owned session against the current native text
selection. A caret inside a link captures its complete label, including adjacent
differently formatted text. The snapshot exposes the canonical source URL,
resolved display URL, mapped selection, pending state and conflicts. Opening a
second session closes the first; `close()` cancels pending resolution and ignores
late results. Disposal also closes the session.

`apply({ href, text })` resolves through the real host Markdown renderer, validates
the returned link, and preflights serialization inside an atomic native command.
It preserves formatting when the label is unchanged. `remove()` preserves text
and other marks. Successful changes have one-step undo/redo; unchanged values are
a no-op. Unrelated edits map the target; changes inside it refuse the operation
and retain the form draft. Renderer failures and a host becoming read-only cannot
silently commit an edit. A host serialization refusal rolls back state/history.

The component exposes toolbar and Ctrl/Meta+K entry, an editable modal, preview,
copy, removal and cancellation. Its controls live outside contenteditable.
The popover is remounted when the actual anchor element changes; undo/redo can
replace that element while retaining the document link. Reusing the previous
popover would retain its old placement target and visibility listeners.
A scoped child-list observer also handles DOM-only view repairs; it disconnects
on root replacement and disposal. Dialog focus returns through the native view
API so cancellation preserves the document caret. Ctrl/Meta+K leaves active IME
composition to the browser.
GitLab's modal emits `hide` for a prevented Apply as well as a real close; only an
actual close cancels the session. Failed Apply retains both fields for retry.

This first boundary supports text within one inline parent. Cross-block ranges,
inline atoms and hard breaks still need dedicated link handling. Text is bounded
at 10,000 characters, input URLs at 2,048 and resolved URLs at 8,192. Multiline
table labels refuse before conversion rather than silently folding their source.
These are private integration contracts, not new public npm APIs or full GitLab
link/dialect acceptance.

## Native ordinary-code controls

`getGitLabCodeContext()` reads the complete source and canonical language of one
active `code_block`, including a structural node selection. A selection extending
outside the block does not expose editable code controls. Copy reads model text,
so syntax-coloring spans and CSS line numbers cannot enter the clipboard.

`beginCodeEdit()` captures one immutable block. Unrelated structural edits map its
target; edits to that block, document replacement, supersession and disposal
invalidate or close the session. Moving the caret cannot redirect an open draft.
Closing releases the service's session ownership and document subscriptions.
Language changes and deletion validate serialization inside a native command
batch. Refusal rolls back document and history. Unchanged language spelling is a
no-op, including authored mixed case. New language labels are normalized to lower
case and bounded to 80 ASCII letters/digits or `_+.#-` characters.

The native contextual row provides a labeled input with GitLab's language
suggestions, custom labels, explicit Apply/Cancel, full-source Copy and Delete.
It wraps at narrow widths. Escape cancels after the native input commits its local
draft, then returns focus through the editor view; active IME composition is left
alone. The surface reveals the restored caret after toolbar focus so a correct
model selection does not remain offscreen. Invalid/conflicting drafts remain visible. Read-only users can copy but
cannot change language or delete. Language labels select existing highlighting
behavior; choosing a custom label does not install or execute anything.

`code_rendering.ts` recognizes GitLab's canonical-language pre/code carriers and
known span metadata (`class`, `id`, `lang`, `data-lang`). It retains every source
character and removes only a verified presentation wrapper and empty Copy/Insert
snippet controls. Nonempty controls, unknown attributes/children and fence
parameters cause a conversion refusal. Fixtures include both pinned upstream
frontend literals and an actual authenticated renderer response. Mermaid and
PlantUML use the diagram boundary below. Frontmatter, suggestions, GLQL and
complete snippet workflows still need dedicated adapters.

### Native diagram source and preview

`setCodeBlock(language)` creates a GitLab fenced-code block from selected prose,
or routes an existing code block through its captured language-edit session.
Creating fenced source intentionally removes prose marks and clears stored
typing marks in one validated, undoable batch. The prose's text characters, semantic
selection positions and unrelated blocks survive; Undo restores the original
rich text. This host-specific conversion does not change Fountain's general
HTML support for authored formatting inside preformatted blocks. Native code
formatting buttons, browser formatting shortcuts and formatting `beforeinput`
events are disabled for this GitLab source surface.

The block-type selector exposes Mermaid and PlantUML directly. Source remains
editable in the document, with language changes, full-source copy, deletion and
undo. Preview toggles are view state and add no document/history entries.
Read-only code can still be previewed and copied.

`Edit diagram source` opens a paired source/preview dialog (stacked on narrow
screens). Its preview reads only a local draft. Apply uses the captured
`GitLabCodeEditingSession.applySource()` target and commits one validated,
undoable replacement; Cancel creates no document/history change. The service
does not trim or normalize source. Unrelated changes map the captured block,
while changes/deletion/replacement of that block refuse Apply and retain the
copyable draft. Read-only inspection has no Apply action. Composition suppresses
Escape dismissal and Apply until composition ends.

The native host's current-content reader and rich-to-Markdown handoff refuse
`GITLAB_CODE_SOURCE_DRAFT_PENDING` while the dialog has unapplied changes.
Opening an unchanged source does not block either path. The committed service
document stays separate from local dialog fields; previewing does not pretend
to be a document edit. Apply or Cancel releases the guard. Closing/navigating
away is not persistent draft storage or broader multi-user conflict resolution.

Mermaid retains GitLab's script-only sandbox and strict renderer configuration.
The pinned sandbox patch adds correlated request IDs, serialized rendering,
stale-result rejection and fixed error messages for native previews. The parent
accepts messages only from its own opaque-origin iframe and current request;
the existing GitLab link policy remains in use. Source changes are debounced,
unresponsive previews expose Retry, and closure releases timers/listeners.
Existing successful reader messages retain their legacy contract. Legacy parse
failures are caught and send a fixed failure flag without parser HTML. GitLab's
reader accepts that flag only from its own opaque-origin frame, reveals the
original inert code carrier, shows a localized error and offers Retry. Successful
retry hides the source carrier again. Mermaid's own error graphic remains intact
for other legacy consumers. The existing resize-removal lifecycle also releases
the reader's message listener and error UI.

PlantUML uses the real configured GitLab renderer and its returned image. The
enabled HTML carrier's canonical base64 is decoded as strict UTF-8 before
becoming editable code. Unknown metadata, unsafe addresses, malformed carriers
and unrepresented fence parameters refuse conversion with source retained.
Missing/offline providers produce a recoverable preview error. No public
PlantUML server is selected automatically.

The reproducible local audit uses the pinned optional service in
`runtime/compose.diagrams.yaml`, following the [official PlantUML server setup](https://plantuml.com/starting).
It enables the service only in the isolated task GitLab instance, restores the
prior application settings, and stops both containers afterward. This is a
private GitLab adapter, not a new public npm diagram-renderer API. Broader
engine/role coverage remains further product acceptance work.

GitLab's lazy-image loader swaps a decoded 1×1 placeholder for its real URL after
Markdown rendering. The reader-only image hook reserves temporary geometry at
that source switch, after `loading="lazy"` and the real source are installed.
It preserves explicit width/height, eager or already-complete images and existing
classes; load/error removes only the owned marker and temporary sizing. Images
outside `.md` content keep the original loader path. The failed later-GFM-hook
experiment is retained in the audit evidence; `render_gfm.js` is restored to its
pinned source. These are browser-view changes, outside the platform-neutral
document service and public npm entry points.

Deleting the final block in a required list item, quote or table cell retains an
editable paragraph. Removing a root block lands at the immediate successor.
Intermediate structural selection mapping can recover without inventing an
invalid gap. These are public engine repairs; the GitLab controls remain private
integration code.

## Native GitLab alerts

`alerts.ts` owns native `gitlab_alert` and `gitlab_alert_title` schema nodes.
The five supported kinds are note, tip, important, warning and caution. The
actual GitLab renderer fixtures include every kind, custom/default-word titles,
empty alerts, nested alerts/lists, literal title characters and code/math bodies.
`data-sourcepos` maps the rendered header back to its original source line so an
omitted generated title remains distinct from an explicitly authored `Note` or
`Tip`. Without that source evidence the visible title is preserved literally.
Unknown or ambiguous carrier metadata refuses conversion with retained source.

`getGitLabAlertContext(editor)` identifies the innermost alert containing the
whole selection. `contentEditor.alerts.insert(kind?)`, `.setKind(kind)`,
`.remove()` and `.unwrap()` use native transactions with serialization preflight,
filter refusal, one-step undo and read-only/lifecycle checks. Unwrap retains an
authored title as a paragraph and keeps its body; Delete removes the whole alert.
Insertion lands in the body. The contextual controls use the same operations;
there is no parallel Vue document state or server-side alert emulation.

Titles are literal, single-line plain text, bounded to 1,000 characters. Their
empty model text leaf is editable; a view-only generated label follows the kind.
Formatting/style/link controls are unavailable inside titles. Keyboard and
mobile formatting input is consumed there without enabling stored marks; the
body retains ordinary rich-text formatting. Single-line paste remains literal;
multiline title paste refuses with an explanation and leaves the content intact.
Enter splits a title into a title and body, Delete at its end enters the existing
body, and Backspace at its start converts the alert to text. Backspace at the
first body boundary either unwraps a default-titled alert or returns to a custom
title without destroying body formatting. Enter in a final empty body paragraph
exits the alert, reusing a following empty paragraph where possible. Active IME
composition and ordinary body input remain on their existing paths.

Export projects alerts to native blockquote structure, retaining correct quote
prefixes within lists and nested alerts. Fenced math also uses a structural code
projection after math-adapter validation, so every line receives its actual
container indentation. Alerts in table cells refuse export rather than silently
flattening. These contracts do not establish complete GitLab Markdown, arbitrary
cross-block selection, mobile IME or all-surface product acceptance.

The GitLab codec opts into `MarkdownExportOptions.omitTrailingCaret`: only a
known, still-empty editor-generated trailing caret paragraph is omitted. The
projection reuses unchanged node objects to retain that ownership evidence.
Authored, copied and JSON-reopened blank paragraphs are preserved. The public
option is additive and defaults off; it does not mutate the document.

## Native image, audio and video properties

`media.ts` normalizes the pinned renderer's image and playable containers into
native Fountain nodes. The canonical upload URL stays separate from the resolved
display URL. GitLab folds `title || alt` into one playable label; both source
fields are recovered through the existing Markdown parser. Ambiguous mappings,
raw media HTML stripped by GitLab,
and unfamiliar container attributes refuse conversion with the source retained.
The schema and codec can run in pure Node; DOM objects are constructed only when
the browser mounts a playable NodeView.

`media_editing.ts` captures one selected atom for the lifetime of a properties
form. Unrelated edits map that target; replacing or changing it creates a
conflict. Description, title and size edits use native transactions without a
network request. URL changes use GitLab's real renderer and verify the returned
canonical URL, description, title and dimensions before committing. Cancel,
disposal, failed resolution and late responses cannot redirect the edit or
discard its draft. Changes and removal participate in native undo/redo.

The contextual menu exposes properties, open, canonical URL copy, deletion and
the existing real upload picker for replacement. Native audio/video controls own
playback; a separate keyboard-accessible button selects the document atom.
Widths/heights accept pixels, percentages or `auto`. Image source projection
also retains explicit dimensions and surrounding link marks after other edits.

File replacement captures its own media session before opening the native picker.
`replaceMediaAttachment(file, target)` routes the real upload through the existing
insertion coordinator, maps the original target through unrelated edits and
projects only the new canonical/display URL onto the original media node.
Description, title, dimensions, link marks and custom attributes remain intact.
Network/render failures retain that same target for retry; a cached upload is not
uploaded again after a renderer failure. Target conflicts or a different media
kind refuse replacement, retain the source and expose removal instead of a
misleading retry. Cancel, permission/capacity refusal and disposal release owned
sessions. These are private integration interfaces.

GitLab's reader omits audio dimensions from its rendered HTML and uses its own
standard player size. The codec recovers authored dimensions from unambiguous
Markdown source, and the properties dialog explains this reader boundary.
Conflicting/duplicate source dimensions refuse conversion. Dimension retention
in the editor does not establish audio sizing parity in GitLab's reader.

These contracts cover images, WAV audio and VP8 WebM video in the scoped audits.
They do not close the original media-menu requirement: iframe/diagram editing,
drag resizing, all supported codecs, captions/tracks and complete application
coverage still require implementation or acceptance evidence. Component renderer
fixtures are separate from actual upload, playback and persistence journeys.

## Native reference controls

`reference_editing.ts` owns one selected `gitlab_reference` atom. Issue, work-item,
merge-request and supported epic kinds expose their ID/title choices; summary is
limited to the kinds for which GitLab defines it. User/label references retain
copy/navigation/removal without invented display variants. The pinned FOSS
service acceptance covers actual issue/MR/user/label records and qualified issue
source; EE-only epic behavior is not established by that journey.

`beginReferenceEdit()` captures the target and `getGitLabReferenceContext(editor)`
reads its current context. `applyFormat('id' | 'title' | 'summary')` resolves the
corresponding source through the existing real GitLab renderer. A response must
contain exactly the expected atom, source, type and destination. Mismatched,
unresolved or additional content refuses the change with the draft retained.

The insertion coordinator owns request ordering, cancellation and the pending
save guard. Its optional private `apply` projection commits reference attributes
without inserting a fragment or moving the user's current selection. Unrelated
edits map the target; target edits and document replacement conflict/supersede the
request. Formatting/removal use native history. Network failures remain retryable;
cancel, supersession, read-only changes and disposal cannot commit a late result.
Both the service and codec work in pure Node without a fake DOM.

The Vue form captures drafts through a DOM `focusin` event because GitLab's
select does not forward a component focus event. Open uses a separate tab;
Copy produces an absolute URL for use outside the editor. Async completion
preserves external focus. Reference autocomplete, hover cards and broader
application/role coverage remain separate work. These are private integration
interfaces, not new public npm exports.

### Reference text boundaries

GitLab resolves references within individual rendered HTML text nodes. A native
reference atom must retain that boundary after editing: `prefix` + issue `#75` +
`suffix` cannot become raw `prefix#75suffix`, which the real renderer treats as
ordinary text. Usernames can also resolve to a different account when suffix
text joins their source. Issue, MR, user and label lexical rules differ.

The canonical codec emits a plain inline `<span>` around a reference touching
non-whitespace text or another reference/placeholder with the same marks. This
preserves the text-node boundary without adding visible separators or
reimplementing GitLab's per-type reference lexer. HTML text within the span is
escaped. Existing whitespace and different-mark element boundaries remain
usable without that wrapper. The actual pinned renderer corpus covers these
contrasting contexts; the live UI journey types beside all four reference kinds
and checks the saved reader after reopening and service restart.

Code/link marks on a reference are an export error, because those ancestor
elements suppress reference recognition. The current document stays editable;
removing that formatting or undoing the change restores serialization. This is
a conversion guard, not support for combining arbitrary link/code semantics
with references. It does not establish exact source-spelling preservation for
untouched sections after edits.

## Build and real-service evidence

```sh
node scripts/build-gitlab-native-runtime.mjs
# Run the following inside Linux with the isolated, healthy GitLab instance:
node scripts/audit-gitlab-native-service.mjs
```

The runtime build produces a browser-targeted ES2018 module with a byte digest and
source-input hashes under `artifacts/gitlab-native-runtime/`. The audit imports
that module in Node without a fake DOM, signs in normally, discovers the actual
preview endpoint through GitLab GraphQL, imports its HTML, performs native
Fountain transactions, saves through authenticated GitLab HTTP, reimports and
visually checks the resulting issue. No render or save responses are fabricated.

That service-boundary audit displays GitLab's own reader. The subsequent native
browser audit mounts Fountain in the real issue/discussion composers; run
`scripts/run-gitlab-native-browser-audit.mjs --insertion` inside Linux to exercise
clipboard insertion, retained-source recovery, real saving and restart. The full
toolbar, contextual menus, remaining media, suggestions and provider integration remain unfinished.
Unknown/unrepresentable content is an explicit conversion error, not feature
parity. This service is private integration code, not a newly published npm API.

## Captured code suggestions — private integration foundation

The native node derives a visible deletion-effect label from exact replacement
source. `gitLabSuggestionDeletesLines()` follows the pinned host's Unicode
whitespace rule; it never changes source. An empty draft uses Apply deletion.
Nonempty whitespace-only source additionally requires an affirmative deletion
intent checkbox in the source dialog. Draft changes reset it, and the apply
command enforces the guard independently of button state. Source copy/export,
undo and handoff ownership remain unchanged.

Real review application showed that GitLab cannot represent the intended blank
line through that whitespace-only suggestion syntax: it deletes the target lines.
The UI now states that outcome rather than implying blank-line support. A separate
stock REST control proves that prose-only note updates recreate suggestions and
clear Applied history. That host requirement remains failed; the editor does not
fabricate replacement application metadata.
[Source safeguard and retained failures](../../../artifacts/suggestion-effects-integration-20261116.json).


The service exposes `content.suggestions.available`, `insertVerified()` and
`begin()`. The native UI awaits `insertVerified()`: it uses host-owned raw-file
loading and the existing mapped asynchronous insertion queue. Its target belongs
to the original invocation, not a later caret. Overlap, replaced documents,
revoked editability/context and disposal cannot publish a late proposal. Pending
insertion blocks serialization/handoff and disables duplicate insertion.

Rapid Diffs maps literal backslash-n to U+E000, colliding with a genuine private-use
source character. Verification compares that known transport encoding but prefills
only the raw file's original characters. It never reverses/removes the marker.
The private synchronous `insert()` helper refuses ambiguous prefills and is not
used by the native UI. [Verified selected-multiline/source evidence](../../../artifacts/suggestion-transport-integration-20261116.json).
An optional host-owned `getSuggestionContext()` callback supplies the current
`canSuggest`, original `lines`, inclusive `lineRange`, `lineType` and
`blobRawPath`, plus optional Rapid Diffs `previewParams`. Only known fields and
contiguous positive line ranges are accepted. Preview metadata must contain the
exact supported file/line/40-character commit fields and is frozen into session
ownership. It identifies preview context; it does not establish current branch
head freshness or grant repository write permission.
`showPopover` is UI metadata; it does not change source ownership. The callback
is reread before mutations and after asynchronous operations. No callback means
suggestions are unavailable. It does not enable the active native host adapter:
default callers remain guarded. The native candidate explicitly opts into the
known adapter and has scoped real authoring/single-application/restart acceptance;
review batching and broader role/concurrency coverage remain open.

A session owns one proposal, rather than whichever block the caret later enters.
Its immutable `initial.range` contains absolute file lines derived from the
original offsets and host anchor. `applyChange(text, start, end)` applies the
replacement plus range atomically; validation/refusal cannot publish half an edit.
`initial` contains its source and offset header. `applySource(text)` preserves
literal LF source; an empty value is a deletion proposal. `prepareRange()` calls
optional `loadSuggestionSource(path, { signal })`, verifies the selected original
lines, and returns file lines for range controls. `applyRange(start, end)` uses
absolute inclusive file lines containing the host anchor, keeps replacement text
unchanged, and rechecks the exact loaded snapshot before expansion. CRLF is only
split for line comparison; the stored snapshot is not normalized. No repository
write occurs. Posting/applying and permissions remain GitLab's responsibility.

The host loader must enforce its own authenticated, same-origin allowed raw-file
route, follow the abort signal and return bounded text. The service accepts no
network client or credentials. Its 1 MiB character bound is a model limit, not an
HTTP transport limit. Close/cancel, replacement, stale targets and superseded
requests cannot apply a late draft. Beginning another session closes the first;
content-service disposal closes the session and aborts its pending request.

Ctrl/Cmd+Enter leaves literal code at its current parent boundary, creating or
reusing an editable paragraph without changing code source. Ordinary Enter and
Tab keep their source-editing behavior. The real host journey verifies that this shortcut does not trigger quick submit;
its handled event stops propagation before reaching the form submission handler.

[Service and recorded local-browser evidence](../../../artifacts/suggestion-editing-integration-20261116.json).

The current native journey posts exact Markdown from the real source/range menu,
uses GitLab's normal Apply control and verifies the source-branch commit/file.
The MR overview shows Applied before and after cold restart. The resolved Rapid
Diffs gutter reopening probe remains a separate recorded UI issue. This does not
establish review batching, all roles/concurrency paths or broad native browser
coverage. [Native evidence](../../../artifacts/suggestion-native-integration-20261116.json).

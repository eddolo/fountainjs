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
frontend literals and an actual authenticated renderer response. Diagrams,
frontmatter, suggestions, GLQL and complete snippet workflows still need dedicated
adapters; the ordinary-code menu does not implement them.

Deleting the final block in a required list item, quote or table cell retains an
editable paragraph. Removing a root block lands at the immediate successor.
Intermediate structural selection mapping can recover without inventing an
invalid gap. These are public engine repairs; the GitLab controls remain private
integration code.

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

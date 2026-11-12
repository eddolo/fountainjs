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
toolbar, suggestions, upload controls and provider integration remain unfinished.
Unknown/unrepresentable content is an explicit conversion error, not feature
parity. This service is private integration code, not a newly published npm API.

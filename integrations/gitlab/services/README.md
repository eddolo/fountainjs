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
while keeping rejected source available for inspection/download. User edits during
a load are preserved and cause a conflict instead of being overwritten by a late
response. Superseded loads cannot change the newest request's status. Disposal
cancels pending loads, removes subscriptions, destroys the owned model and clears
retained recovery/error references.

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

This is a service-boundary audit. The displayed reader is GitLab's own reader;
Fountain's complete browser component, toolbar, suggestions, uploads and provider
integration remain unfinished. Unknown/unrepresentable content is an explicit
conversion error, not feature parity. The native service is private integration
code and is not a newly published npm API.

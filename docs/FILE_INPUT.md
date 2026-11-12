# Host-owned file input

`EditorViewOptions.handleFiles` lets an application own file upload and document
insertion while keeping the native view's paste selection and drop positioning.
It receives the selected `File` objects and `{ editor, source }`, where `source`
is `paste` or `drop`. The callback may return a promise.

Use it when the application needs its own document-aware ingestion path. The
GitLab integration sends files to GitLab, renders the returned Markdown through
GitLab's renderer and inserts the resulting Fountain fragment. Its actual
implementation is in
[`fountain_content_editor.vue`](../integrations/gitlab/components/fountain_content_editor.vue)
and [`attachment_uploads.ts`](../integrations/gitlab/services/attachment_uploads.ts).

When configured, this callback replaces the default insertion of files. A thrown
error or rejected promise goes to `onError` and the `fountain-error` event; it
does not retry as an embedded data URL. Ordinary text/HTML clipboard handling,
plugin interception and read-only guards still apply. All file MIME types can
reach the callback; the host decides which ones it supports.

The host owns progress, cancellation, validation, storage and the eventual native
transaction/history boundary. An asynchronous callback can outlive the view; tie
its tasks to the application document/session lifecycle. For ordinary native
image/audio/video/file insertion, the existing `imageUpload` and `assetUpload`
options already provide upload tasks and native insertion without this callback.

After an explicit insertion, `view.scrollSelectionIntoView()` reveals the current
native selection without changing document state. It handles collapsed ranges
with no measurable caret rectangle by using their containing element. The GitLab
adapter focuses/reveals a completed insertion only if the author has not changed
selection or moved focus elsewhere while the upload was pending.

This is an additive browser-view API. It does not add a network client or a DOM
dependency to the platform-neutral document engine.

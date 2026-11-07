# Retained collaboration recovery after a browser reload

The [browser storage reference](../examples/backends/retained-browser-drafts.ts)
keeps explicit recovery copies and one rolling automatic copy per mounted editor
in an application-scoped IndexedDB database. It waits for the read-write
transaction to commit before reporting a save. Each
copy contains the visible document JSON and schema version. A draft edited in
an admitted session also carries the authority lease and the validated native
checkpoint. A draft made before admission has no native room payload. Account,
room and author scope in the example separate ordinary lookups. Different tabs
under the same account get distinct rolling slots. Access control still belongs
to the host.

The [browser workflow](../artifacts/yjs-browser-draft-fixture-20261107.html) offers
**Save recovery copy**, **Resume this session**, and **Keep a copy and open shared**.
Opening an older draft mounts a separate editor with no provider. Resuming a
same-session draft checks the key, epoch, schema, revision, namespace and native
room identity against a fresh active snapshot, then restores the checkpoint in
isolation and compares its projection to the visible saved model. The adapter
loads the authority again, binds the session and merges current shared state.
The server still fences writes. A failed storage transaction leaves the current
editor intact and retryable. Local document changes, including local Yjs undo,
schedule one automatic save after a short interval. Writes to one slot are
serialized and catch up when a newer edit arrives during a write. The demo
tries to flush when the tab becomes hidden and awaits a save when switching away
from the edited document. If a refused writer has continued typing after
disconnection, the record keeps both the visible model and the earlier native
checkpoint, flags their difference, and offers the visible model as a local copy.

## Evidence

Run the recorded keyboard and pointer workflows against the compiled editor and
retained adapter on the local HTTP/SQLite authority.

```powershell
pnpm exec playwright test --config artifacts/yjs-browser-draft-20261107.config.ts
```

The [test scenarios](../tests/manual/yjs-browser-draft-real.spec.ts) cover
reloading an unsent edit and saving it later, rejoining after a peer has wrapped
the shared paragraph in a quote, preserving a retired draft separately, saving
pre-admission edits, retrying aborted IndexedDB storage and refusing a resume
offer invalidated by an epoch rotation. Automatic-save scenarios also check
reload without a save click, retention after an aborted rolling write, two tabs
under one author, undo before reload, and typing after a refusal. Traces,
videos and screenshots are in `artifacts/yjs-browser-draft-browser-20261107/`.
All 33 cases passed across Chromium, Firefox and WebKit with one worker and zero
retries or skips. Type checks passed. Visual review covered the recovery preview,
retained copy after a failed write, and the post-refusal draft beside the unchanged
server document.

## Boundaries

The newest edit can still be lost if the browser terminates before its IndexedDB
write commits. The example has no quota, retention or eviction policy for older
slots, cross-device sync, local undo-stack persistence, or automatic replay into
a different epoch. Browsers can clear origin storage. The demo's loopback HTTP
session is test infrastructure. Product adoption still needs application auth,
transport and storage policies, a fuller recovery UI, and release verification.
The default Yjs adapter and npm distribution are outside this change.

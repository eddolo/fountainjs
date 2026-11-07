# Retained collaboration recovery after a browser reload

The [browser storage reference](../examples/backends/retained-browser-drafts.ts)
keeps append-only recovery copies in an application-scoped IndexedDB database.
It waits for the read-write transaction to commit before reporting a save. Each
copy contains the visible document JSON and schema version. A draft edited in
an admitted session also carries the authority lease and the validated native
checkpoint. A draft made before admission has no native room payload. Account,
room and author scope in the example separate ordinary lookups. Access control
still belongs to the host.

The [browser workflow](../artifacts/yjs-browser-draft-fixture-20261107.html) offers
**Save recovery copy**, **Resume this session**, and **Keep a copy and open shared**.
Opening an older draft mounts a separate editor with no provider. Resuming a
same-session draft checks the key, epoch, schema, revision, namespace and native
room identity against a fresh active snapshot, then restores the checkpoint in
isolation and compares its projection to the visible saved model. The adapter
loads the authority again, binds the session and merges current shared state.
The server still fences writes. A failed storage transaction leaves the current
editor intact and retryable.

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
offer invalidated by an epoch rotation. Traces, videos and screenshots are in
`artifacts/yjs-browser-draft-browser-20261107/`. All 18 cases passed across
Chromium, Firefox and WebKit with one worker and zero retries or skips. Type
checks passed. Visual review included the editor and server reader showing the
same merged quote, and retired content visible only in the detached copy.

## Boundaries

This local host reference uses explicit saves, including an automatic save before
the demonstrated session switch. An edit that has never been saved can still be
lost if the browser closes. The example has no quota, retention or eviction
policy, cross-device sync, local undo-stack persistence, or automatic replay into
a different epoch. Browsers can clear origin storage. The demo's loopback HTTP
session is test infrastructure. Product adoption still needs application auth,
transport and storage policies, a fuller recovery UI, and release verification.
The default Yjs adapter and npm distribution are outside this change.

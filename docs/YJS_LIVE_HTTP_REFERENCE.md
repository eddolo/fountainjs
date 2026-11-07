# Live HTTP reference for retained collaboration

The [host provider](../examples/backends/retained-http-provider.ts) connects after
the existing authority admission and binding steps. It sends native Yjs deltas
relative to the last accepted server state vector, with one request at a time.
An edit made during a request stays pending for the next exchange. Incoming
checkpoints pass through the retained adapter's validated merge before the
provider advances the revision. The private `pollRetained` read returns no
checkpoint if the room revision is unchanged. It still checks the active phase,
protocol, epoch, namespace and native identity. Changed revisions return a
verified checkpoint. Writes use the existing fenced SQLite authority.

An established transport keeps the editor and its native local history mounted
through a transient request failure. On a stale epoch or frozen room the
transport stops. The editor can keep saving a local recovery draft. Switching
editors cancels the old transport, including a request waiting to merge. Retrying
a native update after a lost reply preserves one copy of the edit. The current
server may record an extra revision for the retry.

## Recorded browser proof

```powershell
pnpm exec playwright test --config artifacts/yjs-live-http-20261107.config.ts
```

The tests open the [two-author browser fixture](../artifacts/yjs-browser-draft-fixture-20261107.html?live)
against a real loopback HTTP and SQLite authority. They verify automatic exchange,
offline typing against a peer's quote wrap, a dropped reply after a committed
write, and a retired writer's saved draft after reload. All nine Chromium,
Firefox and WebKit journeys passed with one worker and zero retries or skips.
The screenshots and video show the merged quote in the editor and server reader,
and the retired copy beside the untouched server document.
Seventy-eight focused authority, provisioning and handoff tests and eleven
Chromium recovery regressions also passed. The build, packed-package smoke and
headless checks passed. The declaration audit records the added internal polling
method in the ESM and CommonJS room-authority declarations.

## Deployment boundaries

This reference uses periodic HTTP polling with fixed delays and sends a full
validated checkpoint for each changed server revision. Polling, checkpoint
validation, full checkpoint responses and SQLite reads have not been load-tested
for large rooms or many editors. It has no live presence channel, real host
authentication, deployed process, request deadline, multi-host load evidence,
or production retention and compaction policy. The loopback session token is
test infrastructure. The default Yjs adapter still has six known structural
failures. This reference adds no public package entry and remains unreleased.

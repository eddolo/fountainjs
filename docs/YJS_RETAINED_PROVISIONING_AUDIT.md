# Concurrent first-room provisioning

The server reference can now load or create a retained room through
`CoordinatedDocumentRoom.provisionRetained`. On the first join it validates a
checkpoint from the application's stored starter document and attempts an atomic
insert. Concurrent callers can prepare different Yjs identities. The insert
selects one saved room, and each losing caller reads and validates that room.
Subsequent joins read the latest saved revision without invoking the loader.

```ts
const snapshot = await room.provisionRetained({
  room: 'fountain',
  signal: requestSignal,
  loadCheckpoint: signal => buildCheckpointFromStoredDocument(projectId, signal),
});
```

The application authorizes the request before it calls the method and chooses
the starter document on the server. The loader can run more than once during a
race, so keep writes outside it. The repository must implement atomic
insert-if-absent and return an owned record on read. The SQLite reference uses a
unique room key and `INSERT ... ON CONFLICT DO NOTHING`.

Provisioning refuses a frozen room, a legacy format, a mismatched namespace or
an invalid checkpoint. Cancellation before the insert leaves the room absent.
An in-flight insert can commit even if the caller loses its acknowledgement.
Retrying then finds the saved room. Continue to check the binding against the
current authority before starting transport and fence every write by epoch.
The reference covers durable room selection and leaves authorization and
transport under application control. [Admission guide](YJS_RETAINED_PREVIEW.md).

## Verification

The eight dedicated Node tests exercise a first-join race through two actual
SQLite connections, lost acknowledgement, cancellation, preservation of the
latest revision, legacy and frozen rooms, namespace mismatch and bad initial
bytes. The initial focused run passed all 77 provisioning, admission and
cross-format handoff cases.

The loopback demo gives both authors an empty room, independently builds each
server candidate, and checks that both providers receive the same saved native
identity. The editor journeys type and save different changes, reopen the latest
revision and compare both authors against the saved reader. A separate journey
checks that retrying a frozen room preserves its identity and resumes after
unfreeze. Each journey runs in Chromium, Firefox and WebKit with video and
trace recording. The first run observed `reconnecting` where the test expected
`connecting`. The assertion was corrected to match the lifecycle. Reviewing
the screenshots also exposed a stale status banner. The demo now announces
when both authors have connected. The final run passes all six journeys.
The visual review checked both authors’ saved changes, the intact figure,
the frozen room message and the resumed connection.

```powershell
pnpm exec vitest run tests/yjs-retained-provision.test.ts --maxWorkers=1
pnpm exec playwright test --config artifacts/yjs-retained-provision-browser-20261107.config.ts
```

The browser uses the compiled editor and the local HTTP/SQLite reference.
Build, types, package smoke, headless and API checks pass. The API snapshot
changes only the two declarations for the internal room authority. All 178
top-level runtime and CSS files match the previous package preview byte for byte.
Deployment across multiple servers, real access control and durable recovery
of browser drafts still require integration evidence.

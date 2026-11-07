# Retained collaboration preview

This **unreleased, opt-in beta** entry makes the retained adapter available through
the normal package:

```ts
import {
  createRetainedYjsCollaborationExtension,
  captureRetainedCheckpoint,
  restoreRetainedCheckpoint,
  type RetainedAdmission,
  type RetainedAdmissionLease,
  type RetainedCheckpoint,
  type DocumentRoomSnapshot,
} from 'fountainjs-editor/experimental/yjs-retained';
```

ESM and CommonJS are supported. Yjs remains an optional peer dependency. Runtime
document, schema, transactions, extensions, checkpoint and collaboration operations
run in Node without jsdom, `document`, `window` or `MutationObserver`. Browser
editing still requires the normal view and input layers. Web Crypto is required;
the package's supported Node 20+ runtime supplies it.

The default `fountainjs-editor/yjs` entry still fails six structural concurrency
tests. The preview uses `fountain-retained-document/3` for collaboration and
`fountain-retained-checkpoint/1` for rollback. Store these separately from portable
document JSON. The public beta API and stored-data migration rules apply to this
entry. [Release policy](RELEASES.md).

## Initialize once, then join

One authority must create the room once. Do not let several disconnected clients
each initialize an empty room, even from identical initial JSON. Their native
identities differ; merging those independently seeded rooms is refused rather
than selecting a winner and losing the other document.

For a local experiment, create one editor with the retained extension and an empty
`Y.Doc`, then copy `Y.encodeStateAsUpdate(seedDoc)` into a second empty `Y.Doc`
**before** creating its editor. After that, exchange Yjs updates normally. Keep
each editor's Yjs constructors in one module system; mixing ESM and CommonJS Yjs
instances in the same process creates incompatible constructor universes.

A shared application provisions on its authorized backend, persists an
authoritative checkpoint, and admits each client before its transport starts.
The server reference handles simultaneous first joins with an atomic insert and
reuses the saved room on retry. [Provisioning audit](YJS_RETAINED_PROVISIONING_AUDIT.md).
The host supplies the loader and binding through the extension options.

```ts
import * as Y from 'yjs';
import type { YjsProvider } from 'fountainjs-editor/yjs';
import {
  createRetainedYjsCollaborationExtension,
  type RetainedAdmission,
} from 'fountainjs-editor/experimental/yjs-retained';

function collaboration(
  document: Y.Doc,
  provider: YjsProvider, // constructed with autoconnect disabled
  admission: RetainedAdmission,
) {
  return createRetainedYjsCollaborationExtension({
    document,
    user: { id: 'ada', name: 'Ada', color: '#7048e8' },
    provider,
    admission,
  });
}
```

The host provides the following options.

- `schemaVersion` specifies the application schema version.
- `load(signal)` returns an already authorized existing checkpoint or an authority
  snapshot with exactly `key`, `epoch`, `revision`, `phase`, `protocol`, and
  `checkpoint`. Transport codecs must restore checkpoint bytes as `Uint8Array`;
  store the bytes separately or encode them with a reversible binary codec.
- Optional `authority: { key, bind(lease, signal) }` validates and binds the active
  epoch/revision/native room identity before provider connection. Authority mode
  requires a retained snapshot. The exported generic `DocumentRoomSnapshot` type
  also describes legacy server records, which this client deliberately refuses.

Binding checks consistency at a single point in time. The backend must authorize
access and fence **every write** against its current
epoch and phase. If binding returns newer accepted state, the provider must
validate/apply that catch-up state with an untracked remote origin before reporting
initial synchronization complete. See the recorded HTTP/SQLite reference in the
[authority-admission audit](YJS_AUTHORITY_ADMISSION_AUDIT.md).

Typing while admission is pending is retained locally. If it conflicts with the
loaded state, admission reports an error instead of overwriting it. Cancellation
prevents late callbacks from installing state or starting transport. An epoch
change on reconnect requires an explicit fresh session and draft recovery.

The [browser draft reference](YJS_BROWSER_DRAFT_RECOVERY_AUDIT.md) shows how a
host can save recovery copies in IndexedDB before switching sessions. A saved
copy from the same session can pass through ordinary admission after reload.
Pre-admission and retired-session drafts reopen separately as editable local
copies. This is an explicit recovery workflow in the host example.

## Checkpoints and limits

`captureRetainedCheckpoint(doc, schema, schemaVersion, room?)` captures full wire
state with checksums and the projected document hash. `restoreRetainedCheckpoint`
validates and restores into a **new isolated document** and returns
`{ document, baseDocument, manifest }`. The caller owns and destroys that document.
Use the returned document as an isolated recovery point.

Compatible named top-level fragments are supported. Nested fragments, conflicting
independent initialization, legacy XML data, subdocuments and nonportable wire
values are refused. Existing XML rooms need the separately audited migration and
rollback workflow; this entry intentionally exports no migration/admin service.

Remaining adoption work includes deployed transport and provisioning, automatic
draft persistence and cross-session reconciliation, multi-host authority, history/metadata growth and compaction,
broader application integration, and full release CI. Recorded desktop-engine
journeys are not physical mobile/IME or assistive-technology certification.

The preview is isolated from the default root, core, React and XML adapter
runtime graphs. [Package measurements and installed consumer audit](YJS_RETAINED_PACKAGE_AUDIT.md).

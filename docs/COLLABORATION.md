# Collaboration and Yjs

FountainJS collaboration has two layers:

1. The framework-neutral `createCollaborationExtension` owns editor lifecycle,
   validated remote transactions, connection state, normalized presence,
   accessible remote decorations, and collaborative-history commands.
2. The optional `fountainjs-editor/yjs` entry owns conflict-free shared state,
   relative cursor positions, and origin-aware undo. It has a `yjs` peer
   dependency and is not loaded by the root package.

The application still owns the room service, network transport,
authentication, authorization, encryption policy, persistence, and user
directory. FountainJS does not require an account or a Fountain-hosted server.

## Install

```bash
npm install fountainjs-editor yjs
```

## Start without a provider

A `Y.Doc` works locally and can be synchronized later. This is useful for
tests, workers, peer-to-peer handoff, or applications that already transport
Yjs updates themselves.

```ts
import * as Y from 'yjs'
import {
  CoreExtension,
  composeExtensions,
  createEditor,
} from 'fountainjs-editor'
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs'

const ydoc = new Y.Doc()
const collaboration = createYjsCollaborationExtension({
  document: ydoc,
  user: { id: currentUser.id, name: currentUser.name, color: '#6d4aff' },
})
const kit = composeExtensions([CoreExtension, collaboration])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })
```

Send `Y.encodeStateAsUpdate(ydoc)` or incremental `update` events through any
trusted channel and apply received bytes with `Y.applyUpdate`. Yjs updates are
binary CRDT data, not FountainJS JSON; validate room membership before relaying
them and apply ordinary transport limits.

## Attach a network provider

`YjsProvider` is structural. A provider may expose `connect`, `disconnect`,
`status` events, and an Awareness-compatible object. Common Yjs providers fit
that boundary without being imported by FountainJS:

```ts
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs'

const ydoc = new Y.Doc()
const provider = new WebsocketProvider(roomURL, roomId, ydoc, {
  connect: false,
  params: { ticket: await issueShortLivedRoomTicket(roomId) },
})

const collaboration = createYjsCollaborationExtension({
  document: ydoc,
  provider,
  user: { id: currentUser.id, name: currentUser.name, color: '#196c55' },
})
```

The example is intentionally host code. Do not put permanent provider secrets
in browser bundles, document JSON, awareness state, or repository settings.
Use short-lived, room-scoped credentials and enforce document permissions on
the relay/service—not in the editor UI.

### Switch documents or providers without recreating the editor

Room, account, and transport changes are explicit runtime operations. Create a
fresh adapter and replace the current session:

```ts
import { replaceCollaborationAdapter } from 'fountainjs-editor'
import { YjsCollaborationAdapter } from 'fountainjs-editor/yjs'

replaceCollaborationAdapter(editor, new YjsCollaborationAdapter({
  document: nextYDoc,
  provider: nextProvider,
  user: { id: currentUser.id, name: currentUser.name, color: '#196c55' },
}))
```

Connection intent is preserved: a connected editor connects the replacement;
an intentionally disconnected editor stays disconnected. `{ connect: true }`
or `{ connect: false }` overrides that rule. FountainJS first invalidates the
old context, then disconnects and destroys the old adapter exactly once. Late
documents, presence, statuses, connection completions, or errors retained by
the retired provider cannot mutate the new session. The host still owns the
provider and `Y.Doc` themselves; adapter destruction removes FountainJS
listeners and history resources rather than destroying shared application data.

In React, `useFountain` treats its config as constructor input. Keep the editor
instance and call `replaceCollaborationAdapter` when a room, `Y.Doc`, provider,
or account prop changes. The hook coalesces React Strict Mode's duplicate
development render probe into one editor and destroys abandoned or unmounted
instances exactly once.

For offline persistence, bind a persistence provider such as an IndexedDB
adapter to the same `Y.Doc`. A persistence binding normally has its own
lifecycle and no awareness channel, so the application should create and
destroy it directly. Network and persistence providers can coexist because
Yjs is network agnostic.

## Provider-free and managed choices

You do not have to host a collaboration service yourself. The application may:

- exchange Yjs updates through an existing authenticated backend;
- choose a managed Yjs-compatible provider;
- use WebRTC where its security and discovery model fit;
- remain local/offline and synchronize files or updates explicitly;
- omit collaboration entirely—the editor core has no Yjs dependency.

The end user should choose a provider only when the product deliberately
offers that setting and can explain where content goes. Installing a random
provider is not a trust model. The product owner should audit the provider,
scope access, disclose the data destination, and retain a revocation path.

## Shared document representation

The adapter stores a Fountain node as a `Y.XmlElement`:

- the node type is shared metadata;
- each node attribute is a separate shared key, so unrelated attribute edits
  can merge independently;
- a text node owns one `Y.XmlText`, giving concurrent character edits CRDT
  semantics;
- marks are stored on their text-node element;
- container children are a Yjs sequence, preserving retained block identity
  across ordinary insertion, deletion, and editing;
- the document has one root element. If two disconnected clients initialize an
  empty room simultaneously, Yjs ordering chooses the same first root and the
  adapter removes the redundant seed deterministically.

Local reconciliation uses the transaction's before/after document pair. It
retains aligned nodes, applies minimal prefix/suffix changes to `Y.XmlText`,
and inserts or deletes unmatched structure. Incoming state is reconstructed
through the receiving editor's schema and must pass complete validation before
one `fountain$collaborationRemote` transaction can replace editor content.
Malformed nodes, marks, attributes, excess depth/count, unsafe presence, and
unknown schema types fail closed; the previous editor document remains intact.

Every client in a room must compose a compatible schema. Custom nodes and marks
work without Yjs-specific code because their names and JSON-safe attributes use
the same generic representation, but a client that does not recognize them
will correctly reject the remote document instead of silently dropping data.

## Presence and relative selections

When awareness is present, the adapter publishes only the configured user and
a text selection encoded as Yjs relative positions. Relative positions remain
attached to the shared text as concurrent changes arrive. Remote positions are
resolved into Fountain structural positions, normalized, and rendered as
view-only range and caret decorations.

Identical local selections are not republished. Changed selections use a
leading/trailing throttle of 32 ms by default, so a synchronous transaction
burst produces at most one immediate and one trailing awareness write. Set
`presenceThrottleMs` between `0` and `1000` when constructing the adapter; `0`
is available for deterministic low-level integrations, while the bounded
default is appropriate for interactive cursors.

Remote names are inserted with `textContent`, not HTML. IDs, names, six-digit
colours, selection bounds, and optional avatar URLs pass validation. Avatar
metadata is not rendered by the built-in caret. Non-text semantic selections
are deliberately omitted from awareness today rather than flattened into a
misleading cursor.

The adapter clears its local awareness field on disconnect. Awareness is
ephemeral and must not be used as durable identity, authorization, comments,
or document history.

## Collaborative undo and redo

Use the collaboration commands while Yjs collaboration is active:

```ts
kit.commands.canUndoCollaboration(editor)
kit.commands.undoCollaboration(editor)
kit.commands.redoCollaboration(editor)
kit.commands.closeCollaborationHistory(editor)
```

The Yjs `UndoManager` tracks only the adapter's local origin. Undo therefore
removes local edits while preserving remote work that arrived later. Relative
selection metadata restores the local text selection after undo/redo.
`captureTimeout` defaults to 500 ms; call `closeCollaborationHistory` at a
semantic boundary or configure the delay when creating the adapter.

Do not route collaborative keystrokes through the snapshot-based local
`HistoryExtension` at the same time. Keep local history for non-collaborative
editors and use the origin-aware commands for a shared Yjs room.

## Generic adapter contract

Products using another CRDT or synchronization engine implement
`CollaborationAdapter` and pass a fresh instance per editor:

```ts
const collaboration = createCollaborationExtension({
  adapter: () => ({
    connect(context) {
      // Subscribe to remote state, then call:
      // context.applyRemoteTransaction(currentStateTransaction, { selection, origin })
      // for provider deltas, or:
      // context.applyRemoteDocument(validatedDocument, { selection, origin })
      // context.setPresences(remoteUsers)
      // context.setStatus('connected')
    },
    onLocalUpdate({ before, document, beforeSelection, selection, transaction }) {
      // Convert and publish one accepted local transaction.
    },
    onLocalSelection(document, selection) {
      // Publish ephemeral presence without persisting it in the document.
    },
    disconnect() {},
    destroy() {},
  }),
})
```

Remote transactions are marked `fountain$collaborationRemote`, excluded from
local history, validated by the schema, and never echoed through
`onLocalUpdate`. `fountain$collaborationOrigin` carries adapter provenance for
host policy or observability. Normal editor transaction filters still run.
`applyRemoteTransaction` requires exact current-document identity and is the
efficient route for CRDT/provider deltas. `applyRemoteDocument` is the correct
route for snapshots and other untrusted whole documents.

## Current scope

Delivered today:

- provider-independent lifecycle and status;
- Yjs conflict-free text and structural synchronization;
- disconnected edits and deterministic seed repair;
- relative text selections and accessible collaborator decorations;
- origin-aware undo/redo with selection restoration;
- schema validation, hostile-input containment, reconnect, and cleanup;
- live adapter/`Y.Doc`/provider replacement with stale-session isolation;
- duplicate-free Strict Mode lifecycle and bounded presence publishing;
- incremental Yjs text deltas without whole-document JSON reconstruction;
- enforced large-document, memory, build-size, DOM-reconciliation, and
  cross-browser input-to-paint budgets;
- ESM/CommonJS package boundaries and a real two-editor browser demo.

Threaded comments and general tracked-change suggestion mode now ship as
separate optional modules. Named version storage/comparison/restoration also
ships as a separate provider-backed module; it is not stored in Yjs, while its
one normal restore transaction can propagate through Yjs. The exact performance
methodology and limits are published in [the performance contract](PERFORMANCE.md);
none of those product capabilities is implied merely by the presence of Yjs.

## Upstream references

- [Yjs shared types and document updates](https://docs.yjs.dev/getting-started/working-with-shared-types)
- [Yjs network-agnostic provider model](https://docs.yjs.dev/getting-started/a-collaborative-editor)
- [Yjs relative positions](https://docs.yjs.dev/api/relative-positions)
- [Yjs selective undo manager](https://docs.yjs.dev/api/undo-manager)
- [Awareness protocol](https://docs.yjs.dev/api/about-awareness)

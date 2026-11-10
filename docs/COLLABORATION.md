# Collaboration and Yjs

FountainJS collaboration has two layers:

1. The framework-neutral `createCollaborationExtension` owns editor lifecycle,
   validated remote transactions, connection state, normalized presence,
   accessible remote decorations, and collaborative-history commands.
2. The optional `fountainjs-editor/yjs` entry owns Yjs shared state,
   relative cursor positions, and origin-aware undo. It has a `yjs` peer
   dependency and is not loaded by the root package.

The unreleased local `/yjs` entry uses retained character and node identities.
The published beta still uses the XML representation. Existing XML rooms need
the explicit `/yjs/legacy` entry or an authority-backed migration; changing an
import does not convert their bytes. The XML compatibility adapter retains its
known offline typing conflicts with structural and formatting edits.
[Adoption contract](YJS_DEFAULT_ADOPTION.md).

For adapter authors, normal remote updates are not sent back as local updates.
When an extension explicitly requests rebroadcast of an appended maintenance
transaction, `onLocalUpdate` receives only the appended steps: `before` and
`transaction.originalDoc` are the accepted incoming document, rather than the
editor's older pre-remote state. History-neutral repairs retain
`addToHistory: false`; an authored action followed by maintenance still requests
history in the combined notification. An adapter implementing its own history
must honor that distinction. Custom adapters must implement their own history
policy. The explicit XML and retained adapters pass the
[shared history-neutral workflow checks](YJS_HISTORY_POLICY_AUDIT.md).

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
This direct example initializes one isolated local room. Load that room's native
Yjs state into subsequent peers before mounting them. A locally empty `Y.Doc`
does not establish that a remote room is empty.

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

### Preserve conflicting room roots

Seed a room once and load its authoritative update into every new client's
`Y.Doc` before attaching the editor. The legacy adapter historically kept the
first root when separately initialized peers met. Applications can set
`preserveConcurrentRoots: true` on the explicit `/yjs/legacy` factory or adapter
to refuse that conflict instead. The retained default always refuses independent
initialization and cannot turn that preservation off.

The adapter then reports an error, leaves the shared roots in place, and keeps
the current editor available for local typing. Shared undo and writes stop for
that adapter. Even if an older peer later removes a root, the existing adapter
keeps the local draft. Save the local draft JSON and any available native room
bytes separately, then explicitly replace the adapter with one backed by the
reviewed authoritative room. A native room archive contains edits accepted into
Yjs before the refusal. Later local typing belongs to the local editor JSON.

Enable the policy on each participating legacy client. Older or unconfigured
peers can still delete roots through their own legacy behavior. The retained
default always refuses independent initialization.

The recorded legacy browser example exchanges two independently typed drafts,
shows the refusal, and downloads native bytes that reopen with both roots.

```powershell
pnpm exec playwright test --config artifacts/yjs-legacy-root-conflict-20261107.config.ts
```

## Attach a network provider

`YjsProvider` is structural. A provider may expose `connect`, `disconnect`,
`status` events, and an Awareness-compatible object. Open the authoritative room
before constructing its provider. A fresh empty provider-backed document without
admission is refused before any local seed or provider connection. Otherwise a
new retained seed could be sent into an existing XML room before synchronization
reveals the format conflict.

```ts
import { openYjsRoom } from 'fountainjs-editor/yjs/room'

const room = await openYjsRoom({
  schema,
  schemaVersion: 'article-v1',
  expected: { key: articleId },
  open: (protocols, signal) => api.openArticle(articleId, protocols, signal),
  admit: (offer, signal) => api.admitArticle(offer, signal),
})

// Host code: create the provider with auto-connect disabled. The backend
// authenticates the user and fences every write against this native room lease.
const provider = api.createDisconnectedProvider(room.document, room.lease)
const collaboration = room.createExtension({
  provider, user: currentUser,
})
// Compose with the same schema extensions and mount room.baseDocument.toJSON().
```

The `api` methods and provider are application code. Existing initialized retained
documents remain usable with a host-managed provider, but the host must ensure
its native identity matches the remote room. Preseeding an unrelated local
template does not establish that. The initialization guard cannot authenticate
or validate a backend, and a provider already connected before admission is
outside its lifecycle. Do not put permanent provider secrets
in browser bundles, document JSON, awareness state, or repository settings.
Use short-lived, room-scoped credentials and enforce document permissions on
the relay/service—not in the editor UI.

### Switch documents or providers without recreating the editor

Room, account, and transport changes are explicit runtime operations. Open the
destination through the authority and save any unsent source draft before
replacing the current session:

```ts
import { replaceCollaborationAdapter } from 'fountainjs-editor'

replaceCollaborationAdapter(editor, () => next.createAdapter({
  provider: api.createDisconnectedProvider(next.document, next.lease),
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

The retained default stores node and character identities separately from their
current document placement. Wrapping a paragraph, splitting its text or applying
a mark therefore does not have to discard the shared object that an offline
peer is editing. A small named room gate identifies the versioned retained
protocol. Checkpoints preserve its native Yjs state; ordinary Fountain JSON
remains the portable document representation.

The explicit XML adapter instead represents each model node as a nested
`Y.XmlElement`, with its text in a `Y.XmlText` and marks on the text-node element.
Its before/after reconciliation aligns existing elements and replaces unmatched
structure. That representation has the documented offline structural-edit
limitations. Its historical first-root cleanup is available only in the legacy
adapter when `preserveConcurrentRoots` is not enabled. The retained default
never chooses one independently initialized draft and discards the other.

Both adapters reconstruct incoming state through the receiving editor's schema
and validate it before applying a remote transaction.
Malformed nodes, marks, attributes, excess depth/count, unsafe presence, and
unknown schema types fail closed; the previous editor document remains intact.

Every client in a room must compose a compatible schema. Custom nodes and marks
work without Yjs-specific code because their names and JSON-safe attributes use
the same generic representation, but a client that does not recognize them
will correctly reject the remote document instead of silently dropping data.

### Opt-in nested attributes

By default, different top-level attributes merge independently while an object
or array inside one attribute is one flat JSON value. Pass
`structuredAttributes` to `createYjsCollaborationExtension` when particular
product nodes need field-level concurrency:

```ts
const collaboration = createYjsCollaborationExtension({
  document: ydoc,
  user,
  structuredAttributes: {
    definitions: [boardConfig],
    identityAttribute: 'nodeId',
  },
})
```

Configured nodes need valid unique stable IDs. The adapter mirrors their
selected values into a dedicated nested `Y.Map`/`Y.Array` tree, updates it in
the same transaction as the canonical document representation, overlays it on
remote reads, and repairs the flat JSON attribute after convergence. Separate
nested keys and concurrent array insertions survive; edits to the same leaf and
whole-root replacement remain genuine conflicts resolved by Yjs. The undo
manager covers both representations under the same local-only origin.

Canonical `editor.getJSON()` and exports contain only ordinary objects and
arrays. Mixed clients can read that flat value, but clients without the same
granular configuration cannot promise field-level concurrency. See
[STRUCTURED_ATTRIBUTES.md](STRUCTURED_ATTRIBUTES.md) for commands, rollout,
limits, headless use, and the complete conflict matrix.

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

For an application update that should be shared but excluded from author undo,
set the history flag explicitly:

```ts
editor.dispatch(editor.createTransaction()
  .setNodeAttrs([0], { review: 'Reviewed' })
  .setMeta('addToHistory', false))
```

The default Yjs adapter publishes that change using its untracked repair origin.
It remains in the document when subsequent authored typing is undone. Automatic
maintenance appended to an ordinary author action still belongs to that action's
undo step. See the [history policy audit](YJS_HISTORY_POLICY_AUDIT.md) for the
verified scope and remaining concurrency failures.

Do not route collaborative keystrokes through the snapshot-based local
`HistoryExtension` at the same time. Keep local history for non-collaborative
editors and use the origin-aware commands for a shared Yjs room.

For a plain-core DOM host, bind keyboard history explicitly to those same
commands. The collaboration extension exposes commands; it does not install
the local-history plugin or assume the host's shortcuts:

```ts
import { Plugin, undoCollaboration, redoCollaboration } from 'fountainjs-editor'

const collaborativeShortcuts = new Plugin({
  props: {
    handleKeyDown(editor, event) {
      const key = event.key.toLowerCase()
      if (!editor.editable || event.isComposing || event.altKey
        || !(event.ctrlKey || event.metaKey) || (key !== 'z' && key !== 'y')) {
        return false
      }
      if (key === 'y' || event.shiftKey) redoCollaboration(editor)
      else undoCollaboration(editor)
      return true // Consume even an empty stack; avoid native DOM history.
    },
  },
})

// Add to the shared surface's createEditor configuration:
// plugins: [...kit.plugins, collaborativeShortcuts]
```

This enables Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y while preserving each
author's history. Install it only on the surface whose active adapter owns
history; remove or replace the binding when switching to a non-collaborative
editing mode. Hosts can choose different shortcuts or expose the commands
through their own UI.

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
- Yjs text and structural synchronization within the supported editing workflows;
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

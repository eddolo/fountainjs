# Stable node identities

The opt-in `fountainjs-editor/node-ids` entry gives document nodes portable,
document-scoped identities. It is intended for application records, comments,
widgets, databases, cross-system references, and any feature that must address a
node after unrelated edits have moved its path.

This module does not turn FountainJS into a database. An ID is an address inside
one document, not an authorization token, globally unique URL, or permission
boundary. Hosts still own documents, users, access control, and external object
namespaces.

## Compose the extension

```ts
import { CoreExtension, composeExtensions, createEditor } from 'fountainjs-editor'
import { StableNodeIdsExtension } from 'fountainjs-editor/node-ids'

const kit = composeExtensions([CoreExtension, StableNodeIdsExtension])
const editor = createEditor({
  schema: kit.schema,
  plugins: kit.plugins,
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
  },
})

console.log(editor.state.doc.child(0).attrs.nodeId) // fjs-...
```

Compose stable IDs before collaboration so initial content is normalized before
a provider connects:

```ts
composeExtensions([
  CoreExtension,
  StableNodeIdsExtension,
  createYjsCollaborationExtension({ document: ydoc, user }),
])
```

By default, every non-root block node receives a `nodeId`. Text leaves do not.
The separate name deliberately avoids overwriting semantic attributes such as a
footnote's `id`, a mention's record ID, or an HTML anchor.

## Configure eligibility and generation

Use `createStableNodeIdsExtension()` when an application needs another policy:

```ts
import { createStableNodeIdsExtension } from 'fountainjs-editor/node-ids'

const identities = createStableNodeIdsExtension({
  attribute: 'identity',
  types: ['paragraph', 'heading', 'image_super', 'task_item'],
  filter: ({ node }) => node.attrs.temporary !== true,
  generateId: ({ node, path, reason, attempt }) =>
    records.allocateId({ type: node.type.name, path, reason, attempt }),
})
```

`types` may opt non-text inline atoms into identity. The root and text leaves
remain excluded. Generators are synchronous, receive the repair reason and a
bounded attempt number, and must return a value matching
`STABLE_NODE_ID_PATTERN`. Fountain retries invalid or colliding results at most
100 times, then throws instead of admitting an ambiguous index.

The supplied generator is deterministic from repair reason, path, node content,
and attempt. Applications may inject UUIDs, database keys, or deterministic
test IDs. These identifiers are not secrets.

## Lookup and commands

The live plugin maintains a `StableNodeIdIndex`:

```ts
import {
  getNodeById,
  getStableNodeIdIndex,
  selectNodeById,
  updateNodeById,
} from 'fountainjs-editor/node-ids'

const entry = getStableNodeIdIndex(editor)?.get(nodeId)
console.log(entry?.path, entry?.node)

updateNodeById(editor, nodeId, { status: 'approved' })
selectNodeById(editor, nodeId)
console.log(getNodeById(editor, nodeId))
```

`get()` is O(1). `getAll()` is available for diagnostics. If a raw document has
two nodes with the same ID, `get()` and `nodeById()` return `undefined`; Fountain
never silently selects the first match. `updateNodeById()` preserves the target
identity even if `attrs` contains a different ID. A deliberate identity change
can still use the ordinary node-attribute transaction API and will pass through
normal validation and collision repair.

The extension also contributes `repairStableNodeIds`, `updateNodeById`, and
`selectNodeById` commands plus a `stableNodeIds` service for composed kits.

## Headless inspection and migration

Every model operation in this module runs in plain Node.js without `document`,
`window`, jsdom, or another fake DOM:

```ts
import {
  createStableNodeIdIndex,
  inspectStableNodeIds,
  normalizeStableNodeIdJSON,
  normalizeStableNodeIds,
  planStableNodeIdRepairs,
} from 'fountainjs-editor/node-ids'

const report = inspectStableNodeIds(documentNode)
const plan = planStableNodeIdRepairs(documentNode)
const normalized = normalizeStableNodeIds(documentNode)

const stored = normalizeStableNodeIdJSON(schema, storedNodeJSON)
await database.save(stored.document)
console.log(stored.repairs)
```

`normalizeStableNodeIdJSON()` is suitable inside an application-owned Fountain
document migration. It validates input through the supplied schema, returns new
JSON, and never mutates the stored value. Stable IDs remain optional application
policy, so enabling them does not increment Fountain's global document-format
version automatically.

Canonical JSON and the generic Yjs tree preserve `nodeId` exactly. HTML and
Markdown remain interoperability formats and intentionally do not claim to
carry private application identity through arbitrary external editors. A host
that needs IDs in HTML should define and security-review its own schema
attributes rather than treating arbitrary DOM `id` values as trusted records.

## Repair, history, and collaboration

Missing, invalid, and duplicate IDs are repaired in one position-neutral step.
That step has an empty position map because it changes attributes only, so text,
node, comment, tracked-change, and page-anchor positions do not move. It is
marked `addToHistory: false`: a paste remains one undoable user action instead of
creating a second repair-only undo entry.

On a local edit, the extension keeps an existing node's ID when it can identify
that node by immutable identity or its mapped position. A copy pasted before
the original receives a new ID, so application references still point to the
original. Initial normalization and remote repair use document order when
resolving duplicate IDs. Applications that let independent offline authors
create identical copies at the same location can supply a UUID generator,
as the homepage's collaborative settings demo does.

For collaboration, a repair appended to a validated remote transaction is
explicitly published back through the provider boundary. This allows an older
or differently configured peer to introduce a duplicate while an ID-aware peer
repairs the shared Yjs document. The repair is deterministic and Yjs attributes
converge normally; provider choice remains host-owned.

The implementation rebuilds its immutable index after a document-changing
transaction and normalizes missing, invalid, or duplicate IDs when repairs are needed.
Repeated lookup is constant-time. The Node-only suite exercises initialization,
maintenance, and 100,000 indexed reads over a 10,000-block document under
explicit timing budgets.

## Limits

- Identity is document-scoped unless a host adds its own namespace.
- HTML and Markdown do not preserve `nodeId` by default.
- Two separately copied documents may intentionally contain the same IDs; only
  duplicates inside one indexed document are conflicts.
- IDs locate nodes, not text offsets. Use mapped positions, comment anchors, or
  application-owned ranges for character-level references.
- Eligibility policy should be agreed by collaborating clients. Mixed clients
  still converge, but an ID-aware peer may add identities that an older peer
  merely preserves as ordinary attributes.

## Collision-group construction repair — 2026-11-17

The index now accumulates each private collision group and freezes its array
once, then retains the private lookup map. Previously every duplicate cloned the
entire growing group, followed by a second dictionary copy. Large collision groups
therefore incurred quadratic array-copying work. Lookup remains ambiguous until
repair: `get(id)` returns `undefined`, while `getAll(id)` retains every immutable
entry in document order with all duplicate diagnostics and paths.

A new semantic regression indexes 2,500 copies of the same ID and checks complete
collision groups, immutable paths/results, fail-closed lookup and independent
later snapshots. The installed-package diagnostic uses 1,000, 5,000 and 10,000
blocks, seven samples per unique/colliding/mixed case, and reversed process order.
At 10,000 blocks on this host:

| Input | Baseline first | Repair second | Repair first | Baseline second |
| --- | ---: | ---: | ---: | ---: |
| Unique IDs | 9.55 ms | 8.70 ms | 7.97 ms | 9.21 ms |
| All IDs collide | 126.04 ms | 6.47 ms | 7.24 ms | 130.30 ms |
| Sixteen collision groups | 14.43 ms | 7.47 ms | 6.29 ms | 15.42 ms |

These are index-construction medians, excluding fixture creation, assertions and
GC. They are not end-to-end paste, typing, universal scaling or competitor claims.
Every run checks all entries, paths, duplicate ownership, frozen results and
unchanged source documents. The [receipt](../artifacts/node-id-index-repair-20261117.json)
records the identical diagnostic hash, package fingerprints, raw-report hashes,
every timing sample and reproduction commands. Run it against an installed build:

```powershell
node --expose-gc scripts/diagnose-node-id-index.mjs --package-root <consumer>/node_modules/fountainjs-editor --tarball <tarball> --sizes 1000,5000,10000 --repeats 7 --output <fresh-report.json>
```

Validation also passes 1,034 focused model/Yjs tests, TypeScript, package/API,
headless and unchanged bundle-budget checks. Twenty-two recorded browser journeys
pass across Chromium, Firefox and WebKit; two native-clipboard variants skip
because that existing automation is Chromium-only. Captured inline/quote/merge
states were visually reviewed. The exact installed repair passes the retained-Yjs
5,000-paragraph/six-cycle offline, undo/redo and checkpoint diagnostic. That run's
447 ms eleven-character burst still exposes full-document normalization cost;
this repair does not close overall collaboration performance acceptance.

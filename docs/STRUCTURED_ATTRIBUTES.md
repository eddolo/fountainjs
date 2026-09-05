# Structured attributes

FountainJS can update and collaboratively merge selected paths inside a node
attribute without changing the portable document format. This is intended for
widgets, form fields, database blocks, layouts, and other nodes whose one JSON
attribute contains independently editable settings.

The feature has two deliberately separate parts:

- `fountainjs-editor/structured-attributes` is a DOM-free definition,
  validation, and command surface;
- `fountainjs-editor/yjs` can opt those definitions into nested `Y.Map` and
  `Y.Array` storage.

Without the Yjs option, every command still works as one ordinary Fountain
transaction. With the option, two disconnected authors can change separate
nested fields without replacing the complete attribute.

## Define the portable value

```ts
import { defineExtension } from 'fountainjs-editor'
import {
  defineStructuredAttribute,
  setStructuredAttribute,
  insertStructuredAttributeItems,
} from 'fountainjs-editor/structured-attributes'

const board = defineExtension({
  name: 'board',
  nodes: {
    board: {
      group: 'block',
      atom: true,
      attrs: {
        nodeId: { validate: value => typeof value === 'string' },
        config: {
          validate: value => Boolean(value && typeof value === 'object'),
        },
      },
      toDOM: () => ['section', { 'data-board': '' }, 'Board'],
    },
  },
})

const boardConfig = defineStructuredAttribute({
  nodeType: 'board',
  attribute: 'config',
  root: 'object',
  validate(value, context) {
    const config = value as { columns?: unknown }
    return Number(config.columns) >= 1 && Number(config.columns) <= 12
      ? true
      : `Invalid board config changed at ${context.path.join('.')}`
  },
})

setStructuredAttribute(editor, [2], boardConfig, ['columns'], 4)
insertStructuredAttributeItems(
  editor,
  [2],
  boardConfig,
  ['filters'],
  1,
  [{ field: 'owner', value: 'ada' }],
)
```

Definitions name an exact node type and exact attribute. `root` may be
`object`, `array`, or `either`. Values contain only JSON objects, arrays,
strings, finite numbers, booleans, and `null`. Validation clones and freezes
the accepted value; unsupported prototypes, circular values, unsafe keys, and
values outside configured limits fail closed.

The optional validator receives the complete candidate root plus the changed
path and action. Fountain then constructs the complete candidate node through
its schema before dispatch. This makes both application invariants and the
ordinary node schema authoritative.

## Commands and transactions

The entry exports:

- `getStructuredAttribute`;
- `setStructuredAttribute`;
- `deleteStructuredAttribute`;
- `insertStructuredAttributeItems`;
- `deleteStructuredAttributeItems`;
- `validateStructuredAttributeValue`.

Every accepted command dispatches one normal `setNodeAttrs` step and attaches
`STRUCTURED_ATTRIBUTE_TRANSACTION_META`. It therefore participates in editor
subscriptions, transaction filters, read-only policy, local history, tracked
changes, and generic collaboration exactly like another node-attribute edit.

The node path must still resolve to the declared node type. Intermediate path
segments must already exist. A final object property may be added; array
indexes must be in range. Passing an empty path to `setStructuredAttribute`
replaces the complete root, while deleting the root is deliberately refused.

## Enable granular Yjs merging

```ts
import * as Y from 'yjs'
import { createStableNodeIdsExtension } from 'fountainjs-editor/node-ids'
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs'

const ids = createStableNodeIdsExtension({ types: ['board'] })
const collaboration = createYjsCollaborationExtension({
  document: new Y.Doc(),
  user: { id: 'ada', name: 'Ada', color: '#6d4aff' },
  structuredAttributes: {
    definitions: [boardConfig],
    identityAttribute: 'nodeId', // this is the default
    // mapName: 'workspace:structured-attributes',
  },
})
```

All nodes matching a configured definition must have a valid, unique stable
ID. Missing, malformed, or duplicate IDs stop synchronization and surface a
recoverable collaboration error instead of associating state with the wrong
node. Compose the stable-ID extension or supply application-owned IDs before
connecting.

The adapter retains the existing `Y.XmlElement` document and its ordinary JSON
attribute. It also owns a dedicated top-level Yjs map, named
`<fragmentName>:structured-attributes` by default. Each entry is addressed by
version, node type, stable node ID, and attribute name. Objects become nested
`Y.Map` values, arrays become nested `Y.Array` values, and primitives remain
primitives.

Local changes update the canonical XML tree and granular map in the same Yjs
transaction. Incoming state overlays the nested value on the canonical
Fountain document, validates the complete receiving schema, and repairs the
flat JSON attribute to the converged value. That repair uses a separate origin
and cannot create an editor echo or undo item.

Applications with several fragments can pass an explicit `mapName`, or a
dedicated integrated `map` from the same `Y.Doc`. The supplied map is reserved
for this adapter; unrelated application keys may be removed when document
nodes are removed.

## What merges

| Concurrent work | Result |
| --- | --- |
| Separate object keys | Both values survive. |
| Separate keys inside the same nested object | Both values survive. |
| Fields inside separate existing array objects | Both field changes survive when the items retain their shared nested types. |
| Concurrent array insertions | Both insertions survive in deterministic Yjs order. |
| Same primitive leaf | Yjs resolves one deterministic value; Fountain does not invent a semantic merge. |
| Delete versus edit of the same key/item | Normal Yjs conflict rules apply. |
| Whole-root replacement versus nested editing | The root replacement is an overlapping operation and may supersede nested work. |

Array command paths are positional at dispatch time. For product operations
that must address a particular array item after arbitrary concurrent inserts,
give those items their own IDs and resolve the current index before issuing the
command.

## Undo and JSON compatibility

The adapter's `Y.UndoManager` scopes both the canonical XML fragment and the
granular map, but tracks only the local adapter origin. Undoing one local field
change therefore preserves a remote field change that arrived later. The flat
canonical attribute is repaired from the nested result after undo.

`editor.getJSON()` remains ordinary Fountain JSON:

```json
{
  "type": "board",
  "attrs": {
    "nodeId": "board-17",
    "config": {
      "columns": 4,
      "filters": [{ "field": "owner", "value": "ada" }]
    }
  }
}
```

No Yjs type, client ID, clock, or map key enters exports, HTML, Markdown,
snapshots, or application databases unless the host separately persists Yjs
updates.

An older Fountain client that does not enable granular definitions can still
read and write the canonical flat attribute. It cannot participate in
field-level merging and a concurrent whole-attribute write can overwrite
nested work. Roll the definition and compatible schema to all collaborative
clients before relying on granular guarantees.

## Safety and headless use

Defaults are bounded to 32 nested levels, 10,000 combined entries, 128
characters per key, 1,000,000 characters per string, and a 1,000,000-character
JSON representation. Definitions may lower these limits. The hard public
ceilings prevent a definition from requesting unbounded recursion or storage.
The dedicated shared store additionally refuses more than 100,000 root
entries. Remote non-JSON values, unsafe object keys, unexpected Yjs types,
invalid roots, and schema failures leave the previous editor document intact.

These checks are document integrity controls, not authorization. The host must
authenticate provider connections, authorize rooms and writes, bound transport
updates, and enforce storage and retention policy on its server.

`fountainjs-editor/structured-attributes` imports neither Yjs nor browser APIs
and can define, validate, and update an editor in pure Node.js. The optional
Yjs bridge also uses no DOM APIs. DOM/React rendering remains an independent
view concern.

## Current boundary

This contract makes selected JSON attributes granular; it does not turn every
arbitrary node attribute into a CRDT automatically. Opt-in is intentional so
schema authors decide which values have meaningful nested concurrency and pay
no extra map/storage cost for simple attributes. It also does not provide
database permissions, form submission, server persistence, or application
validation beyond the hooks the host supplies.

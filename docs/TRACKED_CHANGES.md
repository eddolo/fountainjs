# Tracked changes

FountainJS tracked changes are an optional, framework-neutral review module. It
records proposed document edits with an author, timestamps, a stable suggestion
id, an optional reason, and an optional comment-thread link. A reviewer can
accept or reject one suggestion, everything in a range, everything by an
author, a filtered set, or the complete document.

This capability ships today. It is not an AI feature and it does not require a
FountainJS account or server. AI, a human editor, an import job, or any product
command can create the same kind of proposal because they all dispatch normal
transactions.

## Package boundaries

The implementation is isolated from the main editor bundle:

```ts
import {
  createTrackedChangesExtension,
  acceptTrackedSuggestion,
  rejectTrackedSuggestion,
} from 'fountainjs-editor/tracked-changes'
```

React applications may additionally import the supplied review panel:

```tsx
import { FountainTrackedChanges } from 'fountainjs-editor/react/tracked-changes'
```

Neither entry is loaded by `fountainjs-editor` or
`fountainjs-editor/react`. Non-React products use the exact same state,
commands, events, and document representation.

## Compose it

```ts
import {
  CoreExtension,
  HistoryExtension,
  composeExtensions,
  createEditor,
} from 'fountainjs-editor'
import { createTrackedChangesExtension } from 'fountainjs-editor/tracked-changes'

const trackedChanges = createTrackedChangesExtension({
  user: {
    id: session.user.id,
    name: session.user.displayName,
    color: '#6d4aff',
  },
})

const kit = composeExtensions([
  CoreExtension,
  HistoryExtension,
  trackedChanges,
])

const editor = createEditor({
  schema: kit.schema,
  plugins: kit.plugins,
  content: savedDocument,
})
```

Tracking defaults to enabled. Pass `enabled: false`, call
`enableTrackedChanges`, or call `toggleTrackedChanges` when the host product
owns the initial mode. `setTrackedChangesUser` changes the author for later
edits without rewriting existing authorship.

The `user.id` must be a stable application identity. A display name is not an
authorization credential.

## What gets tracked

All normal document-changing transactions pass through one review transform.
The transform compares the accepted review document with the proposed result
and represents the difference without discarding the content a reviewer needs
to make a decision.

| User action | Portable component | Review result |
| --- | --- | --- |
| Insert text | `insert` | Added text is underlined and retained on accept. |
| Delete text | `delete` | Removed text stays visible with deletion styling until review. |
| Replace text | `replacementDeletion` + `replacementInsertion` | The complete selected range and replacement share one id. |
| Add or remove formatting | `markChange` | Before and after mark JSON are both stored. |
| Change node settings | `attributeChange` | Before and after attributes are both stored. |
| Insert a node or atom | `nodeInsertion` | The complete typed node remains inspectable. |
| Delete a node or atom | `nodeDeletion` | The complete previous node remains inspectable. |
| Split, join, indent, outdent, lift, or sink | text and structural components under one id | Accept reconstructs the proposed structure; reject reconstructs the previous structure. |

This covers paragraphs, headings, lists, task items, blockquotes, code, images,
inline atoms, audio, video, files, embeds, table structures, and extension-owned
nodes because tracking operates on the schema document—not on a fixed list of
HTML elements.

Adjacent text typed into an existing insertion by the same author stays in the
same suggestion. Removing part of that unaccepted insertion shortens the
suggestion instead of creating a fake deletion. Different-author edits can be
nested as multiple records on one text run, so review metadata is not silently
overwritten.

## Portable representation

Text components use the schema mark `tracked_change`:

```json
{
  "type": "text",
  "text": "clearer",
  "marks": [{
    "type": "tracked_change",
    "attrs": {
      "changes": [{
        "id": "suggestion-m0abc-1",
        "component": "replacementInsertion",
        "user": { "id": "ada", "name": "Ada Lovelace", "color": "#6d4aff" },
        "createdAt": "2026-09-04T12:00:00.000Z",
        "updatedAt": "2026-09-04T12:00:00.000Z",
        "reason": "Use the product term"
      }]
    }
  }]
}
```

Node and atom components use the reserved `fountainTrackedChanges` node
attribute. Records contain JSON values only. They survive `node.toJSON()`,
`schema.nodeFromJSON()`, databases, application APIs, and Yjs shared trees.
React elements, DOM nodes, callbacks, credentials, and provider state never
enter the document.

Persist the FountainJSON document if suggestions must round-trip exactly.
Markdown and ordinary HTML do not have a universal tracked-change vocabulary;
those exporters provide a readable projection rather than a lossless review
archive.

## Query and review

```ts
import {
  findTrackedSuggestions,
  getTrackedChangesState,
  acceptTrackedSuggestion,
  rejectTrackedSuggestion,
  acceptTrackedSuggestionsByUser,
  rejectTrackedSuggestionsInRange,
} from 'fountainjs-editor/tracked-changes'

const state = getTrackedChangesState(editor)
const replacements = findTrackedSuggestions(editor.state.doc, {
  type: 'replace',
})

acceptTrackedSuggestion(editor, replacements[0].id)
rejectTrackedSuggestionsInRange(editor, selectionFrom, selectionTo)
acceptTrackedSuggestionsByUser(editor, session.user.id)
```

Available decisions are:

- `acceptTrackedSuggestion` / `rejectTrackedSuggestion`;
- `acceptAllTrackedSuggestions` / `rejectAllTrackedSuggestions`, optionally
  with an id, type, author, or range filter;
- `acceptTrackedSuggestionsInRange` / `rejectTrackedSuggestionsInRange`;
- `acceptTrackedSuggestionsByUser` / `rejectTrackedSuggestionsByUser`;
- `resolveTrackedSuggestion` and `resolveAllTrackedSuggestions` for pure,
  editor-free server or worker processing.

Every editor decision is one undoable transaction. It is marked as an internal
review operation so accepting a deletion does not produce a new deletion
suggestion. Ordinary local history can undo it. A Yjs room should use its
local-origin collaboration history.

`selectTrackedSuggestion` maps text suggestions back to a real Fountain
selection when possible. Atom-only structural suggestions still receive a node
decoration and selected state. `hoverTrackedSuggestions` lets any interface
coordinate cards with document highlighting.

## Programmatic proposals

The convenience helpers use the same transaction path as browser input:

```ts
import {
  addTrackedInsertion,
  addTrackedDeletion,
  addTrackedReplacement,
  addTrackedMarkChange,
  addTrackedNodeAttributeChange,
  dispatchTrackedTransaction,
} from 'fountainjs-editor/tracked-changes'

addTrackedReplacement(editor, [2, 0], 4, 11, 'portable', 'Use the API term')

dispatchTrackedTransaction(editor, transaction => {
  transaction.replace(3, 3, [newCallout])
}, 'Add the release warning')
```

`dispatchTrackedTransaction` is the general escape hatch: every schema-valid
transaction step is tracked, including product-specific nodes and structural
commands. Passing a reason adds it to the complete suggestion.

To make a normal transaction bypass suggestion mode, temporarily disable
tracking. `addToHistory: false` transactions are also ignored because they are
reserved for derived repair or interface state. Remote collaboration
transactions marked `fountain$collaborationRemote` are never attributed to the
receiving user.

## React review panel

```tsx
<FountainTrackedChanges
  editor={editor}
  title="Editorial review"
  onCreateComment={async suggestion => {
    const thread = await discussions.createForSuggestion(suggestion)
    linkTrackedSuggestionToComment(editor, suggestion.id, thread.id)
  }}
/>
```

The supplied panel includes:

- live tracking-mode control and open count;
- filters for suggestion type and full author identity;
- individual and filtered batch accept/reject;
- card-to-document selection and hover highlighting;
- complete, wrapping or scrollable text instead of unexplained ellipses;
- full author names and native hover titles;
- reason, timestamp, and linked-discussion state;
- an optional host callback for starting a discussion;
- keyboard-visible focus and labels on every control;
- explicit foreground and background colors in action hover states.

It is one optional renderer. Vue, Svelte, Angular, Lit, Web Components, or a
server-rendered application can subscribe to `Editor`, read
`getTrackedChangesState`, and call the framework-neutral functions directly.

## Events

```ts
const unsubscribe = subscribeTrackedChanges(editor, event => {
  audit.record(event)
})
```

Events report suggestion creation/update, individual or batch acceptance and
rejection, tracking enable/disable, and selected-suggestion changes. Events are
observational: throwing in host audit code must be contained by the host. The
portable document remains authoritative.

## Comments integration

Comments and tracked changes remain separate modules:

- a suggestion is portable document state and travels with the document;
- a comment thread uses the application’s authenticated `CommentsAdapter`;
- `linkTrackedSuggestionToComment` stores only the safe thread id on the
  suggestion;
- deleting a thread does not silently accept or reject a suggestion;
- accepting or rejecting a suggestion does not silently delete discussion
  history.

The host decides whether to preserve, archive, or relink the discussion after a
decision. This avoids coupling document truth to one comment service.

## Yjs collaboration

Compose both extensions against the same schema:

```ts
const kit = composeExtensions([
  CoreExtension,
  createTrackedChangesExtension({ user }),
  createYjsCollaborationExtension({ document: ydoc, provider, user }),
])
```

The final tracked document is what the local Yjs adapter publishes. Remote
peers validate and render its mark/node records but do not run a second diff or
claim authorship. Suggestions therefore work offline and converge with the
rest of the Fountain tree. Every client must compose the same tracked-changes
schema extension before joining a review document.

Transport, authentication, room authorization, persistence, awareness, and
retention remain provider-owned. See [COLLABORATION.md](COLLABORATION.md).

## Security and production responsibilities

The module validates record ids, authors, timestamps, colors, reasons, mark
snapshots, attribute snapshots, JSON serializability, duplicate components, and
document-wide count/size bounds. A transaction carrying malformed review data
fails before it changes editor state. Rendered titles and labels use DOM text
and attribute APIs; metadata is never interpreted as HTML.

The browser identity and UI permissions are usability controls, not security.
A production API must still:

1. authenticate the caller and derive its canonical author id server-side;
2. authorize edit and review decisions for the document/room;
3. validate incoming FountainJSON against the product schema and tracked-change
   limits;
4. apply optimistic concurrency, CRDT, or version checks so reviewers do not
   overwrite newer work;
5. keep an immutable audit log if compliance requires one;
6. rate-limit and cap payloads before writing them to storage;
7. sanitize any product UI that renders metadata outside FountainJS;
8. define retention and deletion rules for author metadata and discussions.

Never trust a client-supplied display name, role, accepted-by identity, or
comment permission predicate as proof of authority.

## Deliberate boundaries

FountainJS supplies the tracking engine, portable representation, queries,
decisions, events, document decorations, and an optional React panel. It does
not supply a hosted review service, user directory, access policy, audit
database, notification system, email workflow, or side-by-side document
versioning product. Those are application concerns connected through the same
open extension and storage boundaries.

For a complete source tour, see [ARCHITECTURE.md](ARCHITECTURE.md). Public
signatures are indexed in [API.md](API.md).

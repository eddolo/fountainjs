# Schema-aware AI document tools

`fountainjs-editor/ai/document-tools` is a DOM-free, provider-neutral bridge
between an agent and Fountain's document model. It does not call a model and it
does not let a tool invocation silently mutate the editor.

The contract is deliberately two-stage:

```text
agent tool call -> bounded read or validated proposal -> host review -> one transaction
```

The application owns the model, prompt, authentication, permissions, rate
limits, audit log, and review UI.

## Five portable tools

`AI_DOCUMENT_TOOL_DEFINITIONS` contains provider-neutral descriptors and JSON
Schemas for:

- `fountain.read`: inspect a bounded, path-addressed projection of the live
  document or a pending proposal;
- `fountain.insert`: propose schema nodes at a parent child index;
- `fountain.replace`: propose a complete node replacement or ordered text-range
  replacement;
- `fountain.format`: propose adding or removing a schema mark over an ordered
  text range;
- `fountain.structure`: propose declared node-attribute changes or removal of a
  structural node.

Every descriptor reports `mutatesOnInvocation: false`. Pass these definitions
through an adapter for an MCP server, hosted model, local model, worker, or any
other function-calling system. Fountain does not impose an AI SDK.

## Read without flattening the document

```ts
import { createAIDocumentToolbox } from 'fountainjs-editor/ai/document-tools'

const tools = createAIDocumentToolbox(editor)
const result = tools.read({ path: [], depth: 2, limit: 100 })
```

The result includes the live schema description plus ordered records containing
each node's path, type, declared attributes, marks, child count, and text when
the record is a text node. Reads default to 500 records and fail at configured
bounds. `truncated` tells the caller to request a narrower path; Fountain never
pretends a partial record list is a complete document tree.

This structured projection avoids converting tables, media, widgets, details,
or custom blocks into ambiguous plain text. A read only occurs when the host
chooses to service that tool call.

## Preview, inspect, accept

```ts
const proposal = tools.preview([{
  kind: 'insert',
  parentPath: [],
  index: editor.state.doc.childCount,
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Proposed section' }],
    },
  ],
}], { label: 'Add a conclusion' })

// The editor is unchanged. Inspect only the affected candidate subtree.
const candidate = tools.read({ proposalId: proposal.id, path: [3], depth: 2 })

// A human or host policy makes the explicit decision.
tools.accept(proposal)
```

`preview()` clones portable input, applies all operations to an isolated
transaction, validates the final document with the editor's actual schema, and
stores a bounded pending proposal. It returns the operations and affected paths
but does not echo the rest of the document back through the tool result. Use a
proposal-scoped `read()` for precise review.

`accept()` refuses a proposal when the live document no longer equals its base
document. A fresh proposal replays its validated steps into one normal editor
transaction tagged with `fountain$aiDocumentTools`, so history, collaboration,
plugins, and subscribers see an ordinary atomic edit. `reject()` changes only
proposal status.

## Atomic multi-operation plans

One proposal may contain up to 50 operations by default. Paths are interpreted
in sequence against the candidate transaction. This allows one reviewed action
to replace text, add a mark, update declared structure, and insert nodes without
exposing half-applied state to the editor.

```ts
const proposal = tools.preview([
  {
    kind: 'replace',
    target: 'text',
    from: { path: [0, 0], offset: 0 },
    to: { path: [0, 0], offset: 5 },
    text: 'Clear',
  },
  {
    kind: 'format',
    action: 'add',
    from: { path: [0, 0], offset: 0 },
    to: { path: [0, 0], offset: 5 },
    mark: { type: 'strong' },
  },
])
```

## Calling through the generic dispatcher

`invoke()` maps one provider-shaped call to either a read result or a pending
proposal:

```ts
const result = tools.invoke({
  name: 'fountain.replace',
  input: {
    target: 'text',
    from: { path: [0, 0], offset: 0 },
    to: { path: [0, 0], offset: 5 },
    text: 'Clear',
  },
})

// result.kind === 'proposal'; the live editor is still unchanged.
```

An application should validate its own user authorization before calling
`invoke()` or `accept()`. A model response is not authorization.

## Bounds and policy

```ts
const tools = createAIDocumentToolbox(editor, {
  allowedTools: ['fountain.read', 'fountain.replace'],
  maxReadNodes: 250,
  maxOperations: 20,
  maxPayloadBytes: 256_000,
  maxProposals: 25,
  allowUnknownAttributes: false,
})
```

- Paths must contain at most 100 non-negative integer segments.
- Read depth is at most 100 and records are capped by `maxReadNodes`.
- Mutation payloads must be JSON-serializable and fit one total byte limit.
- Node and mark JSON rejects unknown structural fields before schema parsing.
- Unknown node/mark types, invalid attributes, illegal content, invalid ranges,
  root replacement/removal, and no-op proposals fail before editor mutation.
- Attributes not declared by the active schema are rejected by default. A host
  with an intentionally open attribute model may opt in explicitly.
- Retained proposals are bounded; completed proposals are pruned before new
  ones, while excess pending work fails closed.

These are application-layer safety limits, not a sandbox. Never expose the
toolbox directly to an untrusted network client, and do not put database,
filesystem, credential, or operating-system actions behind these definitions
without separate authorization and isolation.

## Server and framework use

The entry imports only Fountain's platform-neutral editor/model/transaction
layers. Its source graph and generated declarations are compiled with no DOM
library, and its packed ESM and CommonJS builds execute proposals in pure
Node.js. The same toolbox can therefore sit behind React, Vue, Svelte, Angular,
a Web Component, plain DOM controls, a server workflow, or a future renderer.

Fountain does not yet rebase stale agent paths through concurrent edits. A
proposal is intentionally refused when the document changes; the agent must
read the fresh structure and propose again. Stable node IDs can help a host find
the new target before issuing that replacement call.

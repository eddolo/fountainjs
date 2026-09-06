# Host-owned AI conversations and prompts

`fountainjs-editor/ai/conversation` is a DOM-free orchestration layer for
multi-turn conversations. It does not provide a model account, network client,
database, telemetry service, or Fountain cloud. The application supplies both
an adapter and a store.

```ts
import {
  AIConversationController,
  createStreamingAIConversationAdapter,
} from 'fountainjs-editor/ai/conversation'

const controller = new AIConversationController({
  threadId: 'document-42-assistant',
  store: myConversationStore,
  adapter: createStreamingAIConversationAdapter(async function* (request, { signal }) {
    for await (const token of myModel.stream({ messages: request.messages, signal })) {
      yield { contentDelta: token }
    }
  }),
})
```

The controller loads prior turns, saves the new user message through the host
store, sends a bounded history window to the adapter, exposes streamed output
as transient UI state, and persists the assistant reply only after it finishes.
`cancel()` discards partial assistant output. Optimistic revisions prevent two
controllers from silently overwriting the same thread.

## Store contract

`AIConversationStore` has two operations:

- `load({ threadId, signal })`
- `save({ thread, expectedRevision, operationId, signal })`

Production stores should authenticate the caller, authorize the thread, enforce
retention and deletion rules, encrypt sensitive records where appropriate, and
implement `expectedRevision` as a compare-and-swap. `operationId` supports safe
retry/deduplication. `InMemoryAIConversationStore` is a deterministic local
reference for demos, tests, and ephemeral sessions; it is not a database.

Every message and metadata object is normalized, copied, frozen, bounded, and
required to be JSON serializable. The controller caps stored history at 500
messages and sends at most `maxContextMessages` (50 by default) to a model. The
request reports both included and total message counts so a host can disclose
exactly how much context is leaving the application.

## Reusable prompts

`AIPromptStore` is a separate host-owned CRUD boundary. A prompt is portable
data with an id, title, text template, exact placeholder list, timestamp, and
optional metadata.

```ts
const prompt = defineAIPromptTemplate({
  id: 'explain',
  title: 'Explain for an audience',
  template: 'Explain {{topic}} for {{audience}}.',
  updatedAt: new Date().toISOString(),
})

const text = renderAIPrompt(prompt, {
  topic: 'transaction mapping',
  audience: 'a new contributor',
})
```

Rendering fails when values are missing or undeclared. Values are plain text,
not executable expressions. `InMemoryAIPromptStore` is supplied as a reference;
applications may use a database, local storage adapter, team prompt catalogue,
or another store without changing the conversation controller.

## Optional React UI

```tsx
import { FountainAIConversation } from 'fountainjs-editor/react'

<FountainAIConversation
  controller={controller}
  promptStore={myPromptStore}
/>
```

The component shows persisted turns, live streaming output, stop, a two-step
history clear, reusable prompt selection, provider errors, and the exact active
request context. It does not write into the Fountain document. Document changes
remain behind the text-proposal or schema-aware document-tool review workflows.

## Security and privacy checklist

- Keep provider credentials on a trusted host or server.
- Treat model output as untrusted data.
- Apply server authorization independently of any client UI.
- Disclose which messages and document content are sent.
- Use short retention or explicit deletion for sensitive conversations.
- Do not connect conversation replies directly to document mutation. Route
  mutations through reviewed Fountain proposals.

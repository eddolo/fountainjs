# AI adapters and MCP

FountainJS separates the editor review lifecycle from model transport. Use any `AIAdapter`; choose `MCPAIAdapter` only when the application already has a compatible Model Context Protocol server.

## What FountainJS controls

1. Resolve selected text or the current text fragment.
2. Create an inspectable `AIRequestEnvelope`.
3. Call the application-supplied adapter.
4. Store the response as a proposal without mutating the document.
5. Validate that the original target is still current.
6. Apply an accepted replacement as an undoable transaction, or reject it unchanged.

Full-document context is absent unless the application sets `includeDocumentContext: true`.

## MCP transport

The included browser-and-Node client implements the Model Context Protocol `2025-11-25` Streamable HTTP lifecycle:

- `initialize` and `notifications/initialized`
- protocol-version negotiation
- `MCP-Session-Id` propagation and session cleanup
- paginated `tools/list` and `tools/call`
- JSON and server-sent-event responses
- JSON-RPC and HTTP errors
- abortable request timeouts
- custom fetch and authorization headers

The client does not pretend that every model provider is an MCP server. Point it at a compatible endpoint or your own bridge.

The test suite also starts a real loopback HTTP server and exercises the complete lifecycle—initialize, session propagation, initialized notification, tool discovery, tool call, accepted editor change, and DELETE cleanup. Protocol tests therefore verify live request/response behavior in addition to mocked edge cases.

## Review workflow over MCP

```ts
const integration = new MCPIntegration('https://mcp.example/mcp', {
  toolName: 'transform_content',
  headers: { Authorization: `Bearer ${token}` },
  timeoutMs: 20_000,
});

await integration.connectToMCPServer();

const ai = new AIController(editor, new MCPAIAdapter(integration));
const request = ai.inspectRequest({ action: 'improve' });
showDisclosure(request);

const suggestion = await ai.suggest({ action: 'improve' });
showReview(suggestion, {
  accept: () => ai.accept(suggestion),
  reject: () => ai.reject(suggestion),
});
```

## Tool contract

`MCPIntegration` calls `transform_content` by default. Override it with `toolName`. The tool receives:

```ts
interface ContentTransformRequest {
  content: string;
  contentType: 'text' | 'markdown' | 'json' | 'html';
  operation: 'generate' | 'improve' | 'transform' | 'summarize' | 'expand' | 'translate';
  context?: string;
  language?: string;
  instructions?: string;
}
```

Return one or more MCP text content blocks. A structured result is serialized as JSON when no text block exists. Results marked `isError` become `MCPError` exceptions.

## Security

- Never embed long-lived API keys in a public browser bundle.
- Prefer same-origin endpoints or short-lived scoped credentials.
- MCP servers should validate `Origin`, authenticate callers, and bind local-only services to loopback interfaces.
- Show `inspectRequest()` output when users need explicit disclosure.
- Treat generated text and metadata as untrusted application input.
- Configure CORS deliberately when editor and server origins differ.

Transport behavior follows the official MCP Streamable HTTP and tools specifications.

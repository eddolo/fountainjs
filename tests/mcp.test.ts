import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import {
  AIController,
  CoreSchemaSpec,
  MCPAIAdapter,
  MCPClient,
  MCPIntegration,
  Selection,
  createEditor,
} from '../src';

describe('MCP Streamable HTTP client', () => {
  it('negotiates a session, lists tools, and calls a tool', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { id?: number; method: string };
      const headers = new Headers({ 'content-type': 'application/json' });
      if (body.method === 'initialize') {
        headers.set('mcp-session-id', 'test-session');
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'test', version: '1' } } }), { headers });
      }
      if (body.method === 'notifications/initialized') return new Response('', { status: 202, headers });
      if (body.method === 'tools/list') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'transform_content', inputSchema: { type: 'object' } }] } }), { headers });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Stronger words.' }] } }), { headers });
    });

    const client = new MCPClient('https://example.test/mcp', { fetch: fetcher as typeof fetch });
    await client.connect();
    expect((await client.listTools())[0]?.name).toBe('transform_content');
    expect((await client.callTool('transform_content', { content: 'words' })).content[0]).toMatchObject({ text: 'Stronger words.' });
    expect(fetcher.mock.calls.some(([, init]) => new Headers(init?.headers).get('mcp-session-id') === 'test-session')).toBe(true);
  });

  it('offers a content-focused integration layer', async () => {
    const responses = [
      { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'test', version: '1' } },
      undefined,
      { content: [{ type: 'text', text: 'Polished.' }] },
    ];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { id?: number };
      const result = responses.shift();
      return result === undefined
        ? new Response('', { status: 202 })
        : new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { headers: { 'content-type': 'application/json' } });
    });
    const integration = new MCPIntegration('https://example.test/mcp', { fetch: fetcher as typeof fetch });
    await integration.connectToMCPServer();
    await expect(integration.transformContent({ content: 'Draft', contentType: 'text', operation: 'improve' })).resolves.toBe('Polished.');
  });

  it('uses a real Streamable HTTP server from negotiation through an accepted editor change', async () => {
    const calls: Array<{ method: string; session?: string }> = [];
    let closed = false;
    const server = createServer(async (request, response) => {
      if (request.method === 'DELETE') {
        closed = true;
        response.writeHead(204).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        id?: number;
        method: string;
        params?: { arguments?: { content?: string } };
      };
      calls.push({ method: body.method, session: request.headers['mcp-session-id'] as string | undefined });
      response.setHeader('content-type', 'application/json');
      if (body.method === 'initialize') {
        response.setHeader('mcp-session-id', 'live-session');
        response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {
          protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fountain-live-test', version: '1' },
        } }));
      } else if (body.method === 'notifications/initialized') {
        response.writeHead(202).end();
      } else if (body.method === 'tools/list') {
        response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {
          tools: [{ name: 'transform_content', inputSchema: { type: 'object' } }],
        } }));
      } else if (body.method === 'tools/call') {
        response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {
          content: [{ type: 'text', text: `MCP polished: ${body.params?.arguments?.content ?? ''}` }],
        } }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('The live MCP fixture did not bind to a TCP port.');
    const integration = new MCPIntegration(`http://127.0.0.1:${address.port}/mcp`);

    try {
      await integration.connectToMCPServer();
      expect((await integration.listTools()).map((tool) => tool.name)).toEqual(['transform_content']);
      const editor = createEditor({ schema: CoreSchemaSpec });
      editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, 0, 'Draft').setSelection(new Selection([0, 0], 0, 5)));
      const ai = new AIController(editor, new MCPAIAdapter(integration));
      const suggestion = await ai.suggest({ action: 'improve' });
      expect(suggestion.replacement).toBe('MCP polished: Draft');
      expect(editor.getText()).toBe('Draft');
      ai.accept(suggestion);
      expect(editor.getText()).toBe('MCP polished: Draft');
      await integration.close();
      expect(closed).toBe(true);
      expect(calls.map((call) => call.method)).toEqual([
        'initialize', 'notifications/initialized', 'tools/list', 'tools/call',
      ]);
      expect(calls.slice(1).every((call) => call.session === 'live-session')).toBe(true);
    } finally {
      await integration.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

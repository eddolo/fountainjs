import { describe, expect, it, vi } from 'vitest';
import { MCPClient, MCPIntegration } from '../src';

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
});

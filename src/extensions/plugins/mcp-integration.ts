export const MCP_PROTOCOL_VERSION = '2025-11-25';

export type MCPArguments = Record<string, unknown>;

export interface MCPTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface MCPTextContent { type: 'text'; text: string; }
export interface MCPImageContent { type: 'image'; data: string; mimeType: string; }
export interface MCPResourceContent { type: 'resource'; resource: Record<string, unknown>; }
export type MCPContent = MCPTextContent | MCPImageContent | MCPResourceContent | Record<string, unknown>;

export interface MCPToolResult {
  content: MCPContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface JSONRPCResponse<T> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPClientOptions {
  headers?: Record<string, string>;
  protocolVersion?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  clientInfo?: { name: string; version: string };
}

export class MCPError extends Error {
  constructor(message: string, public readonly code?: number, public readonly data?: unknown) {
    super(message);
    this.name = 'MCPError';
  }
}

async function parseResponse<T>(response: Response, requestId?: number): Promise<T | undefined> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  let payload: JSONRPCResponse<T> | undefined;
  if (contentType.includes('text/event-stream')) {
    const events = text.split(/\r?\n\r?\n/);
    for (const event of events) {
      const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (!data) continue;
      const candidate = JSON.parse(data) as JSONRPCResponse<T>;
      if (requestId === undefined || candidate.id === requestId) { payload = candidate; break; }
    }
  } else {
    payload = JSON.parse(text) as JSONRPCResponse<T>;
  }
  if (!payload) throw new MCPError('The MCP server returned no matching JSON-RPC response.');
  if (payload.error) throw new MCPError(payload.error.message, payload.error.code, payload.error.data);
  return payload.result;
}

export class MCPClient {
  private requestId = 0;
  private sessionId?: string;
  private negotiatedVersion?: string;
  private connected = false;
  private readonly fetcher: typeof fetch;
  private readonly options: Required<Pick<MCPClientOptions, 'protocolVersion' | 'timeoutMs' | 'clientInfo'>> & MCPClientOptions;

  constructor(public readonly endpoint: string, options: MCPClientOptions = {}) {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MCP Streamable HTTP endpoints must use http or https.');
    this.fetcher = options.fetch ?? globalThis.fetch;
    if (!this.fetcher) throw new Error('No fetch implementation is available.');
    this.options = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      timeoutMs: 30_000,
      clientInfo: { name: 'fountainjs-editor', version: '0.3.0' },
      ...options,
    };
  }

  get isConnected(): boolean { return this.connected; }

  async connect(): Promise<void> {
    const result = await this.request<{ protocolVersion: string }>('initialize', {
      protocolVersion: this.options.protocolVersion,
      capabilities: {},
      clientInfo: this.options.clientInfo,
    }, false);
    if (!result?.protocolVersion) throw new MCPError('The MCP server did not negotiate a protocol version.');
    this.negotiatedVersion = result.protocolVersion;
    await this.notify('notifications/initialized');
    this.connected = true;
  }

  async listTools(): Promise<MCPTool[]> {
    this.assertConnected();
    const tools: MCPTool[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.request<{ tools: MCPTool[]; nextCursor?: string }>('tools/list', cursor ? { cursor } : {});
      tools.push(...(result?.tools ?? []));
      cursor = result?.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(name: string, args: MCPArguments = {}): Promise<MCPToolResult> {
    this.assertConnected();
    const result = await this.request<MCPToolResult>('tools/call', { name, arguments: args });
    if (!result) throw new MCPError(`Tool ${name} returned no result.`);
    return result;
  }

  async close(): Promise<void> {
    if (this.sessionId) {
      await this.fetcher(this.endpoint, { method: 'DELETE', headers: this.headers() }).catch(() => undefined);
    }
    this.connected = false;
    this.sessionId = undefined;
  }

  private assertConnected(): void {
    if (!this.connected) throw new MCPError('MCP client is not connected. Call connect() first.');
  }

  private headers(method?: string, name?: string): Record<string, string> {
    return {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(this.negotiatedVersion ? { 'MCP-Protocol-Version': this.negotiatedVersion } : {}),
      ...(this.sessionId ? { 'MCP-Session-Id': this.sessionId } : {}),
      ...(method ? { 'MCP-Method': method } : {}),
      ...(name ? { 'MCP-Name': name } : {}),
      ...this.options.headers,
    };
  }

  private async post(body: Record<string, unknown>, requestId?: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const method = String(body.method ?? '');
    const params = body.params as { name?: string } | undefined;
    try {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: this.headers(method, params?.name),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new MCPError(`MCP HTTP ${response.status}: ${response.statusText}`, response.status);
      const session = response.headers.get('mcp-session-id');
      if (session) this.sessionId = session;
      return response;
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw new MCPError(`MCP request timed out after ${this.options.timeoutMs}ms.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request<T>(method: string, params: Record<string, unknown>, includeVersion = true): Promise<T | undefined> {
    const id = ++this.requestId;
    const response = await this.post({ jsonrpc: '2.0', id, method, params }, id);
    const result = await parseResponse<T>(response, id);
    if (includeVersion && !this.negotiatedVersion) throw new MCPError('MCP lifecycle has not been initialized.');
    return result;
  }

  private async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    await this.post({ jsonrpc: '2.0', method, params });
  }
}

export interface ContentTransformRequest {
  content: string;
  contentType: 'text' | 'markdown' | 'json' | 'html';
  operation: 'generate' | 'improve' | 'transform' | 'summarize' | 'expand' | 'translate';
  context?: string;
  language?: string;
  instructions?: string;
}

export interface MCPIntegrationOptions extends MCPClientOptions {
  toolName?: string;
}

export class MCPIntegration {
  private client?: MCPClient;
  private endpoint?: string;
  private readonly options: MCPIntegrationOptions;

  constructor(endpoint?: string, options: MCPIntegrationOptions = {}) {
    this.endpoint = endpoint;
    this.options = options;
  }

  async connectToMCPServer(endpoint = this.endpoint): Promise<void> {
    if (!endpoint) throw new MCPError('An MCP endpoint is required.');
    this.endpoint = endpoint;
    this.client = new MCPClient(endpoint, this.options);
    await this.client.connect();
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.client) throw new MCPError('MCP server is not configured.');
    return this.client.listTools();
  }

  async transformContent(request: ContentTransformRequest): Promise<string> {
    if (!this.client) throw new MCPError('MCP server is not configured. Call connectToMCPServer() first.');
    const toolName = this.options.toolName ?? 'transform_content';
    const result = await this.client.callTool(toolName, { ...request });
    const text = result.content
      .filter((block): block is MCPTextContent => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
    if (result.isError) throw new MCPError(text || `MCP tool ${toolName} reported an error.`);
    return text || (result.structuredContent ? JSON.stringify(result.structuredContent) : '');
  }

  async close(): Promise<void> { await this.client?.close(); }
}

export async function generateContentWithAI(
  prompt: string,
  integration: MCPIntegration,
  outputFormat: ContentTransformRequest['contentType'] = 'markdown',
): Promise<string> {
  return integration.transformContent({ content: prompt, contentType: outputFormat, operation: 'generate' });
}

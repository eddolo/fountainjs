/**
 * MCP (Model Context Protocol) Integration
 * 
 * Allows FountainJS to work with ANY AI system that supports MCP
 * AI-agnostic, language-agnostic, and framework-agnostic
 * 
 * Example MCP servers:
 * - OpenAI (via MCP bridges)
 * - Anthropic Claude
 * - Google Gemini
 * - Open source LLMs
 * - Custom enterprise LLMs
 */

export interface MCPToolInput {
  [key: string]: string | number | boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    type: 'object';
    properties: { [key: string]: any };
    required: string[];
  };
}

export interface MCPContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: MCPToolInput;
}

export interface MCPRequest {
  content: string;
  tools?: MCPTool[];
  systemPrompt?: string;
}

export interface MCPResponse {
  content: MCPContentBlock[];
  stopReason: string;
}

/**
 * AI-agnostic content transformation request
 * Send this to any MCP server, get back improved content
 */
export interface ContentTransformRequest {
  content: string;
  contentType: 'markdown' | 'json' | 'html' | 'fountain';
  operation: 'generate' | 'improve' | 'transform' | 'summarize' | 'expand';
  context?: string;
  language?: string;
}

/**
 * MCP Integration Plugin
 * Works with any AI service that supports Model Context Protocol
 */
export class MCPIntegration {
  private mcpServerUrl?: string;
  private tools: MCPTool[] = [];

  constructor(mcpServerUrl?: string) {
    this.mcpServerUrl = mcpServerUrl;
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    this.tools = [
      {
        name: 'generate_content',
        description: 'Generate new content in specified format',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'What to generate',
            },
            format: {
              type: 'string',
              enum: ['markdown', 'html', 'json', 'fountain'],
              description: 'Output format',
            },
            language: {
              type: 'string',
              description: 'Programming language (if code)',
            },
          },
          required: ['prompt', 'format'],
        },
      },
      {
        name: 'improve_content',
        description: 'Improve existing content',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to improve',
            },
            aspect: {
              type: 'string',
              enum: ['clarity', 'grammar', 'tone', 'structure'],
              description: 'What to improve',
            },
          },
          required: ['content', 'aspect'],
        },
      },
      {
        name: 'transform_format',
        description: 'Transform content between formats',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to transform',
            },
            fromFormat: {
              type: 'string',
              enum: ['markdown', 'html', 'json', 'fountain', 'text'],
            },
            toFormat: {
              type: 'string',
              enum: ['markdown', 'html', 'json', 'fountain'],
            },
          },
          required: ['content', 'fromFormat', 'toFormat'],
        },
      },
    ];
  }

  /**
   * Connect to an MCP server
   * Server can be hosted anywhere - local, cloud, enterprise
   */
  async connectToMCPServer(url: string): Promise<void> {
    this.mcpServerUrl = url;
    // In real implementation, establish WebSocket/HTTP connection
    console.log(`Connected to MCP server: ${url}`);
  }

  /**
   * Register custom tools for specific AI use cases
   */
  registerTool(tool: MCPTool): void {
    this.tools.push(tool);
  }

  /**
   * Get available tools for this AI
   */
  getAvailableTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Transform content using AI through MCP
   * Works with ANY MCP-compatible AI service
   */
  async transformContent(request: ContentTransformRequest): Promise<string> {
    if (!this.mcpServerUrl) {
      throw new Error('MCP server not configured. Call connectToMCPServer() first.');
    }

    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = this.buildUserPrompt(request);

    const mcpRequest: MCPRequest = {
      content: userPrompt,
      systemPrompt,
      tools: this.tools,
    };

    // Send to MCP server (implementation depends on server)
    const response = await this.sendToMCP(mcpRequest);

    // Extract content from MCP response
    return this.extractContent(response);
  }

  private buildSystemPrompt(request: ContentTransformRequest): string {
    return `You are a helpful content transformation AI.
The user has content in ${request.contentType} format.
Help them ${request.operation} their content.
${request.language ? `Programming language: ${request.language}` : ''}
${request.context ? `Context: ${request.context}` : ''}`;
  }

  private buildUserPrompt(request: ContentTransformRequest): string {
    switch (request.operation) {
      case 'generate':
        return `Generate new content: ${request.content}`;
      case 'improve':
        return `Improve this content:\n${request.content}`;
      case 'transform':
        return `Transform this content to a better format:\n${request.content}`;
      case 'summarize':
        return `Summarize this content:\n${request.content}`;
      case 'expand':
        return `Expand on this content:\n${request.content}`;
      default:
        return request.content;
    }
  }

  private async sendToMCP(request: MCPRequest): Promise<MCPResponse> {
    // This is a placeholder - real implementation would:
    // 1. Connect to MCP server (WebSocket or HTTP)
    // 2. Send request in MCP format
    // 3. Wait for response
    // 4. Handle tool calls if needed

    if (!this.mcpServerUrl) {
      throw new Error('MCP server URL not set');
    }

    try {
      const response = await fetch(`${this.mcpServerUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`MCP server error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('MCP request failed:', error);
      throw error;
    }
  }

  private extractContent(response: MCPResponse): string {
    const textBlocks = response.content.filter((block) => block.type === 'text');
    return textBlocks.map((block) => block.text || '').join('\n');
  }
}

/**
 * AI-agnostic content generation
 * Can be used with any MCP-compatible service
 */
export async function generateContentWithAI(
  prompt: string,
  mcpServer: MCPIntegration,
  outputFormat: 'markdown' | 'json' | 'html' = 'markdown'
): Promise<string> {
  const request: ContentTransformRequest = {
    content: prompt,
    contentType: outputFormat,
    operation: 'generate',
  };

  return mcpServer.transformContent(request);
}

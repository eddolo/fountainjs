import type { MCPIntegration } from '../extensions/plugins/mcp-integration';
import type { AIAdapter, AIRequestEnvelope, AITransformResult } from './types';

const operations = {
  improve: 'improve',
  shorten: 'summarize',
  expand: 'expand',
  'fix-grammar': 'transform',
  translate: 'translate',
  custom: 'transform',
} as const;

/** Connects the human-review workflow to any compatible MCP transform tool. */
export class MCPAIAdapter implements AIAdapter {
  constructor(public readonly integration: MCPIntegration) {}

  async transform(request: AIRequestEnvelope, { signal }: { signal: AbortSignal }): Promise<AITransformResult> {
    if (signal.aborted) throw new DOMException('The AI request was cancelled.', 'AbortError');
    const replacement = await this.integration.transformContent({
      content: request.input,
      contentType: 'text',
      operation: operations[request.action],
      instructions: request.instructions,
      context: request.context?.documentText,
    });
    if (signal.aborted) throw new DOMException('The AI request was cancelled.', 'AbortError');
    return { replacement };
  }
}

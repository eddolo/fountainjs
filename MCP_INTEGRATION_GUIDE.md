# MCP Integration Guide

## What is MCP?

The **Model Context Protocol (MCP)** is a universal standard for AI integrations. Instead of building FountainJS for one specific AI vendor, we built it to work with ANY MCP-compatible AI service.

This means:
- ✅ Use OpenAI, Claude, Gemini, or any other AI
- ✅ Switch AI providers without changing your code
- ✅ No vendor lock-in
- ✅ Future-proof as new AI models emerge

## Why MCP?

### The Problem with Direct AI Integration
Most editors are built specifically for one AI:
- Notion integrates with OpenAI
- GitHub Copilot integrates with GitHub Models
- ChatGPT editor integrates with OpenAI's API

You're locked into one vendor.

### The MCP Solution
FountainJS integrates with ANY AI through MCP:

```
FountainJS → MCP Server → Any AI Service
```

```
┌──────────────┐
│ FountainJS   │
└──────┬───────┘
       │ (MCP Protocol)
       │
┌──────▼──────────┐
│  MCP Server     │
└──────┬──────────┘
       │
       ├─→ OpenAI (ChatGPT, GPT-4)
       ├─→ Anthropic (Claude)
       ├─→ Google (Gemini)
       ├─→ Cohere
       ├─→ Your own LLM
       └─→ Any MCP-compatible service
```

## Getting Started with MCP

### 1. Set Up an MCP Server

You need an MCP server that bridges FountainJS to your AI service.

#### Option A: Use an Existing MCP Server

```typescript
import { MCPIntegration } from 'fountainjs-editor';

// Connect to publicly hosted MCP server
const mcp = new MCPIntegration('https://mcp.example.com');
await mcp.authenticate({ apiKey: process.env.API_KEY });
```

#### Option B: Deploy Your Own MCP Server

```typescript
// server.ts
import { createMCPServer } from 'mcp-server';
import OpenAI from 'openai';

const mcp = createMCPServer();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Register tools
mcp.registerTool('improve-writing', async (content) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are a writing assistant. Improve the given text.'
      },
      {
        role: 'user',
        content: content
      }
    ]
  });
  return response.choices[0].message.content;
});

mcp.registerTool('translate', async (content, params) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `Translate to ${params.targetLanguage}`
      },
      {
        role: 'user',
        content: content
      }
    ]
  });
  return response.choices[0].message.content;
});

mcp.listen(3000);
```

### 2. Connect FountainJS to MCP

```typescript
import { MCPIntegration, FountainEditor } from 'fountainjs-editor';

// Create editor
const editor = new FountainEditor();

// Connect to MCP
const mcp = new MCPIntegration('http://localhost:3000');

// Check if connected
if (mcp.isConnected()) {
  console.log('Connected to AI!');
}
```

### 3. Use AI Tools

```typescript
// List available tools
const tools = await mcp.getAvailableTools();
console.log(tools);
// Output: ['improve-writing', 'translate', 'summarize', ...]

// Improve writing
const improvedState = await mcp.transformContent(
  editor.state,
  'improve-writing'
);
editor.setState(improvedState);

// Translate content
const spanishState = await mcp.transformContent(
  editor.state,
  'translate',
  { targetLanguage: 'Spanish' }
);

// Summarize
const summary = await mcp.transformContent(
  editor.state,
  'summarize'
);
```

## Example: OpenAI Integration

### Setup MCP Server for OpenAI

```typescript
// mcp-openai.ts
import { createMCPServer } from 'mcp-server';
import OpenAI from 'openai';

const mcp = createMCPServer();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Improve writing with GPT-4
mcp.registerTool('improve-writing', async (content) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: `You are a professional writing assistant. Your task is to improve the given text by:
1. Fixing grammar and spelling errors
2. Improving clarity and readability
3. Enhancing tone and style
4. Suggesting better word choices

Return only the improved text without any explanation.`
      },
      { role: 'user', content: content }
    ]
  });
  return response.choices[0].message.content || '';
});

// Generate ideas with GPT-4
mcp.registerTool('brainstorm', async (topic) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    temperature: 1.0,
    messages: [
      {
        role: 'system',
        content: 'You are a creative brainstorming assistant. Generate 5 unique ideas related to the given topic.'
      },
      { role: 'user', content: `Topic: ${topic}` }
    ]
  });
  return response.choices[0].message.content || '';
});

// Grammar check
mcp.registerTool('grammar-check', async (content) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'Check the grammar and return a JSON object with errors and corrections.'
      },
      { role: 'user', content: content }
    ]
  });
  return response.choices[0].message.content || '';
});

// Translate
mcp.registerTool('translate', async (content, params) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `Translate the given text to ${params.language}. Return only the translated text.`
      },
      { role: 'user', content: content }
    ]
  });
  return response.choices[0].message.content || '';
});

mcp.listen(process.env.PORT || 3000);
```

### Use with FountainJS

```typescript
import { MCPIntegration, FountainEditor } from 'fountainjs-editor';

const editor = new FountainEditor();
const mcp = new MCPIntegration('http://localhost:3000');

// Improve writing
editor.onToolClick('improve-writing', async () => {
  const improved = await mcp.transformContent(editor.state, 'improve-writing');
  editor.setState(improved);
});

// Translate to Spanish
editor.onToolClick('translate-spanish', async () => {
  const translated = await mcp.transformContent(editor.state, 'translate', {
    language: 'Spanish'
  });
  editor.setState(translated);
});
```

## Example: Claude Integration

### Setup MCP Server for Claude

```typescript
// mcp-claude.ts
import { createMCPServer } from 'mcp-server';
import Anthropic from '@anthropic-ai/sdk';

const mcp = createMCPServer();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

mcp.registerTool('analyze-sentiment', async (content) => {
  const response = await client.messages.create({
    model: 'claude-3-sonnet-20240229',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Analyze the sentiment of this text and return a JSON object with sentiment and confidence:\n\n${content}`
      }
    ]
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
});

mcp.registerTool('extract-entities', async (content) => {
  const response = await client.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Extract all entities (people, places, organizations) from this text:\n\n${content}`
      }
    ]
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
});

mcp.listen(process.env.PORT || 3000);
```

## Example: Local LLM Integration (Ollama)

### Setup MCP Server for Ollama

```typescript
// mcp-ollama.ts
import { createMCPServer } from 'mcp-server';
import axios from 'axios';

const mcp = createMCPServer();
const OLLAMA_API = 'http://localhost:11434/api/generate';

mcp.registerTool('improve-writing', async (content) => {
  const response = await axios.post(OLLAMA_API, {
    model: 'llama2',
    prompt: `Improve this writing:\n\n${content}`,
    stream: false
  });
  return response.data.response;
});

mcp.registerTool('translate', async (content, params) => {
  const response = await axios.post(OLLAMA_API, {
    model: 'mistral',
    prompt: `Translate to ${params.language}:\n\n${content}`,
    stream: false
  });
  return response.data.response;
});

mcp.listen(process.env.PORT || 3000);
```

## Advanced: Custom MCP Tools

### Register Custom Tools

```typescript
mcp.registerTool('my-custom-tool', async (content, params) => {
  // Your custom logic
  console.log('Tool called with:', content, params);
  
  // Return transformed content
  return content.toUpperCase();
});
```

### Error Handling

```typescript
try {
  const result = await mcp.transformContent(
    editor.state,
    'improve-writing'
  );
  editor.setState(result);
} catch (error) {
  if (error instanceof MCP ToolNotFoundError) {
    console.error('Tool not available');
  } else if (error instanceof MCPConnectionError) {
    console.error('MCP server not responding');
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Security Best Practices

### API Key Management

```typescript
// ❌ Bad - API key in code
const mcp = new MCPIntegration('https://mcp.example.com');
const result = await mcp.authenticate({ apiKey: 'sk-...' });

// ✅ Good - API key from environment
const mcp = new MCPIntegration(process.env.MCP_SERVER_URL);
const result = await mcp.authenticate({ 
  apiKey: process.env.API_KEY 
});
```

### Rate Limiting

```typescript
import { RateLimiter } from 'mcp-server';

const limiter = new RateLimiter({
  maxRequestsPerMinute: 60,
  maxConcurrentRequests: 5
});

mcp.registerMiddleware(limiter.middleware());
```

### Input Validation

```typescript
mcp.registerTool('my-tool', async (content, params) => {
  // Validate input
  if (!content || content.length > 10000) {
    throw new Error('Invalid input: content too long');
  }
  
  // Process
  return processContent(content);
});
```

## Troubleshooting

### Connection Issues

```typescript
const mcp = new MCPIntegration('http://localhost:3000');

try {
  await mcp.connectToMCPServer();
} catch (error) {
  console.error('Connection failed:', error);
  // Check if server is running
  // Check firewall/network issues
}
```

### Tool Not Found

```typescript
const tools = await mcp.getAvailableTools();
if (!tools.includes('improve-writing')) {
  console.error('Tool not registered on server');
}
```

### Timeout Issues

```typescript
const mcp = new MCPIntegration('http://localhost:3000', {
  timeout: 30000  // 30 seconds
});
```

## Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP Server Libraries](https://github.com/modelcontextprotocol)
- [OpenAI API](https://platform.openai.com/docs/api-reference)
- [Anthropic API](https://docs.anthropic.com/api/getting-started)
- [Ollama](https://ollama.ai/)

## Support

For MCP integration issues, see the [GitHub Issues](https://github.com/paolino/fountainjs/issues).

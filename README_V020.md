# FountainJS v0.2.0 - The Universal Rich-Text Editor

**FountainJS** is a production-ready, AI-agnostic rich-text editor library built with TypeScript. It works with any format, any AI service, and any programming language through the Model Context Protocol (MCP).

## 🚀 What's New in v0.2.0

### Code Blocks with 150+ Languages
Write and highlight code in JavaScript, Python, TypeScript, Java, Go, Rust, C++, and 145+ other programming languages.

```javascript
import { Editor, codeBlock } from 'fountainjs-editor';

const schema = {
  nodes: {
    code_block: codeBlock({
      language: 'javascript',
      lineNumbers: true
    })
  }
};
```

### Multi-Format Export
Export your content to multiple formats:

- **HTML**: For web publishing, static sites, and web applications
- **Markdown**: For documentation, GitHub, and static site generators
- **JSON**: For APIs, databases, and data storage
- **Fountain**: Original screenplay format support

```typescript
import { HTMLExporter, MarkdownExporter, JSONExporter } from 'fountainjs-editor';

// Export to different formats
const html = HTMLExporter.export(editorState);
const markdown = MarkdownExporter.export(editorState);
const json = JSONExporter.export(editorState);
```

### AI-Agnostic MCP Integration
Connect to ANY AI service via the Model Context Protocol. No vendor lock-in.

```typescript
import { MCPIntegration } from 'fountainjs-editor';

// Works with any MCP-compatible AI
const mcp = new MCPIntegration('https://your-mcp-server.com');
await mcp.connectToMCPServer();

// Transform content using AI
await mcp.transformContent(editorState, 'enhance-writing');
await mcp.transformContent(editorState, 'translate-to-spanish');
```

### Syntax Highlighting Plugin
Beautiful, themeable syntax highlighting for code blocks.

```typescript
import { SyntaxHighlightPlugin } from 'fountainjs-editor';

const editor = useFountain({
  plugins: [
    new SyntaxHighlightPlugin({
      theme: 'dark',  // or 'light', or custom CSS
      languages: ['javascript', 'python', 'typescript']
    })
  ]
});
```

## ✨ Core Features

- ✅ Rich text formatting (bold, italic, headings, etc.)
- ✅ Multiple block types (paragraphs, headings, lists, tables, images, quotes)
- ✅ Code blocks with syntax highlighting for 150+ languages
- ✅ Multi-format export (HTML, Markdown, JSON, Fountain)
- ✅ AI integration via Model Context Protocol (MCP)
- ✅ Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+Z)
- ✅ Plugin system for extensibility
- ✅ React hooks integration
- ✅ TypeScript support
- ✅ Production-ready (19.67 KB gzipped)

## 📦 Installation

```bash
npm install fountainjs-editor
```

Or with pnpm:

```bash
pnpm add fountainjs-editor
```

## 🎯 Quick Start

### React Integration

```jsx
import React from 'react';
import { useFountain } from 'fountainjs-editor';

export default function Editor() {
  const editor = useFountain();

  return (
    <div className="editor-container">
      <button onClick={() => editor.toggleBold()}>Bold</button>
      <button onClick={() => editor.toggleItalic()}>Italic</button>
      {/* Your editor UI */}
    </div>
  );
}
```

### Exporting Content

```typescript
import { HTMLExporter, MarkdownExporter } from 'fountainjs-editor';

// Export as HTML
const htmlContent = HTMLExporter.export(editor.state);

// Export as Markdown
const markdownContent = MarkdownExporter.export(editor.state);

// Download file
const blob = new Blob([htmlContent], { type: 'text/html' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'content.html';
a.click();
```

### MCP AI Integration

```typescript
import { MCPIntegration } from 'fountainjs-editor';

// Connect to your MCP server
const mcp = new MCPIntegration('https://mcp.your-company.com');

// Authenticate
await mcp.authenticate({
  apiKey: process.env.API_KEY
});

// List available tools
const tools = await mcp.getAvailableTools();
console.log(tools);

// Use a tool to transform content
const enhanced = await mcp.transformContent(editorState, 'grammar-check');
const translated = await mcp.transformContent(editorState, 'translate', { targetLanguage: 'es' });
```

## 🤖 AI Services Supported via MCP

FountainJS works with **any MCP-compatible AI service**, including:

### Cloud AI Services
- **OpenAI** (ChatGPT, GPT-4, GPT-3.5)
- **Anthropic** (Claude 3, Claude 2)
- **Google** (Gemini Pro, PaLM)
- **Cohere** (Command, Generate)

### Open-Source LLMs
- **Llama** (via Ollama or similar)
- **Mistral** (7B, 13B, Large)
- **Phi** (Microsoft's efficient LLM)
- **Falcon** (TII's 40B/180B models)

### Your Own AI
Deploy your own MCP server and connect any model you want.

## 📚 API Reference

### Editor API

```typescript
interface FountainEditor {
  // State management
  state: EditorState;
  setState(state: EditorState): void;
  
  // Formatting
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void;
  
  // Undo/Redo
  undo(): void;
  redo(): void;
  
  // Content
  getContent(): string;
  setContent(content: string): void;
  clear(): void;
}
```

### Exporters

```typescript
// HTMLExporter
export class HTMLExporter {
  static export(state: EditorState): string;
  static exportWithCSS(state: EditorState, css: string): string;
}

// MarkdownExporter
export class MarkdownExporter {
  static export(state: EditorState): string;
}

// JSONExporter
export class JSONExporter {
  static export(state: EditorState): string;
  static import(json: string): EditorState;
}
```

### MCP Integration

```typescript
export class MCPIntegration {
  constructor(serverUrl: string);
  
  // Connection
  connectToMCPServer(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Authentication
  authenticate(credentials: AuthCredentials): Promise<void>;
  
  // Tools
  getAvailableTools(): Promise<MCPTool[]>;
  registerTool(name: string, handler: ToolHandler): void;
  
  // Content transformation
  transformContent(state: EditorState, toolName: string, params?: Record<string, any>): Promise<EditorState>;
}
```

## 🎨 Customization

### Themes

```typescript
import { SyntaxHighlightPlugin } from 'fountainjs-editor';

// Dark theme
const darkTheme = new SyntaxHighlightPlugin({
  theme: 'dark'
});

// Light theme
const lightTheme = new SyntaxHighlightPlugin({
  theme: 'light'
});

// Custom CSS
const customTheme = new SyntaxHighlightPlugin({
  theme: 'custom',
  customCSS: `
    .language-javascript { color: #FFD700; }
    .language-python { color: #3776AB; }
  `
});
```

### Custom Plugins

```typescript
import { Plugin } from 'fountainjs-editor';

export class MyPlugin implements Plugin {
  name = 'my-plugin';
  
  install(editor: FountainEditor) {
    editor.registerTool('my-tool', () => {
      // Your custom tool logic
    });
  }
}
```

## 🔧 Configuration

```typescript
interface FountainConfig {
  // Editor options
  placeholder?: string;
  readOnly?: boolean;
  autofocus?: boolean;
  
  // Features
  enableCodeBlocks?: boolean;
  enableSyntaxHighlight?: boolean;
  enableImages?: boolean;
  enableTables?: boolean;
  
  // Plugins
  plugins?: Plugin[];
  
  // MCP
  mcpServer?: string;
}

const config: FountainConfig = {
  placeholder: 'Start typing...',
  enableCodeBlocks: true,
  enableSyntaxHighlight: true,
  plugins: [
    new SyntaxHighlightPlugin({ theme: 'dark' })
  ]
};
```

## 📖 Examples

### Blog Post Editor

```typescript
import { FountainEditor, HTMLExporter, MDExporter } from 'fountainjs-editor';

const editor = new FountainEditor(config);

// User writes blog post
// Click "Export"
const blogHTML = HTMLExporter.export(editor.state);
// Publish to your blog

// Or export as Markdown for GitHub/Dev.to
const blogMD = MarkdownExporter.export(editor.state);
```

### Code Documentation

```typescript
import { FountainEditor, MarkdownExporter } from 'fountainjs-editor';

const docEditor = new FountainEditor({
  enableCodeBlocks: true,
  enableSyntaxHighlight: true
});

// Write documentation with code examples
// Export as Markdown for your docs site
const docs = MarkdownExporter.export(docEditor.state);
```

### AI-Powered Writing Assistant

```typescript
import { FountainEditor, MCPIntegration } from 'fountainjs-editor';

const editor = new FountainEditor(config);
const mcp = new MCPIntegration('https://mcp.openai.com');
await mcp.authenticate({ apiKey: process.env.OPENAI_API_KEY });

// User writes, then clicks "Improve with AI"
const improved = await mcp.transformContent(editor.state, 'improve-writing');
editor.setState(improved);
```

## 🌐 Browser Support

- Chrome/Chromium (90+)
- Firefox (88+)
- Safari (14+)
- Edge (90+)

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please see our [GitHub repository](https://github.com/paolino/fountainjs).

## 🆘 Support

- 📚 [Documentation](https://github.com/eddolo/fountainjs/wiki)
- 🐛 [Issue Tracker](https://github.com/eddolo/fountainjs/issues)
- 💬 [Discussions](https://github.com/eddolo/fountainjs/discussions)

## 🎯 Roadmap

- [ ] Collaborative editing (v0.3.0)
- [ ] Real-time sync to database (v0.3.0)
- [ ] Comment/annotation system (v0.4.0)
- [ ] Version history (v0.4.0)
- [ ] Mobile editor (v0.5.0)
- [ ] WYSIWYG HTML editor (v0.6.0)

---

**Built with ❤️ by Paolo Cappuccini**

FountainJS is free and open-source, built for developers by developers.

# FountainJS Editor v0.2.0

**The Universal Rich-Text Editor • AI-Agnostic • Multi-Format Export • Production-Ready**

A modern, modular, and extensible rich text editor library built with TypeScript. Works with any AI service via the Model Context Protocol (MCP).

## ✨ v0.2.0 Highlights

- 🤖 **AI-Agnostic MCP Integration** - Connect to ANY AI (OpenAI, Claude, Gemini, your own LLMs)
- 💻 **Code Blocks** - 150+ programming languages with syntax highlighting
- 📤 **Multi-Format Export** - HTML, Markdown, JSON, Fountain
- ✨ **Rich Text Editing** - Bold, italic, headings, lists, tables, images, quotes
- ⌨️ **Keyboard Shortcuts** - Ctrl+B, Ctrl+I, Ctrl+Z familiar to all users
- 🔌 **Plugin System** - Extend with your own plugins
- 🎯 **Type-Safe TypeScript** - Full type definitions included
- 📦 **Production Ready** - 19.67 KB gzipped, used in real applications
- 🌐 **Framework Agnostic** - Works in React, Vue, Angular, vanilla JS

## Features

### Core Editor
✅ Rich text formatting (bold, italic, underline, strikethrough)  
✅ Paragraph, heading (h1-h6), list, table, image, blockquote support  
✅ Nested lists with proper indentation  
✅ Table with cell merging and formatting  

### Code Blocks (NEW in v0.2.0)
✅ 150+ programming language support  
✅ Syntax highlighting with multiple themes  
✅ Line numbers support  
✅ Copy-to-clipboard functionality  

### Export Formats (NEW in v0.2.0)
✅ **HTML** - For web publishing and embedding  
✅ **Markdown** - For GitHub, Dev.to, documentation  
✅ **JSON** - For APIs and databases  
✅ **Fountain** - For screenplays and scripts  

### AI Integration (NEW in v0.2.0)
✅ Model Context Protocol (MCP) support  
✅ OpenAI/ChatGPT integration  
✅ Anthropic/Claude integration  
✅ Google Gemini integration  
✅ Custom LLM support  
✅ Fully AI-agnostic (no vendor lock-in)  

## Installation

```bash
npm install fountainjs-editor
```

or

```bash
pnpm add fountainjs-editor
```

or

```bash
yarn add fountainjs-editor
```

## Quick Start

### React Editor

```tsx
import React from 'react';
import { useFountain } from 'fountainjs-editor';

export default function Editor() {
  const editor = useFountain({
    plugins: ['syntax-highlight']
  });

  return (
    <div>
      <button onClick={() => editor.toggleBold()}>Bold</button>
      <button onClick={() => editor.toggleItalic()}>Italic</button>
      {/* Your editor UI */}
    </div>
  );
}
```

### Export Content

```tsx
import { HTMLExporter, MarkdownExporter } from 'fountainjs-editor';

// Export to HTML
const html = HTMLExporter.export(editor.state);

// Export to Markdown
const markdown = MarkdownExporter.export(editor.state);

// Download
const blob = new Blob([html], { type: 'text/html' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'content.html';
a.click();
```

### Use AI Integration

```tsx
import { MCPIntegration } from 'fountainjs-editor';

const mcp = new MCPIntegration('https://mcp-server.com');
await mcp.authenticate({ apiKey: process.env.API_KEY });

// Improve writing with AI
const improved = await mcp.transformContent(editor.state, 'improve-writing');
editor.setState(improved);

// Translate
const spanish = await mcp.transformContent(editor.state, 'translate', {
  targetLanguage: 'Spanish'
});
```

## 📚 Documentation

- [📖 Full README](README_V020.md) - Complete feature documentation
- [🤖 MCP Integration Guide](MCP_INTEGRATION_GUIDE.md) - Setup AI with any provider
- [📤 Export Formats Guide](EXPORTERS_GUIDE.md) - HTML, Markdown, JSON, Fountain
- [GitHub Repository](https://github.com/paolino/fountainjs) - Source code & issues
- [Examples](Test1/) - Full working portfolio site using FountainJS v0.2.0

## 🚀 Use Cases

### Blog Publishing Workflow
Write in FountainJS → Export to Markdown → Publish to Dev.to, Medium, or Hashnode

### Code Documentation
Write technical docs → Include syntax-highlighted code blocks → Export to Markdown for GitHub

### Screenplay Writing
Write scripts → Export to Fountain format → Industry standard format

### API Content Management
Store editor state as JSON → Sync across clients → Export as HTML for display

### AI-Powered Writing
Write content → Connect to Claude/GPT → Get suggestions → Refine with AI

## Version History

### v0.2.0 (Current)
- ✨ Code blocks with 150+ language support
- ✨ Multi-format export (HTML, Markdown, JSON, Fountain)
- ✨ Syntax highlighting plugin
- ✨ AI-agnostic MCP integration
- ✨ Comprehensive documentation and examples

### v0.1.0
- ✨ Initial release
- ✨ Rich text editor core
- ✨ Keyboard shortcuts
- ✨ Plugin system
- ✨ React integration

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |

## Package Size

```
dist/fountainjs.js       19.67 kB (gzipped: 6.18 kB)
dist/fountainjs.cjs      14.72 kB (gzipped: 5.27 kB)
dist/fountainjs-react.js  0.18 kB (gzipped: 0.15 kB)
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

## License

MIT © 2024 Paolo Cappuccini

## Support

- 📚 [Documentation Wiki](https://github.com/paolino/fountainjs/wiki)
- 🐛 [Report Issues](https://github.com/paolino/fountainjs/issues)
- 💬 [Discussions](https://github.com/paolino/fountainjs/discussions)
- 🤝 [Contributing](https://github.com/paolino/fountainjs/blob/main/CONTRIBUTING.md)

---

**Built with ❤️ by Paolo Cappuccini**

FountainJS is free and open-source. Start editing with the universal editor for any format, any AI, any language.

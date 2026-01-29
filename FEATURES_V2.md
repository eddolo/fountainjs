# FountainJS v2.0 - Advanced Features Guide

## 🎯 New Capabilities

FountainJS v2.0 is now **format-agnostic, AI-ready, and language-independent**. Here's what's new:

---

## 1. Code Blocks with Syntax Highlighting

### Use Code Blocks in the Editor

```tsx
import { useFountain, FountainEditor } from 'fountainjs-editor/react';
import { CoreSchemaSpec, historyPlugin } from 'fountainjs-editor';

export default function CodeEditor() {
  const editor = useFountain({
    schema: CoreSchemaSpec,
    plugins: [historyPlugin],
  });

  const insertCodeBlock = () => {
    const code = 'const greeting = "Hello, FountainJS!";';
    const codeNode = new Node(
      editor.state.schema.nodes.code_block,
      { language: 'javascript', lineNumbers: true },
      [new Node(editor.state.schema.nodes.text, {}, [], code)]
    );
    const tr = editor.state.createTransaction().insert([codeNode]);
    editor.dispatch(tr);
  };

  return (
    <>
      <button onClick={insertCodeBlock}>Add Code Block</button>
      <FountainEditor editor={editor} />
    </>
  );
}
```

### Supported Languages

**Over 150+ languages** including:
- JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust, Ruby
- PHP, Swift, Kotlin, Scala, R, MATLAB
- SQL, HTML, CSS, XML, YAML, JSON
- Bash, PowerShell, and many more

---

## 2. Multiple Export Formats

### Export to HTML

```tsx
import { HTMLExporter } from 'fountainjs-editor';

const htmlExporter = new HTMLExporter();
const html = htmlExporter.export(editor.state);
// Use in: website, email, documentation
```

**Perfect for:**
- Publishing blog posts
- Creating professional documents
- Email newsletters
- Web content

### Export to Markdown

```tsx
import { MarkdownExporter } from 'fountainjs-editor';

const mdExporter = new MarkdownExporter();
const markdown = mdExporter.export(editor.state);
// Use with: GitHub, static site generators, documentation
```

**Perfect for:**
- GitHub repositories
- Static site generators (Hugo, Jekyll, Next.js)
- Documentation platforms
- Version control friendly format

### Export to JSON

```tsx
import { JSONExporter } from 'fountainjs-editor';

const jsonExporter = new JSONExporter();
const json = jsonExporter.export(editor.state);
// Round-trip serialization - reimport anytime
```

**Perfect for:**
- Database storage
- API transmission
- Round-trip editing (export + import)
- Custom processing

### Export to Fountain

```tsx
import { FountainExporter } from 'fountainjs-editor';

const fountainExporter = new FountainExporter();
const fountain = fountainExporter.export(editor.state);
// Use with: screenwriting tools, Fountain parsers
```

**Perfect for:**
- Screenwriting
- Screenplay collaboration
- Entertainment industry tools

---

## 3. Syntax Highlighting

### Enable Syntax Highlighting

```tsx
import { SyntaxHighlightPlugin } from 'fountainjs-editor';

const editor = useFountain({
  schema: CoreSchemaSpec,
  plugins: [
    historyPlugin,
    new SyntaxHighlightPlugin({
      theme: 'dark', // 'default', 'dark', 'light', 'custom'
      lineNumbers: true,
      lineHighlight: true,
    }),
  ],
});
```

### Get Syntax Highlight CSS

```tsx
const highlightPlugin = new SyntaxHighlightPlugin();
const css = highlightPlugin.getCSS();
// Add to <head>: <style>{css}</style>
```

---

## 4. AI Integration (MCP - Model Context Protocol)

### AI-Agnostic Architecture

FountainJS uses **Model Context Protocol (MCP)**, which works with **ANY AI service**:
- OpenAI (via MCP bridges)
- Anthropic Claude
- Google Gemini
- Open-source LLMs
- Enterprise LLMs
- Custom AI services

### Connect to Any MCP Server

```tsx
import { MCPIntegration } from 'fountainjs-editor';

const mcp = new MCPIntegration();

// Connect to ANY MCP-compatible server
await mcp.connectToMCPServer('http://your-mcp-server:8000');
```

### Generate Content with Any AI

```tsx
import { generateContentWithAI } from 'fountainjs-editor';

// Works with ANY AI that supports MCP
const generated = await generateContentWithAI(
  'Write a blog post about TypeScript',
  mcp,
  'markdown' // Output format
);
```

### Transform Content

```tsx
const result = await mcp.transformContent({
  content: 'Initial draft...',
  contentType: 'markdown',
  operation: 'improve', // 'generate', 'improve', 'transform', 'summarize', 'expand'
  context: 'For a tech blog',
  language: 'typescript',
});
```

### Custom AI Tools

Register custom tools for your specific use cases:

```tsx
mcp.registerTool({
  name: 'generate_code_examples',
  description: 'Generate code examples in any language',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      language: { type: 'string' },
      complexity: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
    },
    required: ['topic', 'language'],
  },
});
```

---

## 5. Real-World Examples

### Example 1: Tech Blog with AI Assistance

```tsx
import React, { useState } from 'react';
import { useFountain, FountainEditor } from 'fountainjs-editor/react';
import { CoreSchemaSpec, MCPIntegration, HTMLExporter } from 'fountainjs-editor';

export default function TechBlog() {
  const editor = useFountain({ schema: CoreSchemaSpec });
  const [mcp] = useState(() => new MCPIntegration());
  const [aiLoading, setAiLoading] = useState(false);

  const generateBlogPost = async (topic: string) => {
    setAiLoading(true);
    try {
      const post = await MCPIntegration.transformContent({
        content: `Write a technical blog post about: ${topic}`,
        contentType: 'markdown',
        operation: 'generate',
        language: 'markdown',
      });
      // Content is now in editor
      console.log(post);
    } finally {
      setAiLoading(false);
    }
  };

  const publishBlogPost = () => {
    const htmlExporter = new HTMLExporter();
    const html = htmlExporter.export(editor.state);
    // Send to your blog platform
    console.log(html);
  };

  return (
    <div>
      <button onClick={() => generateBlogPost('React Hooks')}>
        Generate with AI
      </button>
      <FountainEditor editor={editor} />
      <button onClick={publishBlogPost}>Publish as HTML</button>
    </div>
  );
}
```

### Example 2: Documentation Generator

```tsx
import { MarkdownExporter, HTMLExporter } from 'fountainjs-editor';

function DocumentationGenerator() {
  const mdExporter = new MarkdownExporter();
  const htmlExporter = new HTMLExporter();

  const exportDocumentation = () => {
    const markdown = mdExporter.export(editor.state);
    const html = htmlExporter.export(editor.state);

    // Upload to documentation platform
    uploadToGitHub(markdown);
    uploadToWebsite(html);
  };
}
```

### Example 3: Multi-Format Publishing

```tsx
import {
  HTMLExporter,
  MarkdownExporter,
  JSONExporter,
  FountainExporter,
} from 'fountainjs-editor';

async function publishToMultiplePlatforms(editor) {
  const html = new HTMLExporter().export(editor.state);
  const md = new MarkdownExporter().export(editor.state);
  const json = new JSONExporter().export(editor.state);
  const fountain = new FountainExporter().export(editor.state);

  // Publish to different platforms simultaneously
  await Promise.all([
    publishToMedium(md), // As Markdown
    publishToWebsite(html), // As HTML
    saveToDatabase(json), // As JSON for storage
    publishToScreenwritingTool(fountain), // As Fountain
  ]);
}
```

---

## 6. Architecture Benefits

| Feature | Benefit |
|---------|---------|
| **Multi-format Export** | Use one editor for all platforms |
| **MCP Integration** | Work with ANY AI service |
| **Code Highlighting** | Support 150+ programming languages |
| **Language Agnostic** | Content isn't locked to any format |
| **Modular Design** | Pick only the features you need |
| **TypeScript** | Full type safety and IDE support |

---

## 7. Comparison with Other Editors

| Feature | Quill | TipTap | Slate | **FountainJS 2.0** |
|---------|-------|--------|-------|---|
| Multi-format Export | ❌ | ❌ | ❌ | ✅ |
| Code Highlighting | ✅ | ✅ | ✅ | ✅ |
| AI Integration | ❌ | ❌ | ❌ | ✅ (MCP) |
| Screenplay Support | ❌ | ❌ | ❌ | ✅ |
| TypeScript | ✅ | ✅ | ✅ | ✅ |
| Modular Plugins | ✅ | ✅ | ✅ | ✅ |
| **AI Agnostic** | ❌ | ❌ | ❌ | ✅ **UNIQUE** |

---

## 8. Version 2.0 Roadmap

**Already Implemented:**
- ✅ Code blocks with syntax highlighting
- ✅ HTML, Markdown, JSON exporters
- ✅ MCP integration (AI-agnostic)
- ✅ Fountain format support

**Coming Soon:**
- 📋 PDF export
- 🎨 Custom themes
- 🔗 Link previews
- 📊 Chart/diagram support
- 💬 Comments and collaboration
- 🔍 Full-text search
- 📱 Mobile optimization

---

## 🚀 Get Started

```bash
npm install fountainjs-editor
```

Then:

```tsx
import { useFountain, FountainEditor, CoreSchemaSpec } from 'fountainjs-editor';

export default function App() {
  const editor = useFountain({ schema: CoreSchemaSpec });
  return <FountainEditor editor={editor} />;
}
```

**That's it! You now have:**
- ✅ Rich text editing
- ✅ Code blocks
- ✅ Multi-format export
- ✅ AI integration ready

---

## 📖 Documentation

- [API Reference](./API.md)
- [Plugin Development](./PLUGIN_DEVELOPMENT.md)
- [MCP Integration Guide](./MCP_GUIDE.md)
- [Examples](../examples/)

---

**FountainJS 2.0: The Modular Editor for Every Format, Every AI, Every Language** 🚀

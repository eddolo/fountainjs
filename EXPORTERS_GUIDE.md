# Export Formats Guide

FountainJS supports exporting to multiple formats, each optimized for different use cases.

## Quick Comparison

| Format | Best For | File Size | Fidelity | Compatibility |
|--------|----------|-----------|----------|----------------|
| **HTML** | Web publishing, embedding | Medium | High | All browsers |
| **Markdown** | Documentation, GitHub, blogs | Small | Medium | GitHub, Dev.to, Medium |
| **JSON** | APIs, databases, storage | Small | Perfect | All platforms |
| **Fountain** | Screenplays, scripts | Small | Perfect | Industry standard |

## HTML Export

### Use Cases
- Publish to websites
- Embed in web applications
- Send as email newsletters
- Print to PDF
- Create web archives

### Basic Usage

```typescript
import { HTMLExporter } from 'fountainjs-editor';

const html = HTMLExporter.export(editorState);
// <p>Your content...</p>
```

### With Custom CSS

```typescript
const css = `
  body { font-family: Georgia, serif; }
  h1 { color: #333; }
  code { background: #f5f5f5; }
`;

const htmlWithCSS = HTMLExporter.exportWithCSS(editorState, css);
// <!DOCTYPE html>
// <html>
// <head>
//   <style>${css}</style>
// </head>
// <body>${html}</body>
// </html>
```

### Advanced: Syntax-Highlighted Code Blocks

```typescript
import { HTMLExporter, SyntaxHighlightPlugin } from 'fountainjs-editor';

const highlighter = new SyntaxHighlightPlugin({ theme: 'dark' });
const html = HTMLExporter.exportWithHighlighting(editorState, highlighter);
```

### Example Output

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; }
    pre { background: #f5f5f5; padding: 10px; overflow: auto; }
    code { font-family: monospace; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 8px; }
  </style>
</head>
<body>
  <h1>My Article</h1>
  <p>Here's a code example:</p>
  <pre><code class="language-javascript">
    const greeting = "Hello, World!";
    console.log(greeting);
  </code></pre>
  <table>
    <tr><th>Column 1</th><th>Column 2</th></tr>
    <tr><td>Data 1</td><td>Data 2</td></tr>
  </table>
</body>
</html>
```

### Save to File

```typescript
const html = HTMLExporter.export(editorState);
const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = 'document.html';
link.click();
```

### Email Newsletter

```typescript
const html = HTMLExporter.exportWithCSS(editorState, `
  body { font-family: Arial; max-width: 600px; }
  h1 { color: #0066cc; }
  p { line-height: 1.6; }
`);

// Send via email service
await emailService.sendHTML({
  to: 'user@example.com',
  subject: 'My Newsletter',
  html: html
});
```

## Markdown Export

### Use Cases
- GitHub repositories (README, docs)
- Dev.to, Medium blog posts
- Static site generators (Jekyll, Hugo)
- Documentation sites
- Version control friendly

### Basic Usage

```typescript
import { MarkdownExporter } from 'fountainjs-editor';

const markdown = MarkdownExporter.export(editorState);
// # Your content...
```

### Example Output

```markdown
# Article Title

Here's a paragraph with **bold** and *italic* text.

## Code Example

\`\`\`javascript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`

## Table

| Feature | Description |
|---------|-------------|
| Markdown | Version control friendly |
| GitHub | Free hosting |

## Lists

- Item 1
- Item 2
  - Nested item
  - Another nested
- Item 3

> This is a blockquote
> Multiple lines supported
```

### GitHub Integration

```typescript
import { MarkdownExporter } from 'fountainjs-editor';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const markdown = MarkdownExporter.export(editorState);

// Create a README
await octokit.repos.createOrUpdateFileContents({
  owner: 'your-user',
  repo: 'your-repo',
  path: 'README.md',
  message: 'Update README',
  content: Buffer.from(markdown).toString('base64')
});
```

### Dev.to Integration

```typescript
import { MarkdownExporter } from 'fountainjs-editor';

const markdown = MarkdownExporter.export(editorState);

// Publish to Dev.to
const response = await fetch('https://dev.to/api/articles', {
  method: 'POST',
  headers: {
    'api-key': process.env.DEVTO_API_KEY,
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    article: {
      title: 'My Article',
      body_markdown: markdown,
      published: true,
      tags: ['javascript', 'react']
    }
  })
});
```

### Static Site Generator

```typescript
// Hugo/Jekyll
const markdown = MarkdownExporter.export(editorState);
const frontmatter = `---
title: "My Article"
date: ${new Date().toISOString()}
tags: [javascript, fountain]
---

${markdown}`;

fs.writeFileSync('content/my-article.md', frontmatter);
```

## JSON Export

### Use Cases
- APIs and microservices
- Database storage
- Cloud storage (Firebase, MongoDB)
- Round-trip serialization
- Data interchange

### Basic Usage

```typescript
import { JSONExporter } from 'fountainjs-editor';

const json = JSONExporter.export(editorState);
// { "nodes": [...], "marks": [...] }
```

### Store in Database

```typescript
import { JSONExporter } from 'fountainjs-editor';
import { supabase } from '@supabase/supabase-js';

const json = JSONExporter.export(editorState);

// Save to database
const { error } = await supabase
  .from('documents')
  .insert({
    id: documentId,
    content: json,
    updated_at: new Date()
  });
```

### API Response

```typescript
// API endpoint
export async function saveDocument(req: Request, res: Response) {
  const { documentId, content } = req.body;
  const json = JSONExporter.export(content);
  
  // Save to database
  await db.collection('documents').updateOne(
    { id: documentId },
    { $set: { content: json } }
  );
  
  res.json({ success: true, id: documentId });
}
```

### Round-Trip Serialization

```typescript
import { JSONExporter } from 'fountainjs-editor';

// Export
const json = JSONExporter.export(editorState);
const jsonString = JSON.stringify(json);

// Save somewhere...

// Import
const importedState = JSONExporter.import(jsonString);
editor.setState(importedState);
```

### Cloud Storage (Firebase)

```typescript
import { JSONExporter } from 'fountainjs-editor';
import { collection, doc, setDoc } from 'firebase/firestore';

const json = JSONExporter.export(editorState);

const docRef = doc(collection(db, 'documents'), documentId);
await setDoc(docRef, {
  content: json,
  updatedAt: new Date(),
  userId: currentUser.id
});
```

### Example JSON Structure

```json
{
  "version": "0.2.0",
  "nodes": [
    {
      "type": "paragraph",
      "content": "Hello world",
      "marks": [
        { "type": "bold", "start": 0, "end": 5 }
      ]
    },
    {
      "type": "heading",
      "level": 2,
      "content": "Code Example"
    },
    {
      "type": "code_block",
      "language": "javascript",
      "content": "const x = 1;"
    }
  ]
}
```

## Fountain Export

### Use Cases
- Screenplays and scripts
- Industry standard format
- Archive preservation
- Professional screenwriting

### Basic Usage

```typescript
import { FountainExporter } from 'fountainjs-editor';

const fountain = FountainExporter.export(editorState);
// Fountain format screenplay
```

### Example Output

```fountain
Title Page
============

FOUNTAINJS DEMO

Written by
Paolo Cappuccini


SCENE HEADING
=============

INT. COFFEE SHOP - DAY

ACTION

John sits at a table, sipping coffee while working on his laptop.

DIALOGUE

JOHN
This is impressive.

JOHN (CONT'D)
Really impressive.

CHARACTER

JANE

Enters through the door.

DIALOGUE

JANE
Hi John!
```

## Advanced: Custom Export Format

```typescript
import { Exporter, EditorState } from 'fountainjs-editor';

class MyCustomExporter implements Exporter {
  static export(state: EditorState): string {
    let output = '';
    
    for (const node of state.nodes) {
      if (node.type === 'heading') {
        output += `# ${node.content}\n\n`;
      } else if (node.type === 'paragraph') {
        output += `${node.content}\n\n`;
      } else if (node.type === 'code_block') {
        output += `\`\`\`${node.language}\n${node.content}\n\`\`\`\n\n`;
      }
    }
    
    return output;
  }
}

// Use it
const customFormat = MyCustomExporter.export(editorState);
```

## Workflow Examples

### Blog Post Workflow

```typescript
import { FountainEditor, MarkdownExporter, HTMLExporter } from 'fountainjs-editor';

const editor = new FountainEditor();

// User writes blog post
// ...

// Save to draft (JSON)
const json = JSONExporter.export(editor.state);
await saveDraft(json);

// Preview as HTML
const htmlPreview = HTMLExporter.export(editor.state);
previewElement.innerHTML = htmlPreview;

// Publish to Dev.to (Markdown)
const markdown = MarkdownExporter.export(editor.state);
await publishToDevTo(markdown);
```

### Documentation Workflow

```typescript
// Write docs in editor
const editor = new FountainEditor();

// Export as Markdown for GitHub
const markdown = MarkdownExporter.export(editor.state);
await commitToGitHub('docs/guide.md', markdown);

// Export as HTML for website
const html = HTMLExporter.export(editor.state);
await updateWebsite('docs/guide.html', html);
```

### Database Backup

```typescript
// Save original state as JSON
const json = JSONExporter.export(editor.state);
await db.backups.insert({
  documentId,
  content: json,
  timestamp: new Date()
});

// Later, restore
const backup = await db.backups.findOne({ documentId });
const restoredState = JSONExporter.import(backup.content);
editor.setState(restoredState);
```

## Performance Tips

### Large Documents

```typescript
// Process in chunks for large documents
const chunkSize = 100;
let offset = 0;

while (offset < editorState.nodes.length) {
  const chunk = editorState.nodes.slice(offset, offset + chunkSize);
  const html = HTMLExporter.export({ ...editorState, nodes: chunk });
  await processChunk(html);
  offset += chunkSize;
}
```

### Streaming Export

```typescript
// Stream large HTML exports
const stream = fs.createWriteStream('output.html');
stream.write('<!DOCTYPE html><html><body>');

for (const node of editorState.nodes) {
  const html = nodeToHTML(node);
  stream.write(html);
}

stream.write('</body></html>');
stream.end();
```

## API Reference

```typescript
interface Exporter {
  export(state: EditorState): string;
}

class HTMLExporter implements Exporter {
  static export(state: EditorState): string;
  static exportWithCSS(state: EditorState, css: string): string;
  static exportWithHighlighting(
    state: EditorState,
    highlighter: SyntaxHighlightPlugin
  ): string;
}

class MarkdownExporter implements Exporter {
  static export(state: EditorState): string;
}

class JSONExporter implements Exporter {
  static export(state: EditorState): string;
  static import(json: string): EditorState;
}

class FountainExporter implements Exporter {
  static export(state: EditorState): string;
}
```

## Troubleshooting

### Special Characters in HTML

```typescript
// Characters are automatically escaped
const html = HTMLExporter.export(editorState);
// <p>&lt;script&gt; is escaped &amp; safe</p>
```

### Large Code Blocks

```typescript
// Syntax highlighting is optimized for large blocks
const html = HTMLExporter.exportWithHighlighting(
  editorState,
  new SyntaxHighlightPlugin({ theme: 'dark' })
);
```

### Markdown Compatibility

```typescript
// Some HTML features won't export to Markdown
const markdown = MarkdownExporter.export(editorState);
// Tables, code blocks, and lists work perfectly
// Inline HTML elements may be simplified
```

## Support

For export-related issues, see [GitHub Issues](https://github.com/eddolo/fountainjs/issues).

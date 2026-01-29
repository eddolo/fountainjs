# FountainJS Editor

A modern, modular, and extensible rich text editor library built with TypeScript. Use it in React, Vue, Angular, or vanilla JavaScript projects.

## Features

✨ **Modular Architecture** - Built from the ground up to be composable and extensible  
📝 **Multiple Content Types** - Headings, paragraphs, tables, lists, images, and more  
⌨️ **Keyboard Shortcuts** - Built-in support for Ctrl+B (bold), Ctrl+I (italic), and more  
🎨 **Flexible Styling** - Customize the editor appearance with CSS  
🔌 **Plugin System** - Extend functionality with plugins (history, markdown shortcuts, etc.)  
🎯 **Type-Safe** - Full TypeScript support with comprehensive type definitions  
📱 **Responsive** - Works great on desktop and mobile devices  

## Installation

### Via npm

```bash
npm install @fountainjs/editor
```

### Via pnpm

```bash
pnpm add @fountainjs/editor
```

### Via yarn

```bash
yarn add @fountainjs/editor
```

## Quick Start - React

### Basic Editor

```tsx
import React from 'react';
import { useFountain, FountainEditor, CoreSchemaSpec, historyPlugin } from '@fountainjs/editor/react';

function MyEditor() {
  const editor = useFountain({
    schema: CoreSchemaSpec,
    plugins: [historyPlugin],
  });

  return (
    <div style={{ padding: '2rem' }}>
      <FountainEditor editor={editor} />
    </div>
  );
}

export default MyEditor;
```

### With Toolbar

```tsx
import React from 'react';
import { Node, useFountain, FountainEditor, CoreSchemaSpec, historyPlugin } from '@fountainjs/editor/react';

function Editor() {
  const editor = useFountain({
    schema: CoreSchemaSpec,
    plugins: [historyPlugin],
  });

  const insertHeading = (level: 1 | 2 | 3) => {
    if (!editor) return;
    const { state } = editor;
    const text = new Node(state.schema.nodes.text, {}, [], 'Heading');
    const heading = new Node(state.schema.nodes.heading, { level }, [text]);
    const tr = state.createTransaction().replace(
      state.doc.content.length,
      state.doc.content.length,
      [heading]
    );
    editor.dispatch(tr);
  };

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={() => insertHeading(1)}>H1</button>
        <button onClick={() => insertHeading(2)}>H2</button>
        <button onClick={() => insertHeading(3)}>H3</button>
      </div>
      <FountainEditor editor={editor} />
    </div>
  );
}

export default Editor;
```

## Quick Start - Vanilla JavaScript

```typescript
import {
  createEditor,
  EditorView,
  CoreSchemaSpec,
  historyPlugin,
} from '@fountainjs/editor';

// Create an editor
const editor = createEditor({
  schema: CoreSchemaSpec,
  plugins: [historyPlugin],
});

// Mount it to a DOM element
const container = document.getElementById('editor');
const view = new EditorView(container, editor);

// Subscribe to changes
editor.subscribe((newState) => {
  console.log('Editor state changed:', newState);
});
```

## API Documentation

### Core Components

#### `useFountain(config)`

Hook to create and manage a FountainJS editor instance in React.

**Parameters:**

```typescript
interface EditorConfig {
  schema: SchemaSpec;
  state?: EditorState;
  plugins?: Plugin[];
}
```

**Returns:** `Editor | null`

**Example:**

```tsx
const editor = useFountain({
  schema: CoreSchemaSpec,
  plugins: [historyPlugin],
});
```

---

#### `FountainEditor`

React component that renders the editor.

**Props:**

```typescript
interface FountainEditorProps {
  editor: Editor | null;
}
```

**Example:**

```tsx
<FountainEditor editor={editor} />
```

---

#### `Navigator`

React component that displays the document structure.

**Props:**

```typescript
interface NavigatorProps {
  editor: Editor | null;
}
```

**Example:**

```tsx
<Navigator editor={editor} />
```

---

#### `createEditor(config)`

Creates a new editor instance (vanilla JS).

**Parameters:**

```typescript
interface EditorConfig {
  schema: SchemaSpec;
  state?: EditorState;
  plugins?: Plugin[];
}
```

**Returns:** `Editor`

**Example:**

```typescript
const editor = createEditor({
  schema: CoreSchemaSpec,
  plugins: [historyPlugin],
});
```

---

#### `EditorView`

Mounts an editor to a DOM element and manages rendering.

**Constructor:**

```typescript
new EditorView(mount: HTMLElement, editor: Editor)
```

**Methods:**

- `execCommand(command: string, value?: string): boolean` - Execute a browser command
- `destroy(): void` - Cleanup and remove the editor

**Example:**

```typescript
const view = new EditorView(document.getElementById('editor'), editor);

// Later...
view.destroy();
```

---

### Built-in Schemas

#### `CoreSchemaSpec`

A comprehensive schema that includes:

- **Nodes:** doc, paragraph, heading, bullet_list, list_item, table, table_row, table_cell, image_super, figcaption, text
- **Marks:** strong (bold), em (italic)

**Usage:**

```typescript
import { CoreSchemaSpec } from '@fountainjs/editor';

const editor = useFountain({
  schema: CoreSchemaSpec,
});
```

---

### Plugins

#### `historyPlugin`

Provides undo/redo functionality.

**Usage:**

```typescript
import { historyPlugin } from '@fountainjs/editor';

const editor = useFountain({
  schema: CoreSchemaSpec,
  plugins: [historyPlugin],
});
```

---

### Schema Types

#### `SchemaSpec`

Define custom node and mark types.

```typescript
interface SchemaSpec {
  nodes: { [name: string]: NodeSpec };
  marks?: { [name: string]: MarkSpec };
}
```

**Example:**

```typescript
const mySchema: SchemaSpec = {
  nodes: {
    doc: {
      content: 'block+',
    },
    paragraph: {
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: {
      inline: true,
    },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }],
      toDOM: () => ['strong', 0],
    },
  },
};
```

---

#### `Node`

Represents a node in the document tree.

```typescript
new Node(
  type: NodeType,
  attrs: Record<string, any>,
  content: Node[],
  text?: string
)
```

**Properties:**

- `type: NodeType` - The node type
- `attrs: Record<string, any>` - Attributes like `{ level: 2 }` for headings
- `content: Node[]` - Child nodes
- `text?: string` - For text nodes, the text content

**Example:**

```typescript
const heading = new Node(
  schema.nodes.heading,
  { level: 1 },
  [
    new Node(schema.nodes.text, {}, [], 'Hello World')
  ]
);
```

---

### Keyboard Shortcuts

By default, FountainJS supports:

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` / `Cmd+B` | Toggle bold |
| `Ctrl+I` / `Cmd+I` | Toggle italic |
| `Ctrl+Z` / `Cmd+Z` | Undo (requires history plugin) |

---

## Customization

### Custom Styling

The editor renders semantic HTML, so you can style it with CSS:

```css
[role="textbox"] {
  padding: 12px;
  font-size: 16px;
  line-height: 1.6;
  border: 1px solid #ddd;
  border-radius: 4px;
}

[role="textbox"] h1 {
  font-size: 32px;
  font-weight: bold;
  margin: 1em 0 0.5em 0;
}

[role="textbox"] h2 {
  font-size: 24px;
  margin: 0.8em 0 0.4em 0;
}
```

### Custom Schema

Define your own schema for specific use cases:

```typescript
import { SchemaSpec, useFountain, CoreSchemaSpec } from '@fountainjs/editor/react';

const customSchema: SchemaSpec = {
  ...CoreSchemaSpec,
  nodes: {
    ...CoreSchemaSpec.nodes,
    // Override or add custom nodes
    customNode: {
      content: 'inline*',
      parseDOM: [{ tag: 'div', class: 'custom' }],
      toDOM: () => ['div', { class: 'custom' }, 0],
    },
  },
};

const editor = useFountain({
  schema: customSchema,
});
```

---

## Browser Support

- Chrome/Edge 88+
- Firefox 87+
- Safari 14+
- iOS Safari 14+
- Chrome for Android 88+

---

## License

MIT - See LICENSE file for details

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

---

## Support

- 📖 [Documentation](https://fountainjs.dev)
- 🐛 [Issues](https://github.com/yourusername/fountainjs/issues)
- 💬 [Discussions](https://github.com/yourusername/fountainjs/discussions)

---

**Made with ❤️ for developers who want a powerful, flexible text editor**

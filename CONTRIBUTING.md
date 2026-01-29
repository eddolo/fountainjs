# Contributing to FountainJS

We appreciate your interest in contributing to FountainJS! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 16+ or higher
- npm, yarn, or pnpm

### Local Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/yourusername/fountainjs.git
   cd fountainjs
   ```

3. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

   The example app will be available at `http://localhost:5174`

### Build the Library

To build the library for distribution:

```bash
npm run build:lib
```

This will output files to the `dist/` directory in both ES modules and CommonJS formats.

### Run Type Checking

```bash
npm run type-check
```

## Project Structure

```
fountainjs/
├── src/
│   ├── core/              # Core editor logic
│   │   ├── editor.ts
│   │   ├── state.ts
│   │   ├── schema/        # Schema definitions
│   │   └── transaction/   # Transaction system
│   ├── view/              # DOM rendering and management
│   ├── extensions/        # Built-in nodes, marks, plugins
│   ├── react/             # React components and hooks
│   └── index.ts           # Main entry point
├── examples/
│   └── react-app/         # React example application
├── dist/                  # Built library output
├── README.md
├── CONTRIBUTING.md
└── vite.lib.config.ts     # Library build config
```

## Development Guidelines

### Code Style

- Use TypeScript for all source code
- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic

### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add support for custom plugins
fix: Resolve selection restoration issue
docs: Update API documentation
refactor: Simplify transaction handling
test: Add tests for history plugin
```

### Creating a Pull Request

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Commit with clear messages
4. Push to your fork
5. Open a PR with a detailed description

## Testing

While we work on adding tests, please ensure:

- The dev server runs without errors
- The example app works as expected
- TypeScript compilation passes: `npm run type-check`

## Architecture Overview

### Core Concepts

**EditorState**: Immutable representation of the document and selection

**Transaction**: Describes changes to the document (create with `state.createTransaction()`)

**Editor**: Manages state and dispatches transactions

**EditorView**: Renders the document to DOM and handles user input

**Plugin**: Extends editor functionality (e.g., undo/redo)

### Key Design Decisions

1. **Immutable State**: All state changes are immutable, making it easy to track changes
2. **Transaction System**: Changes are described declaratively via transactions
3. **Plugin Architecture**: Features are added via composable plugins
4. **Modular Schema**: Nodes and marks are defined in a schema, allowing customization
5. **DOM Reconciliation**: The view keeps DOM in sync with editor state through two-way binding

## Adding a New Feature

### Adding a New Node Type

1. Create a new file in `src/extensions/nodes/`:
   ```typescript
   // src/extensions/nodes/code-block.ts
   import { NodeSpec } from '../../core/schema';

   export const codeBlockSpec: NodeSpec = {
     content: 'text*',
     code: true,
     parseDOM: [{ tag: 'pre' }],
     toDOM: () => ['pre', ['code', 0]],
   };
   ```

2. Add it to the schema in `src/extensions/index.ts`:
   ```typescript
   import { codeBlockSpec } from './nodes/code-block';

   export const CoreSchemaSpec = {
     nodes: {
       // ... existing nodes
       code_block: codeBlockSpec,
     },
   };
   ```

### Adding a New Plugin

1. Create a file in `src/extensions/plugins/`:
   ```typescript
   // src/extensions/plugins/my-plugin.ts
   import { Plugin } from '../../core/plugin';
   import { EditorState } from '../../core/state';

   export const myPlugin: Plugin = {
     name: 'myPlugin',
     apply(state: EditorState, action: any) {
       // Plugin logic here
       return state;
     },
   };
   ```

2. Export it from `src/extensions/index.ts`

## Reporting Issues

When reporting bugs, please include:

- A clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Browser and OS information
- Code examples or screenshots if applicable

## Questions?

Feel free to:
- Open a discussion on GitHub
- Check existing issues and PRs
- Review the documentation

Thank you for contributing! 🙌

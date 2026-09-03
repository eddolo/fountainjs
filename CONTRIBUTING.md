# Contributing to FountainJS

Thanks for helping make FountainJS a better place to create.

## Setup

Requirements: Node.js 20+ and pnpm 11+.

```bash
git clone https://github.com/eddolo/fountainjs.git
cd fountainjs
pnpm install
pnpm dev
```

The playground imports the source directly, so changes appear immediately.

## Before opening a pull request

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm exec vite build
pnpm pack:check
```

CI also runs Publint and Are the Types Wrong against the packed root and React entry points. Add or update tests for behavioral changes. Read [the architecture guide](docs/ARCHITECTURE.md) before changing core invariants. Keep public APIs typed and document new nodes, marks, commands, formats, or MCP behaviors. Do not commit `node_modules`, `dist`, coverage output, credentials, or local environment files.

## Design principles

1. Keep document data portable and serializable.
2. Preserve framework freedom in the root entry point.
3. Make the accessible path the default path.
4. Reject unsafe content at HTML and network boundaries.
5. Prefer honest beta labels over unsupported production claims.
6. Keep extension APIs composable even when the default experience is batteries-included.

## Reporting bugs

Include a minimal document JSON sample, browser/Node version, expected behavior, actual behavior, and a reproduction when possible. Never include access tokens or private content.

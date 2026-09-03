# Changelog

## 0.3.0 — Rebuilt as a modular editor engine

This release replaces the `0.2.x` proof of concept.

### Added

- Immutable JSON document model with schema-owned construction and validation.
- Framework-neutral extension composition for nodes, marks, plugins, commands, formats, and host services.
- DOM API, standards-based Web Component, and isolated React entry point over the same editor store.
- Range-aware transactions, typed editing commands, and working 100-step undo/redo history.
- Selection, replacement, and formatting across inline mark boundaries and multiple document blocks.
- Rich-content commands for images, links, quotes, lists, tasks, tables, nested block splitting, and boundary-aware deletion.
- Text alignment, colour, subscript, superscript, semantic hard breaks, and cross-mark document find/replace.
- Image URL, upload-adapter, inline data, clipboard paste, and drag/drop workflows.
- Rich schema for headings, quotes, ordered/bullet/task lists, code, tables, media, links, highlights, dividers, and hard breaks.
- Markdown and HTML importers plus safe HTML, Markdown, JSON, and text exporters.
- Accessible DOM editor with selection synchronization, keyboard input, paste, and Markdown shortcuts.
- React composer, toolbar, state hooks, outline navigator, and optional AI review panel.
- Provider-neutral `AIController` with inspectable request envelopes, data-minimal defaults, before/after proposals, stale-target protection, accept/reject decisions, cancellation, and undoable acceptance.
- MCP Streamable HTTP client and `MCPAIAdapter` with lifecycle negotiation, sessions, pagination, tool discovery and calls, JSON/SSE responses, errors, and timeouts.
- Live loopback MCP integration coverage for the complete connect/discover/call/apply/close lifecycle.
- Interactive extension NodeViews plus beforeinput, paste, drop, and click plugin hooks.
- Behavioral tests, package smoke checks, CI, npm release automation, and GitHub Pages deployment.
- A dedicated, responsive developer guide plus a detailed repository architecture reference and source tour.
- A gallery of ten dedicated, interactive integration pages spanning React, plain DOM, Web Components, Vue, Svelte, Angular, headless Node.js, and Python/Go/Java JSON boundaries.

### Fixed

- Undo and redo are no longer placeholders.
- DOM edits no longer flatten every supported block into plain paragraphs.
- Selections no longer stop working when they cross paragraphs or formatting boundaries.
- Accept-change text remains visible on hover and keyboard focus.
- Outline entries show complete, wrapping heading labels and retain the full text in hover tooltips.
- Modularity walkthrough cards keep their numbers, titles, and descriptions on consistent rows.
- ESM and CommonJS consumers now receive unambiguous declarations with explicit internal module paths; legacy React subpath typing is included.
- Marks serialize by stable type names instead of class objects.
- HTML output escapes text and rejects unsafe image and link protocols.
- The README installs and imports the actual package name, `fountainjs-editor`.
- Git remote credentials are no longer embedded in the repository URL.

### Repository

- Removed thousands of committed dependency files and generated bundles.
- Removed duplicate completion reports and the unrelated portfolio demo.
- Removed the confusing screenplay positioning; FountainJS is a modular, framework-neutral editor library.
- Consolidated usage, API, formats, AI/MCP, contribution, and security documentation.

### Breaking changes

- React APIs live at `fountainjs-editor/react`; the framework-neutral root does not load React.
- `undo` and `redo` receive an `Editor`, not an `EditorState`.
- Mark transactions are range-aware.
- `MCPIntegration` speaks MCP Streamable HTTP instead of a proprietary `/messages` payload.
- `useFountain` returns an `Editor` rather than `Editor | null`.
- Fountain screenplay nodes and format helpers were removed from the core package.

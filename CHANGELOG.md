# Changelog

## Unreleased

### Added

- Opt-in, editor-local clipboard history with bounded deduplicated slots,
  unchanged native copy/paste behavior, a Mod-Alt-V command, explicit host
  persistence, framework-neutral state/commands, and a searchable React picker
  with full-value expansion, paste, remove, and clear controls.
- Span-aware production tables with geometry repair, merged-cell-safe row and
  column transforms, merge/split, scoped header toggles, full-row/column
  selection, accessible pointer/keyboard resizing, persisted column widths,
  and TSV plus HTML clipboard exchange.
- Live language-aware code blocks with safe token decorations, non-persisted
  line numbers, canonical language aliases, host tokenizer injection, public
  settings commands, React language/line-number UI, and real-browser editing.
- Professional bullet, ordered, and task-list transforms with multi-block
  wrapping, range conversion, mixed nesting, multi-item indent/lift, correct
  ordered starts after splits, boundary joins, React controls, and nested
  HTML/Markdown round trips.
- Starter link behavior with safe normalization and validation hooks, typed
  web/email autolinking, selection/caret link-on-paste, whole-link editing and
  removal, host-owned activation events, and a complete React link popover.
- Opt-in Lean 4 foundation with portable source blocks, Unicode shortcut entry,
  highlighting, zero-provider source-only mode, explicit provider trust
  metadata, and cancellable/stale-safe check, diagnostic, goal, hover, and
  completion contracts, plus mapped transient diagnostics and a safe
  framework-neutral InfoView.
- Opt-in native mathematics extension with inline/display TeX nodes, insertion
  and source-update commands, isolated input/paste rules, accessible source
  fallback, caller-owned DOM rendering, a safe KaTeX adapter, format round
  trips, tests, and a live headless demo.
- Configurable local history depth and grouping delay, adjacent browser
  typing/composition/deletion groups, explicit `closeHistory` boundaries,
  browser history-input support, and focused undo contracts.
- Cross-engine input contracts for alternate IME commit ordering, mobile
  replacement input, rich structured paste, mixed RTL/LTR and nested text, and
  native undoable drag-move of selected top-level blocks.
- Pixel/Chromium and iPhone/WebKit emulation projects covering virtual-keyboard
  input types and public-site mobile overflow alongside the desktop matrix.
- Production NodeView reconciliation with transaction-mapped identity, live path
  accessors, update/recreate and cleanup contracts, model-owned `contentDOM`,
  semantic selection hooks, embedded-control event isolation, mutation recovery,
  reversible decorations, and real-browser coverage.
- An optional `createReactNodeView` adapter with typed component props, attribute
  and deletion helpers, selection state, separate React/model DOM ownership,
  mapped reuse, cleanup tests, and a live custom-node demo.
- A mapped selection hierarchy for text, node, structural-gap, all-document,
  and rectangular table-cell selections, including semantic command behavior,
  undo restoration, native DOM synchronization, pointer interaction, keyboard
  navigation, non-colour visual states, public demos, and cross-browser tests.

- Structural `StepMap` and composable `Mapping` primitives with inversion and
  deletion metadata.
- Automatic transaction-selection mapping through text edits, block changes,
  and mark-created text fragments.
- Public conversion helpers between path-based text points and structural
  document positions.
- Immutable inline, node, and widget decorations supplied by plugins and mapped
  through transactions without entering document JSON.
- DOM rendering for overlapping decorated text and non-editable widgets, with
  widget content excluded from selection offset calculations.
- Public, extension-owned input rules with ordered matching, transaction
  handlers, a text-replacement helper, and immediate Backspace undo.
- Markdown shortcuts rebuilt on the public input-rule API, including optional
  language names in fenced-code triggers.
- Playwright browser contracts for real input events, cross-block selection,
  mapped decorations, input-rule undo, and the public React playground across
  Chromium, Firefox, and WebKit, with CI traces retained on failure.
- Typed command managers with immediate commands, atomic fluent chains,
  short-circuit rollback, one-step history, and non-mutating `can()` checks.
- View-aware focus commands for current, start, and end positions, including
  side-effect-free capability checks and real-browser chained-edit coverage.
- Extension-owned paste rules with transaction/document/text results, repeated-
  match processing, and reusable text, mark, and block-wrapping helpers.
- Atomic multiline plain-text paste, so one clipboard action creates one history
  entry even when it inserts several document blocks.
- Deterministic segmentation for partially overlapping inline decorations,
  verified while mapping alongside node and widget decorations in real browsers.
- Immutable selection bookmarks that map through composed changes and recover
  to valid text cursors when their original ranges or blocks are deleted.
- A release-gated Tiptap parity programme that distinguishes delivered,
  partial, and missing capabilities.

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

# Changelog

## Unreleased

### Fixed

- Responsive block images now fall back from a failed `srcset` candidate to
  their ordinary `src` without triggering a NodeView remount loop; Retry
  deliberately restores the responsive candidates.
- Focused controls inside a retained custom NodeView now keep DOM identity and
  focus across model updates and undo/redo; compatible same-path history
  changes may be accepted by the NodeView's own `update` contract.
- Semantic HTML import no longer turns indentation-only whitespace between
  nested blocks into empty paragraphs.
- The ESM React entry now keeps `react-dom/client` external and has package
  import and build-budget gates, preventing an embedded CommonJS runtime from
  breaking ESM import or silently inflating release assets.

### Added

- An immutable Markdown source snapshot for raw/visual workflows:
  `parseWithSource` retains exact input, line endings, and inert YAML
  frontmatter; `exportWithSource` returns unchanged source exactly or
  preserves the frontmatter while canonicalizing a visually edited body; and an
  explicit `exact`/`blocks`/`mapped-blocks`/`frontmatter`/`canonical` result
  prevents false source-fidelity claims. Unknown body syntax is deliberately
  not promised after a model edit.
- Conservative top-level Markdown source spans preserve unchanged aligned
  blocks, their whitespace, and their original line endings around a visual
  edit. A `blocks` result makes that stronger outcome explicit; ambiguous
  ownership and reference-owning changes fall back to frontmatter-only or
  canonical output instead of guessing.
- Unique structural source mapping retains unchanged block spelling through
  insertion, deletion, and movement while canonicalizing inter-block
  separators. Duplicate semantic blocks remain deliberately unmapped, and the
  explicit `mapped-blocks` result distinguishes this from aligned preservation.
- An initial versioned CommonMark 0.31.2/GFM 0.29-oriented compatibility corpus,
  plus ATX/Setext headings, indented and variable backtick/tilde code fences,
  variable-delimiter code spans with standard whitespace normalization, safe
  angle-bracket URI/email autolinks, star emphasis, backslash hard breaks, and
  collision-safe code export. This is documented as a supported subset, not a
  false claim of complete standards conformance.
- Strict semicolon-terminated HTML5 named, decimal, and hexadecimal character
  references now decode everywhere CommonMark permits them, including link
  destinations, titles, reference labels, and fence info strings, but remain
  literal in code. All ASCII punctuation escapes are recognized; escaped
  ampersands remain literal; decoded URLs pass protocol validation; and
  canonical export protects literal entity-shaped text from changing meaning.
- Safe path-relative and query-relative URLs now pass the shared link policy.
  Markdown links additionally handle balanced destination parentheses and
  angle destinations containing `)`, reject unescaped title closers and labels
  beyond CommonMark's 999-character reference bound, and no longer extract
  reference definitions from fenced/indented code or paragraph continuation
  text. Destinations and titles can continue across nonblank definition lines,
  including multiline titles and escaped closing brackets in labels, and
  definitions nested in blockquotes remain global as CommonMark requires.
- A public `fountainjs-editor/core` entry for the platform-neutral document
  engine, logical selection, transactions, commands, history, portable
  extensions, collaboration lifecycle, formats, migrations, stable node IDs,
  and structured attributes; the source graph is import-gated, the package
  declarations compile with `ES2023` and no DOM library, ESM/CommonJS exports
  are smoke-tested, and pure-Node behavior includes collaboration and Yjs with
  no fake DOM. Browser presence rendering remains in the compatible root entry.
- Opt-in top-level `EditorView` virtualization with a renderer-independent
  measured-height/position index, viewport and semantic-selection islands,
  stable structural scroll anchoring, full-model decoration positions,
  deterministic NodeView lifecycle, rich wide-selection copy/cut preparation,
  automatic full-document print rendering, an explicit accessibility/export
  suspension API, React and Web Component forwarding, and 100,000-block
  Chromium/Firefox/WebKit/mobile browser contracts.
- Pure-Node HTML conversion through the isolated
  `fountainjs-editor/html/server` entry: a standards-oriented parser and CSS
  selector engine bundled without jsdom; portable `parseHTML` extension rules;
  retained browser-only `parseDOM` compatibility; full schema validation;
  malformed-input and unsupported-rule reports; URL and attribute safety;
  configurable input/tree/depth/attribute/error bounds; ESM/CommonJS package
  smoke checks; browser/server semantic parity fixtures; and enforced
  10,000-block CPU, growth, memory, and bundle budgets.
- Granular collaborative structured attributes through the new DOM-free
  `fountainjs-editor/structured-attributes` entry and opt-in
  `YjsCollaborationAdapterOptions.structuredAttributes`: bounded immutable JSON
  contracts; typed nested set/delete/array commands; one-step schema-validated
  transactions; stable-ID-addressed nested `Y.Map`/`Y.Array` projection;
  concurrent non-overlapping field and array-insertion convergence; canonical
  flat-JSON repair; local-only undo across both representations; hostile shared
  value and identity failure containment; pure-Node coverage; package exports;
  developer documentation; and working controls in the two-editor public demo.
- First-class portable interactive widgets through isolated
  `fountainjs-editor/widgets`, `fountainjs-editor/widgets/dom`, and
  `fountainjs-editor/react/widgets` entries: immutable definitions; attribute
  and cross-field validation; block/inline/content shapes; protected identity;
  insert/update/remove/selection commands; live-path controllers; transaction
  metadata; one-step history; generic Yjs synchronization; safe bounded HTML
  state; explicit Tab/Enter/Escape focus policy; read-only and accessibility
  state; separate controls/contentDOM ownership; deterministic teardown; plain
  DOM and React renderers; package/API/bundle gates; documentation; unit tests;
  and two package-backed public demos.
- An isolated `fountainjs-editor/node-ids` module with configurable portable
  `nodeId` assignment; injected and deterministic generation; immutable O(1)
  lookup; fail-closed duplicate diagnostics; lookup, update, selection, pure
  normalization, and schema-valid JSON migration APIs; single-pass repair;
  history-neutral position mapping; generic Yjs repair rebroadcast; custom
  block/inline eligibility; package exports and budgets; and Node-only
  10,000-block performance plus legacy-peer convergence coverage.
- An isolated `fountainjs-editor/pages` foundation with DOM-independent
  A4/Letter/custom geometry and legal-fragment flow; manual page-break and rich
  footnote schema intent; one canonical rich header/footer template per
  default/first/odd/even variant; portable current-page/page-count fields;
  integrity diagnostics; atomic commands; explicit
  overflow/constraint results; JSON and semantic HTML interchange; generic
  history/Yjs behavior; an isolated browser measurement adapter for line boxes,
  list items, rowspan-safe table groups, footnotes, and manual breaks; package
  budgets; a coalesced mutation/resize/font/print reflow controller with timed
  snapshots and deterministic teardown; immutable per-page selection of
  canonical furniture, resolved fields, and footnotes; DOM fragment source maps
  with model/structural paths and clip geometry; strict page-placement/source
  projection with separated continuation overhead; an isolated read-only page
  preview/print renderer with repeated furniture, structural continuation,
  footnotes, width validation, ID/transient-editor-state isolation, one
  screen-only accessibility copy, physical print-page rules, and real A4/Letter
  PDF geometry plus page-content extraction checks; and an
  improved keep-with-next rule that reserves a splittable block's required
  opening lines; plus indexed top-level lookup, identity/footnote-safe
  mutation-cycle measurement reuse, and 1,000-/5,000-block browser reflow budgets
  covering repeated middle edits and alternating document-edge edits; plus
  identity-preserving top-level insertion/removal, exact rendered-path and
  cached-source rebasing, and a 5,000-block structural budget that retains every
  unchanged DOM block while limiting insertion/removal to two/one geometry reads;
  plus a guarded editable page-shell controller that retains one unchanged
  contenteditable/model-path tree, supports native cross-page selection and
  IME plus history across whole-block/manual boundaries, restores continuous
  editing for narrow viewports and embedding containers, returns to pages on
  resize without remounting, preserves tracked-change decisions and bidirectional
  Yjs convergence across automatic whole-block boundaries; plus selection-safe,
  accessibility-hidden paragraph continuation gaps at measured line boundaries
  with stable cleanup, exact page-body alignment, responsive fallback, IME,
  history, tracked-change decisions, and bidirectional Yjs coverage; plus
  canonical list-item continuation spacing that preserves ordered starts,
  selection, IME, history, tracked decisions, Yjs convergence, and exact
  page-body alignment without cloned or synthetic list items; plus canonical
  rowspan-safe table-row continuation with reversible non-model spacer rows,
  read-only repeated column-header projections, live header reflow, selection,
  IME, history, tracked decisions, and Yjs convergence without cloning the
  editable table; explicit oversized-row overflow without clipping or model
  splitting; and mapped shared-comment anchors plus top-level movement across
  continued lists and tables. Canonical page templates and footnote definitions
  now remain uniquely editable in ordered rails while sanitized,
  accessibility-hidden page-shell copies resolve fields and update after every
  edit. It still fails closed before cloning unsupported split content; plus an
  honest staged pagination contract; plus a keep-together policy for canonical
  images, audio, disclosures, code blocks, and custom NodeViews. Unsplittable
  content moves intact when it fits and receives explicit, non-clipping page
  overflow when it exceeds the body. Pagination-owned attributes and CSS
  variables no longer cause custom NodeViews to be mistaken for foreign DOM
  mutations, while unrelated mutations still recover from immutable state.
  Complex table measurement now keeps transitive body rowspans together,
  preserves merged-column geometry, and repeats multi-row headers only when
  every header rowspan remains inside the header band; a rowspan leaking into
  body rows disables the unsafe repeated copy. A real-browser fixture keeps the
  canonical merged table editable with history across continuation pages.
  Carets on either DOM side of an injected paragraph page gap now map to the
  same logical text offset; cross-gap ranges and composition from both sides are
  covered in Chromium, Firefox, and WebKit without persisting the widget.
  Mobile Chrome/Safari emulation additionally verifies composition at that
  boundary and selection preservation while responsive fallback removes gaps.
  A physical print-media contract now verifies A4/Letter sheet rectangles,
  stable normalized page names, headers/page numbers, page-local footnotes,
  forced breaks, accessibility isolation, and transient-editor-state removal in
  Chromium, Firefox, and WebKit while retaining Chromium PDF-byte verification.
  `renderDOMPagePreview` now accepts a framework-neutral `renderPlacement` hook
  for custom NodeViews and atomic media; returned host templates are cloned,
  namespaced, made read-only, and stripped of live editor state without moving
  either the template or canonical source DOM. `pages/dom` now also accepts a
  host-owned `blockContinuation` adapter for custom rendered blocks. It strictly
  validates ordered descendant bands, fragment minima, continuation overhead,
  geometry, and source ownership; maps them to neutral immutable flow sources;
  and lets the preview render exact sanitized band ranges without changing the
  model or live NodeView. A custom split remains read-only/print-only and causes
  guarded editable pagination to fall back to continuous mode. Long footnote definitions now
  expose measured line fragments to the neutral layout engine, continue without
  duplicated or dropped content, retain configurable opening/ending minima,
  and render exact sanitized clips in both editable page shells and print
  previews. Inline references outside a text line's vertical center fall back
  to the nearest legal line instead of losing their reservation.
  Footnote display numbers are now derived from first-reference order without
  changing stable JSON IDs, update after structural movement, stay shared by
  repeated references, and round-trip through standard Markdown footnotes and
  semantic HTML noteref/footnote roles. Context-sensitive node DOM output now
  receives document/path context and explicitly opts out of stale DOM reuse.
  Paged previews route repeated cross-page references to the first rendered
  fragment of their shared definition instead of a nonexistent local anchor.
  One-line headings now carry the same keep-with-next intent as measured
  multi-line headings, preventing an ordinary heading from being stranded at
  the bottom of a page while its following block moves to the next sheet.
  Read-only and print pagination now exposes `block-child` fragments and can
  continue a multi-block blockquote at its canonical direct-child boundaries,
  preserving repeated container decoration without cloning or mutating the
  source document. Imported styled semantic HTML is covered across Chromium,
  Firefox, and WebKit, including marks, nested quote/list structure, merged
  tables, math, manual breaks, and Chromium PDF text de-duplication.
  A mixed three-engine print fixture now combines reversed footnote-definition
  order, repeated citations, continued notes, merged tables, page furniture,
  a manual break, and Chromium PDF text de-duplication.
  Broader adversarial/cross-engine print fidelity remains active work rather
  than a claimed capability.
- A DOM-independent versioned document envelope and deterministic sequential
  migration runner, historical bare-JSON compatibility, typed fail-closed
  diagnostics, a published structural JSON Schema, schema-validation hooks,
  isolated ESM/CommonJS exports, package tests, and deployment guidance.
- A written API-stability, deprecation, security-support, release, and rollback
  contract plus a machine-checked package-version/tag/changelog gate and
  reviewed public-declaration snapshot, complete trusted-publisher package-entry
  verification, and intended-file dry-run.
- Versioned extension manifests, deterministic ordered requirements, a safe
  package scaffold command, a framework-neutral checked example, and an
  isolated `fountainjs-editor/testing` conformance entry covering composition,
  document round-trips, command dry-runs/execution, whole-installation doctor diagnostics, packaging,
  compatibility, and author guidance.
- A complete validated text-style suite in `CoreExtension` and `StarterKit`,
  with foreground/background colour, font family, font size, and line height;
  framework-neutral commands and mixed-selection inspection through the
  isolated `fountainjs-editor/text-style` entry; safe HTML and lossless
  Fountain Markdown interchange in browsers and headless Node.js; generic Yjs
  synchronization; a responsive React toolbar panel; documentation, package
  budgets, and desktop/mobile browser contracts.
- An isolated `fountainjs-editor/ruby` module for semantic furigana and other
  pronunciation guides, with marked editable base text, validated readings,
  set/update/unset/toggle commands, accessible and IME-safe replaceable editing
  UI, JSON/HTML/Markdown/text interchange, generic Yjs synchronization, package
  budgets, documentation, and browser contracts.
- An isolated `fountainjs-editor/details` module with semantic, editable native
  details/summary nodes; arbitrary and nested block bodies; public
  insert/wrap/unwrap/open commands; persisted disclosure state; summary/body
  keyboard transitions; JSON, safe HTML, Markdown, and text interchange; generic
  Yjs synchronization; package budgets; documentation; and desktop/mobile
  browser contracts.
- Isolated public MIT named-version entries with replaceable bounded providers,
  manual and debounced automatic checkpoints, optimistic heads and exact
  idempotency, immutable structural/text/format comparison, non-destructive
  preview, permission hooks, backup-first one-transaction restoration,
  tracked-change compatibility, an accessible confirmation-gated React panel,
  package budgets, tests, and production integration/security guidance.
- An isolated, provider-independent tracked-changes engine for text insertion,
  deletion, exact replacement, mark changes, node attributes, atoms, tables,
  and structural edits; portable author/time/reason/comment metadata;
  individual/range/author/filtered batch accept or reject; selection/hover and
  lifecycle events; programmatic proposals; history and Yjs integration;
  accessible full-text React review UI; package/bundle gates; documentation;
  and browser/unit contracts.
- An isolated, provider-independent threaded-comments engine with overlapping
  inline/cross-block, point, block, and document anchors; mapped movement,
  deterministic recovery and orphan reattachment; text or rich-JSON replies,
  editing, reactions, resolution, archival, deletion, immutable events and
  permission hooks; authoritative adapter operations and a shared in-memory
  store; plus an isolated accessible React panel, package gates, tests, public
  demo, and production integration/security guidance.
- A provider-independent collaboration extension plus optional
  `fountainjs-editor/yjs` adapter with conflict-free text/structure,
  deterministic simultaneous-room initialization, relative remote selections,
  accessible presence decorations, local-origin undo/redo, validated remote
  state, host-owned provider/persistence boundaries, package checks, detailed
  integration guidance, and real-browser two-editor coverage.
- Lifecycle-safe collaboration replacement with generation-scoped adapter
  contexts, stale document/provider isolation, one-time retirement, bounded
  Yjs presence publishing, duplicate-listener reconnect tests, and a
  Strict-Mode-safe React editor constructor lifecycle. Multi-editor DOM
  selection ownership now prevents an unfocused remote view from stealing the
  active editor's browser selection.
- Markdown full/collapsed/shortcut reference links and images with titles,
  deterministic deduplicated reference export, recursive quote and loose-list
  parsing, aligned tables with escaped pipes and row normalization, complete
  schema validation, and immutable path-based loss reports for unsupported
  nodes, marks, and attributes.
- Schema-owned `parseDOM` rules for extension-defined block/inline nodes and
  marks, nested `contentElement` parsing, complete imported-tree validation,
  custom-mark export, broader common CSS/link preservation, and hardened
  generic HTML tag/attribute/style serialization with real-browser paste
  coverage.
- Schema-safe `canMoveNode` / `moveNode` commands for same-parent and
  cross-parent nested moves, plus optional framework-neutral drag handles,
  before/after indicators, accessible move buttons, host candidate/label
  policy, React/Web Component passthrough, and desktop/mobile browser coverage.
- A configurable, icon-based React toolbar with stable group/action IDs,
  ordering and visibility controls, label/icon/render overrides, public
  root/group/button/icon primitives, composer passthrough, selection-preserving
  pointer behavior, RTL keyboard navigation, and responsive scrolling.
- Framework-neutral, opt-in bubble and floating menu controllers with named
  instances, safe visibility predicates, reusable selection geometry,
  collision-aware placement, accessible React toolbars, and package-backed
  desktop/mobile demos.
- A framework-neutral slash-command extension with ranked multi-term filtering,
  cancellable async sources, live runtime registrations, atomic rollback,
  eleven schema-aware defaults, an accessible React renderer, and package-backed
  desktop/mobile demo coverage.
- Independent mention, emoji, typography, and character-count extensions; a
  framework-neutral cancellable suggestion controller; accessible React
  suggestion/count UI; an isolated complete RGI emoji-data entry; enforced
  transaction filtering; safe interchange; package-backed desktop/mobile
  demos; and behavioral, packaging, accessibility, and browser contracts.
- A framework-neutral `MediaExtension`, included by `StarterKit`, with typed
  native audio/video and WebVTT tracks, file attachments, provider-gated
  sandboxed embeds, safe HTML/text/Markdown boundaries, mapped observable asset
  uploads, paste/drop events, React controls, a Web Component demo, and unit
  plus cross-browser contracts.
- Production block and inline images with mapped progress/cancel/retry uploads,
  safe replacement, editable captions, alignment, load recovery, accessible
  pointer/touch/keyboard resizing, responsive metadata, expanded interchange,
  framework-neutral commands, and complete React controls.
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

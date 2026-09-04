# FountainJS architecture

This document explains the implementation behind FountainJS. Read it before changing core behavior, building a substantial extension, or creating another framework adapter. The public API surface is listed separately in [API.md](API.md).

## Design goals

FountainJS is organized around five invariants:

1. The document is the source of truth. Browser DOM, React state, and exported strings are projections of it.
2. Editor state is immutable. A change produces a new document tree and state object.
3. Changes are explicit transactions. Input handlers and product controls call commands rather than mutating rendered HTML.
4. The core is UI-framework independent. React and the Web Component wrap the same `Editor`, `EditorState`, and `EditorView` APIs.
5. Product boundaries stay open. Extensions, persistence, uploads, formats, services, and optional AI are selected by the host.

The runtime is TypeScript compiled for the browser. The persisted JSON model and network boundaries are language-neutral: any backend capable of reading JSON can store, validate, index, transform, or publish FountainJS content.

## Dependency direction

```text
Host application
  ├─ React components/hooks ─┐
  ├─ Web Component ─────────┼─> DOM view and input bridge
  ├─ plain DOM API ─────────┘            │
  └─ custom adapter ─────────────────────┤
                                        v
                              Editor + commands
                                        │
                                  transactions
                                        v
                   EditorState + plugins + schema/document
                                        │
                        JSON / Markdown / HTML / text
```

`src/core` imports no React code. `src/view` depends on core. `src/react` depends on core and view. `src/ai` depends on core editor contracts, but core does not depend on AI.

## Document model

### Nodes

`Node` is a typed tree value. A node owns:

- a `NodeType`, which points back to its schema;
- frozen attributes;
- a frozen child array;
- optional text for text nodes;
- frozen marks for text nodes.

Blocks such as paragraphs, lists, tables, code blocks, and images are nodes. Inline content is also made of nodes. `copy`, `withText`, `withMarks`, and `withAttrs` return new values; they never mutate the original.

Paths identify a node by child indexes from the root. `[3, 0, 1]` means root child 3, its child 0, then its child 1. Path helpers in `src/core/transaction/path.ts` resolve, compare, replace, and enumerate text ranges.

### Marks

Marks annotate text without becoming container nodes. Strong, emphasis, underline, strike, link, highlight, inline code, text colour, subscript, and superscript use this mechanism. Mark equality includes both the stable type and attributes.

### JSON

`Node.toJSON()` emits only serializable data:

```json
{
  "type": "paragraph",
  "attrs": { "align": "left" },
  "content": [
    { "type": "text", "text": "Hello " },
    {
      "type": "text",
      "text": "world",
      "marks": [{ "type": "strong" }]
    }
  ]
}
```

JSON is the lossless persistence boundary. HTML and Markdown are interoperability formats and may not represent every custom extension.

## Schema and validation

`Schema` converts a `SchemaSpec` into owned node and mark types. Node specs declare groups, content expressions, attributes, atoms, code behavior, DOM output, and optional NodeViews. Mark specs declare attributes and DOM output.

Content expressions are parsed in `src/core/schema/content-expression.ts`. They support:

- node names or groups: `paragraph`, `inline`, `block`;
- sequences: `paragraph block*`;
- alternatives: `paragraph | heading`;
- grouping with parentheses;
- `?`, `*`, and `+` quantifiers.

Validation recursively checks:

- every node and mark belongs to the receiving schema;
- required/defaulted attributes pass validators;
- text nodes contain no children;
- non-text nodes do not carry marks;
- atom nodes contain no children;
- child sequences satisfy the declared content expression.

Validation occurs when JSON enters a schema and whenever `EditorState` is constructed, including after a transaction is applied. Invalid state is rejected at the boundary instead of reaching a renderer or exporter.

## Selection model

The shared `BaseSelection` contract has five immutable variants:

- `Selection` for a text caret or ordered text range;
- `NodeSelection` for one complete non-text node;
- `GapSelection` for a block boundary;
- `AllSelection` for the full document;
- `CellSelection` for one rectangular region in a table.

Every variant exposes a text projection for read-only integrations. Semantic
identity lives in variant-specific fields such as `nodePath`, `position`, or
`cellPaths`; commands must branch on `kind` instead of treating that projection
as user intent. `Selection` itself stores:

- `path` and `from` for the start text position;
- `endPath` and `to` for the end text position.

Ranges must be document ordered. A collapsed selection has the same path and offset on both ends. Because endpoints are independent, one selection can cross inline mark fragments, paragraphs, list items, table cells, and other nested structures. `TableMap` resolves cell rectangles in logical row-major order across `rowspan` and `colspan`, expanding a rectangle when necessary so a merged cell is never cut. Cell selections never cross table boundaries. Gap positions are valid only between block children, never inside inline content.

`storedMarks` live on `EditorState`. At a collapsed cursor they describe marks for subsequently typed text. This avoids needing a non-empty selection to turn bold, colour, or another inline style on.

## Transactions and steps

`Editor.createTransaction()` starts from the current document, selection, and stored marks. `Transaction` extends `Transform`, which applies `Step` instances in order and retains the steps that changed the document.

Included step types cover:

- top-level replacement;
- path-based node replacement;
- text insertion and replacement;
- ordered multi-text-node replacement;
- mark add/remove over one text node or a cross-node range;
- node attribute updates.

Each applied step also emits a `StepMap`. Positions count text characters and
the opening/closing boundaries represented by `Node.nodeSize`, which allows a
path-based selection to be converted to a structural position, mapped through
one or many changes, and resolved back to the correct text path. Transactions
map their current selection after every step—even when marks split one text
leaf into several leaves. Node and cell selections map their structural ranges
back to typed nodes; deletion recovers as a gap, while an all-document selection
continues to cover the resulting document. `MapResult` reports whether surrounding content was
deleted, and maps can be inverted for rebasing and review infrastructure.

`SelectionBookmark` separates capture from resolution: it stores structural
positions, maps through any number of steps, and resolves against a later tree.
When both ends are deleted or collapse together it recovers to the nearest valid
text cursor, avoiding stale path failures in delayed UI and async integrations.

A transaction can also set the next selection, stored marks, and arbitrary metadata. Commands use metadata for concerns such as history and host provenance.

`Editor.dispatch()` returns `false` for an empty or plugin-filtered transaction.
For an accepted transaction it applies the change, resolves accepted plugin
follow-ups, replaces the current state, notifies subscribers, calls the host
`onUpdate` callback, and returns `true`.

## EditorState and plugins

`EditorState` contains the document, selection, stored marks, schema, plugin list, and private state for each plugin. Applying a transaction follows this order:

1. read the transaction's resulting document;
2. normalize its selection against existing text nodes;
3. calculate stored marks;
4. create a validated interim state;
5. ask every stateful plugin to calculate its next value;
6. create the final validated state.

A `Plugin` may define state plus event/lifecycle props:

- `handleKeyDown`
- `handleBeforeInput`
- `handleTextInput`
- `handleCopy`
- `handleCut`
- `handlePaste`
- `handleDrop`
- `handleClick`
- `onCreate`
- `onDestroy`

`filterTransaction(transaction, state)` runs before the initial transaction
changes state and before each appended transaction. Returning `false` is a
hard refusal: state, history, subscribers, and the view do not observe that
transaction. The character-count extension uses this boundary to enforce a
limit without teaching core commands about product policy. Atomic command
batches still execute against temporary state, then apply every filter to the
one composed transaction; a rejected batch restores its initial state and
reports `false` to the caller.

`appendTransaction(transactions, oldState, newState)` may return a validated
follow-up transaction. Dispatch applies follow-ups to a fixed point with a
20-pass loop guard, then notifies subscribers once with the final state and one
composed transaction containing every applied step/map. Async anchors, views,
and host subscribers therefore observe the complete change. Table repair uses
this hook and tags its transaction as non-historical.

Event hooks return `true` when they handled an event. The input manager then prevents the browser default. `PluginKey` provides stable access to a plugin's private state.

Plugins may also expose a `DecorationSet`. Inline decorations wrap text ranges,
node decorations annotate an exact node range, and widget decorations render a
non-editable DOM node at a mapped position. Decorations never enter the schema
or persisted JSON. Their immutable sets map through the same transaction maps
used by selections, which makes them suitable for search results, comments,
remote carets, diagnostics, and pending review UI.
The renderer segments text at every inline-range and widget boundary, then nests
all active decorations for that segment. This supports crossing ranges without
duplicating or persisting text, including after transaction mapping.

The mention and emoji modules build on this separation. Their shared
suggestion state derives a literal trigger/query from the collapsed text
selection and exposes a view-only query decoration. A framework-neutral
`SuggestionController` subscribes to that state, aborts superseded providers,
rejects stale results, and owns menu selection—but it does not own DOM. On
acceptance, one normal transaction replaces the literal query with a validated
inline atom. React's optional menu only subscribes to the controller and
positions against the decoration. Destroying the editor destroys its
controller and aborts pending work.

The slash-command extension reuses the same trigger, decoration, cancellation,
and keyboard machinery but replaces the query with an atomic command batch.
Its independent `SlashCommandRegistry` combines built-in, product, and async
sources and invalidates an open controller when a module registers or
unregisters. The query deletion and selected command commit together; any
failed command or plugin-filtered result rolls the temporary state back. The
registry and menu therefore add no slash-specific state to the document model.

Bubble and floating menus follow the same boundary without using suggestion
state. `FountainMenuController` derives an immutable eligibility snapshot from
the semantic model selection and contains failures from host `shouldShow`
predicates. The DOM view helper resolves model paths into selection, node, cell,
or empty-block rectangles; a separate pure placement helper flips and clamps a
surface. React only adds focus policy, resize/scroll observation, toolbar
keyboard behavior, and rendering. None of these layers writes contextual UI or
geometry into the document, plugin state, history, or serialized formats.

History demonstrates this design. It is a normal stateful plugin holding `done`
and `undone` snapshots. `createHistoryPlugin` validates configurable depth and
group delay values. Input transactions carry an internal kind/time marker, so
adjacent typing, composition, or deletion shares the earliest snapshot while a
selection move, delay, kind change, or `closeHistory` ends the group. It honors
`addToHistory: false` and restores document plus semantic selection through
another transaction. Snapshot history is deliberately classified as local-only
until collaboration introduces mapped, origin-aware undo.

## Commands

Commands receive an `Editor`, check their preconditions, dispatch a transaction, and return whether they handled the operation. The core command families include:

- content and selection;
- text and stored marks;
- block types and alignment;
- links and arbitrary marks;
- images, quotes, lists, code, tables, dividers, and hard breaks;
- list split/indent/outdent and block boundary joins;
- table row/column editing and cell movement;
- task attributes and generic node attributes;
- cross-mark find, next-match selection, and replacement.

Commands are exported as functions and contributed by `CoreExtension`, so a composed kit can invoke the same operations through `kit.commands`.

`createCommandManager` binds that registry to one editor. Immediate commands use
the editor normally; fluent chains run against temporary state and then compose
their steps, final selection, stored marks, and metadata into one dispatch. A
rejected or throwing command restores the original state. The `can()` surface
uses the same temporary execution path but never commits or notifies. Extension
commands must therefore express editor effects through transactions rather than
performing irreversible host side effects inside the command body.

The core manager has no DOM dependency. `EditorView.commandManager` composes one
additional `focus` command whose start/end selection movement joins the same
transaction batch. Its dry-run equivalent moves only temporary selection state,
so capability checks never steal browser focus.

Typing transformations use the public `InputRule` contract. The input-rules
plugin matches text including the pending browser input, asks a rule for a
transaction, and stores the natural untransformed input as an undo snapshot.
The shipped Markdown shortcuts are consumers of this API rather than special
cases in the DOM input manager. Extensions can therefore add or replace typing
behaviour without modifying the view.

Paste transformations use the parallel `PasteRule` contract. The plugin scans
the clipboard's complete plain-text form, preserves every match for the handler,
and accepts a transaction, schema document, or transformed text as its result.
Text, mark, and wrapping helpers cover the common cases; schema construction and
the normal insertion commands remain the enforcement boundary. Rules run before
the default rich-HTML/plain-text import path and the first handled rule wins.

## DOM view and input pipeline

`EditorView` mounts an accessible multiline `contenteditable`. It owns three bridges:

- `dom-renderer.ts` projects the document tree into DOM;
- `selection-handler.ts` translates DOM ranges to path selections and back, and
  projects node, gap, all-document, and cell selections into native DOM ranges
  plus non-colour visual markers;
- `input.ts` normalizes browser events into commands and transactions.

The input manager handles `beforeinput`, keyboard shortcuts, alternate IME
commit orderings, mobile replacement input, multiline/plain/rich paste, image
paste/drop, rectangular TSV/HTML table copy/cut/paste, internal node drag/drop, list indentation, code
indentation, table navigation, and task checkbox changes. It captures the
browser selection before running commands. Ctrl/Cmd+A, atomic-node boundary
arrows, Shift-pointer cell extension, and Alt+Shift+Arrow cell extension
dispatch semantic selections instead of flattening them into text ranges.
Input is exercised at logical offsets in bidirectional and deeply nested text.
Mobile Chromium and WebKit emulation run focused virtual-keyboard and responsive
layout contracts; physical-device coverage remains a separate production gate.

`BlockHandleManager` is an optional fourth view concern. It discovers eligible
top-level and nested node DOM from model paths, but mounts one accessible control
toolbar beside the contenteditable so interactive buttons never enter text,
clipboard, list/table structure, or NodeView-owned DOM. Pointer/selection changes
only choose the active model path. Drag geometry produces a candidate
`NodeMove`; `canMoveNode` validates the complete tree before an indicator is
shown, and `moveNode` commits one transaction on drop or button activation.
Resize/scroll observation affects only transient positioning. React and the Web
Component forward the same `EditorView` option rather than reimplementing it.

Rendered text is wrapped with `data-fountain-text-path`; block DOM carries node type and path attributes. These anchors let selection synchronization survive marks and nested DOM wrappers. The document—not browser-generated HTML—still decides the resulting state.

The optional clipboard-history plugin listens at the editor copy/cut boundary,
captures the model selection, and schedules its state-only transaction after
the native clipboard event completes so a rerender cannot disturb native copy.
History is bounded, deduplicated, editor-local, memory-only by default, and never
part of document JSON. A host must explicitly inject persistence; the React
picker and any custom UI consume the same immutable plugin state.

DOM output specs accept a tag, safe attributes, nested specs, and one `0` content hole. The renderer rejects unsafe tag names, event attributes, and unsupported URL schemes.

### NodeViews

A node spec may supply a framework-neutral NodeView constructor. It receives the
current node, the view boundary, and a live path accessor, and returns its own
`dom` plus optional `contentDOM`. Use it for interactive product nodes that
cannot be represented by a static DOM tuple.

Rerendering maps each mounted NodeView's old structural range through the
transaction. A same-type node at the mapped range is offered to `update`; an
unchanged node is reused without a hook call. Returning `true` retains DOM and
the mutable path reference, while returning `false` recreates the instance.
Removed and replaced instances receive `destroy`. For a retained non-atomic
view, the renderer replaces only its model-owned `contentDOM` children, leaving
the surrounding interactive DOM and subscriptions intact. Renderer-owned node
decorations are removed before update and reapplied from current plugin state.

`selectNode` and `deselectNode` follow semantic `NodeSelection` changes.
`stopEvent` isolates embedded controls from editor input, plugin, and selection
handling. A subtree `MutationObserver` asks the innermost NodeView's
`ignoreMutation` hook about local UI changes; unignored mutations are restored
from immutable editor state. Observer work is suspended during renderer and
selection hooks and deferred through IME composition. These rules keep the
document authoritative without destroying framework components on every edit.

The optional React entry exposes `createReactNodeView`. Its React root lives in
a dedicated container beside optional `contentDOM`, so React never reconciles
the model-owned editable subtree. React-originated mutations are ignored by
default; callers can override event and mutation policies.

## Extension composition

`defineExtension` creates a named, frozen extension description. An extension may contribute:

- `nodes`
- `marks`
- `plugins`
- `commands`
- `formats`
- `services`

`composeExtensions` merges these into a `FountainKit`. Duplicate extension names always fail. Duplicate named contributions fail by default; `onConflict: 'replace'` must be explicit for intentional overrides. The kit exposes the schema spec, plugins, commands, formats, services, ordered extensions, and `getExtension`.

Services are deliberately open-ended. A host can use them for analytics, collaboration, persistence, feature flags, upload clients, or product-specific dependencies without teaching the editor core about those systems.

Syntax highlighting demonstrates the decoration boundary. A code block persists
source and presentation-neutral language metadata. `SyntaxHighlightExtension`
tokenizes that source into validated ranges, then supplies inline tokens,
line-number widgets, and a block theme through the ordinary plugin decoration
contract. No highlighted DOM enters JSON, history, Markdown, HTML export, or
selection offsets. The dependency-free tokenizer is a useful default; hosts
can replace only that extension with a full grammar tokenizer while keeping the
node, commands, formats, toolbar, and document shape unchanged.

The first-party mathematics module demonstrates this boundary. Its inline and
display nodes persist only validated TeX source and an optional accessible
label. Commands and independent input/paste rule plugins create those nodes;
format adapters round-trip their source. The default NodeView renders an
accessible source fallback. `createMathExtension` can instead receive a DOM-
returning renderer, while `createKaTeXRenderer` adapts a host-installed KaTeX
instance with trust disabled. Rendered markup is view state and never enters
the document JSON.

Lean follows the same inversion of control. `LeanExtension` stores source in a
normal language-tagged code block and owns Unicode entry commands. The separate
`LeanController` extracts one explicit block and talks only to an injected
`LeanProvider`. Source-only mode is the default; provider descriptors make
execution location and data destination inspectable. Diagnostics and proof
state remain transient controller state, and stale provider responses are
discarded rather than attached to changed content. Valid diagnostics enter a
plugin only as mapped decorations; `LeanInfoView` subscribes to the same
controller without putting a framework dependency in core. See [LEAN.md](LEAN.md).

## Framework surfaces

### Plain DOM

Create an `Editor`, mount `EditorView`, and connect controls to commands. Destroy the view and editor when their host is removed.

### Web Component

`registerFountainElement` registers `<fountain-editor>` (or a custom tag). The element exposes a JSON `value`, an `editor` reference after connection, `focusEditor`, and a bubbling/composed `fountain-change` event. This is the standards-based adapter for plain HTML and Custom-Element-capable frameworks.

### React

The separate `fountainjs-editor/react` entry contains `useFountain`, `useFountainState`, `FountainEditor`, the configurable `FountainToolbar`, reusable toolbar root/group/button/icon primitives, `FountainComposer`, `Navigator`, `ClipboardHistoryMenu`, accessible suggestion/slash/count renderers, `createReactNodeView`, and the optional AI review UI. Keeping it in a separate entry prevents the framework-neutral root from loading React. Toolbar action IDs map presentation onto existing root-package commands; they are not a second command registry or persisted editor state. See [TOOLBAR.md](TOOLBAR.md).

A new framework adapter needs four operations: create an editor, subscribe to state, mount or represent the view, and destroy resources on unmount.

## Formats and media

Formats are parser/serializer objects owned by extensions. The supplied JSON,
Markdown, HTML, and text modules share the schema document as their boundary.
HTML is schema-extensible: node and mark specs contribute declarative
`parseDOM` selectors/attribute readers, while `toDOM` serializes both custom
nodes and marks. Import rules are priority-ordered, callback failures are
contained, candidate content is checked against its content expression, and the
complete result is validated before it crosses into editor state. Generic
export output is escaped and restricted to non-executable semantic tags,
attributes, protocols, and CSS; privileged built-in media uses narrower
provider-specific paths. See [FORMATS.md](FORMATS.md).

Media insertion accepts remote URLs or browser `File` objects. Block images use
an accessible NodeView for editable captions, load recovery, alignment, and
pointer/touch/keyboard resize; a separate inline image node can live inside any
`inline*` container. Both persist only portable, schema-validated source,
alternative text, dimensions, responsive source, loading, and presentation
metadata.

Without an image-upload handler, small image files become size-limited,
cancellable data URLs. `ImageUploadHandler` can instead return a URL plus
metadata from any storage provider. Audio, video, and arbitrary files are never
embedded automatically; they require the parallel `AssetUploadHandler` host
boundary. Both handlers receive abort and normalized-progress signals.

`ImageUploadTask` and `AssetUploadTask` keep status, errors, cancellation, and
retry outside the document. They capture the intended insertion, selection, or
replacement target and map it through every transaction until completion. A
deleted or type-mismatched replacement fails closed; a slow response cannot
overwrite a different node that later occupies the same path. Paste, drop,
React controls, Custom Element events, and direct API use share this path.
Failed tasks retain mapping only while retry remains possible and release it on
success or cancellation. Storage credentials, network transport, malware
scanning, and persistence remain host responsibilities.

`MediaExtension` is independently composable and adds native audio/video,
tracks, file attachments, and approved embeds. Each embed provider converts
recognized public URLs to canonical HTTPS, declares the maximum iframe
permissions and sandbox capabilities it needs, and must recognize its own
canonical output. Whole-node schema validation binds the canonical URL to that
provider and prevents persisted or imported content from widening its policy.
YouTube and Vimeo are the default allowlist; a host can replace the list but an
arbitrary iframe never becomes trusted implicitly. Native controls and file
links remain interactive inside atomic, selectable, accessible NodeViews.

## Optional AI and MCP

AI is downstream from the transaction system. `AIController` extracts the current selection, builds an inspectable request, asks an `AIAdapter` for a proposal, and records its exact target. Accepting the proposal uses a normal transaction, so schema validation, subscribers, and undo all still apply. Changed targets are detected and stale proposals are rejected.

`MCPAIAdapter` implements an adapter over MCP Streamable HTTP: initialization, session headers, tool pagination/discovery, tool calls, JSON/SSE decoding, timeout/error handling, and close. The full route is tested against a real local HTTP server. See [MCP.md](MCP.md).

## Test strategy

The suites are organized by boundary:

- `tests/core.test.ts`: schemas, selections, steps, commands, structures, search, formats, and history;
- `tests/extensions.test.ts`: composition, conflicts, and built-in kits;
- `tests/math.test.ts`: math commands, semantic selections, delimiter rules,
  renderer isolation, validation, safe interchange, and source fallback;
- `tests/lean.test.ts`: source-only behavior, portable blocks, Unicode entry,
  provider trust validation, cancellation/staleness, and proof-service results;
- `tests/link.test.ts`: URL policy, typed/pasted link creation, complete-link
  editing/removal, and safe host-owned activation;
- `tests/list.test.ts`: multi-range wrapping/conversion, mixed nesting,
  hierarchy-preserving indent/lift/join, and nested HTML/Markdown interchange;
- `tests/image.test.ts`: block and inline nodes, responsive metadata, mapped
  uploads, progress/cancellation/retry, stale replacement protection, caption
  editing, load recovery, and accessible resizing;
- `tests/media.test.ts`: native playback, tracks, file cards, provider policy,
  safe interchange, mapped asset uploads, undo, selection, and load recovery;
- `tests/block-reordering.test.ts`: same-parent and cross-parent path moves,
  schema/cycle/no-op/read-only rejection, selection, undo, accessible controls,
  host filtering, labels, and teardown;
- `tests/html-format.test.ts`: schema-owned custom node/mark round trips,
  wrapped content, CSS/link semantics, invalid-rule fallback, complete-tree
  validation, and executable generic-output rejection;
- `tests/markdown-format.test.ts`: titled inline/reference destinations,
  deterministic definitions, escaped/aligned tables, recursive blockquotes,
  loose multi-block lists, unsafe URLs, and explicit extension-loss reports;
- `tests/view.test.ts`: DOM rendering, browser-event input, selections, media, NodeView reconciliation, and Web Component behavior in JSDOM;
- `tests/react-node-view.test.tsx`: React NodeView state, mapped paths, commands, event isolation, and cleanup;
- `tests/document-utilities.test.ts`: mention/emoji atoms, typography, enforced
  counting, async suggestion state, slash registration/filtering, and atomic
  command rollback;
- `tests/react-document-utilities.test.tsx`: accessible suggestion, grouped
  slash, and live count renderers;
- `tests/floating-menu.test.ts`: bubble/floating eligibility, named services,
  lifecycle, failure containment, read-only policy, and placement geometry;
- `tests/react-floating-menu.test.tsx`: focused toolbar rendering, positioning,
  keyboard traversal, and Escape dismissal;
- `tests/react-toolbar.test.tsx`: stable action/group composition, custom
  labels/icons/rendering, selection-preserving activation, touch de-duplication,
  RTL keyboard traversal, and composer passthrough;
- `tests/ai.test.ts`: request scope, proposal lifecycle, stale protection, cancellation, and acceptance;
- `tests/mcp.test.ts`: protocol behavior plus a real loopback HTTP lifecycle.
- `tests/browser/`: real Chromium, Firefox, and WebKit editing contracts against
  a Vite-served editor and the public React playground.

Before a release, run `pnpm check` and `pnpm test:browser`, build the production example through the package self-reference, inspect `pnpm pack --dry-run`, smoke-test ESM/CJS imports, and lint package exports.

`pnpm test:budget` enforces raw production ceilings of 102 KiB for the ESM root,
84 KiB for the CommonJS root, 36/30 KiB for document utilities, 340/280 KiB for
the isolated full emoji data, 64/48 KiB for the React entries, 34 KiB for CSS,
and 448/377 KiB for all emitted ESM/CommonJS runtime chunks excluding the full
emoji data. Source maps are
excluded. Media lifecycle tests also assert that cancelled or discarded upload
tasks release their editor subscription and that NodeViews detach resources on
destruction. The broader large-document latency and teardown benchmark work is
tracked separately as `PROD-05`.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/core/schema/` | Documents, marks, schemas, and validation |
| `src/core/transaction/` | Steps, transforms, paths, and transactions |
| `src/core/commands.ts` | Text, marks, content, and document commands |
| `src/core/structure-commands.ts` | Lists, tables, schema-safe path moves, nested blocks, and structural editing |
| `src/view/block-handles.ts` | Optional framework-neutral block controls, drag targets, and drop indicators |
| `src/core/table-map.ts` | Span-aware logical table geometry |
| `src/core/table-commands.ts` | Merge/split, headers, selection, resize, repair, and grid clipboard operations |
| `src/core/search.ts` | Cross-fragment search and replacement |
| `src/core/importers/` and `src/core/exporters/` | Validated interchange plus explicit lossy-boundary reporting |
| `src/core/editor.ts` | Dispatch, subscriptions, lifecycle, JSON/text access |
| `src/core/state.ts` | Immutable state and plugin-state application |
| `src/view/` | DOM projection, input, selection/menu geometry, media, Custom Element |
| `src/extensions/` | Composition contract, contextual-menu state, and supplied capabilities |
| `src/document-utilities.ts` | Isolated mention, emoji, typography, count, suggestion, and slash exports |
| `src/emoji-data.ts` | Optional complete searchable RGI emoji catalogue |
| `src/extensions/media.ts` | Native media nodes, embed providers, policy, commands, and NodeViews |
| `src/react/` | Optional React integration and controls |
| `src/ai/` | Optional provider-neutral AI and MCP adapter |
| `src/lean/` | Optional provider-neutral Lean requests and proof state |
| `tests/` | Behavioral contracts by subsystem |

## Contribution checklist

1. Put the change in the correct layer; do not add product policy to core.
2. Preserve immutability, schema ownership, selection ordering, and safe output.
3. Add a failing behavioral test before or with the implementation.
4. Test the end-to-end route when browser input, output formats, or protocols change.
5. Keep React imports inside the React entry.
6. Document new public nodes, marks, commands, formats, hooks, or services.
7. Run `pnpm check` and `pnpm pack:check` before opening a pull request.

# FountainJS portability audit

Audit date: 2026-09-05  
Audited revision: `b11eb75` (`feat: add extension authoring conformance tooling`)  
Scope: architecture and dependency inspection only. No portability refactor is included in this audit.

Implementation update (2026-09-05): the audit's server-conversion recommendation
now has an additive implementation. [`src/html/server.ts`](../src/html/server.ts)
ships as `fountainjs-editor/html/server`, parses HTML without browser globals or
a fake DOM, and uses the new platform-neutral `HTMLParseRule` attribute surface.
The original root `HTMLImporter` and all browser APIs remain compatible. This
closes the runtime HTML-conversion blocker; it does **not** yet create a no-DOM
core declaration/package boundary or native renderer.

## Executive verdict

FountainJS already has a genuinely platform-neutral document engine at runtime, but it does **not** yet expose a clean platform-neutral package boundary.

- The immutable document model, schema validation, logical selections, transactions, commands, history, extension composition, JSON/text/Markdown/HTML serialization, and Yjs document synchronization can run in pure Node.js without jsdom or another fake DOM.
- The package root can be imported in pure Node.js because browser globals are generally accessed only when a DOM view, parser, widget, or node view is used.
- The root `HTMLImporter` still requires `DOMParser`; the isolated
  `ServerHTMLImporter` now performs the same supported semantic conversion in
  pure Node.js with resource limits and fail-explicit extension diagnostics.
- Plain Markdown import runs in Node. Two richer Markdown paths optionally call `HTMLImporter` when `DOMParser` exists and otherwise use dependency-free fallbacks.
- Collaboration state and Yjs synchronization run in Node. Collaborator caret rendering is browser-only and deliberately returns no decorations when `document` is unavailable.
- The current public core types are not platform-neutral: `NodeSpec`, `MarkSpec`, `PluginProps`, and `Decoration` directly mention DOM types.
- `CoreExtension` mixes semantic schema definitions with `toDOM`, `parseDOM`, and DOM `nodeView` implementations. That does not prevent headless execution, but it prevents a clean renderer-independent ownership boundary.
- There is no public `fountainjs-editor/core` or `@fountain/core` entry. The root intentionally aggregates core, DOM view, browser extensions, HTML parsing, AI, Lean, and text-style exports.

The correct decision is **A: establish and enforce the boundary now, implement native renderers later**. The boundary work should be additive and compatibility-preserving; attempting React Native, Flutter, SwiftUI, or Compose editors now would destabilize the web editor and spread the project too thin.

## Evidence and method

The audit used four forms of evidence:

1. Source-wide searches for browser globals, DOM types, event types, selection/range APIs, observers, `contenteditable`, clipboard/data-transfer APIs, CSS/layout measurement, and DOM schema hooks.
2. Import/export tracing from the root, core, extension, view, React, Yjs, and optional-module entries.
3. Inspection of emitted declarations to distinguish runtime portability from TypeScript portability.
4. Execution in Node.js with no DOM shim.

The repository's Vitest default is `environment: 'node'` in [`vitest.config.ts`](../vitest.config.ts). A focused run of the existing core, selection, extension, and Markdown suites completed with **67/67 tests passing** without a per-file jsdom override:

```text
pnpm exec vitest run tests/core.test.ts tests/extensions.test.ts tests/selection.test.ts tests/markdown-format.test.ts
Test Files  4 passed (4)
Tests      67 passed (67)
```

The packed-package smoke test also imports the ESM and CommonJS root plus every published subpath in Node. It passed:

```text
pnpm test:package
ESM, CommonJS, document utilities, full emoji data, React, comments,
tracked changes, versions, details, ruby, text style, extension testing,
Yjs, and Web Component package exports loaded successfully.
```

A separate pure-Node execution probe first asserted that `document`, `window`, `HTMLElement`, `DOMParser`, `MutationObserver`, and `ResizeObserver` were absent. It then exercised the built output. Results:

```text
root import                         pass
schema creation and JSON roundtrip pass
transactions and history           pass
extension composition and command  pass
JSON/HTML/Markdown/text export      pass
two-editor Yjs convergence          pass
plain Markdown parsing             pass
HTML parsing                        expected failure: DOMParser required
```

This proves runtime behavior. It does not erase the declaration-level and ownership coupling documented below.

## Layer classification

| Layer | Classification | Evidence | Conclusion |
| --- | --- | --- | --- |
| 1. Document model/schema | **Browser-dependent but separable** | The model and validators in `src/core/schema` are runtime-neutral, but [`node-spec.ts`](../src/core/schema/node-spec.ts) owns `DOMOutputSpec`, `DOMParseRule`, `HTMLElement`, `MutationRecord`, and `nodeView`; [`mark-spec.ts`](../src/core/schema/mark-spec.ts) imports those DOM contracts. | Keep semantic node/mark specs in core; move renderer/parser/node-view contributions behind a DOM contract. |
| 2. Transactions/operations | **Already platform-neutral** | Files under [`src/core/transaction`](../src/core/transaction), plus logical commands and mappings, import only Fountain model/state modules. Existing Node tests cover editing, mapping, structure, tables, and command batches. | No architectural rewrite required. Add an import-boundary test to keep it neutral. |
| 3. History/undo | **Already platform-neutral** | [`history.ts`](../src/extensions/plugins/history.ts) imports only core editor/model/plugin types and stores immutable transactions/selections. It passed in the Node probe. | Keep in the headless layer. Collaboration-specific undo remains with its collaboration adapter. |
| 4. Collaboration/Yjs | **Browser-dependent but separable** | [`src/yjs/index.ts`](../src/yjs/index.ts) uses Yjs and Fountain logical nodes/selections only. [`collaboration.ts`](../src/extensions/collaboration.ts) mixes adapter lifecycle with browser caret widgets at lines 411-441, guarded by `typeof globalThis.document`. | Synchronization is already headless-capable. Move presence decorations to the DOM adapter; keep adapter state and commands in core/collaboration. |
| 5. Extension system | **Browser-dependent but separable** | [`extension.ts`](../src/extensions/extension.ts) performs platform-neutral composition, manifests, conflicts, formats, commands, and services, but consumes `NodeSpec` and `Plugin`, whose current public contracts contain DOM types. | Composition needs no rewrite; parameterize or split platform contributions so a core extension need not import DOM contracts. |
| 6. Parsing/serialization | **Browser-dependent but separated** | JSON, text, Markdown export, and string-based HTML export are neutral. [`html-importer.ts`](../src/core/importers/html-importer.ts) remains the browser parser. [`src/html/server.ts`](../src/html/server.ts) is an isolated DOM-free parser with equivalent validation, portable extension rules, reports, and limits. [`markdown-importer.ts`](../src/core/importers/markdown-importer.ts) still conditionally imports the browser parser for two generated inline subsets and has dependency-free fallbacks. | Server HTML conversion is implemented without destabilizing the browser path. Keep closing declaration/package ownership leaks separately. |
| 7. Selection/cursor model | **Already platform-neutral in core; DOM mapping is correctly separate** | [`selection.ts`](../src/core/selection.ts) and transaction mappings use paths and offsets. [`selection-handler.ts`](../src/view/selection-handler.ts) owns browser `Selection`, `Range`, tree walking, and `selectionchange`. | Preserve the logical model. A native renderer must implement its own logical-to-native selection bridge. |
| 8. Rendering/view layer | **Fundamentally DOM-specific as currently implemented** | [`src/view`](../src/view) creates elements, uses `contentEditable`, node views, `MutationObserver`, measurements, and Custom Elements. | This is appropriate for a future `@fountain/dom`; it must not define the engine's core contracts. Native platforms need independent renderers. |
| 9. Input/event handling | **Fundamentally DOM-specific as currently implemented** | [`input.ts`](../src/view/input.ts) consumes `beforeinput`, keyboard, composition, clipboard, drag/drop, pointer, change, and click events. Core [`PluginProps`](../src/core/plugin.ts) currently exposes these browser event classes. | Keep the implementation in the DOM adapter; move its event-hook types out of the core plugin contract. |

## Browser dependency inventory

### 1. Browser types and renderer hooks inside `src/core`

These are the most important layering violations because they make the nominal core declaration graph depend on `lib.dom`.

| Owner | Concrete dependency | Runtime necessity | Smallest boundary change |
| --- | --- | --- | --- |
| [`src/core/schema/node-spec.ts`](../src/core/schema/node-spec.ts) | Defines `DOMOutputSpec`; `DOMParseRule.getAttrs(HTMLElement)`; `NodeViewLike.dom/contentDOM: HTMLElement`; `Event`; `MutationRecord`; and `NodeSpec.parseDOM`, `toDOM`, `nodeView`. | None of these are required to create, validate, or transform a document. They are required by the current DOM parser/renderer. | Leave semantic fields in `NodeSpec`; move the three DOM hooks and node-view interfaces to a DOM contribution contract. |
| [`src/core/schema/mark-spec.ts`](../src/core/schema/mark-spec.ts) | Imports `DOMOutputSpec` and `DOMParseRule` from `node-spec.ts`, then exposes `parseDOM`/`toDOM`. | Required only for HTML/DOM integration. | Give marks a separate DOM contribution just like nodes. |
| [`src/core/plugin.ts`](../src/core/plugin.ts) | `PluginProps` exposes `KeyboardEvent`, `InputEvent`, `ClipboardEvent`, `DragEvent`, and `MouseEvent`. It also combines DOM event hooks/decorations with core `onCreate`/`onDestroy` lifecycle. | Browser events are unnecessary to state plugins. Core lifecycle hooks are used by headless collaboration/comments controllers. | Retain lifecycle and state hooks in core. Move DOM event/decorations hooks to `DOMPluginProps`, or parameterize `Plugin<TState, TViewProps>` with a neutral default. |
| [`src/core/decoration.ts`](../src/core/decoration.ts) | `WidgetFactory = () => globalThis.Node`; widget validation says “DOM factory.” | Position mapping is portable; a DOM node factory is not. | Make the mapped annotation/decorations payload generic, or move widget rendering to the DOM adapter while retaining portable ranges/keys. |
| [`tsconfig.json`](../tsconfig.json) | Globally includes `DOM` and `DOM.Iterable`; `skipLibCheck` is enabled. | Necessary for the current combined source tree, not for a headless core. | Add a second no-DOM TypeScript project for the core boundary with only `ES2023` (and required non-DOM libs), with `skipLibCheck: false`. |

The emitted declarations confirm the leak. `dist/core/schema/node-spec.d.ts`, `dist/core/plugin.d.ts`, and `dist/core/decoration.d.ts` contain the same DOM names. `dist/yjs/index.d.ts` imports `../core/index.js`, and that core index re-exports the DOM-bearing declarations. Therefore a runtime-safe Yjs consumer does not yet receive a DOM-free TypeScript graph.

### 2. HTML and Markdown parsing

| Owner/import edge | Browser dependency | Necessary? | Boundary change |
| --- | --- | --- | --- |
| [`src/core/importers/html-importer.ts`](../src/core/importers/html-importer.ts) imports schema/content-expression/URL helpers | `DOMParser`, `Element`, `HTMLElement`, specialized HTML element classes, `globalThis.Node`, selectors, `ownerDocument`, fragments, and DOM style/dataset APIs. Line 580 explicitly throws without `DOMParser`. | Necessary for this implementation, not fundamentally necessary for HTML-to-Fountain conversion. | Move the current implementation out of core. Expose a parser adapter, then add a security-reviewed DOM-free tokenizer/tree parser for Node/Bun/Deno/Workers. |
| [`src/core/importers/markdown-importer.ts`](../src/core/importers/markdown-importer.ts) imports `HTMLImporter` at line 3 | Checks `typeof DOMParser` at lines 209 and 245 for ruby and styled-span parsing, then falls back to dependency-free parsing. | The dependency is optional and unnecessary for ordinary Markdown. | Inject an embedded-HTML decoder or move the optional bridge to an HTML integration module so the base Markdown importer has no DOM import edge. |
| [`src/extensions/index.ts`](../src/extensions/index.ts) imports `HTMLImporter` and builds `HTMLFormatExtension` | Pulls the DOM parser into the aggregate extension module and `StarterKit`. | Necessary only for the HTML input format. | Keep it in the compatibility/web starter kit; create a headless starter kit that excludes it until a DOM-free implementation exists. |

The exporters do not create DOM nodes. [`html-exporter.ts`](../src/core/exporters/html-exporter.ts) serializes declarative specs to strings and passed in pure Node. JSON, Markdown, and text exporters are also platform-neutral.

### 3. DOM rendering, DOM selection, and browser input

These dependencies are appropriate for a browser adapter and should remain functionally unchanged:

| Files | Browser APIs owned | Why necessary for the current web renderer |
| --- | --- | --- |
| [`src/view/dom-renderer.ts`](../src/view/dom-renderer.ts) | `document.createElement`, text nodes/fragments, `HTMLElement`, `globalThis.Node`, `contentEditable` | Materializes Fountain nodes, marks, node views, and decorations as DOM. |
| [`src/view/view.ts`](../src/view/view.ts) | `HTMLElement`, `document.activeElement`, `contentEditable`, `MutationObserver`, `MutationRecord`, DOM containment | Owns the browser editor surface and reconciles model-owned DOM. |
| [`src/view/selection-handler.ts`](../src/view/selection-handler.ts) | browser `Selection`, `Range`, `document.getSelection/createRange/createTreeWalker`, `NodeFilter`, `selectionchange`, pointer events | Maps logical paths/offsets to browser selection and back. |
| [`src/view/input.ts`](../src/view/input.ts) | `beforeinput`, `KeyboardEvent`, `InputEvent`, IME composition events, clipboard events/data, drag/drop/data transfer, pointer/mouse/change events, caret hit-testing, DOM selection | Converts browser editing behavior into core transactions. This cannot be reused as a native input adapter. |
| [`src/view/block-handles.ts`](../src/view/block-handles.ts) | element/SVG creation, pointer/focus/keyboard/drag events, `ResizeObserver`, `getComputedStyle`, bounding boxes, scrolling, `document.activeElement` | Browser-only block controls, hit testing, bidi positioning, and drag placement. |
| [`src/view/menu-position.ts`](../src/view/menu-position.ts) | DOM tree walking/ranges, client rectangles, element bounds, `window.innerWidth/innerHeight` | Browser layout measurement for floating UI. |
| [`src/view/media.ts`](../src/view/media.ts) | `File`, `FileReader`, upload/drop-oriented browser types | Browser local-file convenience layer. The editor's URL/metadata commands themselves are portable. |
| [`src/view/web-component.ts`](../src/view/web-component.ts) | `HTMLElement`, `customElements`, `CustomElementConstructor`, `CustomEvent` | Browser Custom Element adapter. It already fails explicitly when Custom Elements are unavailable. |
| [`src/view/node-view.ts`](../src/view/node-view.ts), [`src/view/index.ts`](../src/view/index.ts) | Re-export the DOM-bearing node-view and view surface | Correctly belong with the DOM adapter. |

There is no use of `navigator.clipboard`; clipboard integration is event-based through `ClipboardEvent.clipboardData`. That is still browser-specific, but it is contained primarily in `src/view/input.ts` and browser plugin hooks.

### 4. Extensions that mix portable behavior with DOM presentation

These modules can often be loaded in Node because their DOM work is deferred, but their ownership should be split.

| Owner | Browser dependency | Is it necessary to the feature? | Smallest split |
| --- | --- | --- | --- |
| [`src/extensions/collaboration.ts`](../src/extensions/collaboration.ts) | Collaborator caret/label widgets call `globalThis.document.createElement`; decoration provider is installed on the same plugin as adapter state/lifecycle. | Not necessary to synchronization, awareness normalization, commands, or lifecycle. | Export a core collaboration extension and a DOM presence-decoration extension. Preserve a composed compatibility export. |
| [`src/comments/index.ts`](../src/comments/index.ts) | Comment point widgets create buttons; `handleClick` uses `Element.closest`. Both live beside portable anchors, stores, operations, and controller state. | Not necessary to comment persistence/mapping. | Split comments model/controller from DOM decorations and click behavior. |
| [`src/lean/diagnostics.ts`](../src/lean/diagnostics.ts) | Point-diagnostic widget factory calls `document.createElement`; decoration state is combined with logical diagnostic mapping. | Not necessary to Lean requests/results or source-range mapping. | Keep diagnostic data/mapping in core; add a DOM decoration presenter. |
| [`src/lean/info-view.ts`](../src/lean/info-view.ts) | `Document`, `HTMLElement`, buttons, focus, owner document. [`src/lean/index.ts`](../src/lean/index.ts) re-exports it beside the controller. | Necessary only for the supplied browser panel. | Give the info view a DOM-only entry; keep controller/types/diagnostics-data headless. |
| [`src/extensions/plugins/syntax-highlight.ts`](../src/extensions/plugins/syntax-highlight.ts) | Portable tokenization/string output is combined with line-number widget factories that call `document.createElement`. | DOM nodes are unnecessary to tokenization. | Split tokenization/theme data from DOM decorations. |
| [`src/extensions/link-behavior.ts`](../src/extensions/link-behavior.ts) | `MouseEvent`, `Element.closest`, `HTMLElement`, owner-window `CustomEvent`, and clipboard event data. Commands/autolink logic are otherwise portable. | Necessary only for browser activation/paste wiring. | Keep link commands/rules portable; install DOM click/paste bindings separately. |
| [`src/extensions/clipboard-history.ts`](../src/extensions/clipboard-history.ts) | `KeyboardEvent` shortcut matcher and copy/cut plugin hooks. History state/persistence and paste commands are logical. | Browser event objects are not necessary to the history model. | Let an input adapter call portable `capture/open/paste` commands; put default key binding in DOM. |
| [`src/extensions/suggestion.ts`](../src/extensions/suggestion.ts) | `KeyboardEvent` in menu navigation helper. Query state/controller is portable. | Only necessary to the supplied keyboard adapter. | Accept a portable key intent or move the event helper to DOM/React. |
| [`src/extensions/plugins/paste-rules.ts`](../src/extensions/plugins/paste-rules.ts) | `ClipboardEvent` and clipboard data extraction in the plugin contract. The rule application logic consumes strings. | Event extraction is unnecessary to rules. | Make core paste rules consume a portable `{ text, html }` payload supplied by the host adapter. |
| [`src/extensions/math.ts`](../src/extensions/math.ts) | `Document`, `HTMLElement`, `globalThis.Node`, DOM node-view construction and rendering. Math schema/commands/Markdown rules are mixed in. | Necessary to browser rendering only. | Separate math schema/commands from a DOM math renderer/node view. |
| [`src/extensions/media.ts`](../src/extensions/media.ts) | DOM node views for audio/video/file/embed, HTML media elements, tracks, `contentEditable`, owner-window interaction. | Necessary for the supplied interactive browser media UI, not media nodes/commands. | Separate semantic media nodes/commands from DOM node views. |
| [`src/details/index.ts`](../src/details/index.ts) | `<details>` node view and mutation/event handling beside portable commands/schema. | Browser presentation only. | Split schema/commands from the DOM node view. |
| [`src/ruby/index.ts`](../src/ruby/index.ts) | DOM annotation editor, focus, IME events, layout measurement, owner document/window, node view. | Browser editor only; ruby schema/commands are portable. | Split ruby semantics from DOM annotation UI. |
| [`src/extensions/nodes/image-node-view.ts`](../src/extensions/nodes/image-node-view.ts) and [`image-super.ts`](../src/extensions/nodes/image-super.ts) | Element creation, image loading, pointer/mouse/keyboard resizing, window listeners, measurements; `image-super.ts` imports and installs the class. | Browser UI only. | Keep image attributes/schema/commands neutral and register the node view through the DOM contribution. |
| [`src/extensions/nodes/table-cell-view.ts`](../src/extensions/nodes/table-cell-view.ts), [`table-cell.ts`](../src/extensions/nodes/table-cell.ts), [`table-header.ts`](../src/extensions/nodes/table-header.ts) | DOM cells/handles, pointer capture/listeners, keyboard resize, measurements; cell/header specs import and instantiate the node view. | Browser resizing UI only. Table model and commands are portable. | Register resize node views in DOM; keep table schema and operations in core. |

Additional schema contributors use declarative `toDOM`, `parseDOM`, or `nodeView` hooks without directly touching ambient globals. They are still renderer-coupled through the current `NodeSpec`/`MarkSpec` contract:

```text
src/details/index.ts
src/extensions/emoji.ts
src/extensions/marks/code.ts
src/extensions/marks/em.ts
src/extensions/marks/font-family.ts
src/extensions/marks/font-size.ts
src/extensions/marks/highlight.ts
src/extensions/marks/line-height.ts
src/extensions/marks/link.ts
src/extensions/marks/strike.ts
src/extensions/marks/strong.ts
src/extensions/marks/subscript.ts
src/extensions/marks/superscript.ts
src/extensions/marks/text-color.ts
src/extensions/marks/underline.ts
src/extensions/math.ts
src/extensions/media.ts
src/extensions/mention.ts
src/extensions/nodes/blockquote.ts
src/extensions/nodes/bullet-list.ts
src/extensions/nodes/code-block.ts
src/extensions/nodes/doc.ts
src/extensions/nodes/figcaption.ts
src/extensions/nodes/hard-break.ts
src/extensions/nodes/heading.ts
src/extensions/nodes/horizontal-rule.ts
src/extensions/nodes/image-super.ts
src/extensions/nodes/inline-image.ts
src/extensions/nodes/list-item.ts
src/extensions/nodes/ordered-list.ts
src/extensions/nodes/paragraph.ts
src/extensions/nodes/table-cell.ts
src/extensions/nodes/table-header.ts
src/extensions/nodes/table-row.ts
src/extensions/nodes/table.ts
src/extensions/nodes/task-item.ts
src/extensions/nodes/task-list.ts
src/ruby/index.ts
src/tracked-changes/index.ts
```

These HTML tag-array functions are safe to execute in Node because they return data rather than DOM nodes. Their placement is still a portability concern: native renderers should not have to understand or carry HTML presentation metadata.

### 5. React and ReactDOM binding

The React entry is intentionally UI-specific:

- [`src/react/FountainEditor.tsx`](../src/react/FountainEditor.tsx) imports `EditorView` from `../view` and mounts an `HTMLDivElement`.
- [`src/react/ReactNodeView.tsx`](../src/react/ReactNodeView.tsx) imports `createRoot` from `react-dom/client` and creates DOM containers.
- [`FountainFloatingMenu.tsx`](../src/react/FountainFloatingMenu.tsx), [`FountainSuggestionMenu.tsx`](../src/react/FountainSuggestionMenu.tsx), and [`FountainToolbarPrimitives.tsx`](../src/react/FountainToolbarPrimitives.tsx) use DOM focus, bounds, viewport size, observers, scrolling, or computed CSS direction.
- [`FountainToolbar.tsx`](../src/react/FountainToolbar.tsx), [`ClipboardHistoryMenu.tsx`](../src/react/ClipboardHistoryMenu.tsx), and the slash/suggestion menu types expose browser element/file/event types.
- [`src/react/index.ts`](../src/react/index.ts) aggregates both state-oriented React hooks and ReactDOM components, so it is not a React Native entry.

React itself is not synonymous with the browser, but the published FountainJS React binding currently is a ReactDOM binding. A future React Native adapter should consume core directly and must not import `fountainjs-editor/react`.

### 6. Package and import graph

The package has no production DOM-parser dependency. Its browser coupling is through native Web APIs and optional React/ReactDOM peers; jsdom is a development dependency used by DOM unit tests.

The important aggregation edges are:

```text
src/index.ts
  -> ./core
  -> ./view
  -> ./extensions
  -> HTMLImporter / MarkdownImporter
  -> ./lean (which currently re-exports info-view)

src/extensions/index.ts
  -> HTMLImporter
  -> image-super -> image-node-view
  -> table-cell/table-header -> table-cell-view
  -> math/media/link/collaboration and browser plugin hooks

src/yjs/index.ts
  -> ../core
  -> ../extensions/collaboration
  -> ../extensions/extension
```

The package root remains import-safe in Node because these modules defer DOM operations until a view, parser, decoration factory, or node-view instance is used. Import safety is valuable, but it is weaker than a dependency-enforced headless core.

## What works in pure Node today

| Capability | Pure Node without jsdom? | Qualification |
| --- | --- | --- |
| Import ESM/CJS package root | **Yes** | Verified by package smoke and direct probe. Browser-only calls remain callable and will fail/no-op according to their guards. |
| Document nodes, marks, schema validation, JSON round-trip | **Yes** | Fully exercised by default Node tests and probe. Current schema specs carry unused DOM metadata. |
| Logical selections and mappings | **Yes** | Path/offset model is neutral. DOM selection synchronization is separate. |
| Transactions, transforms, commands, tables, lists, search | **Yes** | Covered extensively by `tests/core.test.ts` in Node. |
| History/undo/redo | **Yes** | Verified in Node. |
| Extension definition, composition, manifests, doctor/conformance | **Yes** | Verified in Node and package smoke. A TypeScript consumer still sees DOM-bearing core declarations. |
| JSON/text/Markdown/HTML serialization | **Yes** | HTML export is string-based; no DOM is constructed. |
| Plain Markdown import | **Yes** | Verified. Ruby/styled-span paths have dependency-free fallback behavior. |
| Arbitrary HTML import | **Yes, through the isolated server entry** | `ServerHTMLImporter` runs without browser globals or a shim; the root `HTMLImporter` remains the browser implementation. Schema-defined `parseHTML` rules are portable, while matching browser-only attribute callbacks are reported and skipped. |
| Collaboration adapter state/lifecycle | **Yes** | Adapter plugin runs headlessly. DOM presence decorations become empty without `document`. |
| Yjs document synchronization and local undo | **Yes** | Two-editor convergence was verified in pure Node. |
| Comments/versions/tracked-change models | **Mostly yes** | Their data operations are portable. Comments mixes in DOM presentation; tracked changes carries declarative HTML presentation. Separate headless entries are not yet enforced. |
| DOM editor, Web Component, ReactDOM UI | **No, by design** | These require a browser or compatible DOM host. |

## Smallest architecture change

Do not rewrite the engine or replace working DOM code. Establish an additive boundary in this order:

1. **Add an enforced headless source and package entry.** Introduce `fountainjs-editor/core` first; use `@fountain/core` only if/when the repository intentionally becomes a multi-package workspace. Export only model/schema semantics, transactions, logical selections, state/editor, core lifecycle plugins, commands, portable extensions, and JSON/text/Markdown serializers.
2. **Make core compile without `lib.dom`.** Add a no-DOM TypeScript configuration and an import rule/test that rejects `core -> view|react|dom` edges. This is the objective acceptance criterion—not folder naming.
3. **Separate semantic schema from DOM contributions.** Keep `NodeSpec`/`MarkSpec` semantic. Move `parseDOM`, `toDOM`, and `nodeView` to a `DOMNodeContribution`/`DOMMarkContribution` owned by the DOM adapter. Preserve existing web APIs through a compatibility composition layer for at least one release.
4. **Separate state plugins from DOM plugin props.** Keep state, transaction filtering/appending, and lifecycle in core. Put keyboard/input/clipboard/drop/click/decorations into a DOM view-props contract. A generic `Plugin<TState, TViewProps = unknown>` can minimize churn.
5. **Make widget payloads renderer-neutral.** Either move decorations entirely to the DOM layer or make mapped annotations generic and let DOM specialize the widget payload to `Node`. Do not require native renderers to manufacture DOM nodes.
6. **Split mixed extensions without changing their public convenience exports.** Collaboration, comments, Lean diagnostics, syntax highlighting, links, clipboard history, suggestions, paste rules, math, media, details, ruby, images, and resizable tables should each expose portable logic plus an optional DOM presenter/binding. Existing `StarterKit` can compose both for web users.
7. **Isolate HTML parsing.** **Runtime portion implemented:** the current
   `DOMParser` path remains browser-only and `fountainjs-editor/html/server`
   provides bounded DOM-free conversion plus `parseHTML` extension rules.
   Remaining ownership work is a future headless/core declaration boundary and
   an injectable Markdown embedded-HTML decoder.
8. **Add permanent Node gates.** Test the built headless entry in ESM and CommonJS with browser globals absent, typecheck a consumer with no `DOM` lib, and run Yjs convergence in the default Node environment. Keep browser matrices for the DOM adapter.

A useful target graph is:

```text
fountainjs-editor/core
  document model, schema semantics, selections, transactions, history,
  extension composition, collaboration contracts, portable serializers
          |
          +-- fountainjs-editor/dom
          |     DOM renderer, DOM schema contributions, node views,
          |     browser selection, input/IME, clipboard, layout
          |
          +-- fountainjs-editor/react
          |     ReactDOM binding over core + dom
          |
          +-- fountainjs-editor/yjs
          |     Yjs adapter over core collaboration contracts
          |
          +-- fountainjs-editor/headless
                server-safe starter kit and conversions
```

This can later become scoped packages (`@fountain/core`, `@fountain/dom`, and so on) without making package splitting a prerequisite for architectural correctness.

## Complexity, risk, and API/bundle impact

| Work | Complexity | Main risk | Expected impact |
| --- | --- | --- | --- |
| Add no-DOM compile/import gates and a conservative core entry | Low-medium | Discovering more transitive type leaks | New additive entry; smaller server bundle; no web behavior change. |
| Split schema DOM hooks and plugin view props with compatibility adapters | Medium-high | Extension API breakage and accidental web regressions | Potentially breaking if done abruptly. Use deprecated compatibility fields and migration tooling. Core declarations become genuinely portable. |
| Split mixed built-in extensions | Medium | Duplicate configuration or inconsistent convenience kits | More explicit composition; web `StarterKit` can preserve current behavior. Headless/native consumers avoid browser code. |
| DOM-free HTML parsing with equivalent safety/round-trip behavior | Medium-high | Sanitization differences, malformed HTML, tables/media/ruby edge cases | Unlocks full server conversion; likely adds an optional parser chunk/dependency. Must have adversarial fixtures. |
| React Native renderer/input | Very high | Native text input, IME, selection, accessibility, bidi, clipboard, and performance | Separate product-scale adapter; should not block web 1.0. |
| Flutter/SwiftUI/Compose adapters | Very high | Cross-language bridge/state synchronization plus each platform's text system | Likely months of platform work and dedicated maintainers. |

The current combined ESM root built at approximately 61.6 kB uncompressed during this audit. A headless entry should be materially smaller, but no size claim should be made until that entry exists and is measured. Keeping the existing root and `StarterKit` as compatibility surfaces limits migration cost.

The highest destabilization risk is changing schema and plugin contracts while the web editor is still hardening. The safe approach is additive: introduce neutral contracts and adapters, migrate built-ins, maintain compatibility shims, add conformance checks, and only then deprecate the mixed fields.

## Platform recommendation

| Platform | Current status | Recommendation |
| --- | --- | --- |
| Browser DOM | Working primary platform | Continue hardening now. Move it behind an explicit adapter without rewriting it. |
| Node.js/server-only | Core behavior and bounded HTML import work without a fake DOM; the public core declaration/package boundary is still mixed | Keep the server conversion gate permanent, then formalize a no-DOM core entry without rewriting the web editor. |
| Bun/Deno/serverless/Workers | Likely compatible for core algorithms, not certified | Certify after the no-DOM entry exists; avoid assuming Node built-ins. |
| Electron/Tauri | Browser renderer should work naturally | Treat as web deployment targets, not new editor engines. Validate packaging later. |
| React Native without WebView | Not supported | Preserve architectural possibility now; implement much later with a dedicated native input/render adapter. |
| Flutter without WebView | Not supported | Requires a Dart bridge/implementation plus native editing surface. Post-1.0 work. |
| iOS/SwiftUI | Not supported | Requires Swift bridge/implementation and TextKit/native input integration. Post-1.0 work. |
| Android/Compose | Not supported | Requires Kotlin bridge/implementation and Compose/native text integration. Post-1.0 work. |

## Final recommendation

Choose **A: design it into the architecture now, implement native later**.

The evidence does not justify rewriting the editor. FountainJS owns a portable model/transaction engine already, and the existing view folder is a good start. The work now is to turn an informal runtime property into an enforced dependency and package property:

> FountainJS core must compile, import, and execute without DOM libraries or browser globals; DOM behavior must enter through explicit parser, renderer, view-plugin, and input adapters.

Implement the server/headless boundary relatively soon because most of its engine already works and it creates immediate value. Deliberately postpone native UI renderers until the web editor, extension contract, and headless boundary are stable.

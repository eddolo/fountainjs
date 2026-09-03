# FountainJS API

## Document model

`Schema` compiles a `SchemaSpec` into node and mark types. Use `schema.node()`, `schema.text()`, and `schema.mark()` to create values with attribute defaults and validation. `schema.validate()` enforces ownership, attributes, atom rules, mark placement, and node content expressions at every editor-state boundary. `Node` values are immutable and provide `textContent`, `nodeSize`, `child()`, `descendants()`, `eq()`, and `toJSON()`.

`CoreSchemaSpec` includes paragraphs, headings, quotes, ordered/bullet/task lists, code blocks, tables, media, dividers, hard breaks, and common inline marks. Applications may extend or replace it with a compatible `SchemaSpec`.

## Extension composition

`defineExtension()` declares a named, framework-neutral module. It can contribute `nodes`, `marks`, `plugins`, commands with typed arguments, `formats`, and arbitrary host-owned `services`. A custom `NodeSpec` may provide a `nodeView` class to mount interactive product UI without depending on React.

Non-text nodes may implement `toText(node)`. That projection feeds
`Node.textContent`, `Editor.getText()`, plain-text export, previews, and explicit
context extraction without persisting view DOM. Math nodes use it to expose TeX;
custom atoms should return the text users would expect search or assistive tools
to read.

`composeExtensions(extensions, options?)` returns a `FountainKit` with the combined schema and registries. Duplicate extension names are rejected. Contribution conflicts throw by default; pass `{ onConflict: 'replace' }` only for an intentional override. `CoreExtension` is the built-in rich-document module and publishes its operations through `kit.commands`; `CoreSchemaSpec` remains its ready-made schema for simple setups. `StarterKit` combines the core, history, Markdown shortcuts, and the HTML/Markdown/JSON/text format modules.

```ts
const poll = defineExtension({
  name: 'poll',
  nodes: {
    poll: {
      group: 'block', atom: true,
      attrs: { question: { default: 'Your vote?' } },
      nodeView: class {
        dom = document.createElement('button');
        constructor(node) { this.dom.textContent = String(node.attrs.question); }
      },
    },
  },
});
```

### Custom NodeViews

A NodeView constructor receives the current model `node`, the owning
`EditorView` (typed as `unknown` at the schema boundary), and a live `getPath()`
function. Never cache the returned path: it changes when transactions insert or
remove content before the node.

```ts
class PollView {
  readonly dom = document.createElement('section')

  constructor(node, view, getPath) {
    this.render(node)
    this.dom.onclick = event => {
      if (!(event.target instanceof HTMLButtonElement)) return
      setNodeAttributes(view.editor, getPath(), { voted: true })
    }
  }

  update(node) { this.render(node); return true }
  selectNode() { this.dom.dataset.selected = 'true' }
  deselectNode() { delete this.dom.dataset.selected }
  stopEvent(event) { return event.target instanceof Node && this.dom.contains(event.target) }
  ignoreMutation(mutation) { return mutation.target instanceof Node && this.dom.contains(mutation.target) }
  destroy() { /* remove non-DOM subscriptions or resources */ }
}
```

The framework-neutral `NodeViewLike` lifecycle is:

- `dom` is the required outer element. Atomic node DOM is made non-editable.
- `contentDOM`, when present, is where FountainJS renders the node's model-owned
  children. Do not render another framework into that element.
- `update(nextNode)` returns `true` to keep the instance or `false` to recreate
  it. FountainJS reuses unchanged instances automatically and refreshes
  `contentDOM` without duplicating children.
- `selectNode()` and `deselectNode()` mirror a semantic `NodeSelection` into
  product UI. The editor still supplies its own non-colour selection marker.
- `stopEvent(event)` returning `true` keeps controls inside the NodeView out of
  the editor input, plugin, and selection pipelines. It does not cancel the
  control's own DOM listener.
- `ignoreMutation(record)` returning `true` declares a DOM mutation to be local
  UI state. Other mutations inside a NodeView are replaced from the immutable
  document so DOM cannot silently become persisted content.
- `destroy()` runs exactly when an instance is replaced, its node is deleted,
  or the editor view is destroyed.

NodeViews retain identity while mapped transactions move them. Node decorations
are reversible across reuse, and hook-generated DOM changes are excluded from
mutation recovery. During IME composition the observer waits for controlled
input to commit before reconciling the document.

### Mathematics extension

`MathExtension` is opt-in and does not change `StarterKit`. Compose it with the
starter extensions to add `inline_math` and `math_block` atom nodes:

```ts
const kit = composeExtensions([...StarterKit.extensions, MathExtension])
```

Both nodes store `{ latex, ariaLabel }`; TeX is capped at 20,000 characters and
remains the lossless source of truth. The commands are:

- `insertInlineMath(editor, latex?, ariaLabel?)`, which can use the current
  single-text selection when `latex` is omitted;
- `insertMathBlock(editor, latex, ariaLabel?)`;
- `setMathSource(editor, latex, ariaLabel?)` for a selected math node.

Typing `$...$` or `$$...$$` creates a semantic node, and immediate Backspace
restores the literal delimiters. Pasted math Markdown is parsed through an
independent paste rule. JSON is lossless; Markdown, safe HTML, and text
import/export preserve TeX source. HTML carries a separate stored label so the
computed accessible fallback does not change JSON on round trip.

Without a renderer, the NodeView exposes source in a `<code>` fallback with
`role="math"`, an accessible label, full-source hover text, and selection/error
states. `createMathExtension({ renderer, onRenderError })` accepts any
framework-neutral `MathRenderer`; the renderer must return a DOM `Node`, never
an HTML string. `createKaTeXRenderer(katex, options?)` adapts a caller-owned
[KaTeX installation](https://katex.org/docs/api) with combined HTML/MathML
output and `trust: false`. KaTeX is not loaded by the FountainJS core.

```ts
import katex from 'katex'

const math = createMathExtension({
  renderer: createKaTeXRenderer(katex),
  onRenderError: (error, latex) => report(error, { latex }),
})
const kit = composeExtensions([...StarterKit.extensions, math])
```

Set `inputRules: false` or `pasteRules: false` when the host wants commands
without delimiter conversion. `MAX_MATH_SOURCE_LENGTH` exposes the validation
limit.

### Lean extension and controller

`LeanExtension` composes with `StarterKit` without adding a network or process
dependency. Lean source uses the existing portable `code_block` node with
`language: "lean"`. It contributes `insertLeanBlock`, `setLeanSource`, and
`replaceLeanUnicode`; the last operation is also bound to unmodified Tab after
a recognized backslash abbreviation inside a Lean block. Pass
`unicodeInput: false` to `createLeanExtension` to disable that key behavior.

The composed `lean` service exposes `mode`, the selected provider when present,
and `createController(editor)`. A provider is optional. `LeanController` has
`inspectRequest`, `check`, `goals`, `hover`, `complete`, `cancel`, `dispose`,
`subscribe`, and `getSnapshot`. Requests contain only the current Lean block,
position, version, path, and a host-overridable URI.

`createLeanProvider` validates provider trust metadata and optional operations.
Its descriptor declares `local`, `remote`, `managed`, or `one-shot` mode and a
`device`, `self-hosted`, or `third-party` data destination. Source-only mode is
represented by the absence of a provider. See [LEAN.md](LEAN.md) for provider
examples, endpoint constraints, stale-result handling, and loopback security.

## Editor and state

`createEditor(config)` accepts:

- `schema`: required `SchemaSpec`.
- `content`: optional `Node` or portable `NodeJSON`.
- `state`: optional prebuilt `EditorState`.
- `plugins`: optional `Plugin[]`.
- `editable`: defaults to `true`.
- `onUpdate(state, transaction)`: called after a dispatched state change.

`Editor` exposes `state`, `editable`, `createTransaction()`, `dispatch()`,
`runCommandBatch()`, `subscribe()`, `getJSON()`, `getText()`, and `destroy()`.
`runCommandBatch()` is the low-level atomic transaction boundary used by command
chains; most applications should use `createCommandManager()` instead.

## Selections and transactions

FountainJS exposes an immutable selection hierarchy. Every selection has a
`kind` discriminator and a text projection (`path`, `from`, `endPath`, `to`)
for integrations that need readable content:

- `Selection` (`kind: 'text'`) is a caret or ordered text range.
- `NodeSelection` (`'node'`) owns one complete non-text node and its structural range.
- `GapSelection` (`'gap'`) is an exact insertion point between block nodes.
- `AllSelection` (`'all'`) owns the complete document.
- `CellSelection` (`'cell'`) owns a rectangular set of table cells in one table.

Text selections use document paths and character offsets:

```ts
new Selection([2, 0], 3, 8);
Selection.cursor([2, 0], 8);
Selection.range([2, 0], 3, [2, 2], 4);
```

Semantic selections are resolved against a document when they are created:

```ts
const node = new NodeSelection(editor.state.doc, [2]);
const gap = new GapSelection(editor.state.doc, topLevelPosition(editor.state.doc, 3));
const everything = new AllSelection(editor.state.doc);
const cells = new CellSelection(editor.state.doc, [4, 0, 1], [4, 2, 3]);

editor.dispatch(editor.createTransaction().setSelection(cells));
```

Constructors reject stale paths, inline gap positions, text-node targets, and
cell rectangles that leave their table. Transactions map all five kinds after
every step. A deleted node or cell selection recovers to a valid structural gap;
history restores the original semantic kind. Typing replaces node/all/cell
selections and inserts a new paragraph at a gap. Mark commands apply to the
selected node, document, or exact cell rectangle while retaining its selection.

Version `0.3` supports ordered ranges inside one text fragment, across differently marked inline fragments, across top-level text blocks, and through nested text leaves. Top-level paragraph replacement joins the surviving prefix and suffix into one block; nested custom structures preserve their topology while transforming the selected text leaves.

```ts
const transaction = editor.state.createTransaction()
  .replaceText([0, 0], 0, 4, 'Fresh')
  .setSelection(Selection.cursor([0, 0], 5))
  .setMeta('source', 'my-feature');

editor.dispatch(transaction);
```

Transforms include `replace`, `replaceNode`, `insertText`, `replaceText`, `replaceTextRange`, `addMark`, `removeMark`, and `setNodeAttrs`.

Every document-changing step contributes a `StepMap` to
`transaction.mapping`. A map describes changed structural ranges as
`start, oldSize, newSize` triples and exposes `map()`, `mapResult()`, and
`invert()`. `Mapping` composes multiple step maps. FountainJS automatically
maps the transaction selection after every applied step, including path
changes caused by inserted blocks or text-fragment splits.

Use `textPointToPosition()` and `positionToTextPoint()` at integration
boundaries that need stable structural positions. `nodeRangeAtPath()` returns
the structural range occupied by a node. These APIs are the foundation for
decorations, collaborative cursors, tracked changes, and proposal rebasing;
they do not by themselves provide collaboration.

`SelectionBookmark.fromSelection(document, selection)` captures structural
positions without retaining document paths. Call `.map(stepMapOrMapping)` as
changes arrive and `.resolve(laterDocument)` when the selection is needed again.
If the original range or block was deleted, resolution returns the nearest valid
cursor instead of a stale path. `SelectionBookmark.cursor(position, association)`
is available when an integration already owns a structural position.

## Decorations

Decorations add view-only presentation without changing document JSON:

```ts
const reviewDecorations = DecorationSet.create(editor.state.doc, [
  Decoration.inline(4, 12, { class: 'review-range' }, { key: 'review' }),
  Decoration.node(0, 18, { 'data-reviewed': true }, { key: 'reviewed-block' }),
  Decoration.widget(12, () => {
    const caret = document.createElement('span');
    caret.className = 'remote-caret';
    caret.setAttribute('aria-label', 'Ada\'s cursor');
    return caret;
  }, { key: 'ada', side: 1 }),
]);
```

`DecorationSet` is immutable and exposes `create`, `find`, `map`, `add`,
`remove`, and `eq`. A stateful plugin normally maps its set through
`transaction.mapping` and returns it from `props.decorations`. Inline and node
decoration attributes pass through the DOM renderer's attribute safety rules.
Widget contents are non-editable and ignored by selection-offset calculation.
Partially overlapping inline ranges are split at deterministic boundaries and
nested only for the shared segment; mapping preserves both ranges across edits.

## AI review

`AIController(editor, adapter)` controls the propose/review/apply lifecycle.

- `inspectRequest(options)` builds the exact `AIRequestEnvelope` without calling the adapter.
- `suggest(options)` calls the adapter and records a pending `AISuggestion` without editing.
- `accept(suggestion)` checks the target for staleness and applies one transaction.
- `reject(suggestion)` records the decision without editing.
- `cancel()` aborts an active adapter call.
- `subscribe()` and `getSnapshot()` form an external store for UI integrations.

`AISuggestOptions` accepts `action`, optional `instructions`, `scope`, and `includeDocumentContext`. Scope defaults to `auto`: selected text when a range exists, otherwise the current text node. Document context is disabled by default.

AI review deliberately accepts only `Selection` text carets/ranges. Node, gap,
all-document, and cell selections must be converted by an explicit host tool;
the controller refuses them rather than silently flattening structured content.

An `AIAdapter` implements one method:

```ts
interface AIAdapter {
  transform(
    request: AIRequestEnvelope,
    context: { signal: AbortSignal },
  ): Promise<string | {
    replacement: string;
    explanation?: string;
    model?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }>;
}
```

`MCPAIAdapter` is the included bridge to `MCPIntegration`. `createAIAdapter(fn)` is a convenience for custom adapters.

## Commands

Commands return whether they handled the operation:

- `insertText`, `insertPlainText`, `insertHardBreak`, `deleteSelection`, `deleteBackward`, and `deleteForward`
- `selectText`, `selectNode`, `selectGap`, `selectAll`, `selectCells`, `selectAdjacentNode`, and `extendCellSelection`
- `setContent`, `setBlockType`, and `insertBlock`
- `insertNode`, `insertImage`, `insertQuote`, `insertList`, and `insertTable`
- `isMarkActive`, `toggleMark`, `setMark`, `unsetMark`, `setLink`, and `unsetLink`
- `setTextAlignment`, `splitBlock`, `joinBackward`, and `joinForward`
- `setNodeAttributes`, `removeNode`, `moveBlock`, `toggleTaskItem`, `indentListItem`, and `outdentListItem`
- `addTableRow`, `deleteTableRow`, `addTableColumn`, `deleteTableColumn`, and `moveTableCell`
- `undo`, `redo`, `canUndo`, `canRedo`, and `closeHistory`

Bind any extension registry once to get immediate, chained, and dry-run command
surfaces:

```ts
const manager = createCommandManager(editor, kit.commands);

manager.commands.insertText('Now');
manager.chain().insertText(' one').toggleMark('strong').run();

if (manager.can().insertImage({ src: '/cover.jpg' })) {
  manager.commands.insertImage({ src: '/cover.jpg' });
}
```

A chain runs against temporary state. Every queued command sees the preceding
command's result; a `false` result or exception restores the starting state. A
successful chain is recomposed into one transaction, producing one subscriber
notification and one history entry. `can()` uses the same mechanism in permanent
dry-run mode and emits no update. Extension commands must keep effects inside
editor transactions for dry runs to be side-effect-free. For commands named
`run`, `command`, or `chain`, use the named `.command(name, ...args)` fallback.

`view.commandManager(kit.commands)` returns the same manager plus a view-aware
`focus('current' | 'start' | 'end')` command. In a `can()` check, focus positions
are evaluated against temporary selection state without focusing the DOM. A live
focus chain commits its selection and edits atomically, then keeps the DOM view
focused.

`findText(document, query, options?)` returns model ranges even when a match crosses marked text fragments. `selectNextMatch()` wraps through matches, and `replaceAllText()` changes all matches in one undoable transaction.

## Plugins

A `Plugin` can own immutable state, contribute a `DecorationSet`, and intercept `keydown`, `beforeinput`, text input, paste, drop, and click events. It can also receive editor create/destroy lifecycle callbacks. Returning `true` from an input hook tells the DOM view that the extension handled the event. Use `PluginKey.get(editor.state)` to read plugin state. `historyPlugin` and `markdownShortcutsPlugin` are included.

### History

`historyPlugin` uses a 100-group, 500ms default. Browser typing,
composition commits, and repeated backward/forward deletion are grouped only
while the selection remains adjacent. Moving the selection, switching input
kind, waiting beyond the delay, or calling `closeHistory(editor)` starts a new
undo group. Chains and multiline paste already arrive as one transaction.

```ts
const history = createHistoryPlugin({
  depth: 250,
  newGroupDelay: 750,
})

const editor = createEditor({ schema, plugins: [history] })
closeHistory(editor) // the next edit starts its own group
```

`addToHistory: false` excludes a transaction. The current history stores local
document snapshots; it is not yet safe for concurrent remote changes. The
collaboration adapter will supply rebased, origin-aware undo rather than
silently treating remote edits as local history.

### Input rules

`inputRulesPlugin({ rules })` turns typed patterns into extension-owned
transactions. Rules run in order and the first handler returning a transaction
wins. The literal text that triggered a transformation is retained so an
immediate Backspace, or `undoInputRule(editor)`, restores what the user typed.
Pass a dedicated `PluginKey<InputRulesState>` as `key` when independently
packaged rule sets coexist; their snapshots and Backspace undo then remain
isolated. `undoInputRule(editor, key?)` can target either set. `MathExtension`
uses this path alongside the starter Markdown shortcuts.

```ts
const punctuation = inputRulesPlugin({
  rules: [
    textInputRule({ find: /-- $/, replace: '—', name: 'em-dash' }),
  ],
});
```

`InputRule` supports custom transaction handlers. `textInputRule` is the
convenience helper for textual replacements. The supplied Markdown rules are
built with the same public API and cover headings, bullet/ordered/task lists,
quotes, and language-labelled fenced code blocks.

### Paste rules

`pasteRulesPlugin({ rules })` evaluates rules in registration order before the
view's normal HTML/plain-text importer. Each `PasteRule` receives the complete
plain text, HTML, clipboard event, current editor state, and every regular-
expression match. Its handler may return a `Transaction`, schema `Node`,
transformed string, `true` after handling directly, or `false`/`null` to let the
next rule try.

```ts
const pasteBehaviour = pasteRulesPlugin({
  rules: [
    textPasteRule({ find: /--/g, replace: '—' }),
    markPasteRule({ find: /\*\*([^*]+)\*\*/g, mark: 'strong' }),
    wrappingPasteRule({ find: /^> /m, node: 'blockquote' }),
  ],
});
```

The text helper replaces every match across the complete paste. The mark helper
removes delimiters and marks every matched fragment on every line; `contentGroup`
selects the captured content and `getAttributes` supplies mark attributes. The
wrapping helper builds paragraphs and asks the schema to validate the requested
container, returning `false` when the node cannot contain them. A custom rule can
return its own transaction or document for more specialized structures.

## DOM view

`new EditorView(mount, editor, options?)` mounts a `contenteditable` view. Options include `ariaLabel`, `className`, `placeholder`, safe string attributes, an optional `imageUpload(file, context)` adapter, an inline-image byte limit, and error handling. Without an upload adapter, local images up to the configured limit are embedded as data URLs. The view supports multi-block selection, IME composition, multiline/plain and rich-HTML paste, image upload/paste/drop, task checkboxes, Tab/Shift-Tab list indentation and table navigation, and extension NodeViews. Call `focus('current' | 'start' | 'end')`, `commandManager()`, and `destroy()` on the view as needed.

The controlled `beforeinput` path covers normal/replacement text, composition
commit orderings, paragraph and line breaks, forward/backward deletion,
cut/drag deletion, browser history undo/redo, and native formatting input types.
Rich HTML paste is parsed into validated nodes rather than flattened to text.
Logical model offsets remain stable for bidirectional and nested content.
Selecting a top-level block makes it natively draggable; dropping before or
after another block calls the same undoable `moveBlock` command available as a
keyboard-accessible host control.

Selection input is available without a framework: Ctrl/Cmd+A creates an
`AllSelection`; clicking an atomic node selects it; Left/Right at an adjacent
text boundary enters and leaves an atomic `NodeSelection`; Shift-click extends
a cell rectangle from the current cell; and Alt+Shift+Arrow extends the same
rectangle using only the keyboard. Node, cell, and gap states use outlines,
inset borders, or insertion rules in addition to colour. The view mirrors each
state into a native DOM range while the model selection remains authoritative.
Hosts can add their own labelled controls around `selectNode`, `selectGap`, or
`selectCells` when a product needs a more explicit screen-reader workflow.

`registerFountainElement(options?)` registers `<fountain-editor>` as a standards-based Custom Element. Configure a schema and plugins once, assign document JSON through its `value` property, and listen for the bubbling `fountain-change` event. Event detail includes `state`, `transaction`, and portable `value` JSON.

## Import and export

The root package exports `HTMLImporter`, `MarkdownImporter`, `HTMLExporter`, `MarkdownExporter`, `JSONExporter`, and `TextExporter`. Importers receive a `Schema`; exporters accept an `EditorState` or `Node`.

## React

Import React bindings from `fountainjs-editor/react`:

- `useFountain` and `useFountainState`
- `FountainEditor`, `FountainToolbar`, and `FountainComposer`
- `Navigator` and `useNavigatorState`
- `FountainAIReview` and `useAIControllerState`
- `createReactNodeView(Component, options?)` and `ReactNodeViewProps`

`createReactNodeView` adapts a React component without importing React from the
framework-neutral package root. Components receive the current `node`, semantic
`selected` state, the `editor`, live `getPath()`, `updateAttributes()`, and
`deleteNode()` helpers. Pass `contentDOMTagName` for a non-atomic node; the
adapter renders React-owned controls and model-owned editable children into
separate sibling containers.

```tsx
const CounterView = createReactNodeView(({ node, selected, updateAttributes }) => (
  <button
    aria-pressed={selected}
    onClick={() => updateAttributes({ count: Number(node.attrs.count) + 1 })}
  >
    Count {String(node.attrs.count)}
  </button>
), { tagName: 'section', className: 'counter-node' })
```

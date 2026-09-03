# FountainJS API

## Document model

`Schema` compiles a `SchemaSpec` into node and mark types. Use `schema.node()`, `schema.text()`, and `schema.mark()` to create values with attribute defaults and validation. `schema.validate()` enforces ownership, attributes, atom rules, mark placement, and node content expressions at every editor-state boundary. `Node` values are immutable and provide `textContent`, `nodeSize`, `child()`, `descendants()`, `eq()`, and `toJSON()`.

`CoreSchemaSpec` includes paragraphs, headings, quotes, ordered/bullet/task lists, code blocks, tables, media, dividers, hard breaks, and common inline marks. Applications may extend or replace it with a compatible `SchemaSpec`.

## Extension composition

`defineExtension()` declares a named, framework-neutral module. It can contribute `nodes`, `marks`, `plugins`, commands with typed arguments, `formats`, and arbitrary host-owned `services`. A custom `NodeSpec` may provide a `nodeView` class with `dom`, optional `contentDOM`, and `destroy()` to mount interactive widgets without depending on React.

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

## Editor and state

`createEditor(config)` accepts:

- `schema`: required `SchemaSpec`.
- `content`: optional `Node` or portable `NodeJSON`.
- `state`: optional prebuilt `EditorState`.
- `plugins`: optional `Plugin[]`.
- `editable`: defaults to `true`.
- `onUpdate(state, transaction)`: called after a dispatched state change.

`Editor` exposes `state`, `editable`, `createTransaction()`, `dispatch()`, `subscribe()`, `getJSON()`, `getText()`, and `destroy()`.

## Selections and transactions

`Selection` addresses text with document paths and character offsets:

```ts
new Selection([2, 0], 3, 8);
Selection.cursor([2, 0], 8);
Selection.range([2, 0], 3, [2, 2], 4);
```

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

## AI review

`AIController(editor, adapter)` controls the propose/review/apply lifecycle.

- `inspectRequest(options)` builds the exact `AIRequestEnvelope` without calling the adapter.
- `suggest(options)` calls the adapter and records a pending `AISuggestion` without editing.
- `accept(suggestion)` checks the target for staleness and applies one transaction.
- `reject(suggestion)` records the decision without editing.
- `cancel()` aborts an active adapter call.
- `subscribe()` and `getSnapshot()` form an external store for UI integrations.

`AISuggestOptions` accepts `action`, optional `instructions`, `scope`, and `includeDocumentContext`. Scope defaults to `auto`: selected text when a range exists, otherwise the current text node. Document context is disabled by default.

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

- `insertText`, `insertPlainText`, `insertHardBreak`, `deleteSelection`, `deleteBackward`, `deleteForward`, and `selectText`
- `setContent`, `setBlockType`, and `insertBlock`
- `insertNode`, `insertImage`, `insertQuote`, `insertList`, and `insertTable`
- `isMarkActive`, `toggleMark`, `setMark`, `unsetMark`, `setLink`, and `unsetLink`
- `setTextAlignment`, `splitBlock`, `joinBackward`, and `joinForward`
- `setNodeAttributes`, `removeNode`, `moveBlock`, `toggleTaskItem`, `indentListItem`, and `outdentListItem`
- `addTableRow`, `deleteTableRow`, `addTableColumn`, `deleteTableColumn`, and `moveTableCell`
- `undo`, `redo`, `canUndo`, and `canRedo`

`findText(document, query, options?)` returns model ranges even when a match crosses marked text fragments. `selectNextMatch()` wraps through matches, and `replaceAllText()` changes all matches in one undoable transaction.

## Plugins

A `Plugin` can own immutable state, contribute a `DecorationSet`, and intercept `keydown`, `beforeinput`, text input, paste, drop, and click events. It can also receive editor create/destroy lifecycle callbacks. Returning `true` from an input hook tells the DOM view that the extension handled the event. Use `PluginKey.get(editor.state)` to read plugin state. `historyPlugin` and `markdownShortcutsPlugin` are included.

## DOM view

`new EditorView(mount, editor, options?)` mounts a `contenteditable` view. Options include `ariaLabel`, `className`, `placeholder`, safe string attributes, an optional `imageUpload(file, context)` adapter, an inline-image byte limit, and error handling. Without an upload adapter, local images up to the configured limit are embedded as data URLs. The view supports multi-block selection, IME composition, multiline/plain and rich-HTML paste, image upload/paste/drop, task checkboxes, Tab/Shift-Tab list indentation and table navigation, and extension NodeViews. Call `focus()` and `destroy()` on the view as needed.

`registerFountainElement(options?)` registers `<fountain-editor>` as a standards-based Custom Element. Configure a schema and plugins once, assign document JSON through its `value` property, and listen for the bubbling `fountain-change` event. Event detail includes `state`, `transaction`, and portable `value` JSON.

## Import and export

The root package exports `HTMLImporter`, `MarkdownImporter`, `HTMLExporter`, `MarkdownExporter`, `JSONExporter`, and `TextExporter`. Importers receive a `Schema`; exporters accept an `EditorState` or `Node`.

## React

Import React bindings from `fountainjs-editor/react`:

- `useFountain` and `useFountainState`
- `FountainEditor`, `FountainToolbar`, and `FountainComposer`
- `Navigator` and `useNavigatorState`
- `FountainAIReview` and `useAIControllerState`

# FountainJS API

## Document model

`Schema` compiles a `SchemaSpec` into node and mark types. Use `schema.node()`, `schema.text()`, and `schema.mark()` to create values with attribute defaults and validation. `Node` values are immutable and provide `textContent`, `nodeSize`, `child()`, `descendants()`, `eq()`, and `toJSON()`.

`CoreSchemaSpec` includes paragraphs, headings, quotes, ordered/bullet/task lists, code blocks, tables, media, dividers, hard breaks, and common inline marks. Applications may extend or replace it with a compatible `SchemaSpec`.

## Extension composition

`defineExtension()` declares a named, framework-neutral module. It can contribute `nodes`, `marks`, `plugins`, `commands`, `formats`, and arbitrary host-owned `services`.

`composeExtensions(extensions, options?)` returns a `FountainKit` with the combined schema and registries. Duplicate extension names are rejected. Contribution conflicts throw by default; pass `{ onConflict: 'replace' }` only for an intentional override. `CoreExtension` is the built-in rich-document module, while `CoreSchemaSpec` remains its ready-made schema for simple setups.

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

Version `0.3` supports a range inside one text fragment or across adjacent inline text fragments that share a parent. This makes selections across mark boundaries editable without flattening the whole block. Cross-block ranges remain roadmap work.

```ts
const transaction = editor.state.createTransaction()
  .replaceText([0, 0], 0, 4, 'Fresh')
  .setSelection(Selection.cursor([0, 0], 5))
  .setMeta('source', 'my-feature');

editor.dispatch(transaction);
```

Transforms include `replace`, `insertText`, `replaceText`, `replaceTextRange`, `addMark`, `removeMark`, and `setNodeAttrs`.

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

- `insertText`, `deleteSelection`, and `selectText`
- `setContent`, `setBlockType`, and `insertBlock`
- `isMarkActive` and `toggleMark`
- `splitBlock` and `joinBackward`
- `undo`, `redo`, `canUndo`, and `canRedo`

## Plugins

A `Plugin` can own immutable state and contribute input hooks. Use `PluginKey.get(editor.state)` to read plugin state. `historyPlugin` and `markdownShortcutsPlugin` are included.

## DOM view

`new EditorView(mount, editor, options?)` mounts a `contenteditable` view. Options include `ariaLabel`, `className`, `placeholder`, and safe string attributes. Call `focus()` and `destroy()` on the view as needed.

`registerFountainElement(options?)` registers `<fountain-editor>` as a standards-based Custom Element. Configure a schema and plugins once, assign document JSON through its `value` property, and listen for the bubbling `fountain-change` event. Event detail includes `state`, `transaction`, and portable `value` JSON.

## Import and export

The root package exports `HTMLImporter`, `MarkdownImporter`, `HTMLExporter`, `MarkdownExporter`, `JSONExporter`, and `TextExporter`. Importers receive a `Schema`; exporters accept an `EditorState` or `Node`.

## React

Import React bindings from `fountainjs-editor/react`:

- `useFountain` and `useFountainState`
- `FountainEditor`, `FountainToolbar`, and `FountainComposer`
- `Navigator` and `useNavigatorState`
- `FountainAIReview` and `useAIControllerState`

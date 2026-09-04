# Slash commands

FountainJS provides a framework-neutral slash-command registry and an optional
React menu. It is not a hard-coded list inside the editor: built-in commands,
product modules, and remotely loaded sources all use the same public registry.

## Add the module

```ts
import { CoreExtension, composeExtensions, createEditor } from 'fountainjs-editor'
import {
  SlashCommandRegistry,
  createSlashCommandExtension,
} from 'fountainjs-editor/document-utilities'

const registry = new SlashCommandRegistry()

registry.registerItems('product-blocks', [{
  id: 'callout',
  label: 'Callout',
  description: 'Insert a highlighted product note.',
  aliases: ['notice', 'aside'],
  icon: '!',
  group: 'Product',
  isAvailable: editor => Boolean(editor.state.schema.nodes.callout),
  run: ({ editor }) => insertProductCallout(editor),
}])

const slash = createSlashCommandExtension({ registry })
const kit = composeExtensions([CoreExtension, productBlocks, slash])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })
```

The default configuration opens when `/` is typed at the start of a line. It
allows multi-word searches and includes 11 ordinary registry items: text,
headings 1–3, bullet/numbered/task lists, quote, code block, divider, and table.
Set `includeDefaultItems: false` when a product wants to own the whole list.
`trigger`, `startOfLine`, `allowSpaces`, `allowedPrefixes`, and `maximumItems`
configure matching without changing the registry or UI contract.

## Item contract

Every `SlashCommandItem` has a stable `id`, visible `label`, and synchronous
`run({ editor, match })` command. The following fields are optional:

- `description` and `icon` are presentation metadata;
- `group` lets a UI organize related items;
- `aliases` participate in search without changing the visible label;
- `priority` breaks ties after match quality;
- `disabled` leaves an item visible but unavailable;
- `isAvailable(editor)` hides an item when its schema or product state cannot
  support the action.

Search is case-insensitive and treats hyphens and underscores as spaces. Exact
label/id/alias matches rank before prefixes, word prefixes, and general
multi-term matches. Equal matches preserve source order.

## Runtime and asynchronous sources

`SlashCommandRegistry.register(id, source)` accepts a synchronous or
asynchronous source. It receives the active editor, literal match, current
query, and an `AbortSignal`:

```ts
const removeTemplates = registry.register(
  'workspace-templates',
  async ({ query, signal }) => {
    const templates = await workspace.searchTemplates(query, { signal })
    return templates.map(template => ({
      id: `template-${template.id}`,
      label: template.title,
      description: template.summary,
      group: 'Workspace',
      run: ({ editor }) => insertTemplate(editor, template.document),
    }))
  },
)

// Unregister when the owning product module is disabled.
removeTemplates()
```

Registering or removing a source refreshes an open menu. Query changes abort
obsolete requests, and request identities prevent late responses from
overwriting current results. Source IDs and item IDs must be unique; duplicate
or malformed contributions fail explicitly instead of silently replacing an
unrelated command.

## Atomic execution

Until acceptance, `/query` remains ordinary document text with a view-only
decoration. Accepting an item runs one atomic command batch:

1. remove the literal query;
2. place the cursor at its original start;
3. run the registered command;
4. apply plugin transaction filters;
5. commit once or restore the complete pre-command state.

If the command returns `false`, throws, or the composed transaction is refused,
the query and document are restored. Successful actions therefore create one
observable update and one undo boundary. Registry state and search results are
transient and never enter JSON, HTML, Markdown, or text output.

## Headless and React UI

Any surface can subscribe to the shared controller:

```ts
const service = kit.services.slashCommands
const controller = service.getController(editor)

controller.subscribe(snapshot => renderMyMenu(snapshot))
controller.move(1)
controller.accept()
controller.dismiss()
```

ArrowUp/ArrowDown wrap across enabled results. Enter accepts; Escape and Tab
dismiss without deleting typed text. Pointer/touch hosts call `select(index)`
or `accept(index)`.

React applications can use the supplied grouped listbox:

```tsx
<FountainComposer ref={editorRef} editor={editor} />
<FountainSlashCommandMenu
  editor={editor}
  service={kit.services.slashCommands}
  anchorElement={editorRef.current?.view?.dom}
/>
```

The component is exported only from `fountainjs-editor/react`. It uses the
shared viewport-aware suggestion positioning, keeps focus in the editor, and
links the contenteditable to its listbox with `aria-controls`, `aria-expanded`,
`aria-haspopup`, `aria-autocomplete`, and `aria-activedescendant`. Groups use
labelled `role="group"` containers; items use `role="option"`.

## Lifecycle and boundaries

The registry owns registrations, not application data or authorization. A
source that searches private data must enforce access in the host service and
must honor the provided abort signal. A command that uploads, navigates, opens
a dialog, or invokes a remote service remains product-owned.

Destroying the editor destroys its controller, unsubscribes it from registry
changes, and aborts pending source requests. Multiple editors may share one
registry intentionally, or use separate registries for isolated products.

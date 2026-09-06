# FountainJS API

## Platform-neutral package entry

`fountainjs-editor/core` is the enforced no-DOM engine entry. It exports the
document model and schema, logical selections, transactions and mappings,
editor state, plugins and lifecycle, extension composition, command manager,
history, collaboration contracts and `createCoreCollaborationExtension()`,
portable exporters/importer, migrations, stable node IDs, and structured
attributes. Its public declarations compile with only `ES2023`, and its source
graph is forbidden from importing the DOM view, React, or browser HTML parser.

The package root remains the compatible browser convenience entry.
`createCollaborationExtension()` adds browser caret/range decoration;
`createCoreCollaborationExtension()` keeps the same adapter lifecycle and
remote-update commands without a presence renderer. Parse arbitrary HTML on a
server with `fountainjs-editor/html/server`. See
[HEADLESS_CORE.md](HEADLESS_CORE.md) for examples, exclusions, and verification.

## Document model

`Schema` compiles a `SchemaSpec` into node and mark types. Use `schema.node()`, `schema.text()`, and `schema.mark()` to create values with attribute defaults and validation. `schema.validate()` enforces ownership, attributes, atom rules, mark placement, and node content expressions at every editor-state boundary. `Node` values are immutable and provide `textContent`, `nodeSize`, `child()`, `descendants()`, `eq()`, and `toJSON()`.

Marks belong to inline content, including atomic inline nodes—not only text.
Pass them as the fifth argument to `schema.node(...)`, or use
`inlineNode.withMarks(marks)`. Block nodes carrying marks fail schema
validation. JSON, DOM rendering, browser/server HTML, Markdown's supported
inline-node forms, and Yjs preserve this distinction.

`CoreSchemaSpec` includes paragraphs, headings, quotes, ordered/bullet/task lists, code blocks, tables, block/inline images, dividers, hard breaks, and common inline marks. `StarterKit` adds the independently composable native-media module and behavior/format extensions. Applications may extend or replace either with a compatible `SchemaSpec`.

## Extension composition

`defineExtension()` declares a named, framework-neutral module. It can contribute `nodes`, `marks`, `plugins`, commands with typed arguments, `formats`, and arbitrary host-owned `services`. A custom `NodeSpec` may provide a `nodeView` class to mount interactive product UI without depending on React. Independently published extensions declare a `manifest` with their SemVer package version, `FOUNTAIN_EXTENSION_API_VERSION`, optional descriptive metadata, and ordered runtime dependencies in `requires`. Invalid metadata and unsupported API versions fail before the extension can enter a kit.

Node and mark attribute arrays/plain objects are cloned and recursively frozen
at construction, so callers cannot mutate a document through a retained nested
reference. Per-attribute validators handle local values; `NodeSpec.validate(node)`
can enforce relationships across attributes, such as requiring an embed's
declared provider to match its canonical source. Both checks run during direct
construction, JSON import, and full schema validation.

Non-text nodes may implement `toText(node)`. That projection feeds
`Node.textContent`, `Editor.getText()`, plain-text export, previews, and explicit
context extraction without persisting view DOM. Math nodes use it to expose TeX;
custom atoms should return the text users would expect search or assistive tools
to read.

`NodeSpec` and `MarkSpec` may provide ordered `parseHTML` rules for safe,
browser/server HTML import. Each `HTMLParseRule` has a CSS `tag` selector, optional numeric
`priority`, optional `getAttrs(element)`, and—for nodes—an optional
`contentElement` selector. `getAttrs` returns portable attributes, `null` for
defaults, or `false` to decline the match. Selectors and callbacks are contained
at the format boundary; created values pass normal attribute, node-invariant,
content-expression, and full-document validation. `HTMLParseElement` exposes
only tag/text/attribute/dataset/inline-style data. Browser-only `parseDOM`
rules and `DOMParseRule.getAttrs(HTMLElement)` remain compatible with the root
`HTMLImporter`; a server import reports a matching callback unless a portable
rule is supplied. `toDOM` is the matching
export contract for both nodes and marks. A node serializer may read the
optional `{ document, path }` context when presentation depends on document
order. Set `contextualDOM: true` for such a node so top-level reconciliation
re-renders an otherwise unchanged ancestor after another part of the document
changes; the context and flag affect only presentation, never JSON. Generic output accepts semantic HTML
but strips executable tags, event/srcdoc attributes, unsafe URL protocols, and
dangerous CSS URL/expression forms. See [FORMATS.md](FORMATS.md#html).

`composeExtensions(extensions, options?)` returns a `FountainKit` with the combined schema and registries. Duplicate extension names are rejected. Manifest requirements must already appear earlier in the list. Contribution conflicts throw by default; pass `{ onConflict: 'replace' }` only for an intentional override. `CoreExtension` is the built-in rich-document module and publishes its operations through `kit.commands`; `CoreSchemaSpec` remains its ready-made schema for simple setups. `StarterKit` combines the core, history, Markdown shortcuts, safe link behavior, live syntax highlighting, automatic table repair, a guaranteed trailing editable block, and the HTML/Markdown/JSON/text format modules.

The isolated `fountainjs-editor/testing` entry exports
`checkExtensionConformance()` and `assertExtensionConformance()`. They verify
manifest/API compatibility, immutable definitions, composition, fixture
round-trips, command dry-run isolation, expected executable behavior, and
teardown without mounting a framework or DOM view.
`checkExtensionCompatibility()` and `assertExtensionCompatibility()` inspect an
ordered installation and aggregate all manifest, dependency, duplicate-name,
and contribution-collision problems; the same inspection is available through
`npx fountainjs-editor doctor <extensions-module>`. Generate a complete package
with `npx fountainjs-editor create-extension <directory>`, and see the
[extension authoring and compatibility guide](EXTENSIONS.md) for the manifest,
fixture, framework, versioning, migration, failure, and publishing contracts.

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

### Link behavior

`StarterKit` includes `LinkBehaviorExtension` alongside the core `link` mark.
It recognizes complete web and email addresses as the user types, links a text
selection when a URL is pasted, inserts linked text when a URL is pasted at a
caret, and keeps trailing punctuation outside the link. It accepts `https`,
`http`, `mailto`, `tel`, root-relative, hash, dot-relative, safe path-relative,
and query-relative destinations;
unsafe schemes, NUL characters, invalid attributes, and overlong URLs are
rejected.

Use `createLinkBehaviorExtension(options)` when a product needs to disable
`autolink` or `linkOnPaste`, choose the default target, add a normalization or
validation policy, or handle activation. Editor-surface clicks never navigate
implicitly: they call `onActivate` and emit a bubbling, composed
`fountain-link-activate` event with an `ActiveLink`. The host can show a card,
open a trusted destination, or do nothing.

`getActiveLink(editor)` returns the complete contiguous link surrounding a
caret or selection start. `editLink` applies a link to selected text, edits that
complete active link, or inserts caller-supplied visible text at an empty caret.
`removeLink` likewise handles both a selection and a collapsed caret. The React
toolbar uses these same public functions for add, preview, title, target, edit,
and remove UI.

```ts
const links = createLinkBehaviorExtension({
  defaultTarget: '_self',
  validate: (href, context) => context.source !== 'paste' || !href.includes('blocked.example'),
  onActivate: ({ href }) => showLinkPreview(href),
})
const kit = composeExtensions([CoreExtension, links])
```

### Lists

`toggleList(editor, kind)` wraps a top-level paragraph/heading selection as a
`bullet`, `ordered`, or `task` list. On an existing list range it converts only
the selected items and preserves the list segments on either side; invoking the
active kind lifts the range out. Ordered segments retain their correct numeric
start after a split.

`indentListItem(editor, nestedKind?)` and `outdentListItem(editor)` transform
every selected item when both endpoints share a list. Passing `nestedKind`
creates mixed hierarchy such as an ordered list inside a bullet item. Lifting a
middle nested range keeps earlier children under the parent and reparents later
children under the final lifted item, preserving document order. Tab and
Shift+Tab use the same commands, and an impossible Tab is not trapped. Enter
splits an item (or exits an empty one); Backspace and Delete join item/list
boundaries, including adjacent top-level lists and following paragraphs.

HTML and Markdown importers preserve direct item text, inline marks, ordered
starts, task checks, continuation paragraphs, and mixed nested list types. The
Markdown exporter emits matching indentation, so supported nested documents
round-trip through the format adapter.

### Collapsible details

The optional `fountainjs-editor/details` entry exports `DetailsExtension`.
Compose it alongside `StarterKit` to add a block `details` node with one required
`details_summary` followed by one or more body blocks. The summary accepts marked
inline content; the body accepts every block in the composed schema.

```ts
import {
  DetailsExtension,
  insertDetails,
  wrapInDetails,
} from 'fountainjs-editor/details'

const kit = composeExtensions([...StarterKit.extensions, DetailsExtension])
insertDetails(editor, { summary: 'Deployment notes', open: true })
wrapInDetails(editor, { summary: 'Background' })
```

The complete command set is `insertDetails`, `wrapInDetails`, `unwrapDetails`,
`toggleDetails`, `setDetailsOpen`, and `toggleDetailsOpen`.
`getActiveDetails(editor)` returns the containing disclosure and current model
path. Commands are also registered on `kit.commands`.

`wrapInDetails` operates on top-level block selections and rejects nested-range
ambiguity. Enter in the editable summary moves trailing inline content into a
new first body paragraph; Backspace at the start of the first body paragraph
returns the caret to the summary; Ctrl/Cmd+Enter toggles `open`.

`DetailsNodeView` renders a native `<details>` element. A click or tap persists
its open state in editable documents; in read-only views readers can disclose
content locally without mutating the document. JSON, safe HTML, Markdown, and
text interchange are supported, including nested details and inline summary
marks. See [DETAILS.md](DETAILS.md) for the schema, collaboration behavior,
security boundary, and integration contract.

### Ruby annotations

The optional `fountainjs-editor/ruby` entry exports `RubyExtension` and
`createRubyExtension(options)`. Compose it to add an inline `ruby` node whose
text children are the editable base and whose required `rt` attribute is the
reading/pronunciation.

```ts
import {
  RubyExtension,
  getActiveRuby,
  setRuby,
  toggleRuby,
  unsetRuby,
  updateRuby,
} from 'fountainjs-editor/ruby'

const kit = composeExtensions([...StarterKit.extensions, RubyExtension])
setRuby(editor, { annotation: 'とうきょう' })
```

`setRuby` requires a non-empty text selection within one inline parent and
retains the selected text leaves and marks. `updateRuby` changes only the
reading; `unsetRuby` unwraps the base; `toggleRuby` selects between those
operations; and `getActiveRuby` returns `{ path, node }`. Explicit paths let
custom NodeViews address a ruby node after mapped document changes. The command
aliases ending in `RubyText` accept the same arguments.

`createRubyExtension` accepts `allowClickToEdit` and a framework-neutral
`renderAnnotationEditor(context)` hook. The default semantic NodeView opens an
accessible floating form from click, Enter, or Space, blocks accidental submit
during IME composition, supports Escape/Cancel and Remove, and does not expose
editing controls in read-only documents. JSON, safe HTML, semantic inline HTML
in Markdown, readable text, and generic Yjs synchronization are supported. See
[RUBY.md](RUBY.md) for the complete schema and interoperability contract.

### Text styles

`CoreExtension` and `StarterKit` include the complete text-style schema:
`text_color`, `highlight`, `font_family`, `font_size`, and `line_height`.
Framework-neutral commands and normalizers are available from the isolated
`fountainjs-editor/text-style` entry:

```ts
import {
  getActiveTextStyle,
  setBackgroundColor,
  setFontFamily,
  setFontSize,
  setLineHeight,
  setTextColor,
  unsetFontFamily,
} from 'fountainjs-editor/text-style'

setFontFamily(editor, 'Noto Sans JP, sans-serif')
setFontSize(editor, '18px')
setLineHeight(editor, 1.75)
```

Every setter normalizes and bounds its value before calling the ordinary mark
transaction path. Each property has a corresponding `unset…` command.
`getActiveTextStyle(editor)` returns common values across the complete selection
and lists differing properties in `mixed`. `TextStyleExtension` exposes all five
mark specs and named commands for a custom schema that does not use
`CoreExtension`; composing both intentionally triggers the duplicate-mark guard.

FountainJSON is lossless. Safe HTML reconstructs supported inline CSS, and the
Markdown adapter uses deterministic inline HTML when Markdown syntax cannot
represent a style. The React toolbar action id is `text-style`; other framework
surfaces call the same module directly. See [TEXT_STYLE.md](TEXT_STYLE.md) for
the value grammar, interchange, UI, collaboration, and security contract.

### Code blocks and syntax highlighting

The `code_block` node stores only portable source plus `language` and
`lineNumbers` attributes. `StarterKit` adds `SyntaxHighlightExtension`, which
turns token ranges and line starts into view decorations. Highlight spans and
line-number widgets update after every edit, remain outside document JSON and
exports, and are ignored when DOM selections are converted back to model
offsets. The default tokenizer covers common syntax in JavaScript/TypeScript,
HTML, CSS, JSON, Python, SQL, shell, Lean, Rust, Go, Java, C, and C++ without a
runtime dependency. Unknown language names remain valid portable metadata and
render safely as plain code.

`getActiveCodeBlock(editor)`, `setCodeBlockLanguage(editor, language)`, and
`toggleCodeBlockLineNumbers(editor, visible?)` power both custom controls and
the supplied React toolbar. Common aliases such as `js`, `ts`, `py`, `sh`, and
`lean4` normalize to canonical values. The toolbar accepts a custom language
name as well as its suggested list.

For a full grammar engine, replace the starter syntax extension with
`createSyntaxHighlightExtension({ tokenizer })`. A tokenizer returns validated
`{ from, to, type }` ranges; it never returns DOM or HTML, so an invalid class,
out-of-bounds range, or overlap is discarded before rendering. A tokenizer
failure calls `onTokenizeError` and falls back to the built-in tokenizer.
`maxCodeLength` (200,000 by default) and `maxLineNumbers` (10,000 by default)
bound decoration work for pathological blocks; both limits are configurable.

```ts
const syntax = createSyntaxHighlightExtension({
  theme: 'light',
  tokenizer: (code, language) => grammar.tokenizeRanges(code, language),
})

const kit = composeExtensions([
  ...StarterKit.extensions.filter(extension => extension.name !== 'syntax-highlight'),
  syntax,
])
```

`SyntaxHighlighter` remains available for rendering a standalone highlighted
HTML string. Its optional `highlighter` callback is explicitly trusted HTML and
is not used by the live editor; prefer the range tokenizer for editable or
untrusted content.

### Tables

`TableMap.create(table, tablePath?)` calculates logical table geometry across
`rowspan` and `colspan`. It exposes `width`, `height`, unique `cells`, geometry
`problems`, `cellAt()`, `cellInfo()`, `cellsInRect()`,
`rectangleBetween()`, and `columnWidth()`. A `CellSelection` uses this map and
expands automatically rather than cutting through a merged cell.

The public commands are `addTableRow`, `deleteTableRow`, `addTableColumn`,
`deleteTableColumn`, `deleteTable`, `moveTableCell`, `mergeTableCells`, `splitTableCell`,
`toggleTableHeaderRow`, `toggleTableHeaderColumn`, `toggleTableHeaderCell`,
`selectTableRow`, `selectTableColumn`, `resizeTableColumn`, and `repairTable`.
All structural commands operate on logical coordinates and preserve valid spans.
`TableEditingExtension`, included by `StarterKit`, appends a non-historical repair
transaction when an arbitrary host transaction leaves missing or overflowing
geometry.

`pasteTableCells(editor, text)` distributes a tab/newline matrix from the
selection's top-left cell, or repeats a smaller matrix across a larger selected
rectangle. It rejects out-of-bounds targets and cells that would be split.
`serializeTableSelection(doc, selection)` returns `{ text, html }`; the DOM input
layer uses it for native copy/cut. Cells store optional per-logical-column
`colwidth` values from 40 through 2,000 pixels. The default cell NodeView exposes
a labelled separator handle: Left/Right resizes by 5 px and Shift modifies by
25 px; dragging previews locally and commits one undoable transaction on release.

### Trailing editable block

`TrailingEditableBlockExtension`, included by `StarterKit`, maintains one small
document invariant: each configured root must finish with a direct text-editable
block. It recognizes any schema-valid block that accepts direct text, including
paragraphs, headings, and code blocks. A terminal table, image, divider, media
node, widget, quote, or list therefore gains one empty paragraph after it; a
document that already ends editably is unchanged.

`createTrailingEditableBlockExtension(options)` accepts `nodeType` (default
`paragraph`), `nodeAttributes`, and `rootTypes` (default the schema top node).
Nested configured roots are repaired deepest-first. Invalid node/root choices
fail when the editor is created rather than producing an invalid document.
`ensureTrailingEditableBlocks(editor, options?)` performs the same idempotent
repair explicitly, and `createTrailingEditableBlockTransaction(state, options?)`
returns the history-neutral transaction without dispatching it. Repairs emitted
after collaborative changes are marked for one provider rebroadcast so peers
converge without duplicate trailing blocks. See
[TRAILING_EDITABLE_BLOCK.md](TRAILING_EDITABLE_BLOCK.md).

### Clipboard history

`ClipboardHistoryExtension` is opt-in and memory-only. Compose it after the
starter extensions, or call `createClipboardHistoryExtension(options)` to set
`maxEntries`, `maxEntryLength`, a shortcut string/custom matcher, and an optional explicit
host `persistence` adapter. Only non-empty text copied or cut inside the editor
is captured; an over-limit entry is ignored and identical text is deduplicated.
No browser-wide clipboard history is read.

`getClipboardHistoryState(editor)` returns immutable `{ entries, open }` state.
Each entry has `id`, `text`, and `copiedAt`. Commands include
`openClipboardHistory`, `closeClipboardHistory`,
`pasteClipboardHistoryEntry`, `removeClipboardHistoryEntry`, and
`clearClipboardHistory`. The optional React `ClipboardHistoryMenu` searches,
expands, pastes, removes, and clears entries; `FountainToolbar` displays its
button only when the extension is installed. Non-React hosts subscribe to the
same plugin state and render their own picker.

Persistence is deliberately synchronous and host-owned:

```ts
const clipboard = createClipboardHistoryExtension({
  maxEntries: 25,
  persistence: {
    load: () => JSON.parse(localStorage.getItem('my-copies') ?? '[]'),
    save: entries => localStorage.setItem('my-copies', JSON.stringify(entries)),
  },
})
const kit = composeExtensions([...StarterKit.extensions, clipboard])
```

FountainJS does not choose localStorage, a database, a network destination, or
an encryption policy on behalf of the application.

### Mentions, emoji, typography, and character count

These opt-in modules are exported from
`fountainjs-editor/document-utilities`, keeping the core package entry free of
suggestion policy and extra nodes.

`createMentionExtension(options)` adds an atomic inline `mention` with `id`,
`label`, `trigger`, `kind`, and safe optional `href` attributes. It accepts
multiple unique trigger configurations with synchronous or asynchronous item
providers. `createEmojiExtension(options)` adds an atomic inline `emoji`,
custom catalogues, `:shortcode:` input, optional emoticons, Unicode typing and
paste conversion, and safe fallback images. Both expose a
`SuggestionController` through their composed service. Obsolete async requests
are aborted and ignored; snapshots expose status, match, items, selected item,
and errors without depending on a UI framework.

`EmojiExtension` uses a compact common catalogue. Import `unicodeEmojis` or the
ready-to-compose `UnicodeEmojiExtension` from the isolated
`fountainjs-editor/emoji-data` entry for the complete searchable RGI base
catalogue. The data entry is not loaded by the package root, React, or the
compact document-utilities path.

`TypographyExtension` supplies independently configurable input rules for
smart quotes, em dashes, ellipsis, arrows, symbols, fractions,
multiplication, and superscript two/three. Each result can be overridden or
disabled, quote pairs can be selected for LTR/RTL, and immediate Backspace
restores literal input.

`createCharacterCountExtension(options)` provides `characters`, `words`,
`snapshot`, and `trim` services. It supports `textSize`/`nodeSize`, custom text
and word counters, an optional limit, and initial/programmatic auto-trimming.
Transactions above a limit are refused while reductions from preserved
over-limit content remain possible. `trimDocumentToCharacterLimit` is the pure
schema-valid trimming helper.

React hosts can pass the headless controller to `FountainSuggestionMenu` and
the counting service to `FountainCharacterCount`. The suggestion component
positions against the decorated query, keeps editor focus, exposes listbox and
option semantics, and links the contenteditable through `aria-controls`,
`aria-expanded`, `aria-haspopup`, `aria-autocomplete`, and
`aria-activedescendant`. See [DOCUMENT_UTILITIES.md](DOCUMENT_UTILITIES.md) for
the complete options, lifecycle, format, and accessibility contracts.

### Slash commands

`createSlashCommandExtension(options)` is an opt-in module from
`fountainjs-editor/document-utilities`. By default `/` opens at the start of a
line and searches 11 schema-aware text, heading, list, quote, code, divider, and
table actions. Trigger, line/prefix/space policy, maximum results, built-ins,
static items, async sources, and the registry itself are configurable.

`SlashCommandRegistry.register(id, source)` adds a synchronous or asynchronous
source and returns an unregister function. `registerItems(id, items)` is the
static convenience form. Sources receive `{ editor, match, query, signal }`;
runtime registration changes refresh an open controller. Duplicate source or
item IDs fail explicitly. `filterSlashCommandItems(items, query, editor?)`
exposes the same stable exact/prefix/multi-term ranking used by the extension.

Each `SlashCommandItem` has `id`, `label`, and `run({ editor, match })`, with
optional description, group, aliases, icon, priority, disabled state, and a
dynamic `isAvailable(editor)` predicate. Acceptance removes the literal query
and runs the command in one batch. Failure, exception, or transaction-filter
refusal restores the entire prior state.

The `slashCommands` service exposes its `key`, `registry`, and
`getController(editor)`. Non-React hosts render that headless controller;
React hosts can use `FountainSlashCommandMenu`, which supplies labelled groups
over the shared accessible suggestion listbox. See
[SLASH_COMMANDS.md](SLASH_COMMANDS.md) for the full registration, execution,
accessibility, and lifecycle contracts.

### Bubble and floating menus

`BubbleMenuExtension` and `FloatingMenuExtension` are opt-in root-package
extensions. Their `bubbleMenu` and `floatingMenu` services expose
`getController(editor)`. A `FountainMenuController` publishes immutable
snapshots, `subscribe`, selection-local `dismiss`, explicit `refresh`, and
`destroy`. Bubble eligibility defaults to text ranges plus node, cell, and
whole-document selections; floating eligibility defaults to a collapsed caret in an empty
nearest block and includes its `anchorPath`.

Use `createBubbleMenuExtension(options)` or
`createFloatingMenuExtension(options)` for `showWhenReadOnly`, a complete
`shouldShow({ editor, state, selection, defaultOpen })` override, or a named
`id`. Named services use `bubbleMenu:<id>` / `floatingMenu:<id>` so multiple
instances can compose without silent replacement. Invalid IDs fail explicitly;
predicate exceptions close the menu and appear in `snapshot.error`.

`getEditorMenuAnchorRect(root, snapshot)` resolves model selection geometry,
and `placeEditorMenu(reference, menu, kind, options?)` returns clamped,
collision-aware fixed coordinates. React hosts can render arbitrary controls
inside `FountainBubbleMenu` and `FountainFloatingMenu`; the renderers are
focus-aware, SSR-safe labelled toolbars with arrow/Home/End navigation and
Escape dismissal. See [CONTEXTUAL_MENUS.md](CONTEXTUAL_MENUS.md).

### First-class interactive widgets

The optional `fountainjs-editor/widgets` entry defines renderer-independent
application controls whose accepted state remains in validated document
attributes. It exports:

- `defineWidget(options)` for immutable node attributes, whole-widget
  validation, block/inline/content shape, text/HTML projection, protected
  identity attributes, and Tab/Enter/Escape policy;
- `createWidgetExtension(definition, options?)` to contribute the node, named
  commands, and definition service to any extension kit;
- `createWidgetNode`, `insertWidget`, `getWidgetNode`, `updateWidget`,
  `removeWidget`, and `exitWidget` as framework-neutral commands;
- `validateWidgetAttributes` for non-mutating validation and
  `createWidgetController` for a renderer or other host using a live path;
- `WIDGET_TRANSACTION_META`, which identifies accepted insert/update
  transactions without relying on DOM events.

An accepted multi-attribute update is one `SetNodeAttrsStep` and one history
item. Invalid, unchanged, read-only, stale-path, wrong-kind, unsafe-attribute,
and protected-identity updates return `false` without changing the editor.
JSON and Yjs keep the same portable state; the default bounded HTML projection
round-trips it or fails explicitly rather than silently discarding data.

`createDOMWidgetNodeView` and `createDOMWidgetExtension` live in the separate
`fountainjs-editor/widgets/dom` entry. Their render context exposes immutable
node/attribute state, validation and selection state, separate `controls` and
optional model-owned `contentDOM` containers, the live path, and controller
actions. A renderer may return `update` and `destroy` hooks. The adapter retains
focused controls across accepted updates, excludes control events/mutations
from editing, disables nested form controls in read-only editors, and applies
the definition's composition-aware key-exit policy.

`createReactWidgetNodeView` and `createReactWidgetExtension` live in
`fountainjs-editor/react/widgets`; importing the neutral widget entry does not
load React. Components receive the same attributes, validation, selection,
editable state, path, and actions as DOM renderers. Read the complete examples,
persistence rules, accessibility responsibilities, collaboration behavior, and
limits in [WIDGETS.md](WIDGETS.md).

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
When `DOMEditablePageController` is mounted, Fountain's reserved
`data-fountain-editable-page*` attributes and changes limited to
`--fountain-editable-page-*` CSS variables are also excluded from NodeView
recovery. Product-owned attribute, child, text, and unrelated style mutations
still follow the NodeView's own `ignoreMutation` policy.

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
- `getActiveMath(editor, path?)` to inspect the selected or requested node;
- `setMathSource(editor, latex, ariaLabel?, path?)` for a selected or explicitly
  addressed math node.

Typing `$...$` or `$$...$$` creates a semantic node, and immediate Backspace
restores the literal delimiters. Pasted math Markdown is parsed through an
independent paste rule. JSON is lossless; Markdown, safe HTML, and text
import/export preserve TeX source. HTML carries a separate stored label so the
computed accessible fallback does not change JSON on round trip.

Without a renderer, the NodeView exposes source in a `<code>` fallback with
`role="math"`, an accessible label, full-source hover text, and selection/error
states. Selecting a math node reveals a direct source input; typing updates the
portable TeX and participates in undo, Enter commits, and Escape restores the
current source. `createMathExtension({ renderer, onRenderError, appearance })` accepts any
framework-neutral `MathRenderer`; the renderer must return a DOM `Node`, never
an HTML string. `createKaTeXRenderer(katex, options?)` adapts a caller-owned
[KaTeX installation](https://katex.org/docs/api) with combined HTML/MathML
output and `trust: false`. KaTeX is not loaded by the FountainJS core.

```ts
import katex from 'katex'

const math = createMathExtension({
  renderer: createKaTeXRenderer(katex),
  appearance: 'plain', // or 'tinted' / 'outlined'
  onRenderError: (error, latex) => report(error, { latex }),
})
const kit = composeExtensions([...StarterKit.extensions, math])
```

`plain` is the neutral default, so a coloured container is never required.
Set `inputRules: false` or `pasteRules: false` when the host wants commands
without delimiter conversion. `MAX_MATH_SOURCE_LENGTH` exposes the validation limit.

### Lean extension and controller

`LeanExtension` composes with `StarterKit` without adding a network or process
dependency. Lean source uses the existing portable `code_block` node with
`language: "lean"`. It contributes `insertLeanBlock`, `setLeanSource`, and
`replaceLeanUnicode`; the last operation is also bound to unmodified Tab after
a recognized backslash abbreviation inside a Lean block. Pass
`unicodeInput: false` to `createLeanExtension` to disable that key behavior.

The composed `lean` service exposes `mode`, the selected provider when present,
and `createController(editor)`. A provider is optional. `LeanController` has
`inspectRequest`, `check`, `goals`, `hover`, `expectedType`, `complete`, `cancel`, `dispose`,
`subscribe`, and `getSnapshot`. Requests contain only the current Lean block,
position, version, path, and a host-overridable URI.

When the extension's diagnostics plugin is present, successful checks publish
validated ranges as accessible, view-only decorations. They map when unrelated
content moves the Lean block, clear as soon as its source changes, and never
enter JSON or history. `getLeanDiagnostics(state)` reads that transient state;
`clearLeanDiagnostics(editor)` clears it; `selectLeanDiagnostic` selects a
current diagnostic range.

`new LeanInfoView(mount, controller, options?)` supplies a framework-neutral
panel with provider disclosure, explicit check/goals/hover/expected-type/completion actions,
diagnostics, proof goals, safe text-only hover output, cancellation, diagnostic
selection, and completion insertion. Destroying the view removes its
subscription and DOM without assuming ownership of the controller or provider.
Pass `onConfigureProvider` to expose a host-owned trusted-provider picker from
source-only mode.

`createLeanProvider` validates provider trust metadata and optional operations.
`createLeanLoopbackProvider({ endpoint, sessionToken, label?, timeoutMs?,
fetch? })` is the matching browser-side adapter for the separately launched
`fountainjs-lean-bridge`. It accepts only loopback HTTP(S), retains the secret in
the provider closure rather than its descriptor, sends a bounded one-block
check request with credentials omitted, refuses redirects, propagates aborts,
and rejects invalid or oversized JSON. The executable exposes only one-shot
proof checking; it is not an arbitrary command or complete LSP endpoint. See
[LEAN.md](LEAN.md) for setup and the project trust boundary.
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
`dispatch()` returns `true` only when a transaction is accepted and applied;
empty or plugin-filtered transactions return `false`.
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

## Stable node identities

Import stable identity APIs from `fountainjs-editor/node-ids`. The entry is
framework-neutral and does not load the DOM view, React, or Yjs.

`StableNodeIdsExtension` assigns `nodeId` to every non-root block by default.
`createStableNodeIdsExtension(options)` configures another attribute, eligible
node types, a predicate, and a synchronous injected generator. Text leaves and
the document root are always excluded. Generated values must match
`STABLE_NODE_ID_PATTERN`; generation is bounded and fails rather than accepting
an invalid or colliding value.

`StableNodeIdIndex` contains immutable `{ id, path, node }` entries and issue
reports for missing, invalid, or duplicate identities. `get(id)` is O(1) and
returns `undefined` for a duplicated key. `getAll(id)` exposes ambiguous matches
for diagnostics. Build a headless index with `createStableNodeIdIndex()` or use
the live plugin index through `getStableNodeIdIndex(editor)`.

The live APIs are `getNodeById`, `updateNodeById`, `selectNodeById`, and
`repairStableNodeIds`. Pure document APIs are `nodeById`,
`inspectStableNodeIds`, `planStableNodeIdRepairs`, and
`normalizeStableNodeIds`. `normalizeStableNodeIdJSON(schema, json)` validates
and normalizes stored JSON without a DOM, which lets a host opt identities into
its own versioned migration.

Repair changes only attributes and uses an empty position map. Existing
selections, comment/tracked-change anchors, and page positions therefore remain
stable. Repair is excluded from history, while the user action that caused it
remains undoable. A repair appended after a remote collaborative transaction is
published back through the adapter so generic Yjs documents converge. Canonical
JSON/Yjs preserve IDs; HTML and Markdown do not claim to preserve application
identity. See [NODE_IDS.md](NODE_IDS.md) for policy, examples, and limits.

## Live table of contents

Import table-of-contents APIs from `fountainjs-editor/table-of-contents`. This
entry is framework-neutral and does not import the DOM view or React.

`buildTableOfContents(document, options?)` returns immutable `entries` and
`tree` projections. Entries contain `id`, `anchor`, `title`, source heading
`level`, normalized hierarchy `depth`, current `path`/`from`/`to`, and a
`stable` flag. `createTableOfContentsState(document, selection, options?)` also
derives the closest active heading. Both APIs run in pure Node.js.

`createTableOfContentsExtension(options?)` installs live plugin state and
view-only heading decorations. `TableOfContentsExtension` is the default
instance and requires `StableNodeIdsExtension` to precede it. Configure
`types`, `minLevel`, `maxLevel`, `identityAttribute`, `anchorPrefix`, or
`maxTitleLength` for another schema. `getTableOfContentsState(editor)` reads the
live immutable snapshot. `navigateTableOfContents(editor, idOrAnchor)` resolves
the current entry and selects its heading through the model without a DOM
query.

DOM decorations expose the stable derived anchor, node ID, and level without
changing on selection-only updates; they never enter stored JSON, exported
HTML/Markdown, clipboard payloads, history, or collaboration. React hosts can use the supplied `Navigator`,
`useNavigatorTableOfContentsState`, or the backward-compatible
`useNavigatorState`. See [TABLE_OF_CONTENTS.md](TABLE_OF_CONTENTS.md) for
composition, renderer, identity, and accessibility details.

## Text integrity and invisible characters

Import platform-neutral inspection and cleanup from
`fountainjs-editor/integrity`.

`scanInvisibleCharacters(text, options?)` returns bounded immutable findings
with a category, UTF-16 offset/length, code-point labels, Unicode name, visible
marker, and severity. `inspectTextIntegrity(text, options?)` adds a code-point
table, UTF-8 bytes/hex, LF/CRLF/CR counts, normalization-form facts,
truncation state, and an accessible summary. Neither function mutates text or
requires browser globals.

`previewTextSanitization(text, policy)` and its `sanitizeText` alias return an
immutable before/after result and exact edit list. Every removal, replacement,
line-ending conversion, and normalization category is opt-in. The function
never applies a change. `inspectSelectionIntegrity(editor)` and
`previewSelectionSanitization(editor, policy)` operate on an exact single-text
selection. `applySelectionSanitization(editor, preview)` dispatches one
transaction only while the selection and source still match; stale previews
return `false`.

Import DOM display/input behavior from `fountainjs-editor/integrity/dom`.
`createInvisibleCharacterExtension(options?)` contributes bounded view-only
decorations and eligible literal input. `InvisibleCharacterExtension` is its
default instance. `getIntegrityDisplayState`, `setShowInvisibles`,
`toggleShowInvisibles`, and `setVerbatimMode` expose the state. Compose it
directly after `CoreExtension` when it should intercept eligible literal input
before text-rewriting plugins.

React hosts may import `FountainIntegrityInspector` from
`fountainjs-editor/react/integrity`. It is an optional reference UI, not a
required shell. See [TEXT_INTEGRITY.md](TEXT_INTEGRITY.md) for exact categories,
composition, security limits, byte provenance, and examples.

## Structured attributes

Import renderer-independent nested value APIs from
`fountainjs-editor/structured-attributes`.

`defineStructuredAttribute(options)` snapshots an exact node type, attribute,
object/array root policy, recursive safety limits, and optional whole-root
validator. `validateStructuredAttributeValue()` returns a cloned, recursively
frozen portable value or explicit issues. Values support only JSON primitives,
objects, and arrays; circular data, non-finite numbers, unsupported prototypes,
control/unsafe keys, and configured depth/entry/string/encoding excesses fail.

`getStructuredAttribute`, `setStructuredAttribute`,
`deleteStructuredAttribute`, `insertStructuredAttributeItems`, and
`deleteStructuredAttributeItems` address the node by its current model path.
They refuse stale/wrong nodes and invalid intermediate paths. Every accepted
change passes definition and complete node-schema validation, dispatches one
`setNodeAttrs` step, and attaches
`STRUCTURED_ATTRIBUTE_TRANSACTION_META` with the action, node path, attribute,
nested path, and optional array range.

`YjsCollaborationAdapterOptions.structuredAttributes` accepts definitions, an
optional `identityAttribute`, and an optional dedicated `map` or `mapName`.
Configured nodes require unique IDs. The adapter mirrors only those attributes
into nested Yjs maps/arrays, overlays and validates remote values, repairs the
ordinary flat attribute, and scopes local-origin undo across both forms. Other
attributes retain the original representation and behavior. See
[STRUCTURED_ATTRIBUTES.md](STRUCTURED_ATTRIBUTES.md) for the wire format,
concurrency matrix, rollout boundary, and security limits.

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

## Collaboration

`createCollaborationExtension(options)` is the framework-neutral boundary for
any synchronization engine. `options.adapter(editor)` must return a fresh
`CollaborationAdapter` for that editor. The adapter receives a
`CollaborationAdapterContext` on `connect`:

- `editor` is the editor instance owned by this integration;
- `applyRemoteTransaction(transaction, options)` validates a transaction that
  starts from the current editor document and applies it without converting the
  complete document to JSON; stale transactions fail closed;
- `applyRemoteDocument(document, options)` validates a `Node` or `NodeJSON`,
  applies it as a non-local-history transaction, optionally restores an
  adapter-resolved selection, and returns whether the transaction was accepted;
- `setPresences(values)` normalizes immutable remote users and structural
  selection ranges before decoration rendering;
- `setStatus(status, error?)` publishes `disconnected`, `connecting`,
  `connected`, `reconnecting`, or `error` state.

The adapter may implement `onLocalUpdate`, `onLocalSelection`, `disconnect`,
`destroy`, and collaborative `undo`/`redo`/availability/boundary methods.
`CollaborationLocalUpdate` contains the before/after document, before/after
selection, and accepted transaction. A remote transaction never echoes through
that callback.

```ts
const extension = createCollaborationExtension({
  autoConnect: true,
  adapter: () => myAdapter,
})

getCollaborationState(editor)
connectCollaboration(editor)
disconnectCollaboration(editor)
reconnectCollaboration(editor)
getCollaborationAdapter(editor)
replaceCollaborationAdapter(editor, nextAdapterOrFactory)
undoCollaboration(editor)
redoCollaboration(editor)
canUndoCollaboration(editor)
canRedoCollaboration(editor)
closeCollaborationHistory(editor)
```

`replaceCollaborationAdapter` invalidates the old session context before it
disconnects and destroys that adapter, then connects the replacement when the
old session was connected. Pass `{ connect: true | false }` to override that
default. Late documents, presences, statuses, promise resolutions, and failures
from the retired adapter are ignored. The same API switches a live editor to a
different Yjs document, room, provider, or synchronization engine without
recreating its view.

The immutable plugin state contains `status`, normalized `presences`, and an
optional bounded error. `collaborationKey` allows direct plugin-state access.
Remote transactions carry `COLLABORATION_REMOTE_META`; adapter provenance is
available through `COLLABORATION_ORIGIN_META`. Transaction filters remain in
force, so host policy can reject an otherwise schema-valid remote update.

The optional `fountainjs-editor/yjs` entry exports
`YjsCollaborationAdapter`, `createYjsCollaborationExtension`,
`YjsCollaborationAdapterOptions`, `YjsProvider`, and `YjsAwareness`. Supply a
`Y.Doc`, local `CollaborationUser`, and optional fragment, provider, awareness,
field name, undo `captureTimeout`, or `presenceThrottleMs`. Presence writes are
deduplicated and use a 32 ms leading/trailing throttle by default so selection
bursts cannot multiply awareness traffic; set `0` only when an integration
requires synchronous unthrottled presence. `yjs` is an external optional peer;
the root and React entries do not load it.

```ts
const ydoc = new Y.Doc()
const collaboration = createYjsCollaborationExtension({
  document: ydoc,
  fragmentName: 'fountain',
  user: { id: 'ada', name: 'Ada', color: '#6d4aff' },
  provider,
})
```

All collaborators must use compatible Fountain schemas. Text presence uses
Yjs relative positions; non-text selections are not published. Use
collaborative history commands instead of snapshot `HistoryExtension` for a
shared editor. See [COLLABORATION.md](COLLABORATION.md) for provider,
authentication, persistence, shared-tree, trust, and lifecycle rules.

## Threaded comments

The isolated `fountainjs-editor/comments` entry provides comment state and
commands without adding a storage vendor, network dependency, or framework to
the root package. Compose `createCommentsExtension({ adapter, user })` with any
compatible kit. The adapter factory receives the editor and returns a fresh
`CommentsAdapter` whose `connect(context)` loads/subscribes to snapshots and
whose `apply(operation)` returns an authoritative `thread` or
`removedThreadId`.

```ts
const store = new InMemoryCommentsStore()
const comments = createCommentsExtension({
  adapter: () => store.createAdapter(),
  user: { id: 'user-42', name: 'Ada' },
})
const kit = composeExtensions([CoreExtension, comments])

selectText(editor, [0, 0], 3, 12)
const thread = await createCommentThread(editor, {
  content: 'Review this claim.',
})
await addComment(editor, thread.id, { content: 'Verified.' })
await toggleCommentReaction(editor, thread.id, thread.comments[0].id, '✅')
await setCommentThreadResolved(editor, thread.id, true)
```

`CreateCommentThreadInput.type` accepts `inline`, `block`, or `document` and
defaults to inline unless the current selection is a `NodeSelection`. An inline
caret becomes a point anchor; a range may cross text blocks. `CommentContent`
is either text or portable `NodeJSON`. Thread/comment custom data must be JSON
serializable.

The complete mutation API is `createCommentThread`, `addComment`,
`updateComment`, `removeComment`, `setCommentThreadResolved`,
`setCommentThreadArchived`, `removeCommentThread`, `reattachCommentThread`, and
`toggleCommentReaction`. These functions are asynchronous because storage is
authoritative. Pending operations appear in `CommentsState.pendingThreadIds`;
no thread is changed optimistically.

`getCommentsState` returns immutable status, threads, selected/hovered IDs,
pending IDs, and the last contained adapter error. `selectCommentThread`,
`unselectCommentThread`, and `hoverCommentThreads` coordinate custom surfaces.
`subscribeCommentEvents` reports thread, selection, hover, anchor, and error
events. `canComment` evaluates the current local permission policy.
`connectComments`, `disconnectComments`, and `reconnectComments` control an
explicit lifecycle and are also registered as extension commands.

Inline/block anchors store structural positions, quote context, and for blocks
a node fingerprint. Every accepted document transaction maps them. If a
replacement removes the mapped range, unique context recovery is attempted;
otherwise the anchor remains as `orphaned` until explicitly reattached. Comment
annotations are overlapping-safe decorations and never enter the document or
its normal format exports.

`CommentPermissions` accepts predicates for thread creation, reply, comment
edit/delete, resolution, archive, thread deletion, reattachment, and reaction.
Defaults are author-aware, but this browser policy is only presentation. A
production adapter must authenticate the caller, authorize each operation,
deduplicate `operationId`, resolve revision conflicts, validate all payloads,
and return the authoritative result.

`reduceCommentOperation` is a pure reference reducer for trusted adapters and
tests. `InMemoryCommentsStore` connects multiple editors, applies operations
idempotently, and broadcasts snapshots, but intentionally has no durable
persistence. `commentsKey` exposes direct plugin-state access where necessary.

The separate `fountainjs-editor/react/comments` entry exports
`FountainComments`, an accessible replaceable discussion panel. It covers new
inline/block/document threads, replies, editing, deletion, reactions,
resolution, archival, orphan reattachment, pending state, and errors without
adding React to either the root or comments entry. See [COMMENTS.md](COMMENTS.md)
for adapter examples, security rules, rich content, Yjs composition, and test
guidance.

## Tracked changes

The isolated `fountainjs-editor/tracked-changes` entry contributes the
`tracked_change` mark, provider-independent review state, decorations, commands,
pure document resolvers, and framework-neutral events.

```ts
const tracked = createTrackedChangesExtension({
  user: { id: 'user-42', name: 'Ada', color: '#6d4aff' },
  enabled: true,
  idFactory: () => crypto.randomUUID(),
  now: () => new Date(),
})
const kit = composeExtensions([CoreExtension, tracked])
```

`TrackedChangesState` contains `enabled`, the current `user`, immutable
`suggestions`, an optional `selectedSuggestionId`, and
`hoveredSuggestionIds`. Read it with `getTrackedChangesState`; use
`trackedChangesKey` when direct plugin-key access is useful.

Document queries and pure transforms are `findTrackedSuggestions`,
`findTrackedSuggestionById`, `validateTrackedDocument`,
`createTrackedDocument`, `resolveTrackedSuggestion`,
`resolveAllTrackedSuggestions`, `resolveTrackedDocument`, and
`mapSelectionToTrackedDocument`. `SuggestionFilter` accepts `id`, `type`,
`userId`, `from`, and `to`.

Editor review operations are `acceptTrackedSuggestion`,
`rejectTrackedSuggestion`, `acceptAllTrackedSuggestions`,
`rejectAllTrackedSuggestions`, `acceptTrackedSuggestionsInRange`,
`rejectTrackedSuggestionsInRange`, `acceptTrackedSuggestionsByUser`, and
`rejectTrackedSuggestionsByUser`. `selectTrackedSuggestion` and
`hoverTrackedSuggestions` coordinate product UI. `enableTrackedChanges`,
`disableTrackedChanges`, `toggleTrackedChanges`, and
`setTrackedChangesUser` control later edits without rewriting existing records.

`dispatchTrackedTransaction(editor, edit, reason?)` tracks arbitrary valid
steps. Convenience functions cover text insertion/deletion/replacement, mark
changes, and node attributes. `linkTrackedSuggestionToComment` stores or clears
a safe comment-thread id while leaving the discussion service independent.
`subscribeTrackedChanges` reports created/updated/accepted/rejected suggestions,
mode changes, and selected-suggestion changes.

The separate `fountainjs-editor/react/tracked-changes` entry exports
`FountainTrackedChanges`. It renders complete text, author, reason, time,
filters, selection/hover state, individual and filtered batch decisions, mode
control, and an optional discussion callback. It does not add React to the core
or tracking entry. See [TRACKED_CHANGES.md](TRACKED_CHANGES.md).

## Named versions

The isolated `fountainjs-editor/versions` entry exports `VersionController`,
`InMemoryVersionProvider`, normalization helpers, content fingerprint/equality,
and structural comparison types/functions. It has no React or storage-service
dependency.

```ts
const versions = new VersionController({
  editor,
  documentId: 'document-42',
  user: { id: 'user-7', name: 'Ada' },
  provider,
  pageSize: 50,
  autoSave: { delayMs: 2_000 },
})

const release = await versions.save({ name: 'Release candidate' })
await versions.preview(release.id)
await versions.compare(release.id) // saved state to current editor
await versions.compare(release.id, anotherVersionId)
await versions.restore(release.id)
```

`VersionProvider` defines paginated `list`, exact `load`, authoritative `save`,
and optional `remove`/`destroy` methods. Save input includes a stable id,
idempotent operation id, optional expected head, kind (`manual`, `automatic`,
`backup`, or `restore`), author, time, portable JSON, fingerprint, and optional
application data. Providers assign monotonically increasing revisions.
`VersionConflictError` represents stale heads or reused mutation identities;
`VersionNotFoundError` represents a missing requested version.

`VersionController` exposes external-store `subscribe`/`getSnapshot`, lifecycle
events through `on`, `refresh`, `loadMore`, `save`, `saveAutomatic`, `preview`,
`closePreview`, `compare`, `clearComparison`, `restore`, `remove`, `can`,
`setAutoSave`, and `destroy`. Restore defaults to backup-first, applies one
undoable document transaction, bypasses tracked-change attribution, and saves a
new linked head. Provider output and schema content are validated at every read
boundary.

`compareVersionDocuments` reports exact inserted/deleted/replaced nodes and text,
mark changes, and attribute changes with immutable paths and before/after values.
The separate `fountainjs-editor/react/versions` entry exports the optional
`FountainVersions` history, preview, comparison, autosave, pagination, and
confirmation UI. See [VERSIONS.md](VERSIONS.md) for consistency, adapters,
security, failure semantics, and framework-neutral integration.

## AI review

`AIController(editor, adapter)` controls the propose/review/apply lifecycle.

- `inspectRequest(options)` builds the exact `AIRequestEnvelope` without calling the adapter.
- `suggest(options)` calls the adapter and records a pending `AISuggestion` without editing.
- `accept(suggestion)` checks the target for staleness and applies one transaction.
- `reject(suggestion)` records the decision without editing.
- `cancel()` aborts an active adapter call.
- `subscribe()` and `getSnapshot()` form an external store for UI integrations.

An adapter may additionally implement `stream(request, context)` as an
`AsyncIterable<AIStreamChunk>`. `createStreamingAIAdapter(stream)` is the
convenience constructor. Each chunk append-only contributes
`replacementDelta` and/or `explanationDelta`, and may update bounded `model`
and JSON-serializable `metadata`. `AIControllerSnapshot.streamingProposal`
exposes a frozen transient preview while status is `streaming`; it never enters
the document or suggestion history. Completion creates the normal pending
suggestion. Cancellation, adapter failure, malformed/empty chunks, more than
10,000 chunks, a replacement over 1,000,000 characters, or an explanation over
100,000 characters clears the preview without editing. A stream-capable adapter
is preferred when it also supplies `transform`.

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
  stream?(
    request: AIRequestEnvelope,
    context: { signal: AbortSignal },
  ): AsyncIterable<AIStreamChunk>;
}
```

`MCPAIAdapter` is the included bridge to `MCPIntegration`. `createAIAdapter(fn)`
is the convenience for complete results. `createStreamingAIAdapter(fn)` returns
both the streaming operation and a conventional transform that safely collects
the same chunks, preserving the established adapter contract.

### Schema-aware agent tools

`createAIDocumentToolbox(editor, options)` from the isolated
`fountainjs-editor/ai/document-tools` entry exposes five provider-neutral tool
definitions and a generic `invoke()` dispatcher for bounded `fountain.read`,
`fountain.insert`, `fountain.replace`, `fountain.format`, and
`fountain.structure` calls. Reads return path-addressed node records plus the
active schema. Mutation calls only create immutable pending proposals.

`preview(operations, { label })` supports an atomic multi-operation plan.
`read({ proposalId, path, depth, limit })` inspects its candidate document
without revealing unrelated content through the mutation result. `accept()`
requires an unchanged base document, replays the validated steps as one normal
undoable transaction, and tags it with `fountain$aiDocumentTools`; `reject()`
does not edit. JSON shape, schema content, declared attributes, paths, ranges,
marks, total payload, read size, proposal count, operation count, and tool
allowlists are checked before mutation. See
[AI_DOCUMENT_TOOLS.md](AI_DOCUMENT_TOOLS.md) for the complete trust boundary.

### Multi-turn conversations and prompts

The DOM-free `fountainjs-editor/ai/conversation` entry exports
`AIConversationController`, `AIConversationStore`, `AIConversationAdapter`,
`createAIConversationAdapter`, and `createStreamingAIConversationAdapter`.
`load()` retrieves a host-owned thread; `inspectRequest(input)` shows bounded
context without saving or calling the adapter; `send(input)` persists the user
turn, streams a transient reply, then persists only the completed assistant
turn; `cancel()` discards partial assistant output; and `clear()` writes a new
empty revision. Stores receive `expectedRevision` and `operationId` for
conflict detection and safe retries.

`defineAIPromptTemplate`, `renderAIPrompt`, `AIPromptStore`, and
`InMemoryAIPromptStore` provide reusable prompt data. Declared variables must
exactly match `{{placeholder}}` tokens, and rendering rejects missing or unknown
values. `InMemoryAIConversationStore` is an ephemeral reference store. The
optional `FountainAIConversation` React component consumes the same contracts.
See [AI_CONVERSATIONS.md](AI_CONVERSATIONS.md).

### Generated media

The isolated DOM-free `fountainjs-editor/ai/generated-media` entry exports
`AIGeneratedMediaController`, `createAIGeneratedMediaAdapter`, the request,
candidate, snapshot, committer, and decision types, and explicit resource-limit
constants. `inspectRequest()` discloses a private-by-default generation request
without calling its adapter. `generate()` validates one to eight copied
byte-backed candidates and exposes them for review without changing a document.
`accept()` invokes only a supplied committer and marks an asset accepted after
that committer returns `true`; `reject()`, `cancel()`, `clear()`, `subscribe()`,
and `getSnapshot()` complete the framework-neutral lifecycle.

The root browser entry exports `aiGeneratedMediaFile`,
`insertAIGeneratedMedia`, and `createAIGeneratedMediaCommitter`. These convert a
reviewed candidate to a browser `File` and call the ordinary
`ImageUploadHandler` or `AssetUploadHandler`, preserving mapped targets,
progress, abort, schema validation, and undo. The optional React entry exports
`FountainAIGeneratedMedia` and `useAIGeneratedMediaState`. See
[AI_GENERATED_MEDIA.md](AI_GENERATED_MEDIA.md).

## Commands

Commands return whether they handled the operation:

- `insertText`, `insertPlainText`, `insertHardBreak`, `deleteSelection`, `deleteBackward`, and `deleteForward`
- `selectText`, `selectTextRange`, `selectNode`, `selectGap`, `selectAll`, `selectCells`, `selectAdjacentNode`, and `extendCellSelection`
- `setContent`, `setBlockType`, and `insertBlock`
- `insertNode`, `insertImage`, `insertInlineImage`, `insertQuote`, `toggleQuote`, `insertList`, and `insertTable`
- `isMarkActive`, `toggleMark`, `setMark`, `unsetMark`, `setLink`, and `unsetLink`
- `setTextAlignment`, `splitBlock`, `joinBackward`, and `joinForward`
- `getActiveImage`, `setImageAttributes`, `setImageAlignment`, and `deleteImage`
- `setNodeAttributes`, `removeNode`, `canMoveNode`, `moveNode`, `moveBlock`, `toggleTaskItem`, `toggleList`, `indentListItem`, and `outdentListItem`
- `addTableRow`, `deleteTableRow`, `addTableColumn`, `deleteTableColumn`, `deleteTable`, and `moveTableCell`
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

### Node moves

`moveNode(editor, { fromPath, toParentPath, toIndex })` moves any non-text node
within or across compatible parents. All paths refer to the current document;
`toIndex` is the final index after removal. The command rejects the root, text
nodes, invalid paths, cycles, no-ops, read-only state, and any result that fails
complete schema validation. Success dispatches one transaction, selects the
moved node's first text leaf (or the atom itself), and creates one history entry.
`canMoveNode` checks the identical operation without dispatching. `moveBlock`
remains the top-level compatibility shortcut. See
[BLOCK_REORDERING.md](BLOCK_REORDERING.md) for index examples, nested behavior,
DOM controls, and extension guidance.

`findText(document, query, options?)` returns model ranges even when a match crosses marked text fragments. `selectNextMatch()` wraps through matches, and `replaceAllText()` changes all matches in one undoable transaction.

## Plugins

A `Plugin` can own immutable state, contribute a `DecorationSet`, intercept `keydown`, `beforeinput`, text input, copy, cut, paste, drop, and click events, filter a transaction before it changes state, and append a follow-up transaction after a state update. It can also receive editor create/destroy lifecycle callbacks. `filterTransaction(transaction, state)` returns `false` to refuse the original or an appended transaction; character limits use this public boundary. Dispatch reaches a guarded fixed point, then subscribers receive the final state and one transaction composed from the original plus every accepted follow-up map. Returning `true` from an input hook tells the DOM view that the extension handled the event. Use `PluginKey.get(editor.state)` to read plugin state. `historyPlugin` and `markdownShortcutsPlugin` are included.

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
view's normal plain-text importer. Structured `text/html` takes precedence and
bypasses text rules so marks, links, tables, annotations, and extension nodes
are not silently flattened. Each `PasteRule` receives the complete
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

`new EditorView(mount, editor, options?)` mounts a `contenteditable` view. Options include `ariaLabel`, `className`, `placeholder`, safe string attributes, optional `imageUpload(file, context)` and `assetUpload(file, context)` adapters, an inline-image byte limit, `blockHandles`, the default-on `dropCursor`, `virtualization`, source-aware `paste`, and error handling. Without an image adapter, local images up to the configured limit are embedded as data URLs. Other assets always require a host adapter. The view supports multi-block selection, IME composition, multiline/plain and rich-HTML paste, image/asset upload, paste and drop, task checkboxes, Tab/Shift-Tab list indentation and table navigation, and extension NodeViews. Call `focus('current' | 'start' | 'end')`, `commandManager()`, and `destroy()` on the view as needed.

`virtualization: true` uses the window viewport and starts at 250 top-level
blocks. `EditorViewVirtualizationOptions` configures `scrollContainer`,
`minimumBlockCount`, `estimatedBlockHeight`, `overscanPx`, and
`pinnedOverscanBlocks`. `view.virtualized` reports whether the current document
is windowed. `view.setVirtualizationSuspended(true)` mounts the complete
document for continuous accessibility, capture, export, or another host-owned
operation; `false` restores the viewport. Copy/cut selection ranges and print
events use temporary complete rendering automatically. See
[VIRTUALIZATION.md](VIRTUALIZATION.md).

Set `blockHandles: true` for the supplied contextual drag/move toolbar, or pass
`BlockHandleOptions` with an `include(context)` candidate policy and label
functions. Controls mount outside the contenteditable, follow nested selection
and pointer targets, expose touch-sized and keyboard-operable movement buttons,
and show schema-valid before/after drop indicators. React's `FountainEditor` and
`FountainComposer`, plus `registerFountainElement`, forward this same option.

`dropCursor` defaults to `true`. Native drags carrying data receive a
view-only inline caret when the browser resolves a text position, or a
before/after block rule over atomic content. Fountain block-handle drags retain
their stricter schema-valid move indicator. Pass `false` to omit the supplied
cursor or `{ color, className }` to brand it; products may style or replace
`.fountain-drop-cursor` and its `data-fountain-drop-cursor`,
`data-fountain-drop-path`, and `data-fountain-drop-position` hooks. The exported
`DropCursorManager` never dispatches, moves selection, or interprets dropped
data. React and Custom Element surfaces forward the same option.

### Images and uploads

`image_super` is the captioned block image; `inline_image` is an atomic inline
node for icons, badges, and images between text. Shared attributes are `src`,
`alt`, `title`, `width`, `height`, `align`, `srcset`, `sizes`, `loading`, and
`decoding`; block images also carry `caption`. URL, CSS-size, responsive-source,
and enum values are schema-validated. `createImageNode` creates a node without
dispatching, while `insertImage` and `insertInlineImage` use the active
selection. `setImageAttributes`, `setImageAlignment`, and `deleteImage` operate
on a selected image or an explicit live path.

An inline image may carry ordinary inline marks. In particular, linked images
round-trip as an `inline_image` with a `link` mark through JSON, Markdown,
browser/server HTML, the DOM renderer, and Yjs; no image-specific URL attribute
or browser-only wrapper is required.

The block-image NodeView supplies a multiline caption field, selection state,
load-error status and retry, and two resize sliders. Drag either handle with a
pointer/touch input, or focus it and use Left/Right (10 px), Shift+Left/Right
(50 px), Home (minimum), or End (maximum). Captions and controls disappear
safely in read-only mode while populated caption text remains visible.

`startImageUpload(editor, file, options)` returns an `ImageUploadTask` with
`snapshot`, `completion`, `subscribe(listener)`, `cancel()`, and `retry()`.
Snapshots contain `status`, normalized `progress`, `attempt`, and any error.
The injected `ImageUploadHandler` receives `{ editor, signal, reportProgress }`
and returns a URL or `ImageAttributes`. `placement: 'inline'` inserts inline;
`replacePath` safely replaces a mapped existing image. Upload targets map through
transactions while work is pending, and deletion makes a replacement fail
instead of applying to an unrelated node. Without a handler, `FileReader`
creates a size-limited data URL and honors cancellation.

Paste and drop use the same task path and emit bubbling
`fountain-image-upload` events whose detail contains `{ snapshot, task }`.
Upload state is deliberately absent from document JSON. Hosts own file storage,
authentication, retry policy beyond a task, and persistence.

### Audio, video, files, and configurable embeds

`MediaExtension` is included in `StarterKit` but can be removed or replaced like
any other extension. It contributes four atomic block nodes and their commands:

- `audio`: native playback source, title/caption, controls, autoplay, loop,
  mute, preload, `controlsList`, CORS/remote-playback policy, and up to 32
  validated WebVTT subtitle, caption, description, chapter, or metadata tracks;
- `video`: the audio fields plus a safe poster, width/height, alignment, and
  inline mobile playback;
- `file_attachment`: URL, visible name, MIME type, byte size, description, and
  an optional safe download filename. Image MIME types receive a lazy thumbnail
  preview while retaining a separate, explicit download action;
- `embed`: a provider-approved canonical HTTPS source, required accessible
  title, caption, dimensions/alignment, bounded permission tokens, sandbox
  tokens, and fullscreen policy.

Use `insertAudio`, `insertVideo`, `insertFileAttachment`, and `insertEmbed` for
insertion. `getActiveMedia`, `setMediaAttributes`, `setEmbed`, and `deleteMedia`
operate on a `NodeSelection` or explicit path. `createMediaNode` validates a
node without dispatching. Native controls remain interactive inside the atomic
NodeView; the outer node/caption remains selectable. Audio/video load failures
expose an accessible status and host-visible retry. File cards use safe new-tab
link semantics and human-readable byte metadata. In an editable DOM view they
also provide a `Select attachment` action so a host toolbar can expose
`setMediaAttributes` and `deleteMedia` without asking users to discover atomic
node selection through a caption or empty margin.

The default embed providers accept common YouTube, `youtu.be`, privacy-enhanced
YouTube, and Vimeo URLs. They persist only canonical
`youtube-nocookie.com/embed/...` or `player.vimeo.com/video/...` sources.
Unknown origins, HTTP URLs, unsafe URL schemes, invalid provider output,
unrecognized sandbox tokens, and undeclared iframe permissions are rejected.
The rule is enforced by the schema as well as the command, so forged JSON or
HTML cannot bypass it.

`createMediaExtension({ embedProviders })` replaces—not widens—the allowlist.
Each `EmbedProvider` has a stable `name`, a `resolve(URL)` function, and optional
validated `sandbox`, `allow`, and `allowFullscreen` defaults. A resolver is
trusted application code, but its result must still be canonical HTTPS. Compose
the resulting extension in place of the starter `media` extension. The resolver
must recognize its own canonical output so validation remains stable after
persistence. Per-node permissions, sandbox tokens, and fullscreen access may
only narrow the matched provider's declared policy ceiling; HTML import cannot
grant a provider an undeclared capability.

`startAssetUpload(editor, file, options)` returns an `AssetUploadTask` with the
same `snapshot`, `completion`, `subscribe`, `cancel`, and `retry` contract as
image tasks. MIME type infers `audio`, `video`, or `file`; `kind` can be supplied
explicitly. The required `AssetUploadHandler` receives
`{ editor, kind, signal, reportProgress }` and returns a URL or typed attributes.
The target position maps through every local transaction. `replacePath` may
replace only the same mapped live asset type and fails closed if that node is
deleted or the MIME-derived kind differs.

Editor paste/drop routes non-image files through `assetUpload` and emits a
bubbling, composed `fountain-asset-upload` event with `{ snapshot, task }`.
React exposes the same adapter on `FountainEditor`, `FountainToolbar`, and
`FountainComposer`; the supplied toolbar supports URL insertion/editing and
host-uploaded audio, video, and files. Storage credentials, local `File`
objects, progress, abort controllers, and errors never enter document JSON.
Hosts remain responsible for authorization, storage, quotas, malware scanning,
content-type verification, transcoding, and long-lived URLs. A failed task keeps
mapping its retry target; call `cancel()` when discarding it instead of retrying.

The controlled `beforeinput` path covers normal/replacement text, composition
commit orderings, paragraph and line breaks, forward/backward deletion,
cut/drag deletion, browser history undo/redo, and native formatting input types.
Rich HTML paste is parsed into validated nodes rather than flattened to text.
Logical model offsets remain stable for bidirectional and nested content.
Selecting a top-level block keeps the compatible native drag path. With
`blockHandles` enabled, top-level and nested blocks gain a visible drag handle,
schema-valid before/after indicators, and explicit move buttons for keyboard
and touch. Every route calls the same undoable path-based `moveNode` command.

Selection input is available without a framework: Ctrl/Cmd+A creates an
`AllSelection`; clicking an atomic node selects it; Left/Right at an adjacent
text boundary enters and leaves an atomic `NodeSelection`; Shift-click extends
a cell rectangle from the current cell; and Alt+Shift+Arrow extends the same
rectangle using only the keyboard. Node, cell, and gap states use outlines,
inset borders, or insertion rules in addition to colour. The view mirrors each
state into a native DOM range while the model selection remains authoritative.
Hosts can add their own labelled controls around `selectNode`, `selectGap`, or
`selectCells` when a product needs a more explicit screen-reader workflow.

### Clipboard interoperability

Copy/cut from Fountain writes three representations when the selected model
fragment is schema-valid:

- `application/x-fountainjs+json`: a bounded version-1 `{ document }` payload
  for exact transfer between Fountain editors that share the required schema;
- `text/html`: clean semantic HTML for other rich editors, with no renderer
  paths, selection markers, block-handle controls, or pagination widgets;
- `text/plain`: readable text with list markers, quote markers, tab-separated
  table cells, line-separated rows, and each node's `toText` projection.

The exact representation preserves document nodes, marks, attributes, nested
blocks, spans, media tracks, and extension-defined atoms. It is still untrusted
input: the receiving schema recreates and validates the document. If that schema
does not include a copied extension, Fountain tries semantic HTML and then plain
text. Post-transaction invariant plugins may still repair context-sensitive
values—for example, a stable-ID extension can replace duplicate IDs created by
copying a node inside the same document. Private plugin/service state—comment threads, presence, host records,
uploads, credentials, and clipboard history—is never smuggled into document
clipboard JSON.

`EditorViewOptions.paste` accepts `ExternalPasteOptions`: `normalize`,
`wordLists`, `trackedChanges` (`accept`, `reject`, or `preserve-visible`),
`stripSourceMetadata`, and `onReport`. Reports identify Fountain, Word, Excel,
Google Docs, MathML, generic HTML, or plain text; name the inserted outcome;
count UTF-8 input/output bytes; and list immutable loss/normalization issues.
Cleanup removes executable content, normalizes supported Office structures, and
never claims to reconstruct external comments or unknown proprietary metadata.
Word visual-list paragraphs retain numeric ordered starts, nested levels, and
separate Office list identities; comment/annotation identifiers are reported as
loss and removed rather than leaking application-private metadata into portable
HTML. The fixture corpus also covers Word footnotes/endnotes and revisions,
Google Docs structure, Excel spans and supported cell styling, annotated MathML,
ruby, semantic footnotes, unsafe HTML, and schema-safe fallback.
React passes this option through its view options and
`registerFountainElement({ paste })` exposes the same policy to Custom Elements.

`registerFountainElement(options?)` registers `<fountain-editor>` as a standards-based Custom Element. Configure a schema and plugins once, assign document JSON through its `value` property, and listen for the bubbling `fountain-change` event. Event detail includes `state`, `transaction`, and portable `value` JSON.

## Import and export

The root package exports `HTMLImporter`, `MarkdownImporter`, `HTMLExporter`, `MarkdownExporter`, `JSONExporter`, and `TextExporter`. Importers receive a `Schema`; exporters accept an `EditorState` or `Node`.

The isolated `fountainjs-editor/html/server` entry exports
`ServerHTMLImporter`, `HTMLImportLimitError`, and their option/report types.
`ServerHTMLImporter.parse(html, schema, options?)` returns a validated document
in pure Node.js without browser globals. `parseWithReport(...)` also returns
bounded parser-recovery, invalid-selector, and unsupported-browser-rule issues.
Options cap UTF-8 input bytes, parsed nodes, depth, attributes per element,
attribute length, and recorded parser errors. See
[SERVER_HTML.md](SERVER_HTML.md).

`MarkdownImporter.parse(source, schema)` recognizes inline links with titles;
full, collapsed, and shortcut reference links/images; recursive quotes; loose
multi-block nested lists; aligned tables with escaped pipes; and the remaining
built-in Markdown projections. Links and emphasis around inline images remain
marks on the image atom, including full/reference linked-image forms. Reference identifiers are normalized without
changing their displayed label, unsafe URLs remain ordinary text, short table
rows are padded, and the final tree passes `schema.validate()`.

`MarkdownImporter.parseWithSource(source, schema)` returns
`{ document, source }`. The immutable `MarkdownSourceSnapshot` keeps the exact
input, detected line ending, body, and optional inert YAML frontmatter. Fountain
does not parse or execute the YAML. `MarkdownExporter.exportWithSource(document,
source, options?)` then returns `{ markdown, losses, preservation }`:

- `exact` means the parsed model has not changed and the original source string
  is returned exactly, including line endings, spacing, reference spelling,
  and syntax Fountain does not semantically understand;
- `blocks` means top-level source regions mapped one-to-one, the document shape
  stayed aligned, and unchanged blocks plus their separators were retained
  exactly while changed blocks were rendered canonically;
- `mapped-blocks` means insertion, deletion, or movement changed the top-level
  shape; identity-preserved or uniquely equal unchanged blocks retained exact
  source while
  inter-block separators and unmatched blocks were rendered canonically;
- `frontmatter` means a visual edit occurred, the exact frontmatter prefix was
  retained, and the changed body was rendered canonically;
- `canonical` means no recognized frontmatter existed and the changed model was
  rendered through the normal exporter.

`MarkdownSourceSnapshot.mapBlocks(document)` exposes the same immutable,
identity-first mapping. Equal originals can retain distinct source spellings
when their immutable node references survive deletion or movement; duplicated
references and reconstructed ambiguous equals return `null`, so source is never
assigned by guesswork. Block capture deliberately fails closed for ambiguous
blank-line ownership and cross-block references; changed reference-style links
also require canonical document-level definitions. Capture is bounded to
10,000 top-level source regions. Unknown syntax inside a changed or unmatched
block is not claimed to survive. Reparse raw edits to create a new source
snapshot. See
[MARKDOWN_SOURCE.md](MARKDOWN_SOURCE.md) for the exact frontmatter contract,
initial standards-oriented fixture corpus, and explicit conformance limits.

`MarkdownExporter.export(stateOrNode, options?)` returns a string. Set
`options.linkStyle` to `"reference"` for stable `ref-1`, `ref-2`, … definitions
deduplicated by destination and title. The default is `"inline"`.

`MarkdownExporter.exportWithReport(stateOrNode, options?)` returns
`{ markdown, losses }`. Each immutable `MarkdownExportLoss` contains `kind`,
`type`, `path`, and `detail`; it identifies a node, mark, or attribute that the
Markdown projection cannot reconstruct. `options.onLoss` receives each entry
but is observational—callback failures are contained. This is the release-safe
choice when publishing documents composed from third-party extensions.

## Document versions and migrations

`encodeFountainDocument(document, options?)` writes the current `NodeJSON` in
an explicit `{ format: "fountainjs", version, document }` envelope.
`migrateFountainDocument(input, options?)` accepts that envelope or historical
bare `NodeJSON`, rejects unknown future versions, applies each required
sequential migration, and returns the immutable envelope plus source/target
metadata. Supply `options.validate` to validate the final document against the
application's composed `Schema`.

For a future format, create an isolated runner with
`createFountainDocumentMigrator({ currentVersion, migrations, validate })`.
Every `defineFountainDocumentMigration(...)` step must advance exactly one
positive integer version. Duplicate source steps, gaps, invalid JSON values,
oversized/deep data, circular input, and failed transformations produce a typed
`FountainDocumentMigrationError`. The host owns the complete chain; FountainJS
does not keep a process-global migration registry.

The constants `FOUNTAIN_DOCUMENT_FORMAT` and `FOUNTAIN_DOCUMENT_VERSION`, all
migration types, and the runner are exported from both the root and the
DOM-independent `fountainjs-editor/migrations` entry. The transport-level JSON
Schema is available as `fountainjs-editor/schema/document.json`. See
[MIGRATIONS.md](MIGRATIONS.md) for extension-version separation and safe
deployment order.

## Print-aware page foundation

The opt-in, runtime-DOM-independent `fountainjs-editor/pages` entry separates
persisted page intent from automatic layout. Compose `PagesExtension` to add
manual page breaks, inline footnote references, top-level rich footnote
definitions, canonical header/footer templates, and dynamic page fields:

```ts
import { CoreExtension, composeExtensions } from 'fountainjs-editor'
import {
  PagesExtension,
  createPageGeometry,
  insertPageField,
  insertFootnote,
  layoutPages,
  projectPagePresentation,
  selectPageTemplate,
  setPageTemplate,
} from 'fountainjs-editor/pages'
import {
  createDOMEditablePageController,
  createDOMPageLayoutController,
  layoutDOMPages,
  measureDOMPageFlow,
} from 'fountainjs-editor/pages/dom'
import { renderDOMPagePreview } from 'fountainjs-editor/pages/preview'

const kit = composeExtensions([CoreExtension, PagesExtension])
insertFootnote(editor, { id: 'source-1', content: 'Source text' })
setPageTemplate(editor, { kind: 'footer', content: 'Page ' })
selectPageTemplate(editor, 'footer')
insertPageField(editor, 'page-number')

const geometry = createPageGeometry({
  size: 'letter',
  margins: 25.4,
  headerHeight: 32,
  footerHeight: 32,
  unitsPerMillimetre: 96 / 25.4,
})
const pages = layoutPages(measuredFlowItems, geometry)
const presentation = projectPagePresentation(editor.state.doc, pages)
view.dom.style.boxSizing = 'content-box'
view.dom.style.inlineSize = `${geometry.size.width - geometry.margins.left - geometry.margins.right}px`
const browserPages = layoutDOMPages(view.dom, editor.state.doc, geometry)
renderDOMPagePreview(view.dom, previewElement, geometry, browserPages)
const controller = createDOMPageLayoutController(
  view.dom,
  () => editor.state.doc,
  geometry,
  { onLayout: ({ snapshot }) => renderDOMPagePreview(view.dom, previewElement, geometry, snapshot) },
)

const editablePages = createDOMEditablePageController(
  view.dom,
  () => editor.state.doc,
  geometry,
  {
    measurement: { lineFragmentNodeTypes: [] },
    onFallback: issues => showContinuousModeNotice(issues),
  },
)
```

`inspectFootnotes(document)` reports duplicate, missing, nested, and
unreferenced definitions. `assertFootnotes(document)` enforces the same graph
when a product requires it. `createPagesExtension({ footnoteIdFactory })` lets
collaborative hosts inject their own collision-resistant identifier policy.
`computeFootnoteNumbering(document)` derives immutable display labels from the
first occurrence of each reference. IDs remain stable in JSON while DOM and
HTML labels renumber after document-order changes; repeated references retain
the same label. The optional nodes also round-trip standard `[^id]` Markdown
footnotes and import semantic HTML `doc-noteref` / `doc-footnote` roles.
`insertPageBreak`, `insertFootnote`, `selectFootnoteDefinition`, and
`removeFootnote` use ordinary validated transactions, so history and Yjs carry
them without a page-specific collaboration protocol.

`setPageTemplate(editor, { kind, variant, content })` creates or replaces the
single canonical `header` or `footer` for a `default`, `first`, `odd`, or `even`
page variant. `selectPageTemplate`, `removePageTemplate`, and `insertPageField`
provide the corresponding editing surface; fields can represent either the
current page number or total page count. `inspectPageTemplates` reports nested
or duplicate templates and fields outside a template. `resolvePageField`
resolves fields for a renderer without storing measured numbers in the document.

`layoutPages(items, geometry, options?)` consumes measured legal fragments and
returns frozen pages, placements, reserved footnotes, used/available height,
and explicit overflow/constraint warnings. It never reads `document`, CSS, or
viewport state and never writes automatic page membership into JSON.
For a single-fragment keep-with-next item such as a heading, it reserves the
following item's configured `minimumStart` fragments rather than requiring the
whole following paragraph to be indivisible. If that opening pair cannot fit an
empty page, the constraint is relaxed with an explicit warning.

`projectPagePresentation(document, layout)` turns that result into an immutable
renderer-neutral page plan. Each page references the selected canonical
first/odd/even/default header and footer, resolves current/total page fields,
and pairs reserved footnote measurements with their one canonical definition.
Ambiguous templates and missing/duplicate footnote definitions remain explicit
warnings; the projector fails closed instead of picking one duplicate.

The separate browser-only `fountainjs-editor/pages/dom` entry provides
`measureDOMPageFlow(root, document, options?)` and `layoutDOMPages(...)`. It
reads the current rendered geometry and emits legal line fragments for text,
direct blockquote-child and list-item fragments, rowspan-safe table row groups
with continuation
header cost, first-reference footnote reservations, manual-break intent, and
canonical template measurements. Missing nodes, invalid geometry, and
unmeasured footnotes are explicit warnings. It never reparents, clones, or
annotates the editable DOM. `fragmentSources` maps each legal fragment back to
its top-level model path, nested structural paths, measured height, and
vertical clip offset without retaining DOM nodes. Its output is ordinary frozen
input for the neutral layout engine. `layoutDOMPages` also includes the neutral `presentation` plan in
its frozen snapshot so a host does not have to repeat variant or footnote logic.

`DOMPageMeasurementOptions.blockContinuation` is an opt-in measurement boundary
for a custom rendered block or NodeView. The frozen adapter context contains the
complete immutable `modelDocument`, its top-level `node`, canonical read-only
`element`, model `path`, and generated `itemId`. Return `undefined` to keep the
normal whole/structural/text policy, or return:

```ts
{
  fragments: [...element.querySelectorAll<HTMLElement>('[data-print-band]')],
  minimumStart: 1,
  minimumEnd: 1,
  continuationHeight: 24,
}
```

`fragments` must contain at least two unique, ordered, non-overlapping descendant
elements with finite geometry. A fragment cannot cut through a Fountain-owned
widget. The optional minima are positive fragment counts no larger than the
returned list; `continuationHeight` is finite, non-negative visual overhead
repeated after the first placement. Invalid host output throws immediately.
Accepted bands become ordinary frozen flow fragments with `kind: 'custom'`,
exact clip offsets, mapped footnote reservations, and rebased source paths.
The adapter never adds data to the model or changes the canonical DOM.

`projectDOMPageContent(measurement, layout)` validates and joins every layout
placement to its exact contiguous `fragmentSources` slice. Each projected
placement exposes `contentHeight`, renderer-owned `continuationHeight`, and its
frozen sources. Missing, partial, duplicated, or non-sequential external input
throws instead of producing a visually plausible but incorrect page.

The separately loaded browser entry `fountainjs-editor/pages/preview` exports
`renderDOMPagePreview(sourceRoot, target, geometry, snapshot, options?)`. It
creates fixed-size read-only sheets without moving, annotating, or changing the
editable source. It projects exact text clips, assigned blockquote children,
list items, and table row
groups, repeated table headers, selected page templates, resolved page fields,
and linked page-local footnotes. The source must be measured at the exact page
body width; a mismatch throws before rendering because changed wrapping would
invalidate every line boundary.

By default the renderer also inserts print-only unnamed and deterministic named
`@page` rules for the supplied width/height, normalizes CSS numbers so equivalent
physical sizes do not leak floating-point artifacts into public page names,
assigns the named page to each
sheet, removes screen decoration, and preserves one forced PDF page per sheet.
Pass `includePrintStyles: false` only when the host owns the document's global
print rules. DOM geometry values are CSS pixels, so physical A4/Letter output
uses `unitsPerMillimetre: 96 / 25.4` as shown above.

`options.renderPlacement(context)` is the host-owned print boundary for a
custom NodeView, canvas, embed, atomic media surface, or any other placement
whose live DOM is not a deterministic print representation. The frozen context
contains the canonical source element, exact projected placement and its
`sources` (including the selected custom fragment interval), page number, and
source document. Return `undefined` for the default clone/vertical clip or an
`HTMLElement` from that document for a replacement. Fountain clones the
replacement, namespaces IDs, removes model/selection/drag state, disables
controls, and never moves or changes either the returned template or live
source. A foreign-document or non-element result fails closed.

The visual sheets are `aria-hidden` because clipped DOM copies otherwise repeat
off-page text to assistive technology. By default the preview contains one
visually hidden, continuous, non-editable semantic copy of the source instead.
Set `includeAccessibleDocument: false` only when the host keeps an equivalent
accessible document beside the preview; the whole preview is then hidden from
assistive technology. Cloned IDs are namespaced, form controls are disabled,
and visual links are removed from keyboard order. The renderer owns no event
listeners and is safe to call again on the same target.

`createDOMPageLayoutController(root, getDocument, geometry, options)` adds an
optional automatic lifecycle around the same functions. It coalesces subtree
mutations, element/window resize, loaded fonts, and print preparation into one
animation-frame refresh; reports the reason, revision, duration, and frozen
snapshot; accepts host error/layout callbacks; and disconnects every observer
and listener in `destroy()`. `refreshNow()` remains available for synchronous
printing and explicit host checks. The controller reads state through
`getDocument()` so it never owns or mutates editor state. Mutation-only cycles
reuse a top-level measurement only when the immutable model node, DOM element,
page body width, and referenced footnote heights remain identical; observed DOM
changes explicitly dirty their owning block. Resize, font, window, manual, and
print cycles clear the cache. Set `incremental: false` to force full measurement
on every cycle.

`createDOMEditablePageController(root, getDocument, geometry, options)` couples
that measured lifecycle to `DOMEditablePageSurface`. The surface inserts
non-interactive sibling sheets, keeps one continuous contenteditable tree, and
uses transient visual offsets plus non-model continuation spacing. Paragraphs
split at measured line boundaries, lists split between canonical list items,
and tables split at rowspan-safe row groups. Paragraph gap widgets are excluded
from DOM-to-model offsets and model-to-DOM traversal, so carets on either side
resolve to one logical boundary and a range crossing the widget retains its
document offsets. A split table remains one editable
table with the same row nodes; page shells render read-only, accessibility-hidden
copies of its canonical leading header rows. Multi-row headers preserve
`rowspan` and `colspan` only when each rowspan closes within the leading header
band; a header spanning into body rows is kept canonical but not repeated.
Transitive body rowspans form one unsplittable row group. DOM order, model-node identity,
model paths, selection/input handlers, and persisted JSON remain unchanged.
Canonical `page_header` nodes must precede ordinary body content; canonical
`page_footer` and `footnote_definition` nodes must follow it. The surface keeps
those nodes uniquely editable in rails before and after the sheet stack, then
projects sanitized, read-only, accessibility-hidden header/footer and
page-assigned footnote copies into each sheet. Page fields are resolved in the
copies, while edits continue to target the one canonical model node and trigger
a fresh projection. Missing sources, unsupported structural fragments, invalid
page-intent order, and presentation-integrity warnings produce typed `issues`
and `mode: 'continuous'`. Unsplittable rows, images, media, details, code, and
custom NodeViews stay canonical and editable: they move intact to the next page
when they fit, or receive an explicit non-clipping layout-overflow marker when
taller than its body. A host-declared custom continuation may be rendered
across read-only or print sheets, but it is not automatically a safe editable
split. If its placement spans pages, this guarded controller reports
`fragmented-editable-source` and returns to continuous mode. `onFallback` can
explain the transition in host UI. At viewports below 720 CSS pixels, or when the
embedding container cannot fit a complete sheet, the surface removes every
continuation widget, intent rail, page copy, and visual offset. Widening the same
mounted host restores paged mode without replacing selection/history state. Destroy the page
controller before the owning `EditorView` so it can restore host classes,
variables, and source annotations deterministically.

This is a guarded editable paginator, not completed Word-style pagination.
Chromium, Firefox, and WebKit gates verify A4/Letter sheet rectangles, stable
named-page assignment, per-page headers/numbers, footnote placement, forced
print breaks, accessibility-copy suppression, and removal of transient editor
state. A real Chromium gate additionally verifies A4/Letter PDF page
counts, MediaBox dimensions, resolved headers/page fields, body/list/table text,
page-local footnotes, manual-break placement, and absence of the hidden
accessibility duplicate. Editable split paragraphs, canonical list items, and
rowspan-safe table row groups are covered. Canonical page-furniture/footnote
rails and their page-local projections, oversized-row behavior,
split-container comments, top-level movement, and canonical
image/audio/details/code/custom-NodeView placement and interaction are also
covered in dedicated browser fixtures. A complex-table fixture covers safe
two-row header repetition, mixed row/column spans, continued body groups, and
history. An imported semantic-HTML fixture additionally verifies alignment and
text-style marks, ruby, math, nested multi-block quotes/lists, merged tables, a
forced page break, and exact once-only generated-PDF body text. Broader adversarial print
fidelity remains active work.
See [PAGINATION.md](PAGINATION.md) for the invariants and delivery gates.

## Word DOCX interchange

Import the optional platform-neutral entry from `fountainjs-editor/docx`:

```ts
const imported = importDOCX(bytes, schema, {
  maxArchiveBytes: 25 * 1024 * 1024,
  maxExpandedBytes: 80 * 1024 * 1024,
  maxDocumentXmlBytes: 25 * 1024 * 1024,
  maxMediaBytes: 32 * 1024 * 1024,
  maxMediaFiles: 100,
  maxXmlNodes: 500_000,
  maxXmlDepth: 128,
  createImageSource: image => mediaStore.put(image.bytes, image.contentType),
})

const generated = exportDOCX(editor.state.doc, {
  title: 'Project brief', creator: 'Example product', page: 'a4',
  resolveImage: source => authorizedMedia.read(source),
})
```

`importDOCX(input, schema, options?)` accepts `Uint8Array` or `ArrayBuffer`,
extracts only the document, numbering, document-relationship, and bounded
`word/media` parts, builds content through the receiving schema, and returns
`{ document, report }`. Verified raster images become bounded data URLs by
default; `createImageSource` can persist their copied bytes and return another
safe schema URL.
`exportDOCX(document, options?)` requires a validated Fountain `doc` node and
returns `{ bytes, report }`. Raster data URLs embed directly; the optional
`resolveImage` supplies already-authorized bytes for other sources because the
converter never fetches URLs. Reports contain immutable path-bearing issues and
a `bounded` or `lossy` fidelity value. See [DOCX.md](DOCX.md) for the precise
supported subset, fallback policy, resource limits, and security boundary.

## React

Import React bindings from `fountainjs-editor/react`:

- `useFountain` and `useFountainState`
- `FountainEditor`, `FountainToolbar`, and `FountainComposer`
- `FountainToolbarRoot`, `FountainToolbarGroup`, `FountainToolbarButton`, and
  `FountainToolbarIcon`
- `FountainSuggestionMenu`, `FountainSlashCommandMenu`, `FountainBubbleMenu`,
  `FountainFloatingMenu`, and `FountainCharacterCount`
- `ClipboardHistoryMenu`
- `Navigator`, `useNavigatorState`, and `useNavigatorTableOfContentsState`
- `FountainAIReview` and `useAIControllerState`
- `FountainAIConversation` and `useAIConversationState`
- `FountainAIGeneratedMedia` and `useAIGeneratedMediaState`
- `createReactNodeView(Component, options?)` and `ReactNodeViewProps`

`useFountain(config)` creates one editor for the component lifetime. Its config
is constructor input rather than reactive props. In development Strict Mode,
duplicate render probes share that one pending editor; abandoned renders and
the final unmount destroy it exactly once. To switch a live collaboration room,
document, or provider, keep the editor and call `replaceCollaborationAdapter`
instead of expecting a changed config object to reconstruct the hook.

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

`FountainToolbar` exposes stable `FountainToolbarGroupId` and
`FountainToolbarActionId` contracts. Configure `groups`, `actionOrder`,
`hiddenActions`, `groupLabels`, `actionLabels`, `actionIcons`, and
`renderAction`; choose the default contextual `tableControls: 'menu'` or the
complete `tableControls: 'expanded'` icon group. `FountainComposer.toolbarProps`
forwards the same options.
The standalone toolbar primitives can compose product-owned commands without
mounting the supplied toolbar. See [TOOLBAR.md](TOOLBAR.md) for the complete ID
registry, render context, keyboard/focus contract, responsive behavior, and
non-React boundary.

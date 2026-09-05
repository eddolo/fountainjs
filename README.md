# FountainJS

[![npm version](https://img.shields.io/npm/v/fountainjs-editor?color=6d4aff)](https://www.npmjs.com/package/fountainjs-editor)
[![CI](https://github.com/eddolo/fountainjs/actions/workflows/ci.yml/badge.svg)](https://github.com/eddolo/fountainjs/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/fountainjs-editor)](LICENSE)

**A full-featured rich-text editor for any web app or frontend framework.**

FountainJS is an open-source TypeScript library you add to a website or web app. It includes rich text, images, tables, comments, tracked changes, collaboration, and named version history. Use it with React, Vue, Svelte, Angular, plain JavaScript, or a Web Component, and store its portable document JSON on any backend.

Underneath those ready-made features is a modular editing engine: a typed document model, selections, transactions, plugins, history, and a plain DOM view. The interfaces and optional capabilities are replaceable, so a product can add or change content types, commands, formats, UI, storage, collaboration, and services without forking the core.

> `0.3.0` is an early public beta and a ground-up replacement for the `0.2.x` proof of concept.

## What “language agnostic” means

The editor runtime is JavaScript/TypeScript because it edits a browser DOM. FountainJS does not pretend an npm package executes natively in Python or Go.

Its boundaries are language and framework agnostic:

- Use the DOM API directly from any frontend framework.
- Register the standards-based `<fountain-editor>` Web Component in React, Vue, Svelte, Angular, plain HTML, or any Custom-Element-capable environment.
- Use the first-party React package when React-specific hooks and components are useful.
- Persist stable JSON that any backend language can store, validate, index, or transform.
- Add nodes, marks, plugins, commands, formats, and host services through one extension contract.

React is an adapter, not the architecture. AI is an optional module, not the product identity.

## What “open source” means

Every capability counted as shipped has public source, types, tests, and
documentation and belongs in this public MIT-licensed package. The MIT license
allows commercial use, modification, forks, redistribution, and private
application code. FountainJS has no paid editor tier, private feature registry,
license-key unlock, or mandatory Fountain-hosted service. Optional entry points
keep the surface modular so applications only load what they use.

This does not promise costless infrastructure. Your application may pay its
chosen database, file storage, server, conversion service, collaboration host,
or model provider. Those systems stay behind replaceable interfaces: you may
self-host, use local implementations, or choose a third party without changing
the document engine. A practical test is that FountainJS continues to work
without a Fountain account and can be maintained from a fork if this project
disappears.

## Install

```bash
npm install fountainjs-editor
```

React is an optional peer dependency. Install `react` and `react-dom` only when importing `fountainjs-editor/react`.
Yjs is also optional. Install `yjs` only when importing
`fountainjs-editor/yjs` for real-time collaboration.

## Compose an editor

Use the supplied rich-document extension, add behavior, and define your own capability:

```ts
import {
  CoreExtension,
  EditorView,
  composeExtensions,
  createEditor,
  defineExtension,
  historyPlugin,
  insertNode,
} from 'fountainjs-editor';

const callout = defineExtension({
  name: 'callout',
  nodes: {
    callout: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'info' } },
      parseDOM: [{
        tag: 'aside[data-fountain-callout]',
        getAttrs: (element) => ({ tone: element.dataset.tone ?? 'info' }),
      }],
      toDOM: (node) => ['aside', {
        'data-fountain-callout': '',
        'data-tone': node.attrs.tone,
      }, 0],
    },
  },
  commands: {
    insertCallout: (editor, text = 'A useful callout') => {
      const { schema } = editor.state;
      return insertNode(editor, schema.node('callout', { tone: 'info' }, [schema.text(text)]));
    },
  },
  services: {
    analytics: { track: (event) => console.info('editor event', event) },
  },
});

const kit = composeExtensions([
  CoreExtension,
  defineExtension({ name: 'history', plugins: [historyPlugin] }),
  callout,
]);

const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
const view = new EditorView(document.querySelector('#editor')!, editor, {
  blockHandles: true,
});
const commands = view.commandManager(kit.commands);

commands.commands.insertCallout('This command came from an extension.');
commands.chain().focus('end').insertText('Atomic ').toggleMark('strong').run();
commands.can().insertImage({ src: '/cover.jpg', alt: 'Cover' });
```

Chains stop and roll back when any command returns `false` or throws. A successful
chain is dispatched once, so subscribers and history see one atomic edit. `can()`
runs the same command logic against temporary state without changing the editor.
`EditorView.commandManager()` adds a view-aware `focus('current' | 'start' | 'end')`
command; use `createCommandManager()` when there is no DOM view.
Use `.command(name, ...args)` for an extension command named `run`, `command`, or
`chain`, since those names are reserved by the fluent API.

Composition rejects duplicate extension names and conflicting node, mark, command, format, or service names by default. Use `{ onConflict: 'replace' }` only for an intentional override.

An extension can contribute:

- `nodes` and `marks` to the schema
- stateful `plugins`
- reusable `commands`
- `formats` with parse/serialize boundaries
- open-ended `services` interpreted by the host application

## Create and verify an extension

FountainJS ships an extension generator rather than leaving every author to
invent package, type, test, and compatibility setup:

```bash
npx fountainjs-editor create-extension ./fountain-callout --name callout
cd fountain-callout
npm install
npm run check
```

The generated framework-neutral package includes versioned manifest metadata,
an ordered dependency declaration, a typed example node/command, and fixtures
for `assertExtensionConformance` from `fountainjs-editor/testing`. The test entry
checks schema/JSON round-trips and guarantees command dry-runs do not mutate or
notify. Its `npm run doctor` command checks the complete ordered installation
for manifest, dependency, duplicate-name, and contribution conflicts before an
editor starts. The generator previews with `--dry-run` and refuses to overwrite a
non-empty directory. Read the [complete extension authoring and compatibility
policy](docs/EXTENSIONS.md) before publishing or changing stored node data.

## Production table editing

Tables use a span-aware `TableMap`, so logical rows and columns remain correct
through `rowspan` and `colspan`. The public command set covers row/column
insertion and deletion, merge/split, row/column/cell header toggles, whole-row
and whole-column selection, exact column widths, repair, and spreadsheet-style
TSV paste. Rectangular copy writes both plain TSV and an HTML table. Resizing is
available from an accessible pointer/keyboard handle and the React toolbar.
Column widths round-trip through JSON and safe HTML.

```ts
selectCells(editor, [0, 0, 0], [0, 1, 1])
mergeTableCells(editor)
splitTableCell(editor)
resizeTableColumn(editor, 180)
toggleTableHeaderRow(editor)
```

`TableEditingExtension` is part of `StarterKit`; it repairs non-rectangular
geometry after arbitrary host transactions without adding repair steps to local
undo history.

## Nested block reordering

`moveNode` is a framework-neutral, path-based command for same-parent or
cross-parent moves. It rejects cycles and validates the whole result before one
undoable transaction is dispatched. `canMoveNode` is its side-effect-free
availability check; `moveBlock` remains the top-level shortcut.

```ts
const move = { fromPath: [2, 1], toParentPath: [4], toIndex: 0 }
if (canMoveNode(editor, move)) moveNode(editor, move)
```

Pass `blockHandles: true` to `EditorView`, `FountainEditor`,
`FountainComposer`, or `registerFountainElement`. The supplied contextual
toolbar follows top-level and nested blocks, adds a native drag handle, shows
only schema-valid before/after indicators, and provides labelled move buttons
for keyboard and touch users. Hosts can filter candidates and replace every
label, or call the same commands from wholly custom UI. See the
[block-reordering guide](docs/BLOCK_REORDERING.md).

## Collapsible details

`DetailsExtension` adds native, editable `<details>` / `<summary>` disclosures
without changing `StarterKit`. The summary supports inline formatting and the
body accepts any blocks in the composed schema, including lists, tables, media,
and nested disclosures.

```ts
import { DetailsExtension, insertDetails } from 'fountainjs-editor/details'
import { StarterKit, composeExtensions } from 'fountainjs-editor'

const kit = composeExtensions([...StarterKit.extensions, DetailsExtension])
insertDetails(editor, { summary: 'Deployment notes', open: true })
```

Clicking the native marker persists the `open` state. Enter in a summary creates
the first body paragraph, Backspace at the start of that paragraph returns to
the summary, and Ctrl/Cmd+Enter toggles it. JSON is lossless; safe HTML,
Markdown, and text interchange are supported; generic Yjs collaboration carries
the structure and state. See the [collapsible-details guide](docs/DETAILS.md).

## Ruby pronunciation annotations

The optional `fountainjs-editor/ruby` entry adds semantic, editable reading
guides such as Japanese furigana. It is unrelated to the Ruby programming
language. The selected base text and all of its marks stay in the document,
while the reading is stored as validated `rt` metadata.

```ts
import { RubyExtension, setRuby } from 'fountainjs-editor/ruby'
import { StarterKit, composeExtensions } from 'fountainjs-editor'

const kit = composeExtensions([...StarterKit.extensions, RubyExtension])
setRuby(editor, { annotation: 'とうきょう' }) // selected 東京
```

The native NodeView renders `<ruby>/<rb>/<rt>/<rp>` and supplies an accessible,
IME-safe click/keyboard editor that a host may replace. JSON is lossless;
semantic HTML and Markdown round-trip; plain text reads `東京 (とうきょう)`;
and generic Yjs collaboration carries both base edits and reading changes. See
the [ruby-annotation guide](docs/RUBY.md).

## Complete text styles

`CoreExtension` and `StarterKit` include validated foreground/background
colour, font-family, font-size, and line-height marks. The isolated
`fountainjs-editor/text-style` entry exposes framework-neutral commands and
selection inspection for both the supplied UI and custom controls:

```ts
import {
  getActiveTextStyle,
  setFontFamily,
  setFontSize,
  setLineHeight,
} from 'fountainjs-editor/text-style'

setFontFamily(editor, 'Atkinson Hyperlegible, sans-serif')
setFontSize(editor, '18px')
setLineHeight(editor, 1.7)
console.log(getActiveTextStyle(editor))
```

Values are normalized and bounded before entering portable JSON. Safe HTML and
Fountain Markdown round-trip the complete suite, generic Yjs synchronization
carries the marks unchanged, and the React toolbar supplies a responsive
`Text styles` panel. See the [text-style guide](docs/TEXT_STYLE.md).

## Print-aware page foundation (active)

The isolated `fountainjs-editor/pages` entry provides a runtime-DOM-independent
page-flow algorithm and portable manual page-break, footnote, and canonical
header/footer template semantics. Templates support default, first, odd, and
even variants plus current-page/page-count fields.
Automatic page boundaries are measurements, not JSON, so two collaborators
with different fonts or viewports cannot overwrite each other's document.

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
} from 'fountainjs-editor/pages/dom'
import { renderDOMPagePreview } from 'fountainjs-editor/pages/preview'

const kit = composeExtensions([CoreExtension, PagesExtension])
insertFootnote(editor, { id: 'source-1', content: 'Source text' })
setPageTemplate(editor, { kind: 'footer', content: 'Page ' })
selectPageTemplate(editor, 'footer')
insertPageField(editor, 'page-number')

const geometry = createPageGeometry({
  size: 'a4',
  margins: 20,
  headerHeight: 32,
  footerHeight: 32,
  unitsPerMillimetre: 96 / 25.4,
})
const result = layoutPages(measuredFlowItems, geometry) // any measurement host
const presentation = projectPagePresentation(editor.state.doc, result)
view.dom.style.boxSizing = 'content-box'
view.dom.style.inlineSize = `${geometry.size.width - geometry.margins.left - geometry.margins.right}px`
const browserResult = layoutDOMPages(view.dom, editor.state.doc, geometry)
renderDOMPagePreview(view.dom, previewElement, geometry, browserResult)
const controller = createDOMPageLayoutController(
  view.dom,
  () => editor.state.doc,
  geometry,
  { onLayout: ({ snapshot }) => renderDOMPagePreview(view.dom, previewElement, geometry, snapshot) },
)
// controller.destroy() when the host view is removed

// Or keep one live contenteditable over guarded visual page shells.
const editablePages = createDOMEditablePageController(
  view.dom,
  () => editor.state.doc,
  geometry,
  {
    onFallback: issues => console.warn('Using continuous editing', issues),
  },
)
// editablePages.destroy() before destroying the EditorView
```

The foundation covers legal fragments, keep-with-next, widow/orphan minima,
continuation overhead, page-local footnote reservation, canonical editable
templates, dynamic page fields, overflow diagnostics, undo, JSON, semantic
HTML, and Yjs. Its immutable presentation plan selects first/odd/even/default
furniture, resolves page fields, and assigns canonical footnotes to measured
pages without cloning the model. The separate `pages/dom` adapter measures real line boxes, list
items, rowspan-safe table groups, footnotes, and manual breaks without moving
editable DOM. Every measured fragment includes an immutable source map with its
model path, structural child paths, clip offset, and height for non-destructive
continuation rendering. `projectDOMPageContent()` joins the neutral layout back
to exact validated source slices and separates repeated continuation overhead.
Its optional controller coalesces DOM mutations, resize, font,
window, and print invalidations into timed snapshots and has explicit teardown.
Mutation-only cycles reuse geometry only when both the immutable model node and
rendered top-level element are unchanged, even when a structural insertion or
removal shifts their top-level path. The view retains those unchanged DOM
objects and rebases rendered paths, while the page cache rebases item,
fragment, template, warning, and structural source paths without rereading
geometry. Changed footnote heights still invalidate their cached references.
Resize, font, manual, and print cycles remeasure fully, and
`{ incremental: false }` disables reuse for specialized hosts.
`createDOMEditablePageController()` adds a responsive screen-editing surface
without cloning, moving, or reordering any editable model node. Whole top-level
blocks receive transient visual offsets over fixed page shells. A paragraph can
also continue across sheets: the adapter inserts accessibility-hidden,
non-model gap widgets at measured line boundaries, marks them as Fountain
widgets so selection mapping ignores them, and removes them before every fresh
measurement. The paragraph remains one model node inside the same
`contenteditable`; selection, IME, undo/redo, tracked-change decisions, and Yjs
convergence are covered across its page boundaries. Lists continue between
canonical list items without cloning them. Tables continue only at
rowspan-safe row-group boundaries: the one canonical table and every real row
stay editable, while transient non-model spacer rows align each continuation
and page shells show accessibility-hidden, read-only copies of the canonical
column header. Multi-row headers retain their row/column spans when every
rowspan stays inside the header band; Fountain omits an unsafe repeated header
when a header cell spans into body rows. Transitive body rowspans remain one
legal group and are never cut apart. Header edits update every copy on reflow. Selection, IME,
undo/redo, tracked-change decisions, and Yjs convergence are covered across
both list and table page boundaries. Canonical header templates remain editable
once in a rail before the page stack; canonical footer templates and footnote
definitions remain editable once after it. Every sheet receives a sanitized,
read-only, accessibility-hidden copy with resolved page fields and only the
footnotes assigned to that page. Editing a canonical source rebuilds every copy
without creating another model path, editable control, or persisted node.
Narrow viewports or
embedding containers that cannot fit a complete sheet return to a normal
continuous editor, and a host resize restores paged mode without remounting the
editor. Layout never persists automatic page numbers or continuation widgets
into the shared document. Unsupported structural fragments or page intent in
an invalid canonical order produce a typed continuous-mode fallback. An
individual table row, image, media player, disclosure, code block, or custom
NodeView stays one canonical editable node. Unsplittable content moves to the
next page when it fits and is marked as explicit overflow rather than clipped
or destructively split when it is taller than the body.
That guarded boundary is intentional; it is not yet complete Word-style
editable pagination.
The separate `pages/preview` entry renders non-destructive read-only page sheets,
repeated templates and fields, structural continuations, page-local footnotes,
and print page breaks. Editing-only selection markers and field-token styling
are removed from visual copies, and the continuous accessibility copy is omitted
from print. It installs print-only physical `@page` rules matching the geometry;
pass `{ includePrintStyles: false }` only when the host owns those global rules.
Browser geometry must use CSS-pixel units (for example,
`unitsPerMillimetre: 96 / 25.4`) for physical A4/Letter output. Visual clipped
copies are hidden from assistive technology while one continuous read-only copy
preserves document semantics. Real Chromium PDFs verify A4/Letter geometry and
page-specific header/field, body, list, table, footnote, and manual-break text
without a duplicate hidden document. Whole blocks, measured paragraph lines,
canonical list items, and rowspan-safe table row groups are editable across
pages. Editable canonical page furniture and page-local footnotes, oversized-row
behavior, split-container comments, and top-level block movement now have
dedicated browser contracts. A real browser contract also covers canonical
image, audio, details, code, and custom NodeView placement, interaction, history,
and explicit oversized overflow. Another covers merged two-row headers,
rowspan-safe body groups, header-copy sanitization, and history after a table
continuation. Broader adversarial/cross-engine PDF fidelity
remains active `DOC-14` work with explicit browser and accessibility gates in
[the pagination contract](docs/PAGINATION.md).

## Optional clipboard history

`ClipboardHistoryExtension` adds a bounded, searchable list of text copied
inside an editor. Normal Ctrl/Cmd+C, Ctrl/Cmd+X, and Ctrl/Cmd+V keep their native
behavior. Ctrl/Cmd+Alt+V (or `openClipboardHistory`) opens the supplied React
picker when it is mounted. Every shortened preview has the complete value in a
hover title and can be expanded to read the full text before pasting.

```ts
const kit = composeExtensions([
  ...StarterKit.extensions,
  createClipboardHistoryExtension({ maxEntries: 25 }),
])
```

History is memory-only by default, belongs to that editor instance, and never
uploads anything. Persistence happens only when an application explicitly
passes its own synchronous `{ load, save }` adapter. Commands are available for
open, close, paste, remove, and clear, so non-React products can render the same
immutable state in any interface.

## Optional document utilities

Mentions, emoji, typography, and character/word limits are independent modules
from `fountainjs-editor/document-utilities`; none is imposed by `StarterKit`.
Mention and emoji suggestions share an abortable, stale-safe headless
controller that any framework can render. The React entry includes an
accessible positioned listbox and live count.

```ts
import {
  EmojiExtension,
  TypographyExtension,
  createCharacterCountExtension,
  createMentionExtension,
} from 'fountainjs-editor/document-utilities'

const kit = composeExtensions([
  ...StarterKit.extensions,
  createMentionExtension({ suggestions: [{ char: '@', items: findPeople }] }),
  EmojiExtension,
  TypographyExtension,
  createCharacterCountExtension({ limit: 5_000 }),
])
```

The default emoji module keeps a curated common search catalogue while converting
any typed or pasted Unicode emoji. Applications that want the complete
searchable RGI catalogue can import `UnicodeEmojiExtension` or `unicodeEmojis`
from the isolated `fountainjs-editor/emoji-data` entry. See the
[document-utilities guide](docs/DOCUMENT_UTILITIES.md) for every option,
headless UI contracts, accessibility, persistence, and interchange behavior.

### Slash command registry

`createSlashCommandExtension()` adds a headless `/` command menu without adding
any UI-framework dependency. Its live `SlashCommandRegistry` combines built-in,
product-owned, and asynchronous sources; performs stable multi-term filtering;
aborts stale searches; and executes the selected command atomically. A failed
command restores the literal query and the complete previous document.

```ts
import {
  SlashCommandRegistry,
  createSlashCommandExtension,
} from 'fountainjs-editor/document-utilities'

const registry = new SlashCommandRegistry()
registry.registerItems('product', [myCalloutCommand, myTemplateCommand])
const slash = createSlashCommandExtension({ registry })
```

Any surface can render `kit.services.slashCommands.getController(editor)`.
React applications can use the grouped, viewport-aware
`FountainSlashCommandMenu`. See the complete [slash-command guide](docs/SLASH_COMMANDS.md).

## Contextual bubble and floating menus

`BubbleMenuExtension` and `FloatingMenuExtension` are separate opt-in modules.
Their framework-neutral controllers derive eligibility from semantic selections,
support named instances and safe custom `shouldShow` rules, and never persist UI
state. Reusable DOM geometry resolves marked/cross-wrapper text, node, and cell
selections and flips/clamps menus within the viewport.

React hosts can render any product controls inside `FountainBubbleMenu` and
`FountainFloatingMenu`; other frameworks subscribe to the same controller and
use `getEditorMenuAnchorRect()` plus `placeEditorMenu()`. See the full
[contextual-menu guide](docs/CONTEXTUAL_MENUS.md).

## Composable React toolbar

The supplied `FountainToolbar` uses dependency-free SVG icons with complete
accessible names. Stable group/action IDs let a product reorder groups and
actions, hide controls, replace labels or icons, and wrap or replace any action.
`FountainComposer` accepts the same configuration through `toolbarProps`.

```tsx
<FountainComposer editor={editor} toolbarProps={{
  toolbarLabel: 'Article formatting',
  groups: ['marks', 'block-types', 'history'],
  actionOrder: { marks: ['highlight', 'bold', 'italic'] },
  hiddenActions: ['strike', 'subscript', 'superscript'],
  actionLabels: { bold: 'Strong emphasis' },
}} />
```

Applications can instead assemble `FountainToolbarRoot`,
`FountainToolbarGroup`, and `FountainToolbarButton` around any FountainJS or
product command. Arrow/Home/End navigation is RTL-aware, mouse activation
preserves the model selection, and narrow toolbars scroll by intact groups.
See the complete [toolbar composition guide](docs/TOOLBAR.md).

## Native LaTeX mathematics

`MathExtension` is a first-party but opt-in module. It adds portable
`inline_math` and `math_block` nodes, `$...$` / `$$...$$` typing and paste
rules, insertion/update commands, accessible source fallback, and lossless
JSON plus HTML/Markdown/text interchange.

```ts
import katex from 'katex'
import {
  MathExtension, StarterKit, composeExtensions,
  createKaTeXRenderer, createMathExtension,
} from 'fountainjs-editor'

// Source-only fallback (no rendering dependency):
const portable = composeExtensions([...StarterKit.extensions, MathExtension])

// Or pass a caller-owned renderer:
const math = createMathExtension({ renderer: createKaTeXRenderer(katex) })
const rendered = composeExtensions([...StarterKit.extensions, math])
```

The editor stores TeX source—not renderer HTML. KaTeX is deliberately not a
runtime dependency: applications choose their renderer/version and may provide
another `MathRenderer` that returns a DOM node. Renderer errors keep the source
visible and editable through `setMathSource`.

## Lean 4 without mandatory hosting

`LeanExtension` is also opt-in. With no provider it supplies portable Lean code
blocks, insertion/update commands, Unicode backslash shortcuts, highlighting,
and an explicit source-only controller; no source leaves the editor and no
verification is claimed. Applications may attach a named local, remote,
managed, or one-shot provider for diagnostics, goals, hover, and completion.
Provider diagnostics render as mapped, transient decorations, and the optional
plain-DOM `LeanInfoView` exposes source-only/provider state plus proof results.
There is no built-in endpoint or credential storage.

```ts
const kit = composeExtensions([...StarterKit.extensions, LeanExtension])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })
kit.commands.insertLeanBlock(editor, 'example : True := by trivial')

const lean = kit.services.lean.createController(editor)
await lean.check() // explicit `not-checked` result in source-only mode
```

See [Lean integration and trust boundaries](docs/LEAN.md) for local bridge and
provider examples.

## Use any UI surface

### Plain DOM

```ts
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
const view = new EditorView(document.querySelector('#editor')!, editor, {
  placeholder: 'Start writing…',
  ariaLabel: 'Article body',
  imageUpload: async (file, { signal, reportProgress }) => {
    const body = new FormData();
    body.append('file', file);
    const response = await uploadWithProgress('/api/media', body, {
      signal,
      onProgress: reportProgress,
    });
    return response.json(); // { src, alt?, caption?, width?, srcset?, sizes? }
  },
  assetUpload: async (file, { kind, signal, reportProgress }) => {
    return myAssets.upload(file, { kind, signal, onProgress: reportProgress });
    // Returns a URL or typed audio/video/file attributes.
  },
});

const stopSaving = editor.subscribe((state) => saveDraft(state.doc.toJSON()));

// Cleanup:
stopSaving();
view.destroy();
editor.destroy();
```

### Production images

Block images support editable captions, alternative text, titles, left/centre/
right alignment, responsive `srcset`/`sizes`, safe load settings, explicit width
and height, load-error recovery, and mouse, touch, or keyboard resizing. Use
`insertInlineImage` when the image must live between text fragments. Both forms
remain typed, selectable nodes and round-trip through JSON and HTML; standard
Markdown image syntax covers their portable subset.

`startImageUpload` returns an observable task. Its insertion or replacement
target maps through edits made while the upload is running, so a slow response
cannot silently overwrite the wrong image. The host owns the transport and can
report progress; FountainJS supplies cancellation, retry state, validation, and
safe insertion:

```ts
const task = startImageUpload(editor, file, {
  placement: 'block', // or 'inline'
  upload: async (file, { signal, reportProgress }) =>
    myAssets.upload(file, { signal, onProgress: reportProgress }),
})

const unsubscribe = task.subscribe(snapshot => renderUpload(snapshot))
task.cancel()
await task.retry() // available after a failed attempt
```

Pass `replacePath` to replace an existing block or inline image without losing
its metadata. Upload state is transient and local; credentials, files, and
progress never enter document JSON.

### Native audio, video, files, and safe embeds

`StarterKit` includes the independently composable `MediaExtension`. It adds
typed `audio`, `video`, `file_attachment`, and `embed` nodes without depending
on React. Native playback attributes include controls, autoplay, loop, mute,
preload, remote-playback policy, CORS mode, captions/subtitle tracks, video
posters, inline mobile playback, dimensions, alignment, titles, and captions.
File nodes retain a safe URL, visible name, MIME type, byte size, description,
and optional download name.

```ts
insertAudio(editor, {
  src: 'https://cdn.example.com/episode.mp3',
  title: 'Episode 12',
  controls: true,
  tracks: [{
    src: 'https://cdn.example.com/episode-en.vtt',
    kind: 'captions', srclang: 'en', label: 'English', default: true,
  }],
})

insertVideo(editor, {
  src: 'https://cdn.example.com/launch.mp4',
  poster: 'https://cdn.example.com/launch.webp',
  title: 'Launch film', width: '720px', controls: true, playsInline: true,
})

insertFileAttachment(editor, {
  src: 'https://cdn.example.com/brief.pdf',
  name: 'Project brief.pdf', mimeType: 'application/pdf', size: 125_000,
})
```

Embeds are fail-closed. The default module canonicalizes approved YouTube URLs
to `youtube-nocookie.com` and Vimeo URLs to `player.vimeo.com`, then renders a
titled, lazy, referrer-limited, sandboxed iframe. An arbitrary iframe URL is
rejected at command, JSON-import, attribute-update, and HTML-import boundaries.
Replace the entire allowlist when your product trusts another provider:

```ts
const media = createMediaExtension({
  embedProviders: [{
    name: 'acme-video',
    sandbox: 'allow-scripts allow-same-origin',
    allow: 'fullscreen; picture-in-picture',
    resolve(url) {
      const match = url.hostname === 'video.acme.test'
        ? url.pathname.match(/^\/(?:watch|embed)\/(\d+)$/)
        : null
      return match ? `https://video.acme.test/embed/${match[1]}` : null
    },
  }],
})

const kit = composeExtensions([
  ...StarterKit.extensions.filter(extension => extension.name !== 'media'),
  media,
])
```

A provider resolver must recognize both its public input URLs and its own
canonical output URL. Persisted `allow`, `sandbox`, and fullscreen capabilities
may only narrow the provider's declared policy, so imported HTML cannot widen
the provider's permissions.

`startAssetUpload` supplies the same observable, mapped, cancel/retry and
fail-closed replacement behavior as image uploads. Audio and video are inferred
from MIME type; other files become attachments. Unlike small local images,
arbitrary assets are never embedded automatically: the application must pass an
`assetUpload` handler and remains responsible for storage, authorization,
malware scanning, quotas, and URL lifetime. Paste/drop emits the composed
`fountain-asset-upload` event for non-React hosts.

### Web Component

```ts
import { registerFountainElement } from 'fountainjs-editor';

registerFountainElement({
  schema: kit.schema,
  plugins: kit.plugins,
});
```

```html
<fountain-editor placeholder="Start writing…"></fountain-editor>

<script>
  const element = document.querySelector('fountain-editor');
  element.value = savedDocumentJSON;
  element.addEventListener('fountain-change', (event) => {
    save(event.detail.value);
  });
</script>
```

### React

```tsx
import { FountainComposer, useFountain } from 'fountainjs-editor/react';
import 'fountainjs-editor/styles.css';

export function WritingRoom() {
  const editor = useFountain({
    schema: kit.schema,
    plugins: kit.plugins,
    onUpdate: (state) => saveDraft(state.doc.toJSON()),
  });

  return <FountainComposer editor={editor} placeholder="Start writing…" />;
}
```

The React entry is separate, so the framework-neutral root does not load React. A new framework binding only needs to create an editor, subscribe to its immutable state, and mount or replace its view.

### Build interactive nodes

An extension node can provide a plain DOM `nodeView` for polls, diagrams,
mentions, embeds, or any product-owned widget. FountainJS keeps its instance and
live path across mapped edits, calls `update` when model data changes, mirrors
semantic node selection, isolates embedded controls with `stopEvent`, restores
unapproved DOM mutations, refreshes optional editable `contentDOM`, and calls
`destroy` on replacement or removal. React products can adapt a component with
`createReactNodeView` from `fountainjs-editor/react`; React remains absent from
the package root. See the [NodeView API](docs/API.md#custom-nodeviews) and the
[working plain-DOM demo](https://eddolo.github.io/fountainjs/demos/plain-dom-notes.html).

## Included document capabilities

`CoreExtension` supplies paragraphs, six heading levels, alignment, quotes, bullet/ordered/task lists, code blocks, tables, block/inline images, dividers, semantic hard breaks, links, highlights, text colour, subscript, superscript, and common text marks. Its commands are available both as named imports and through `kit.commands`. Lists support multi-block wrapping, selected-range type conversion, mixed nesting, multi-item indent/lift, ordered starts, task state, boundary joins, and nested HTML/Markdown interchange; the React controls toggle types and expose lift/indent actions. Tables support span-aware merge/split, structural repair, header scopes, full-row/column selections, column resizing, and TSV/HTML clipboard exchange. `StarterKit` also adds `MediaExtension`, safe link behavior, live language-aware code highlighting, and automatic table repair. Code tokens and optional line numbers are view-only decorations, language metadata round-trips through JSON/Markdown/HTML, the React toolbar edits language and line-number settings, and `createSyntaxHighlightExtension` accepts any host tokenizer through validated ranges. Link behavior includes normalization and validation hooks, typed web/email autolinking, link-on-paste, whole-link editing around a caret, host-owned activation, and complete React add/preview/edit/remove controls.

The editing core provides immutable state; mapped text, node, gap, all-document,
and rectangular table-cell selections; typed transactions; keyboard and IME
input; configurable input/paste rules; multiline and rich-HTML paste; image and
asset paste/drop/upload; schema-safe nested drag/button reordering; find/replace; Markdown shortcuts;
and configurable undo/redo that groups adjacent browser input.
JSON is the lossless source of truth; Markdown, safe HTML, and plain text are
interoperability boundaries.

```ts
const schema = new Schema(CoreSchemaSpec);
const document = MarkdownImporter.parse('# Hello\n\nA **bold** beginning.', schema);

const { markdown, losses } = MarkdownExporter.exportWithReport(document, {
  linkStyle: 'reference',
});
HTMLExporter.export(document, { document: false });
JSONExporter.export(document);
```

HTML export escapes text and attributes, rejects unsafe URL protocols, and
restricts generic extension output to non-executable semantic markup. Custom
nodes and marks pair `toDOM` with schema-owned `parseDOM` selector/attribute
rules, so configured extension content can survive HTML paste and round trips
without hard-coding the extension into FountainJS. Every imported document is
validated by the receiving schema. JSON remains the exact persistence format;
see the [format-boundary guide](docs/FORMATS.md).

Persisted documents can use an explicit, independently versioned envelope.
The migration runner accepts historical bare `NodeJSON` as format version 1,
applies only an application-owned sequential chain, rejects unknown future
versions, and validates the result with the receiving schema. It has no DOM
dependency and is also available from the isolated
`fountainjs-editor/migrations` entry.

```ts
const stored = encodeFountainDocument(editor.getJSON(), { validate })
const loaded = migrateFountainDocument(await database.read(id), { validate })
setContent(editor, schema.nodeFromJSON(loaded.envelope.document))
```

The structural envelope schema is published as
`fountainjs-editor/schema/document.json`. See the
[document migration contract](docs/MIGRATIONS.md) before changing persisted
nodes, marks, attributes, or content invariants.

Markdown import supports titled inline and reference links/images, recursive
quotes, loose nested lists, and aligned tables with escaped pipes. Export can
emit deterministic deduplicated references; `exportWithReport` identifies
every unsupported node, mark, or attribute projection by document path so a
publishing pipeline never has to guess what Markdown omitted.

## Optional real-time collaboration

The root package exposes a provider-independent collaboration boundary. The
separate `fountainjs-editor/yjs` entry adds conflict-free shared text and
structure, relative remote selections, accessible carets, deterministic room
initialization, and local-origin undo/redo.

```bash
npm install fountainjs-editor yjs
```

```ts
import * as Y from 'yjs'
import { CoreExtension, composeExtensions } from 'fountainjs-editor'
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs'

const ydoc = new Y.Doc()
const collaboration = createYjsCollaborationExtension({
  document: ydoc,
  provider: myWebSocketWebRTCOrManagedProvider,
  user: { id: user.id, name: user.name, color: '#6d4aff' },
})
const kit = composeExtensions([CoreExtension, collaboration])
```

Switching rooms does not require rebuilding the editor. Pass a fresh
`YjsCollaborationAdapter` to `replaceCollaborationAdapter(editor, adapter)`;
late updates from the retired document/provider are ignored and the previous
adapter is disconnected and destroyed once. Local cursor awareness is
deduplicated and throttled to a 32 ms cadence by default. React's `useFountain`
also creates only one editor across Strict Mode's duplicate development render.

See the [collaboration and Yjs guide](docs/COLLABORATION.md) for lifecycle,
provider, security, offline, and replacement examples.

The provider is optional. An app may transport Yjs updates itself, add offline
persistence to the same `Y.Doc`, select a managed provider, or leave
collaboration out. FountainJS hosts no room service and receives no document or
credential. Authentication, authorization, persistence, and provider trust
remain explicit application boundaries. See the
[collaboration and Yjs guide](docs/COLLABORATION.md).

## Optional threaded comments

`fountainjs-editor/comments` adds provider-independent review without putting
comment records into the document or choosing a hosted service. Inline ranges
(including cross-block selections), points, blocks, and the whole document can
carry overlapping threads. Anchors map through edits, recover from uniquely
matched replacement content, become visibly orphaned when recovery is unsafe,
and can be deliberately reattached.

```ts
import {
  InMemoryCommentsStore,
  createCommentThread,
  createCommentsExtension,
} from 'fountainjs-editor/comments'

const store = new InMemoryCommentsStore()
const comments = createCommentsExtension({
  adapter: () => store.createAdapter(),
  user: { id: session.user.id, name: session.user.name },
})
const kit = composeExtensions([CoreExtension, comments])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })

const thread = await createCommentThread(editor, {
  content: 'Can we verify this statement?',
})
```

Replies, editable text or rich-JSON bodies, reactions, resolve/reopen,
archive/restore, deletion, selection/hover events, and connection lifecycle are
available from the framework-neutral entry. The in-memory store is for local
use, prototypes, and tests. Production applications replace it with an adapter
for their REST, database, CRDT, or other authenticated store. Local permission
predicates control UI availability; the backend must independently authenticate
and authorize every operation.

React applications may add the optional accessible discussion panel from
`fountainjs-editor/react/comments`. See the [threaded-comments guide](docs/COMMENTS.md)
for anchors, storage operations, idempotency, permissions, security, and the
complete public workflow.

## Optional tracked changes

`fountainjs-editor/tracked-changes` turns normal schema-valid transactions into
portable review suggestions. It covers text insertion, deletion, exact
replacement, formatting, node attributes, atoms, tables, and structural edits;
each suggestion carries a stable id, author, timestamps, optional reason, and
optional comment-thread link.

```ts
import { CoreExtension, composeExtensions } from 'fountainjs-editor'
import {
  createTrackedChangesExtension,
  acceptTrackedSuggestion,
  rejectTrackedSuggestion,
} from 'fountainjs-editor/tracked-changes'

const tracked = createTrackedChangesExtension({
  user: { id: session.user.id, name: session.user.name, color: '#6d4aff' },
})
const kit = composeExtensions([CoreExtension, tracked])

acceptTrackedSuggestion(editor, suggestionId)
rejectTrackedSuggestion(editor, anotherSuggestionId)
```

Deleted and replaced content remains inspectable until review. Accept/reject
can target one suggestion, a range, an author, a filtered set, or everything;
decisions are undoable. Metadata lives in FountainJSON and synchronizes through
the optional Yjs adapter without a Fountain server. React applications can add
the accessible, full-text `FountainTrackedChanges` panel from
`fountainjs-editor/react/tracked-changes`; every other framework can subscribe
to the same headless state and commands. See the
[tracked-changes guide](docs/TRACKED_CHANGES.md) for representation, comments,
collaboration, APIs, and production security.

## Optional named versions

`fountainjs-editor/versions` provides durable named snapshots without choosing
a database or cloud. It includes paginated provider contracts, optimistic-head
conflicts, idempotent operations, manual and debounced automatic versions,
non-destructive preview, exact text/structure/format comparison, and safe
restoration. By default restoration first saves unsaved work as a backup,
applies one undoable editor transaction, and creates a new head linked to the
source version.

```ts
import {
  InMemoryVersionProvider,
  VersionController,
} from 'fountainjs-editor/versions'

const versions = new VersionController({
  editor,
  documentId: 'article-42',
  user: { id: session.user.id, name: session.user.name },
  provider: new InMemoryVersionProvider(),
})

const saved = await versions.save({ name: 'Ready for review' })
const comparison = await versions.compare(saved.id) // saved → current
await versions.restore(saved.id) // backup → restore → new linked head
```

The memory provider is for local use, demos, and tests; production apps replace
it with an authenticated provider for their own storage. React apps can import
the accessible, confirmation-gated `FountainVersions` panel from
`fountainjs-editor/react/versions`. Every other framework uses the same
controller store and methods. See the [named-versions guide](docs/VERSIONS.md)
for the provider contract, REST adapter, consistency rules, security, failure
behavior, and full UI workflow.

## Optional AI review module

AI is one example of a host service. FountainJS does not provide a model account or require a Fountain cloud. The optional `AIController` lets an application inspect exactly what will be sent, request a text proposal from any adapter, show a before/after review, accept or reject, block stale proposals, and undo acceptance.

```ts
const adapter = createAIAdapter(async (request, { signal }) => {
  const response = await fetch('/api/rewrite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  return response.json(); // { replacement, explanation?, model?, metadata? }
});

const ai = new AIController(editor, adapter);
const disclosure = ai.inspectRequest({ action: 'improve' });
const proposal = await ai.suggest({ action: 'improve' });

ai.accept(proposal); // one undoable editor transaction
// or: ai.reject(proposal);
```

Full-document context is off by default. The included `MCPAIAdapter` connects the same workflow to a compatible MCP Streamable HTTP tool; MCP is a transport option, not the AI itself. Never ship permanent provider credentials in browser code.

React applications can render the optional workflow with `<FountainAIReview controller={ai} />`.

## Honest comparison

FountainJS is not the first framework-neutral or extensible editor.

| Project | Architecture and maturity | Practical reason to choose it |
| --- | --- | --- |
| [ProseMirror + Tiptap](docs/PROSEMIRROR_COMPARISON.md) | Battle-tested ProseMirror engine plus Tiptap's mature extension, framework, UI, and optional service layer | Deep production history, ecosystem breadth, hosted services, and commercial support |
| [Plate](https://platejs.org/docs) | Powerful React/Slate framework with a broad plugin catalog | A React-first product with many polished capabilities ready now |
| [BlockNote](https://www.blocknotejs.org/docs) | Polished React block editor with an out-of-the-box Notion-like experience | Shipping a strong block UI quickly |
| **FountainJS** | DOM-first editor platform, Web Component, React adapter, and explicit extension composition | Owning a modular editor platform and keeping framework/data boundaries open |

Choose FountainJS when those boundaries matter and an early API is acceptable. Choose a mature alternative today when you need years of physical-device IME/mobile certification, a large plugin market, hosted collaboration administration, or commercial support.

Tiptap wraps ProseMirror. FountainJS independently implements the responsibilities
of both layers: its own engine plus one native extension and product-module
contract. The primary comparison is therefore FountainJS versus the combined
ProseMirror + Tiptap stack. Read the [one-to-one full-stack
comparison](docs/PROSEMIRROR_COMPARISON.md).

## React exports

- `useFountain` and `useFountainState`
- `FountainEditor`, `FountainToolbar`, `FountainComposer`, and the
  `FountainToolbarRoot` / `Group` / `Button` / `Icon` primitives
- `FountainSuggestionMenu`, `FountainSlashCommandMenu`, `FountainBubbleMenu`,
  `FountainFloatingMenu`, and `FountainCharacterCount`
- `FountainComments` from the isolated `fountainjs-editor/react/comments` entry
- `FountainTrackedChanges` from the isolated
  `fountainjs-editor/react/tracked-changes` entry
- `FountainVersions` from the isolated `fountainjs-editor/react/versions` entry
- `ClipboardHistoryMenu`
- `Navigator` and `useNavigatorState`
- `FountainAIReview` and `useAIControllerState`
- `createReactNodeView` and `ReactNodeViewProps`

## Development

```bash
pnpm install
pnpm dev
pnpm check
pnpm test:browser
pnpm pack:check
```

Generated bundles and dependencies are not committed. CI runs type checks,
behavioural tests, production and package builds, plus Playwright contracts in
Chromium, Firefox, WebKit, emulated Pixel Chrome, and emulated iPhone Safari.
Failed browser runs retain traces and screenshots.

The website includes [a ten-demo integration gallery](https://eddolo.github.io/fountainjs/demos.html) with dedicated working pages for React, plain DOM, the Web Component, Vue, Svelte, Angular, headless Node.js, and JSON boundaries with Python, Go, and Java. Framework recipes use the real supported adapter boundary; backend recipes are explicitly presented as portable JSON contracts rather than browser runtimes.

## Project status

The tested release supports multi-paragraph text selection plus mapped node,
gap, all-document, and rectangular cell selections; formatting across marked
and nested text; block splitting and joining; attributed text and alignment;
find/replace; rich content insertion; image URL/upload/paste/drop workflows;
reusable input and paste rules; links, lists, tasks, code, tables, local history,
interactive NodeViews, grouped browser input, structured clipboard and selected-
nested block drag/button reordering, mentions, emoji, typography, character limits, a live extensible
slash-command registry, framework-neutral bubble/floating menus, browser-event
plugin hooks, extensible schema composition,
safe format serialization, DOM/Web Component/React surfaces, optional AI
proposals, MCP transport, and optional provider-independent Yjs collaboration
with relative presence and origin-aware undo; plus optional provider-independent
threaded comments with mapped inline/block/document anchors and a replaceable
storage adapter; plus optional provider-independent tracked insertion,
deletion, replacement, formatting, attribute, and structural suggestions with
author metadata and individual, range, author, or batch decisions; plus optional
named manual/automatic versions with exact comparison, preview, backup-first
restoration, and replaceable persistence.

FountainJS is open about integration boundaries: host applications choose their media storage, persistence, authentication, and collaboration provider through adapters and services. No Fountain cloud account is required, and those product-specific systems are not silently bundled into the editor.

- [Architecture and internals](docs/ARCHITECTURE.md)
- [Performance, memory, reconciliation, and bundle budgets](docs/PERFORMANCE.md)
- [Mentions, emoji, typography, and character count](docs/DOCUMENT_UTILITIES.md)
- [Slash commands and runtime registrations](docs/SLASH_COMMANDS.md)
- [Bubble and floating menus](docs/CONTEXTUAL_MENUS.md)
- [Toolbar composition and stable action IDs](docs/TOOLBAR.md)
- [Nested block reordering and accessible handles](docs/BLOCK_REORDERING.md)
- [Collapsible details, commands, interchange, and accessibility](docs/DETAILS.md)
- [Ruby/furigana annotations, commands, interchange, and custom UI](docs/RUBY.md)
- [Validated font, size, line-height, foreground, and background styles](docs/TEXT_STYLE.md)
- [Collaboration, Yjs, providers, presence, and security](docs/COLLABORATION.md)
- [Threaded comments, anchors, adapters, permissions, and React UI](docs/COMMENTS.md)
- [Tracked changes, suggestion mode, review decisions, and React UI](docs/TRACKED_CHANGES.md)
- [Named versions, comparison, restoration, providers, and React UI](docs/VERSIONS.md)
- [ProseMirror + Tiptap parity programme and verified gap baseline](docs/TIPTAP_PARITY.md)
- [One-to-one full-stack comparison with ProseMirror + Tiptap](docs/PROSEMIRROR_COMPARISON.md)
- [Ten working integration demos](https://eddolo.github.io/fountainjs/demos.html)
- [API guide](docs/API.md)
- [Format boundaries](docs/FORMATS.md)
- [Document versions and migrations](docs/MIGRATIONS.md)
- [Print-aware page foundation and pagination gates](docs/PAGINATION.md)
- [Release and API stability policy](docs/RELEASES.md)
- [Platform-portability audit](docs/PORTABILITY_AUDIT.md)
- [Optional AI and MCP](docs/MCP.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © Paolo Cappuccini. Optional bundled data attribution is listed
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

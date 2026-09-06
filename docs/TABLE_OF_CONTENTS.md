# Live table of contents

FountainJS provides a platform-neutral heading index through the optional
`fountainjs-editor/table-of-contents` entry. It derives navigation state from
the immutable document and logical selection; it does not read the DOM, measure
layout, or persist presentation-only anchors in document JSON.

## Install the identity and index extensions

Compose the table of contents after stable node identities:

```ts
import { CoreExtension, composeExtensions, createEditor } from 'fountainjs-editor'
import { StableNodeIdsExtension } from 'fountainjs-editor/node-ids'
import {
  TableOfContentsExtension,
  getTableOfContentsState,
  navigateTableOfContents,
} from 'fountainjs-editor/table-of-contents'

const kit = composeExtensions([
  CoreExtension,
  StableNodeIdsExtension,
  TableOfContentsExtension,
])

const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })
const outline = getTableOfContentsState(editor)

console.log(outline?.entries) // flat document order
console.log(outline?.tree)    // normalized hierarchy
navigateTableOfContents(editor, outline?.entries[0]?.id ?? '')
```

The extension manifest declares `stable-node-ids` as a requirement, so
`composeExtensions` reports an incorrect order or missing dependency before the
editor starts. The pure builder can still operate without IDs, but its entries
are explicitly marked `stable: false` and use path-derived compatibility keys.

## State contract

`TableOfContentsState` is an immutable snapshot:

```ts
interface TableOfContentsState {
  readonly entries: readonly TableOfContentsEntry[]
  readonly tree: readonly TableOfContentsTreeEntry[]
  readonly activeId: string | null
}
```

Each entry exposes:

- stable `id` and view-only `anchor` values;
- normalized visible `title`;
- original heading `level` and gap-free hierarchy `depth`;
- current immutable model `path`, `from`, and `to` positions;
- `stable`, which is false only for the path fallback.

Skipped levels do not produce empty hierarchy nodes. For example, an H1
followed by an H3 has depths zero and one. Identical titles remain separate
because identity comes from the node rather than its text. Editing a title or
moving the heading updates its title/path/positions without changing its ID or
anchor.

`activeId` follows the closest preceding heading at the current logical
selection. This is deterministic in headless, collaborative, and rendered
editors. A host may separately add viewport-based scroll-spy behavior, but
scroll position is intentionally not part of the document engine.

## Headless indexing

`buildTableOfContents(document, options?)` builds the flat and tree projections
without constructing an editor. `createTableOfContentsState(document,
selection, options?)` additionally computes the active section. Both run in
Node.js without `window`, `document`, jsdom, or another fake DOM.

Options configure heading node types, minimum/maximum levels, identity
attribute, DOM-anchor prefix, and maximum displayed title length. Inputs are
validated and copied before use; changing the caller's option arrays later does
not change the extension.

## Navigation and rendering

`navigateTableOfContents(editor, idOrAnchor)` resolves the entry against the
current snapshot and dispatches a logical selection at the heading start. It
returns false for a missing or stale target. The command never queries a DOM
node and therefore works for custom renderers.

When the DOM view is present, extension decorations add the following
presentation-only attributes to headings:

```html
<h2
  id="fountain-heading-fjs-…"
  data-fountain-toc-id="fjs-…"
  data-fountain-toc-level="2"
  class="fountain-toc-heading"
>
```

Those attributes are stable across selection changes and are not included in
JSON, Markdown, HTML export, clipboard payloads, history, or collaboration. A
renderer may use `entry.anchor` to scroll after the model command succeeds and
style active navigation from `activeId` without rebuilding editor content.

## React

The supplied `Navigator` reads the same plugin state, renders a labelled
navigation landmark, exposes the active item through `aria-current="location"`,
indents by normalized depth, preserves complete titles in `title`, and scrolls
the selected heading into view.

```tsx
import { FountainEditor, Navigator } from 'fountainjs-editor/react'

<aside><Navigator editor={editor} /></aside>
<FountainEditor editor={editor} />
```

`useNavigatorTableOfContentsState(editor)` exposes `{ entries, activeId }` for
custom React interfaces. The older `useNavigatorState(editor)` remains
available and returns the flat entry list for compatibility.

## Persistence and collaboration

The table of contents itself is derived state and must not be stored. Persist
the Fountain document, including its stable node IDs. Generic Yjs
collaboration carries those IDs as normal attributes, so peers derive the same
anchors while independently tracking their own active selection.

HTML and Markdown interchange do not promise to preserve Fountain identity.
Imported headings receive fresh stable IDs through the identity extension.

## Limits

- This is document navigation, not Word-style numbered-heading generation.
- The default active section follows the editor selection, not page or viewport
  geometry.
- Custom heading node types need a numeric `level` attribute or must normalize
  their content before indexing.
- If stable IDs are deliberately omitted, path anchors change after structural
  edits and must not be used as durable external references.

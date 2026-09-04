# Block reordering

FountainJS exposes block movement as a framework-neutral model operation. The
optional DOM controls, React composer prop, and Web Component configuration all
call the same command; none of them own a second document or persist UI state.

## Core command

`moveNode(editor, move)` moves any non-text node in one undoable transaction:

```ts
import { canMoveNode, moveNode } from 'fountainjs-editor'

const move = {
  fromPath: [3, 1],     // node in the current document
  toParentPath: [5],    // destination parent; [] means the document root
  toIndex: 0,           // final child index after the source is removed
}

if (canMoveNode(editor, move)) moveNode(editor, move)
```

All paths are resolved against the document that exists when the command runs.
`toIndex` is the node's final index, not a pre-removal boundary. For example,
moving child `1` to index `2` in the same parent changes `A, B, C` into
`A, C, B`. `moveBlock(editor, from, to)` remains as the compatible top-level
shortcut and delegates to `moveNode`.

Before dispatch, FountainJS:

1. resolves the source and destination from the current immutable tree;
2. rejects the root, text nodes, malformed paths, no-ops, and descendant cycles;
3. removes the source and remaps a destination path shifted by that removal;
4. inserts the source at its final index;
5. validates the complete result against the active schema;
6. dispatches one transaction and selects the moved node's first text leaf, or
   the node itself when it is an atom.

An invalid destination returns `false` and leaves state, history, selection,
plugins, and subscribers untouched. This is what prevents a paragraph from
being dropped directly into a list that accepts only list items, while allowing
valid list-item reordering and paragraph moves between block quotes. The command
does not serialize through HTML and does not flatten custom node attributes.

`canMoveNode` runs the same resolution and schema validation without dispatching.
Use it for disabled controls and drop previews. Both functions return `false`
for a read-only editor.

## Supplied DOM controls

Enable the optional controls on `EditorView`:

```ts
const view = new EditorView(mount, editor, {
  blockHandles: true,
})
```

The view displays one contextual toolbar for the active block. It follows the
text selection, node selection, pointer, and touch target. The toolbar contains:

- a native drag handle;
- a labelled move-before button;
- a labelled move-after button.

Move buttons use the path-based core command and are therefore usable by touch,
keyboard, switch input, and automation. Arrow Left/Right, Arrow Up/Down, and
Home/End traverse enabled toolbar controls, including right-to-left layouts. Buttons expose full
accessible names and hover titles, and disabled directions are real `disabled`
states. Coarse-pointer targets are at least 44 by 44 CSS pixels.

While dragging, only schema-valid targets show a visible before/after rule.
The input layer climbs from the deepest hovered block to an eligible ancestor,
so dragging a list item over its own paragraph cannot create an invalid tree.
A successful drop is one normal transaction and one undo step. Drag state,
candidate markers, labels, geometry, and drop indicators never enter document
JSON or exported HTML/Markdown.

An editor accepts a Fountain node-path payload only while that same view owns a
live drag. A forged or stale payload—and a payload dragged from another editor
instance—is prevented and ignored instead of treating an untrusted path as a
local move. Cross-editor transfer should use an explicit host import/copy
workflow with its own schema and authorization policy.

The control toolbar is mounted next to—not inside—the contenteditable. This
keeps buttons out of DOM text selection, custom NodeView content, list/table
semantics, clipboard output, and mutation reconciliation. Node DOM retains
stable `data-fountain-path` and `data-fountain-block-reorderable` hooks so a host
may provide entirely different CSS or controls.

Import `fountainjs-editor/styles.css` for the supplied layout, focus treatment,
drag state, and drop indicators.

## Candidate and label policy

By default, every top-level document node is eligible. Nested nodes are eligible
when they belong to the schema's `block` group or are `list_item` / `task_item`.
Internal table rows/cells, captions, inline nodes, and hard breaks are excluded;
their structure has dedicated editing commands.

Use an option object to narrow or extend that policy and own every spoken label:

```ts
const blockHandles = {
  include: ({ node, path, parent, editor }) =>
    node.type.name === 'callout' || path.length === 1,
  labels: {
    toolbar: ({ node }) => `${node.type.name} layout controls`,
    drag: () => 'Drag section',
    moveBefore: () => 'Move section earlier',
    moveAfter: () => 'Move section later',
  },
}

new EditorView(mount, editor, { blockHandles })
```

An `include` exception is contained and hides that candidate. It cannot bypass
the schema: button availability and every drop still use `canMoveNode`.

## React and Web Component

React forwards the same view option:

```tsx
<FountainComposer editor={editor} blockHandles />
```

So does Custom Element registration:

```ts
registerFountainElement({
  schema: kit.schema,
  plugins: kit.plugins,
  blockHandles: true,
})
```

Vue, Svelte, Angular, plain DOM, and other hosts can use `EditorView` directly,
call `moveNode` from their own interface, or both. Reordering has no React
dependency.

## Extension guidance

Custom block nodes with ordinary `group: 'block'` membership participate by
default. A specialized structural node should be filtered out through
`include`, then expose purpose-specific commands that preserve its invariants.
If a custom product UI implements drop zones, derive its final `NodeMove`, ask
`canMoveNode`, and call `moveNode`; do not mutate DOM order and attempt to infer
model changes afterward.

Tests should cover same-parent and cross-parent moves, invalid destinations,
cycles, selection restoration, history, read-only behavior, pointer geometry,
keyboard control, touch target size, and cleanup. FountainJS's own contracts
live in `tests/block-reordering.test.ts`, `tests/browser/editor.spec.ts`, and
`tests/browser/mobile.spec.ts`.

# Bubble and floating menus

FountainJS supplies framework-neutral eligibility controllers, reusable DOM
geometry, and optional React surfaces for two contextual menu patterns:

- a **bubble menu** for a non-collapsed text selection, node selection, or table
  cell selection;
- a **floating menu** for a caret inside an empty editable block.

The extensions do not prescribe buttons or import a positioning dependency.
Product code chooses the commands and visual language while every surface can
subscribe to the same state.

## Compose the services

```ts
import {
  BubbleMenuExtension,
  FloatingMenuExtension,
  StarterKit,
  composeExtensions,
  createEditor,
  type FountainMenuService,
} from 'fountainjs-editor'

const kit = composeExtensions([
  ...StarterKit.extensions,
  BubbleMenuExtension,
  FloatingMenuExtension,
])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })

const bubble = kit.services.bubbleMenu as FountainMenuService
const floating = kit.services.floatingMenu as FountainMenuService
```

Neither extension is part of `StarterKit`. Add one or both only when the host
needs them.

## Default visibility

`bubbleMenu.getController(editor)` is eligible for text ranges, complete node
selections, rectangular cell selections, and the whole-document selection. A
collapsed caret or structural gap is closed by default.

`floatingMenu.getController(editor)` is eligible when a collapsed text caret is
inside an empty nearest block. The snapshot includes `anchorPath`, so a DOM,
Vue, Svelte, or other host can position against the same logical block.

Read-only editors remain closed unless `showWhenReadOnly: true` is explicit.
`shouldShow(context)` may replace the default rule and receives
`{ editor, state, selection, defaultOpen }`. A thrown host predicate is contained:
the menu closes and exposes the message through `snapshot.error` instead of
breaking the editor transaction that caused the refresh.

```ts
const links = createBubbleMenuExtension({
  id: 'links',
  shouldShow: ({ editor, defaultOpen }) =>
    defaultOpen && editor.state.schema.marks.link !== undefined,
})

const blocks = createFloatingMenuExtension({ id: 'blocks' })
const customKit = composeExtensions([
  ...StarterKit.extensions,
  links,
  blocks,
])

customKit.services['bubbleMenu:links']
customKit.services['floatingMenu:blocks']
```

Names allow multiple independent instances. IDs may contain letters, numbers,
dots, underscores, and hyphens; invalid IDs fail during composition instead of
creating ambiguous service keys.

## Headless lifecycle

```ts
const controller = (kit.services.bubbleMenu as FountainMenuService).getController(editor)

const unsubscribe = controller.subscribe(snapshot => {
  renderMyToolbar(snapshot)
})

controller.getSnapshot() // stable until the next editor update
controller.dismiss()     // closed until this selection changes
controller.refresh()     // clear dismissal and re-run shouldShow

unsubscribe()
```

Snapshots contain the immutable `state` and `selection`, menu `kind`, open
state, floating `anchorPath`, monotonic `revision`, and any predicate error.
Controllers subscribe to the editor, not the browser DOM. The owning extension
destroys each controller and its editor subscription during editor teardown.

## Position in any DOM surface

`getEditorMenuAnchorRect(editorDOM, snapshot)` translates FountainJS paths and
offsets into a viewport-relative rectangle. It handles marked text, selections
that cross text wrappers, selected nodes, table-cell rectangles, and empty-block
fallbacks while ignoring view-only widgets.

`placeEditorMenu(referenceRect, menuRect, kind, options?)` returns a clamped
`{ left, top, side }` placement. Bubble menus prefer above the selection;
floating menus prefer below the empty block. Both flip when necessary and stay
inside the supplied or current viewport.

These utilities are exported from the package root and can be used without
React. They produce view state only and never alter document JSON, selection,
history, or format output.

## React surfaces

```tsx
import {
  FountainBubbleMenu,
  FountainFloatingMenu,
} from 'fountainjs-editor/react'

<FountainBubbleMenu
  editor={editor}
  service={kit.services.bubbleMenu as FountainMenuService}
  anchorElement={editorRef.current?.view?.dom}
>
  {snapshot => <>
    <button onClick={() => toggleMark(editor, 'strong')}>Bold</button>
    <button onClick={() => addComment(editor, snapshot.selection)}>Comment</button>
  </>}
</FountainBubbleMenu>

<FountainFloatingMenu
  editor={editor}
  service={kit.services.floatingMenu as FountainMenuService}
  anchorElement={editorRef.current?.view?.dom}
>
  <button onClick={() => setBlockType(editor, 'heading', { level: 2 })}>
    Heading 2
  </button>
</FountainFloatingMenu>
```

The React components render labelled horizontal toolbars, track focus across
the editor and menu, reposition on scrolling/resizing/content size changes,
support ArrowLeft/ArrowRight/Home/End between controls, and dismiss with Escape
whether focus is in the menu or remains in the editor. Set `requireFocus={false}`
only when a product intentionally wants an eligible menu visible without DOM
focus. `placementOptions` adjusts the viewport edge/gap, and
`getReferenceRect` can supply custom view geometry. Rendering is SSR-safe;
geometry begins after the component mounts.

## Boundaries

Commands remain ordinary FountainJS commands. The menu does not bypass schema
validation, plugin transaction filters, history, read-only state, or host
authorization. UI state and placement are never persisted. If a menu launches
a dialog, remote request, comment service, or navigation, the host owns that
side effect and its permissions.

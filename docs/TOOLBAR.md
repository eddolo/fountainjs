# Toolbar composition

FountainJS supplies a complete React toolbar, but it does not make that toolbar
the editor architecture. The document commands remain framework-neutral. React
applications may configure the supplied toolbar, assemble the public primitives,
or replace the UI completely while using the same editor and commands.

Import toolbar APIs from `fountainjs-editor/react`.

## Configure the supplied toolbar

`FountainToolbar` and `FountainComposer.toolbarProps` accept stable group and
action IDs. A product can reorder groups, move selected actions to the front of
a group, hide controls, replace visible labels and icons, and wrap or replace a
rendered action.

```tsx
import { FountainComposer } from 'fountainjs-editor/react'

<FountainComposer
  editor={editor}
  toolbarProps={{
    toolbarLabel: 'Article formatting',
    groups: ['marks', 'block-types', 'history'],
    actionOrder: {
      marks: ['highlight', 'bold', 'italic', 'underline'],
    },
    hiddenActions: ['strike', 'subscript', 'superscript'],
    groupLabels: { marks: 'Essential formatting' },
    actionLabels: { bold: 'Strong emphasis' },
    actionIcons: { bold: <MyStrongIcon aria-hidden="true" /> },
    renderAction: ({ actionId, defaultControl }) =>
      actionId === 'highlight'
        ? <FeatureHint name="New">{defaultControl}</FeatureHint>
        : defaultControl,
  }}
/>
```

The IDs listed in `actionOrder[group]` move to the front in that exact order;
omitted actions retain their default relative order. List every action in a
group when the DOM order must be exact. Duplicate group/action IDs are
deduplicated, and IDs that do not belong to the rendered group are ignored.
`hiddenActions` remains the explicit visibility control.

`renderAction` receives `{ actionId, label, defaultControl, editor }`. Return
`defaultControl`, wrap it, replace it, or return `null`. A replacement owns its
own semantics and focus behavior. `extraActions` remains available for controls
outside the built-in registry.

## Stable groups and actions

| Group ID | Default actions, in order |
| --- | --- |
| `history` | `undo`, `redo`, `search`, `clipboard-history` |
| `block-types` | `paragraph`, `heading-1`, `heading-2`, `heading-3` |
| `marks` | `bold`, `italic`, `underline`, `strike`, `inline-code`, `highlight`, `subscript`, `superscript`, `link`, `unlink`, `text-color`, `clear-text-color`, `text-style` |
| `alignment` | `align-left`, `align-center`, `align-right`, `justify` |
| `insert` | `quote`, `bullet-list`, `ordered-list`, `task-list`, `outdent-list`, `indent-list`, `code-block`, `insert-table`, `image`, `upload-image`, `media`, `upload-asset`, `divider`, `hard-break` |
| `table` | `add-table-row`, `delete-table-row`, `add-table-column`, `delete-table-column`, `merge-cells`, `split-cell`, `toggle-header-row`, `toggle-header-column`, `toggle-header-cell`, `select-row`, `select-column`, `column-width` |

`defaultFountainToolbarGroups` is the frozen default group order. TypeScript
exports `FountainToolbarGroupId` and `FountainToolbarActionId` so configuration
can be checked without copying string unions.

Availability follows the composed editor. Clipboard history appears only when
its extension service exists. Media actions appear only when the media schema is
installed; upload is disabled until the host supplies `assetUpload`. Contextual
table/list actions remain visible but disabled when their command is not valid.
This distinction lets users discover a capability without allowing an invalid
transaction.

## Build a completely custom toolbar

The public primitives have no dependency on a particular schema or command set:

```tsx
import {
  FountainToolbarButton,
  FountainToolbarGroup,
  FountainToolbarIcon,
  FountainToolbarRoot,
} from 'fountainjs-editor/react'
import { toggleMark, undo } from 'fountainjs-editor'

<FountainToolbarRoot label="Comment formatting">
  <FountainToolbarGroup label="History">
    <FountainToolbarButton
      actionId="undo"
      label="Undo"
      icon={<FountainToolbarIcon name="undo" />}
      onAction={() => undo(editor)}
    />
  </FountainToolbarGroup>
  <FountainToolbarGroup label="Text">
    <FountainToolbarButton
      actionId="bold"
      label="Bold"
      icon={<FountainToolbarIcon name="bold" />}
      active={isMarkActive(editor, 'strong')}
      onAction={() => toggleMark(editor, 'strong')}
    />
  </FountainToolbarGroup>
</FountainToolbarRoot>
```

`FountainToolbarIcon` is a dependency-free, `currentColor` SVG set covering all
built-in action IDs. It is decorative by default; the owning button supplies
the accessible name. Products may use any icon system instead.

## Selection, keyboard, and responsive behavior

- The root is a labelled horizontal `toolbar`; groups are labelled `group`
  elements and active toggles expose `aria-pressed`.
- Every built-in icon button has a complete `aria-label` and matching hover
  title. Meaning never depends on recognizing an icon.
- Tab enters normal controls. Left/Right wraps across enabled buttons, inputs,
  and selects; Home/End move to the first/last enabled control. Arrow direction
  follows computed LTR or RTL direction.
- Pointer activation is de-duplicated. Mouse and pen commands run on pointer
  down while preventing the browser from replacing the editor selection; touch
  uses the resulting click so horizontal toolbar scrolling remains possible.
- Desktop controls wrap. Narrow layouts keep groups intact in a horizontally
  scrollable toolbar with a visible thin scrollbar, contained overscroll, and
  scroll snapping. Popovers become single-column rather than widening the page.

Custom replacements returned by `renderAction` should preserve these behaviors
where applicable. Use a real `<button type="button">`, provide an accessible
name, expose pressed/disabled state, and avoid moving focus before a selection
command runs.

## Styling contract

The packaged stylesheet uses these intentional hooks:

- `.fountain-toolbar`, `.fountain-toolbar__group`, `.fountain-toolbar__button`
- `.fountain-toolbar__color`, `.fountain-toolbar__popover`
- `.fountain-toolbar__style-field`, `.fountain-toolbar__style-actions`
- `[data-fountain-toolbar-group="…"]`
- `[data-fountain-toolbar-action="…"]`

Data attributes are stable composition/test hooks, not persisted document data.
Override colors through the documented Fountain CSS custom properties or add
product selectors after importing `fountainjs-editor/styles.css`.

## Non-React products

There is no headless toolbar state to synchronize. Read `editor.state`,
subscribe with `editor.subscribe`, and call root-package commands from DOM,
Vue, Svelte, Angular, a Custom Element wrapper, or another UI system. Command
validity and transactions—not the supplied React control—remain authoritative.

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
    tableControls: 'menu', // default; 'expanded' restores every table icon
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
| `table` | Contextual `table-menu`; its labelled panel exposes `add-table-row-above`, `add-table-row-below`, `add-table-column-left`, `add-table-column-right`, `delete-table-row`, `delete-table-column`, `delete-table`, `merge-cells`, `split-cell`, `toggle-header-row`, `toggle-header-column`, `toggle-header-cell`, `toggle-row-repeat-header`, `select-row`, `select-column`, and `column-width` |

`defaultFountainToolbarGroups` is the frozen default group order. TypeScript
exports `FountainToolbarGroupId` and `FountainToolbarActionId` so configuration
can be checked without copying string unions.

Set `tableControls: 'expanded'` to render the original always-present icon set:
`add-table-row`, `delete-table-row`, `add-table-column`,
`delete-table-column`, `delete-table`, `merge-cells`, `split-cell`, the three
header toggles, `toggle-row-repeat-header`, row/column selection, and `column-width`. Those stable IDs and
their `actionOrder` behavior remain available for dense application-specific
toolbars.

Availability follows the composed editor. Clipboard history appears only when
its extension service exists. Media actions appear only when the media schema is
installed; upload is disabled until the host supplies `assetUpload`. The
default table group appears only for an active table and explains each
operation in text; expanded table and list actions remain visible but disabled
when their command is not valid.

`insert-table` opens explicit row and column fields before insertion (1–50
rows, 1–20 columns). `delete-table` removes the complete table containing the
active cell; row and column deletion remain separate actions.
Unreleased: `toggle-row-repeat-header` is labelled **Repeat row on pages** and
updates the active row's boolean `repeatHeader` attribute in one undoable
transaction. Its pressed state shows effective repeat intent, not cell role.
It is unavailable when the host row schema cannot retain this attribute.
Changing semantic header cells does not overwrite explicit repeat intent.
Only consecutive leading rows repeat, and pagination omits an unsafe band whose
rowspan extends into body rows. This action does not recolour or bold the row.
`quote` wraps every selected compatible block and becomes Remove quote while
the selection is already inside one. `highlight` opens a colour picker with
explicit Apply and Remove actions.

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
- Text-bearing icons also include their visible abbreviation in that name:
  `H1 — Heading 1` and `A — Text styles`, for example. Custom icons/labels must preserve this
  relationship for speech-input users as well as screen-reader users.
- Tab enters normal controls. From a command button, Left/Right wraps across
  enabled controls and Home/End move to the first/last control. Arrow direction
  follows computed LTR or RTL direction. Native inputs, selects, textareas,
  editable host fields and semantic text/combobox/spinbutton/slider widgets keep
  their own arrow/Home/End editing behavior rather than triggering traversal.
  Exception: actual native colour inputs suppress those four navigation defaults
  because Linux WebKit applies them to an old contenteditable range even on a
  plain page without Fountain. This keeps the control focused, not a toolbar
  traversal. Text fallbacks retain caret navigation; Tab, Enter, Space and
  Escape are not consumed by this guard. Native OS picker interaction is not
  certified by the headless focus test. See
  `artifacts/native-colour-arrow-verification-20261007.json`.
- Unreleased: configuration triggers announce `aria-expanded` and identify their
  named form through `aria-controls`. Opening focuses the first enabled field or
  action. Escape, unless already handled or composing text, closes the panel and
  returns focus to its trigger; Close/Cancel do the same. These are non-modal
  configuration forms, not dialogs or focus traps. Tab may leave them normally.
  Host `renderAction` replacements should retain the default control's ownership
  attributes or supply equivalent accessible behavior. Opening/cancelling a
  settings form does not rewrite document content. Inserting a new code block
  through its action remains a real, undoable insertion before its settings open.
- A selected native editor range is not permission to reclaim keyboard focus
  from an external control. View rendering and mutation repair preserve focus
  in configuration fields, including colour inputs that retain an old native
  range. Explicit `view.focus()` still returns to the logical editor selection.
  Unreleased follow-up: this also applies when a formatting transaction remaps
  the model selection. Automatic `selectionchange` events from a stale editor
  range are ignored while another control owns focus. Selection markers still
  update; only the browser Range application is deferred. Call the public view
  or React editor-handle `focus()` method to restore the mapped range; raw
  `HTMLElement.focus()` is not that API. Clicking the document places an ordinary
  user caret. Linux native-colour coverage is separate from Windows WebKit's
  hex-text fallback and runs first in CI before the complete browser matrix.
- Pointer activation is de-duplicated. Mouse and pen commands run on pointer
  down while preventing the browser from replacing the editor selection; touch
  uses the resulting click so horizontal toolbar scrolling remains possible.
- Desktop controls wrap. Narrow layouts keep groups intact in a horizontally
  scrollable toolbar with a visible thin scrollbar, contained overscroll, and
  scroll snapping. Configuration forms wrap their controls within the editor
  container, with border-box field bounds; they must not clip Link or
  Find/Replace actions at desktop widths. Popovers become single-column on
  narrow viewports rather than widening the page.

Custom replacements returned by `renderAction` should preserve these behaviors
where applicable. Use a real `<button type="button">`, provide an accessible
name, expose pressed/disabled state, and avoid moving focus before a selection
command runs.

## Styling contract

Unreleased view behavior: adjacent standard text leaves with equal link
attributes share one visible anchor even when bold or other marks differ.
Original text paths and document/export/source metadata do not change.
Whitespace-only links have no actionable `href` in the view; typing visible text
restores it, and undo preserves the original mark. This does not certify
accessibility of exported HTML or promise grouping across media/custom renderers.

Code blocks are labelled, tab-focusable scrolling regions. While browsing a
region without a source caret, plain Left/Right scroll horizontally and Tab
leaves it normally. Enter enters the source without inserting a newline;
typing or Ctrl/Cmd+V also enters at its first leaf. Once the source caret is
active, the existing code-editing key behavior applies. Read-only regions allow
scrolling but not editing. Automatic link input/paste rules do not interpret
literal code; explicit host commands remain available. These are view/input
behaviors, not additional toolbar action IDs.

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

### Block direction and logical alignment

`setTextDirection(editor, 'ltr' | 'rtl' | 'auto' | undefined)` changes the base
direction of selected paragraphs/headings. `undefined` removes the override;
it does not force LTR. The command leaves text and alignment unchanged, uses one
undoable transaction, and supports text ranges, container/all selections and
selected table cells. Code/media/custom blocks without a direction attribute
are not reformatted. Custom schema validation and transaction filters remain
authoritative.

Use `setTextAlignment(editor, 'start')` or `'end'` for alignment relative to the
reading direction. Existing left/right/center/justify values remain available;
an explicitly directed block with left alignment stays physically left-aligned.
Do not insert invisible Unicode controls merely to set paragraph direction.

```ts
import { setTextDirection, setTextAlignment } from 'fountainjs-editor/core';

setTextDirection(editor, 'rtl');
setTextAlignment(editor, 'start'); // right in RTL, left in LTR
```

The simple command-based demos provide RTL, LTR, Auto direction and Align start
buttons. These are examples of host-owned controls, not new action IDs in the
supplied React toolbar. The two calls above are separate undo steps; hosts can
use `editor.runCommandBatch` if a combined UI action should be one history step.

The document stores optional `dir` on paragraphs/headings. HTML import/export
and the DOM view use HTML `dir`, separately from `text-align`. Fixed inherited
LTR/RTL direction is materialized on imported text blocks, including list/cell
paragraphs: canonical HTML may therefore add explicit direction and start
alignment to children. Ordinary documents without direction keep their existing
default JSON. Heading conversion and Enter preserve supported direction and
alignment. JSON and Yjs retain these attributes without a DOM shim.

This is not a complete RTL/localization or Word bidi bridge. Inherited `auto`
depends on the ancestor's first strong character; flattening that wrapper is
not certified. Inline bidi isolation, mirrored list/table structure, CSS-only
direction import, native mobile keyboards and translated locale packages remain
separate work. Ordinary Markdown reports omitted direction/logical alignment.
DOCX reports unprojected direction and conversion of logical alignment to a
physical approximation; it does not equate HTML `dir` with Word `w:bidi`.

There is also an unresolved default-alignment boundary: legacy `align: 'left'`
does not distinguish an authored physical-left override from the ordinary
default. To preserve existing canonical HTML, default left without a block's
own `dir` is not emitted as CSS. An inherited-auto container or an RTL host can
therefore supply natural right alignment even though the child JSON says left;
setting left again is a model no-op. Set explicit block direction before choosing
physical left as the current workaround. An authored-versus-natural alignment
contract and inherited/host-direction tests are required for full RTL support.

The distinctions follow [W3C's structural direction guidance](https://www.w3.org/International/questions/qa-html-dir.en.html).
[Microsoft's `BiDi` remarks](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.bidi?view=openxml-3.0.1)
separately describe Word paragraph layout and run-level text ordering; those
need their own import/export and native-rendering evidence.

# Interactive widgets

FountainJS widgets are document nodes whose product state is portable,
schema-validated data. A date picker, status field, dropdown, variable, rating,
form question, database reference, or embedded application control can use the
same state and command contract while a host chooses plain DOM, React, or a
future renderer.

This is deliberately higher level than a raw `NodeView`:

- `defineWidget()` declares the node kind, attributes, validation, keyboard exit
  policy, text projection, and format boundary without importing a renderer;
- `createWidgetExtension()` composes that definition into any Fountain kit;
- `updateWidget()` and `WidgetController` make accepted state changes through
  one normal transaction, so local history, subscriptions, JSON, and Yjs see the
  same value;
- `createDOMWidgetExtension()` and `createReactWidgetExtension()` adapt only the
  controls and lifecycle. They do not become a second document store.

The low-level NodeView API remains available when this contract is not suitable.

## Package boundaries

```ts
// DOM-free: Node.js, Bun, Deno, workers, browser state, or native bridges
import {
  defineWidget,
  createWidgetExtension,
  createWidgetController,
  insertWidget,
  updateWidget,
} from 'fountainjs-editor/widgets'

// Browser renderer, no UI framework
import { createDOMWidgetExtension } from 'fountainjs-editor/widgets/dom'

// Optional React renderer
import { createReactWidgetExtension } from 'fountainjs-editor/react/widgets'
```

None of these modules is included by `StarterKit`. The neutral, DOM, and React
surfaces are independently loadable and have separate release-size budgets.

## Define portable state once

```ts
import { defineWidget } from 'fountainjs-editor/widgets'

export const statusWidget = defineWidget({
  name: 'status_field',
  label: 'Incident status',
  attributes: {
    status: {
      default: 'Investigating',
      validate: value => value === 'Investigating' || value === 'Resolved',
    },
    owner: { default: '' },
  },
  validate: ({ attributes }) => (
    attributes.status === 'Resolved' && !String(attributes.owner).trim()
      ? 'Resolved incidents require an owner.'
      : true
  ),
  toText: node => `${node.attrs.status} · ${node.attrs.owner}`,
})
```

Definitions are snapshotted and frozen. Attribute validators run at normal
schema boundaries; the widget-level validator can return `true`, `false`, one
message, or a list of messages. `validateWidgetAttributes()` exposes the same
issues without dispatching.

Widget names become schema node names. They use lowercase letters, numbers, and
underscores. Atomic block widgets are the default. Set `inline: true` for a chip
inside text, or provide a `content` expression such as `block+` for a widget with
Fountain-owned editable children. A widget with child content cannot be atomic.

`nodeId` is protected from ordinary widget patches by default, so composing the
stable-ID module does not let a control accidentally replace its identity. Pass
an explicit `protectedAttributes` list for another identity policy.

## Plain DOM

```ts
import { CoreExtension, EditorView, HistoryExtension, composeExtensions, createEditor } from 'fountainjs-editor'
import { createDOMWidgetExtension } from 'fountainjs-editor/widgets/dom'
import { statusWidget } from './status-widget'

const statusExtension = createDOMWidgetExtension(statusWidget, context => {
  const select = document.createElement('select')
  for (const value of ['Investigating', 'Resolved']) {
    select.append(new Option(value))
  }

  const onChange = () => context.set('status', select.value)
  select.addEventListener('change', onChange)
  context.controls.append(select)

  const render = next => { select.value = String(next.attributes.status) }
  render(context)
  return {
    // Updating the existing control retains its DOM identity and focus.
    update: render,
    destroy() { select.removeEventListener('change', onChange) },
  }
})

const kit = composeExtensions([CoreExtension, HistoryExtension, statusExtension])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: savedJSON })
const view = new EditorView(document.querySelector('#editor'), editor)
```

The render context contains the immutable node and attributes, current selection
and editable flags, validation report, live `getPath()`, the outer/controls and
optional `contentDOM` elements, and `update`, `set`, `remove`, `select`, and
`exit` helpers. It also exposes the renderer-neutral controller.

The renderer runs once. Return an `update(next)` hook to refresh the same control
when local history, a command, or collaboration changes the node. Without that
hook, the adapter deliberately remounts the controls. `destroy()` releases event
listeners, observers, subscriptions, or other host resources exactly once.

## React

```tsx
import { createReactWidgetExtension } from 'fountainjs-editor/react/widgets'
import { statusWidget } from './status-widget'

export const statusExtension = createReactWidgetExtension(
  statusWidget,
  ({ attributes, editable, selected, set, validation }) => (
    <label data-selected={selected || undefined}>
      Incident status
      <select
        disabled={!editable}
        aria-invalid={!validation.valid}
        value={String(attributes.status)}
        onChange={event => set('status', event.target.value)}
      >
        <option>Investigating</option>
        <option>Resolved</option>
      </select>
    </label>
  ),
)
```

React is imported only by `fountainjs-editor/react/widgets`. The component gets
the same state/controller contract as plain DOM. React controls and optional
Fountain-owned `contentDOM` children are mounted in separate sibling containers,
so neither renderer rewrites the other's subtree. Nested form controls are
disabled automatically in a read-only editor; components should still use the
`editable` prop for explanatory UI and non-form interactions.

## Commands, history, and collaboration

```ts
insertWidget(editor, statusWidget, { status: 'Investigating', owner: '' })
updateWidget(editor, statusWidget, [3], { status: 'Resolved', owner: 'Ada' })

const controller = createWidgetController(editor, statusWidget, () => livePath)
controller.validate({ status: 'Resolved' })
controller.set('owner', 'Ada')
controller.exit('after')
controller.remove()
```

An accepted multi-attribute update is one `SetNodeAttrsStep` and one undo item.
Invalid, unchanged, read-only, stale-path, wrong-node, unsafe-attribute, or
protected-identity changes return `false` without modifying state. Transactions
carry `WIDGET_TRANSACTION_META` so host analytics can distinguish `insert` and
`update` actions without reading DOM events.

The generic Yjs adapter needs no widget-specific transport. Every client must
compose a compatible definition; widget attributes then synchronize like other
portable node attributes, remote updates reach the mounted renderer's `update`
hook, and local-origin undo remains author-local. Independent top-level
attributes merge independently. A nested object stored in one attribute is still
one collaborative value; granular nested CRDT attributes are a separate roadmap
item.

## Keyboard and focus policy

The default key policy inside widget controls is explicit:

| Key | Default | Result |
| --- | --- | --- |
| Tab | `cycle` | Move to the next document text point; Shift+Tab moves before the widget. |
| Enter | `allow` | Preserve the native control behavior. |
| Escape | `select` | Return model selection to the complete widget node. |

Override any key with `before`, `after`, `select`, `cycle`, or `allow`:

```ts
defineWidget({
  name: 'single_line_field',
  keyPolicy: { Enter: 'after', Escape: 'before' },
})
```

Composition events and host-prevented key events are never intercepted. After a
successful exit the DOM adapter focuses the owning `EditorView` and restores its
model selection. Set `focusEditorOnExit: false` or supply `onExit` when the host
owns a different focus route. NodeView reconciliation preserves a focused host
control across accepted model updates and undo/redo when the instance accepts
the update.

## Read-only, accessibility, and content children

The DOM adapter labels the widget group, exposes `aria-disabled` and
`aria-invalid`, mirrors node selection with `data-selected`, and prevents its
controls from entering the editor's input or mutation-recovery pipelines. It
does not invent the semantics of a date, poll, or database field: the renderer
must still use the correct native element, name, description, live status, and
error relationship for that product.

For a definition with `content`, the adapter creates a separate `contentDOM`.
Put product controls in `context.controls`; never move model children into that
container. Fountain renders, selects, edits, and reconciles the children in
`contentDOM`.

## Persistence and format behavior

Widget attributes are lossless in Fountain JSON and ordinary collaboration.
The default HTML representation is a semantic block or inline element with
`data-fountain-widget` and a bounded JSON `data-fountain-widget-state`; the
matching parse rule round-trips it through the safe HTML importer. A definition
may replace `toDOM` and `parseDOM` with an application-specific public format.

Plain text uses `toText` or the widget label. Markdown cannot promise a native
syntax for an arbitrary application control; use an application format module,
a semantic HTML boundary, or document the deliberate projection/loss. Never put
credentials or secrets in widget attributes—document state is exportable user
content.

## Server and native boundaries

`fountainjs-editor/widgets` does not read `window`, `document`, Selection,
Range, layout, contenteditable, events, or clipboard APIs. Definitions,
validation, creation, updates, selection transitions, JSON, history, and Yjs can
run in Node without jsdom. `widgets/dom` owns browser elements and events;
`react/widgets` owns React rendering. A future native renderer can consume the
same definition/controller contract without pretending that a WebView is native.

## Current limits

- Widget validation is synchronous. Async business validation belongs in the
  host and should commit only an accepted portable result.
- This contract does not provide forms, database storage, permissions, network
  transport, file hosting, or secret storage.
- An arbitrary widget is kept together by pagination unless the host supplies a
  validated read-only/print continuation renderer.
- Granular collaboration inside nested object/array attributes is future work;
  prefer separate top-level attributes when independent concurrent edits matter.

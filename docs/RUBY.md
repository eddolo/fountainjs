# Ruby annotations

`fountainjs-editor/ruby` is an optional, framework-neutral module for reading
and pronunciation guides such as Japanese furigana. “Ruby” here means the HTML
annotation structure, not the Ruby programming language.

```ts
import {
  CoreExtension,
  EditorView,
  composeExtensions,
  createEditor,
} from 'fountainjs-editor'
import {
  RubyExtension,
  setRuby,
  updateRuby,
  unsetRuby,
} from 'fountainjs-editor/ruby'

const kit = composeExtensions([CoreExtension, RubyExtension])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })
new EditorView(document.querySelector('#editor')!, editor)
```

## Document model

Ruby is an editable inline node. Its child text is the base and its `rt`
attribute is the reading:

```json
{
  "type": "ruby",
  "attrs": { "rt": "とうきょう" },
  "content": [
    {
      "type": "text",
      "text": "東京",
      "marks": [{ "type": "strong" }]
    }
  ]
}
```

The base is one or more text leaves, so inline formatting survives adding,
editing, removing, serializing, undoing, and synchronizing the annotation. The
reading is required, trimmed, single-line, free of control characters, and at
most 2,000 UTF-16 code units. Nested blocks, media, and other inline atoms are
rejected so one annotation always has an unambiguous textual base.

## Commands

```ts
setRuby(editor, 'とうきょう')
setRuby(editor, { annotation: 'とうきょう' })
setRuby(editor, { rt: 'とうきょう' })

updateRuby(editor, 'トウキョウ')
unsetRuby(editor)
toggleRuby(editor, 'とうきょう')
```

- `setRuby` wraps a non-empty selection inside one inline parent. It preserves
  every selected text leaf and mark, and rejects cross-paragraph, atom, empty,
  nested, invalid, and read-only targets.
- `updateRuby` changes only the reading of the active ruby node. Pass a model
  path as the third argument to address a node from custom UI.
- `unsetRuby` removes the wrapper but retains the base text and its formatting.
- `toggleRuby` unsets the active node or applies a new annotation.
- `getActiveRuby` returns the complete active node and its immutable path.

The aliases `setRubyText`, `updateRubyText`, `unsetRubyText`, and
`toggleRubyText` are available for APIs that prefer the HTML `rt` terminology.
All successful mutations are ordinary FountainJS transactions, so history,
mapping, plugins, tracked workflows, and collaboration observe them normally.

## Editing the reading

The default NodeView renders native `<ruby>`, `<rb>`, `<rt>`, and `<rp>`
elements. In an editable view, activating the reading by pointer, Enter, or
Space opens a keyboard-accessible form with Save, Remove, and Cancel actions.
Enter saves, Escape cancels, clicking elsewhere dismisses it, and an active IME
composition cannot accidentally submit. A read-only view renders semantic ruby
without presenting editing controls.

Disable this behavior or replace only the floating UI while retaining the same
commands and document structure:

```ts
import { createRubyExtension } from 'fountainjs-editor/ruby'

const ruby = createRubyExtension({
  allowClickToEdit: true,
  renderAnnotationEditor: ({ document, annotation, submit, remove, dismiss }) => {
    const element = document.createElement('my-ruby-editor')
    // Connect the component to annotation, submit, remove, and dismiss.
    return element
  },
})
```

The custom renderer is deliberately DOM-based. React, Vue, Svelte, Angular,
Web Components, or plain JavaScript can mount their own component inside the
returned element without changing the editor engine.

## Interchange

JSON retains the exact node, base marks, and reading. HTML and Markdown emit
semantic ruby HTML:

```html
<ruby data-fountain-ruby="true">
  <rb>東京</rb><rp>(</rp><rt>とうきょう</rt><rp>)</rp>
</ruby>
```

HTML import accepts both an explicit `<rb>` and the common direct-base form
`<ruby>東京<rt>とうきょう</rt></ruby>`. It ignores presentation-only `<rp>`
text. Missing or invalid readings degrade to ordinary base text rather than
smuggling malformed annotation state into the document. Attribute validation
and the normal safe HTML importer still apply.

Markdown uses semantic inline HTML because CommonMark has no native ruby
syntax. FountainJS reconstructs it through the same safe HTML rules and reports
no projection loss for supported base marks. Plain text intentionally projects
the example as `東京 (とうきょう)` so a reader does not lose the pronunciation.

## Collaboration and storage

Ruby state is ordinary portable JSON. The optional Yjs adapter synchronizes
base edits and `rt` changes without a ruby-specific server. Every collaborating
client must compose `RubyExtension` into the same schema. Storage, permissions,
transport, and authentication remain responsibilities of the host application.

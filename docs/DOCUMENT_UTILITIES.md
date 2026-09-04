# Mentions, emoji, typography, and character count

These four capabilities are independent, framework-neutral extensions. They
live in `fountainjs-editor/document-utilities` so importing the package root
does not install document policy or suggestion UI. React rendering is a
separate optional layer.

## Compose only what the product needs

```ts
import { CoreExtension, composeExtensions, createEditor } from 'fountainjs-editor'
import {
  EmojiExtension,
  TypographyExtension,
  createCharacterCountExtension,
  createMentionExtension,
} from 'fountainjs-editor/document-utilities'

const mentions = createMentionExtension({
  suggestions: [
    {
      char: '@',
      kind: 'person',
      items: async ({ query, signal }) =>
        people.search(query, { signal }),
    },
    {
      char: '#',
      kind: 'topic',
      items: ({ query }) => topics.filter(topic => topic.label.includes(query)),
    },
  ],
})

const count = createCharacterCountExtension({ limit: 5_000 })
const kit = composeExtensions([
  CoreExtension,
  mentions,
  EmojiExtension,
  TypographyExtension,
  count,
])

const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })
```

None of these extensions is silently added to `CoreExtension` or
`StarterKit`. Their schema nodes and plugin keys therefore exist only when the
host deliberately composes them.

## Headless suggestion primitive

Mentions and emoji share `SuggestionController<Item>`, but neither depends on
React. A suggestion plugin finds a configured trigger immediately before a
collapsed text cursor, stores the match in immutable plugin state, and renders
only a view decoration around the query. The document still contains the
literal query until the user accepts an item.

`SuggestionTrigger` supports:

- `char`: one to eight non-whitespace characters;
- `allowedPrefixes`: characters allowed immediately before the trigger, or
  `null` for no prefix restriction;
- `startOfLine`: require the trigger at offset zero;
- `allowSpaces`: permit spaces inside the query.

The controller calls its synchronous or asynchronous provider with the active
editor, immutable match, and an `AbortSignal`. A changed query aborts the old
request and an internal request identity prevents late results from replacing
newer ones. `maximumItems` bounds accepted results. Disabled items remain
visible but are skipped by selection.

```ts
const controller = kit.services.mentions.getController(editor)
const unsubscribe = controller.subscribe(snapshot => {
  // snapshot: open, status, match, items, selectedIndex, error
  renderProductMenu(snapshot)
})

controller.move(1)     // next enabled item, wrapping at the end
controller.move(-1)    // previous enabled item
controller.select(3)
controller.accept()
controller.dismiss()

unsubscribe()
```

The supplied key handler maps ArrowUp/ArrowDown, Enter, and Escape while the
menu is open. An application can use the controller from any UI framework or
no framework at all.

## Mentions

The `mention` node is an atomic inline node with portable `id`, `label`,
`trigger`, `kind`, and optional `href` attributes. A persisted mention keeps
identity separate from presentation text. Unsafe URLs and invalid attribute
lengths are rejected at schema construction and import boundaries.

`createMentionExtension(options)` accepts multiple unique suggestion configs,
custom HTML attributes, `renderText`, `appendSpace`,
`deleteTriggerWithBackspace`, and `maximumItems`. Each trigger can have a
different provider and semantic `kind`.

The public commands/functions are:

- `createMentionNode(editor, attrs)`;
- `insertMention(editor, attrs, range?, appendSpace?)`;
- `getActiveMention(editor, path?)`;
- `setMentionAttributes(editor, attrs, path?)`;
- `deleteMention(editor, path?)`.

With the default Backspace policy, deleting a mention restores its trigger so
the user can immediately search again. Set `deleteTriggerWithBackspace: true`
to delete both the atom and trigger.

## Emoji

The `emoji` node stores `name`, Unicode `emoji`, and an optional
`fallbackImage`. Typed and pasted Unicode grapheme clusters containing an
extended pictograph become atoms, including ZWJ sequences. Copy and text export
project the node back to readable Unicode (or `:name:` when it has only a
fallback image). Fallback URLs are protocol checked; data URLs are restricted
to images.

`EmojiExtension` includes a curated common catalogue for the default bundle.
The complete RGI base catalogue is isolated in another entry:

```ts
import {
  UnicodeEmojiExtension,
  unicodeEmojis,
} from 'fountainjs-editor/emoji-data'

const kit = composeExtensions([CoreExtension, UnicodeEmojiExtension])

// Or extend the complete catalogue with product-owned entries.
const productEmoji = createEmojiExtension({
  emojis: [
    ...unicodeEmojis,
    {
      id: 'octocat',
      label: 'Octocat',
      emoji: '',
      shortcodes: ['octocat'],
      tags: ['github', 'cat'],
      group: 'Product',
      fallbackImage: 'https://github.githubassets.com/images/icons/emoji/octocat.png',
    },
  ],
})
```

The optional catalogue contains more than 1,900 searchable RGI base entries
but is not loaded by the package root, document-utilities entry, or React
entry. Skin-tone variants are consolidated in the source catalogue; a user may
still type or paste any supported variant and FountainJS preserves the complete
grapheme.

`createEmojiExtension(options)` accepts a custom catalogue, custom suggestion
provider, `enableEmoticons`, `forceFallbackImages`, `appendSpace`,
`maximumItems`, and HTML attributes. Completing a known `:shortcode:` inserts
the item directly; an incomplete `:query` drives the suggestion controller.
`insertEmoji`, `insertEmojiText`, `getActiveEmoji`, and `deleteEmoji` are also
public.

## Typography

`TypographyExtension` installs isolated input rules. Immediate Backspace uses
the normal input-rule undo contract and restores the exact literal characters.
Every rule can be disabled with `false` or assigned a different output string.

| Option | Typed form | Default result |
| --- | --- | --- |
| `emDash` | `--` | `—` |
| `ellipsis` | `...` | `…` |
| `openDoubleQuote`, `closeDoubleQuote` | `"` | `“`, `”` |
| `openSingleQuote`, `closeSingleQuote` | `'` | `‘`, `’` |
| `leftArrow`, `rightArrow` | `<-`, `->` | `←`, `→` |
| `copyright`, `registeredTrademark` | `(c)`, `(r)` | `©`, `®` |
| `trademark`, `servicemark` | `(tm)`, `(sm)` | `™`, `℠` |
| `oneHalf`, `oneQuarter`, `threeQuarters` | `1/2`, `1/4`, `3/4` | `½`, `¼`, `¾` |
| `plusMinus`, `notEqual` | `+/-`, `!=` | `±`, `≠` |
| `laquo`, `raquo` | `<<`, `>>` | `«`, `»` |
| `multiplication` | `2x3` or `2*3` | `2×3` |
| `superscriptTwo`, `superscriptThree` | `^2`, `^3` | `²`, `³` |

Set `rtl: true` to use the supplied RTL quote direction, or provide explicit
LTR/RTL pairs through `doubleQuotes` and `singleQuotes`.

## Character and word count

`createCharacterCountExtension` contributes no document node. Its plugin state
contains the current character/word snapshot and, when configured, rejects
transactions that increase a document beyond its limit.

```ts
const characterCount = createCharacterCountExtension({
  limit: 280,
  mode: 'textSize', // or 'nodeSize'
  autoTrim: true,
  textCounter: text => Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
  ).length,
  wordCounter: text => text.trim() ? text.trim().split(/\s+/u).length : 0,
})

const service = kit.services.characterCount
service.characters(editor)
service.words(editor)
service.snapshot(editor)
service.trim(editor)
```

The default text counter uses JavaScript string length, matching common editor
behavior; provide a grapheme counter when a product defines one displayed
character as one grapheme. `mode: 'nodeSize'` measures structural size instead.
Queries can count a supplied node and can override the mode.

With `autoTrim: true`, oversized initial content and programmatic content
replacement are trimmed to the largest schema-valid prefix. Trimming respects
grapheme boundaries. With `autoTrim: false`, oversized content is preserved;
transactions that reduce it are allowed while any increase is refused.
`Editor.dispatch()` returns `false` for a refused transaction, so command and UI
callers receive the real result.

## React suggestion and count UI

`FountainSuggestionMenu` and `FountainCharacterCount` are exported from
`fountainjs-editor/react`. Pass the headless controller and editor DOM rather
than rebuilding suggestion state in React:

```tsx
<FountainComposer ref={editorRef} editor={editor} />
<FountainSuggestionMenu
  controller={kit.services.mentions.getController(editor)}
  anchorElement={editorRef.current?.view?.dom}
  label="Mention a person or topic"
  renderItem={item => <span>{item.label}</span>}
/>
<FountainCharacterCount
  editor={editor}
  service={kit.services.characterCount}
/>
```

The menu follows the decorated query during editor/page scrolling and stays
inside the viewport. Focus remains in the editor. While open, the component
links the contenteditable to the listbox with `aria-controls`,
`aria-expanded`, `aria-haspopup`, `aria-autocomplete`, and
`aria-activedescendant`; enabled items expose `role="option"` and
`aria-selected`. Pointer choice prevents premature editor blur. The character
counter is an `aria-live="polite"` output.

## Interchange and lifecycle boundaries

Validated JSON is lossless for both atom types. Safe HTML retains their typed
attributes when the receiving schema includes the matching extension. Markdown
and plain text deliberately flatten mentions and emoji to readable text; that
projection cannot reconstruct identity, semantic kind, or fallback metadata.

Suggestion requests and plugin state are transient. They never enter JSON or
exported HTML. Destroying an editor aborts requests, unsubscribes controllers,
and clears their listeners. Full emoji data is generated at build time from
`unicode-emoji-json`; attribution is included in `THIRD_PARTY_NOTICES.md`.

The same suggestion primitive also powers the independently registered `/`
command workflow. See [SLASH_COMMANDS.md](SLASH_COMMANDS.md) for its built-in
actions, runtime registry, async sources, atomic execution, and React renderer.

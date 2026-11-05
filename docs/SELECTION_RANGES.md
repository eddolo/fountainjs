# Text and structural ranges across document structure

`Selection.range(startPath, from, endPath, to)` uses ordered text-leaf paths
and UTF-16 offsets. It can span paragraphs, quotes, lists and nested content.
`insertText` replaces that range; `deleteSelection` deletes it. Both are document
transactions, so the history plugin can undo and redo the complete edit.

For a document containing a quote with `Left`, followed by a paragraph with
`Right`, this replaces `ft` through `Rig` with `X`:

```ts
import { Selection, insertText } from 'fountainjs-editor/core';

editor.dispatch(editor.createTransaction().setSelection(
  Selection.range([0, 0, 0], 2, [1, 0], 3),
));
insertText(editor, 'X');
// The quote now contains LeXht. The selected paragraph boundary is removed.
```

The replacement keeps the first text block's attributes, the insertion leaf's
marks, and unselected suffix marks. Fully selected figures and other intervening
blocks are removed. Compatible block edges can join through quote/list ancestors.
Unselected siblings retain their model objects. Containers with different
attributes keep an unselected right-hand tail in its own container; it must not
silently acquire the first quote's direction or appearance.

Partial table grids and inline wrappers retain their structure. The operation
does not turn a table into a paragraph or merge separate inline bookmark IDs.
Custom required content is validated; when joining would violate that schema,
the required container shape is retained while its selected text is replaced.
Applications should use `CellSelection` and the table commands for rectangular
cell operations. Schema validation does not by itself define every possible
extension's editing or isolation policy.

## Directed structural endpoints (unreleased)

`new RangeSelection(doc, anchor, head)` retains directed document positions,
including boundaries before/after figures and gaps between nodes. It does not
pretend that an image endpoint is an offset in an adjacent text paragraph.
Positions count UTF-16 text units plus opening/closing units for non-root nodes;
the document itself contributes no opening/closing units.

```ts
import { RangeSelection, insertText } from 'fountainjs-editor/core';

// For paragraph("Left") followed by an empty-caption image, content size is 8.
editor.dispatch(editor.createTransaction().setSelection(
  new RangeSelection(editor.state.doc, 8, 3),
));
insertText(editor, 'X'); // LeX; removes the selected image, keeps Le.
```

`anchor` and `head` retain direction; `structuralFrom`/`structuralTo` are ordered.
An equal anchor/head represents an exact caret. State normalization prefers the
existing text or `GapSelection` caret when either can represent that position.
`resolveDocumentPoint` distinguishes text offsets from parent/child boundaries;
it rejects positions inside opaque nodes. Empty non-atomic content can have a
valid boundary inside it, even when no text leaf exists yet.

`RangeSelection.textSelection` is the editable-text projection, or `null` when
there is none. The legacy `path`/offset fields are compatibility projections,
not the structural range. Use the structural fields when replacing or deleting;
do not format neighboring text through an image-only projection.

`ReplaceRangeStep` and `Transform.replaceRange` support text replacement with
mixed endpoints. Required container shape and partial table grids remain schema
validated. Typing, deletion, rich paste and history use the same model operation;
unsupported fitting returns failure rather than publishing an invalid tree.

The Yjs adapter encodes text endpoints against `Y.XmlText` and boundaries against
their retained parent `Y.XmlElement`. Directed ranges, gap association and undo
selections are relative to those shared objects, not absolute paths or numeric
positions. Existing text-awareness payloads remain readable. Structural range
awareness adds an optional kind; an older adapter cannot display its boundary
endpoints. The document storage format is unchanged.

Clipboard serialization currently creates a closed, schema-valid document from
the selection, retaining whole selected nodes and clipped marked text. A custom
open fragment that cannot form a valid document is reported and is not cut.
General open-slice transport and insertion fitting remain unfinished.

## Position mapping

Text-block formatting (unreleased follow-up, 2026-11-05) uses the structural
interval, not just its nearest-text projection. Alignment and direction affect
only intersected text blocks; an image-only range cannot format neighboring
paragraphs. Heading/paragraph conversion also supports `AllSelection` and
`CellSelection`, retaining their kind and range direction. A range ending at the
first text offset of a following paragraph excludes that paragraph. Eligible
empty paragraphs are included; code and media are not converted to headings.

Changing a text block's type preserves its children and positions. Stable IDs,
unknown portable metadata and compatible declared attributes survive; attributes
specific to the old type are omitted. The whole result must satisfy the schema,
and a filtered or invalid conversion changes neither the document nor history.
The Yjs adapter retains the existing shared text for this operation, so a
concurrent text insertion is not discarded by replacing its containing paragraph.
This does not equate unrelated replacement nodes by their text or require stored
node IDs. Raw editor-host focus restores the current command landing; native
pointer placement and embedded control focus retain their own behavior.

`ReplaceTextRangeStep.getMap(before)` describes the actual resulting tree.
Positions count UTF-16 text units plus opening/closing units for non-root nodes.
Joining different ancestor depths can remove old tokens and add balancing tokens
outside the selected text interval. The map therefore may contain several
replacement ranges. Do not assume every text replacement has one size delta at
the selection start.

The engine tracks retained structural/text runs when fitting nested edges.
Unchanged subtrees contribute one run; it does not construct a per-character
copy of the document. Positions in unselected text, including the right-hand
suffix, map to their actual new locations. History restores document snapshots
and selections rather than trying to reconstruct them from visible HTML.

## Scope still open

The legacy `Selection.range` API requires text endpoints; `RangeSelection` adds
exact structural endpoints. The recorded browser journey covers 24 ordinary/
virtual, leading/trailing-media and directed replacement cases across Chromium,
Firefox and WebKit. It checks visible edited text, complete exported models,
exact-source undo/redo and reopened reader output. Trusted native copy/cut is
checked in each engine; actual internal and independent external OS paste is
checked in Chromium. This does not certify arbitrary open-slice insertion,
every keyboard gesture or every custom NodeView's editing behavior. See
[virtualization limits](VIRTUALIZATION.md#scope-and-limits).

The regression suite checks complete models, unselected character positions,
schema-constrained containers, partial grids, inline IDs and history. The native
journey imports a draft in the issue demo, selects in both directions, replaces,
downloads, undoes/redoes, reopens and checks the reader. Desktop browser automation
is evidence for those cases, not physical mobile or universal input certification.

```sh
pnpm exec vitest run tests/cross-container-range.test.ts
pnpm exec vitest run tests/document-range-selection.test.ts tests/replace-document-range.test.ts tests/document-range-commands.test.ts tests/document-range-clipboard.test.ts tests/yjs-document-range.test.ts
pnpm exec playwright test --grep "native selections across quote and list"
```

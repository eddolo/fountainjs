# Text ranges across document structure

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

## Position mapping

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

This API requires text endpoints. A general range with an endpoint before/after
an atomic block or in a structural gap is separate unfinished foundation work.
In particular, the recorded virtual Ctrl+Shift+End audit still misses a trailing
image; this repair does not certify that shortcut, arbitrary open-slice insertion,
or complete mixed structural clipboard behavior. See
[virtualization limits](VIRTUALIZATION.md#scope-and-limits).

The regression suite checks complete models, unselected character positions,
schema-constrained containers, partial grids, inline IDs and history. The native
journey imports a draft in the issue demo, selects in both directions, replaces,
downloads, undoes/redoes, reopens and checks the reader. Desktop browser automation
is evidence for those cases, not physical mobile or universal input certification.

```sh
pnpm exec vitest run tests/cross-container-range.test.ts
pnpm exec playwright test --grep "native selections across quote and list"
```

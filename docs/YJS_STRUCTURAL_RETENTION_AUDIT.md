# Yjs structural and text identity retention

Work in progress, 2026-11-05. This is a confirmed correctness failure, not a
certification of collaboration parity. The separate native-focus repair is
[draft PR #22](https://github.com/eddolo/fountainjs/pull/22); this unfinished
structural work is not part of that PR or an npm/site release.

## Reproduction

`tests/yjs-document-range.test.ts` creates two actual `Y.Doc` instances, syncs
their initial state, then makes independent edits before exchanging their real
Yjs updates. The starting paragraph is `Alpha`. One peer inserts `X` at offset
two; the other changes structure or formatting. The peers must both converge
and preserve the inserted character's position relative to the existing text.

Run:

```powershell
pnpm exec vitest run tests/yjs-document-range.test.ts tests/document-range-wrapping.test.ts tests/list-auto-scope.test.ts --maxWorkers=1
```

The verified local run has 54 passing cases and six failures:

| Concurrent action | Required result | Observed result |
| --- | --- | --- |
| Quote wrapping | Wrapped `AlXpha` | Wrapped `Alpha`; character lost |
| Bullet-list wrapping | Wrapped `AlXpha` | Wrapped `Alpha`; character lost |
| Ordered-list wrapping | Wrapped `AlXpha` | Wrapped `Alpha`; character lost |
| Task-list wrapping | Wrapped `AlXpha` | Wrapped `Alpha`; character lost |
| Strong mark over original offsets 1–4 | Text remains `AlXpha` | Text becomes `AlphXa` |
| Paragraph split at original offset three | `AlXp` / `ha` | `Alp` / `Xha` |

All six fail after the equality assertion has confirmed that the peers agree.
Convergence therefore does not establish preservation of the user's edit.
The wrap cases use legacy caret commands as well as the new structural wrapping
implementation; the failure is not limited to the new range-selection API.

The failed run is retained at
`artifacts/structural-wrapping-yjs-matrix-verified-20261105.log`.

## Owning boundary

`src/yjs/index.ts` imports Yjs and implements storage and reconciliation in the
adapter. `createSharedElement` stores each Fountain text leaf as its own nested
`Y.XmlElement` containing a `Y.XmlText`; marks belong to leaf metadata rather
than formatting one continuous shared text sequence.

`alignment` / `pairScore` reconcile sibling model nodes. `synchronizeChildren`
deletes unmatched shared children and creates new shared elements for new model
children. Wrapping changes parentage, so the old shared subtree is deleted and
its visible content copied into a new one. An offline insertion into the old
shared text is consequently not retained in the copied destination.

Partial marks and paragraph splits create several model leaves from one old
leaf. Sibling matching can retain one old shared text object for a different
logical segment. `synchronizeElement` then changes its text to that segment,
while other segments get new shared text objects. An offline insertion can
survive in that retained object but appear at the wrong logical position.

`sharedTextAtPath` and relative-selection resolution depend on the current
nested shared objects. `Y.UndoManager` scopes the fragment (and optional
structured-attribute map). Fixing only visible text after synchronization would
leave selection, author undo, marks and future edits on inconsistent identities.

The owning repair is the adapter's shared representation and reconciliation
boundary. The Fountain document schema, command semantics and DOM renderer need
not be replaced to make the adapter preserve their content correctly.

## Reference checks

Yjs documents that an integrated shared type cannot be moved/reintegrated;
copying is required. This supports treating retained identity separately from
tree placement rather than trying to reinsert the same nested shared object.
[Yjs shared-type caveats](https://github.com/yjs/docs/blob/main/getting-started/working-with-shared-types.md).

The stable `y-prosemirror` v1.3.7 binding groups adjacent marked text leaves into
one shared `Y.XmlText` and applies formatting deltas. That is a useful reference
for text-run identity, not evidence that its structural behavior satisfies our
six cases. No competitor runtime or schema has been added to Fountain.
[Pinned binding source](https://github.com/yjs/y-prosemirror/blob/v1.3.7/src/plugins/sync-plugin.js).

The binding repository's current development branch targets unstable Yjs v14;
it explicitly directs most users to its stable v13-compatible package. A major
dependency upgrade is therefore not a demonstrated fix for Fountain's adapter.
[Upstream version guidance](https://github.com/yjs/y-prosemirror).

## Required direction and acceptance

Preserve shared character identity independently of presentation-only leaf
splits, and preserve retained node identity independently of tree parentage.
Evaluate a stable shared-node/reference representation and rich shared text
projection together: a node pool alone would address wrapping but would not
prove correct text identity through marks and paragraph splits.

Do not patch this by changing pairing scores until these six examples happen
to pass, by reconstructing concurrent edits from string similarity, or by
weakening the original-position assertions. Those approaches do not establish
character provenance for duplicate text, deletions or multi-peer edits.

Before changing the default representation, explicitly define its version and
existing-document compatibility/migration behavior. Preserve unknown metadata,
structured attributes, author-scoped undo/redo, relative selections/presence,
and pure-Node operation. Test both exchange orders, insertions on both sides of
a split, duplicate content, concurrent marks, moves, nesting, deletions and
reconnect/provider replacement. Any new reference graph also needs deterministic
handling of concurrent placements, duplicate parents and cycles.

The existing six failing tests remain required. After an adapter repair, repeat
the real two-peer invariants and recorded browser workflows with complete model,
selection and history checks. No migration, wire-format change or new adapter
implementation has been applied by this audit.

Subsequent local work adds isolated retained-text, retained-node and transaction-
mapping candidates. They are not wired into the default adapter and do not fix
the six failures above yet. The
[candidate storage checkpoint](YJS_RETAINED_STORAGE_WORK_IN_PROGRESS.md) records
the implementation, focused/compiled tests and required integration/migration
boundaries. Existing live collaboration documents are unchanged.

The next [local document bridge](YJS_RETAINED_DOCUMENT_WORK_IN_PROGRESS.md) tests
actual Fountain commands against the pools, including concurrent cuts and author
undo. It remains disconnected from the default adapter. An additional ordinary
failure exposes lost private formatting ownership after concurrent full deletion
and typing; that failure is preserved rather than covered by a default-style
fallback.

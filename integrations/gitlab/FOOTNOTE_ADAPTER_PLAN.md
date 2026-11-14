# GitLab native footnote adapter

Status: source-preservation guard implemented; native GitLab footnote authoring
and import remain unfinished. Fountain already has portable footnote nodes,
numbering, insertion, reconnection, selection and removal in `src/pages/index.ts`.
The next work is a source-aware host bridge, not another document engine.

The authenticated cases in `fixtures/footnote-live-html.json` establish these
constraints:

- GitLab omits unreferenced definitions from HTML altogether. Looking only for
  `.footnotes` cannot detect the resulting source loss.
- Repeated references do not consistently retain `.footnote-ref`; their anchors
  also differ from the first reference. A CSS-class-only import is incomplete.
- Rendered IDs have per-render suffixes. They are navigation artifacts, not
  stable document identities or a reliable way to recover source labels.
- Labels can have hyphens, Unicode and percent characters. Case variants may
  reference the same definition while retaining different authored spelling.
  A non-breaking-space label is accepted by the host but normalized in its
  fragment identifier; that URL is not a replacement for the original label.
- Source positions use UTF-8 byte columns. JavaScript string offsets cannot
  safely slice Unicode labels from those positions.
- Multi-paragraph/list definitions, references inside tables/quotes/lists and
  references from one definition to another are actual host behaviors.
- Code examples, escaped text, invalid space-containing labels and frontmatter
  examples must remain distinct from semantic definitions.

The pinned `lib/banzai/filter/footnote_filter.rb` confirms the random per-render
suffix and a 1,000-reference processing limit. Its class-restoration pass is not
a source-preservation contract. The bridge must not depend on those classes
being present on every reference.

`services/footnote_source.ts` currently uses Fountain's existing block/container
parser with an inspection-only grammar. It detects definitions, including
render-invisible ones, without supplying editor IDs, DOM anchors or converted
definition content. The validated GitLab frontmatter prefix is excluded and the
extra parse shares the configured source-byte limit. Until the full bridge is
ready, import refuses these documents with exact source retained rather than
accepting a projection that can lose definitions on a later edit.

The implementation and acceptance sequence is:

1. Reuse the native footnote nodes in the private GitLab schema. Keep safe,
   stable internal IDs separate from original reference/definition labels.
   Define label renaming and duplicate-label behavior explicitly. Do not infer
   IDs from generated link suffixes or decode percent sequences indiscriminately.
2. Map actual reference and definition source spans with strict UTF-8 boundaries
   and validate them against rendered structure. Remove only renderer-owned
   back-reference chrome, retaining body links, marks, math, code and nested
   blocks. Matching must include repeated references without their CSS class.
3. Preserve and expose definitions that the renderer omits. Source discovery
   must use the existing parser's container/code rules; the inspection grammar
   is not permission to substitute its body interpretation for GitLab's. Use a
   verifiable source/render boundary for these bodies, and retain ambiguous
   source with a report until it can be represented. A changed paragraph must
   not remove an unrelated unused definition or normalize its label silently.
4. Export through the native Markdown footnote representation plus explicit
   GitLab label/source projection. Verify exact untouched source and semantic
   retention after edits, including repeated/case-varied references, unused and
   duplicate definitions. Document any canonical rewriting; do not claim byte
   equality from an equivalent AST.
5. Add discoverable insert, definition-edit/navigation, rename and deletion
   controls. Deleting one reference must distinguish itself from deleting a
   shared note and all its references. Transactions, undo/redo, captured targets,
   read-only mode and keyboard focus must work in the actual host.
   A refused initial load must still offer a source-mode handoff of the original
   Markdown. Choosing a new/empty visual draft must be explicit and must not be
   presented as though it had imported the original document.
6. Record real issue/MR/discussion/wiki workflows through save, source/rich
   switching, reopen and application restart. Inspect both the native editor
   and GitLab reader, including repeated-reference/back-reference navigation.
   Cover narrow touch/keyboard and applicable browser/permission matrices.

Do not remove the guard merely because a simple numbered note displays. Replace
it only as the corresponding source cases are represented and verified. This
plan does not promote a public parity row or make the GitLab product complete.

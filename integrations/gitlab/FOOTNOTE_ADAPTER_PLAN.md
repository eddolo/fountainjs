# GitLab native footnote adapter

Status: the verified source/render cases now use native import, canonical export
and authoring controls in the private GitLab adapter. Full host acceptance is
unfinished. The adapter reuses the portable footnote nodes, numbering, selection
and removal in `src/pages/index.ts`; it does not introduce another engine.

## Current implementation — November 15

`footnote_codec.ts` validates complete source/render ownership before enabling
native notes. Represented definitions use one host render. Omitted bodies use a
bounded second render, whose original reference targets must agree. Unsupported
or ambiguous cases still refuse conversion with the exact source retained.

`markdown_codec.ts` keeps authored labels separate from native identities,
preserves untouched source exactly, and canonically exports changed documents.
Case-varied aliases retain their spelling while their definition binding stays
unchanged. `footnote_labels.ts` gives newly inserted notes fresh numeric labels
without rewriting existing labels. Pasted definitions stay at the document root.

The formatting toolbar provides new-note insertion, existing-note reuse, direct
body editing, definition navigation, removal of one reference, and deletion of
the shared note with all its references. The insertion session retains its
captured/rebased target; cancel and failure preserve the draft. Mutations use the
existing transaction/history model. Definition insertion groups notes without
turning the editor's final caret repair into an intervening empty paragraph.
Authored empty paragraphs are not deleted to achieve that result.

The real-user journey exposed a separate browser-view defect: End after a
trailing inline atom could jump to a later paragraph. A view-only caret
placeholder fixes the endpoint; it adds no model character or hard break.
The regression covers footnotes and inline math in Chromium, Firefox and WebKit.

Remaining acceptance work:

- Label-renaming UI and a complete duplicate-label/source-alias policy.
- Missing entity/escape bodies, raw HTML back-reference ambiguity and host
  BOM/CR preprocessing; retain source until each representation is verified.
- All supported canonical exports re-rendered through the actual host, beyond
  the current recorded issue cases and captured codec tests.
- Footnote clipboard, native fragment and authored-empty-paragraph matrices,
  including the public Pages insertion commands outside this private adapter.
- MR, wiki and discussion authoring; browser, touch/IME, read-only and role
  matrices; compiled deployment rollback. One issue journey is not that matrix.

[Current evidence](../../artifacts/gitlab-footnote-authoring-integration-20261115.json).

The following section records the earlier guard/model checkpoint, before native
import and controls were wired into the installed editor.

## Source/render checkpoint — November 14–15

The installed guard now handles labels whose entity/escape decoding produces
brackets or ASCII spaces. Two parent-codec witnesses show those hidden bodies
vanishing after an unrelated edit. The inspection schema now accepts decoded
metadata while qualifying it against raw, space-free candidate syntax through
Fountain's own parser. Inspection values never become native IDs. The actual
13-check browser profile verifies escaped-label paste refusal, entity-space
failed-load recovery/cancel and exact server source after restart.

Forty-seven authenticated normal and forty-two verification renderings
now live in `fixtures/footnote-probe-live-html.json`. The bounded
`footnote_rendering.ts` prelude exposes ordinary unused bodies through the real
host, after validated frontmatter and outside trailing unclosed fences.
`footnote_projection.ts` verifies/removes the carrier, checks source definition
counts, resolves response-local link/ordinal relations and creates carriers for
the existing native nodes. Raw authored labels remain separate from safe,
collision-checked IDs. `footnote_nodes.ts` supplies matching headless/DOM rules.
Invalid authored labels cannot fall through to generic native parsing and lose
their metadata; a valid native ID/raw backslash label survives headless HTML
fragment export/reopen. These three adapter modules are not yet wired into the
installed editor.

The new evidence adds important requirements, not permission to drop guards:

- A raw-label probe still cannot expose some entity/escaped-label bodies.
  Missing source definitions must refuse projection, including a syntactically
  valid response whose diagnostic paragraph was removed successfully.
- Duplicate definitions can share visible reference numbers while different
  links target different bodies. Adding a probe reference can change which body
  an existing link reaches. Response-local href joins take precedence over
  ordinals, but duplicate-label normalization remains refused pending a complete
  source/export/rename policy. Never infer a stable ID from the generated href.
- Source-authored raw HTML can retain `data-footnote-backref`. Removing every
  such anchor deletes authored content. Ownership checks require unique expected
  indices and known generated structure; ambiguity refuses before removing links.
- Prefixing a document with a leading BOM changes whether the BOM is treated as source
  text. That projection is refused until a verified mapping preserves its role.
- The actual preview collapses CR-only input in the captured case. Synthetic
  CR offset-index tests do not prove host newline equivalence; the source-count
  check refuses the resulting incomplete projection. Host parser positions must
  be mapped through verified server preprocessing, rather than assumed to index
  every request string verbatim.
- Probe insertion changes host numbering. Definition order is restored from
  original references after removing the probe; genuinely unused bodies follow.
- Combined original/probe reference limits, original reference preservation,
  body source links, cross-paste label collisions and canonical serialization
  still need complete acceptance before native import/authoring is enabled.

The 110 projection cases, existing source/position cases and other GitLab models
total 954 passes. The selected upstream set has 536 passes and one inherited
skip; types, frontend build, eighteen patch reconstruction and 28-file source
rollback pass. The source guard is installed and browser-verified; native note
import/export, controls and the full product/browser/role matrix remain open.
[Evidence](../../artifacts/gitlab-footnote-projection-integration-20261115.json).

`services/footnote_positions.ts` now implements the first source-position
boundary: inclusive one-based UTF-8 columns become exact half-open JavaScript
offsets in the original renderer input. It refuses invalid boundaries, malformed
or out-of-range positions, lossy Unicode and source beyond the byte limit.
Per-line byte boundaries are cached; original LF/CRLF/CR characters stay intact.
All 23 captured renderings map their emitted reference/definition positions,
including repeated references without a CSS class, Unicode/NBSP labels, nested
definitions and duplicate labels. Forty-seven cases pass; all 839 GitLab model
cases and the TypeScript check pass. This helper is not yet wired into native
import. It neither discovers omitted definitions nor enables authoring, chooses
internal IDs or interprets definition bodies. The source-protection guard stays.
[Source-position evidence](../../artifacts/gitlab-footnote-positions-integration-20261114.json).

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

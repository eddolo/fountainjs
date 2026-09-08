# Whole-container Markdown/HTML recovery boundary audit

Status: investigated on 2026-09-08; capability still unfinished. No runtime,
schema, dependency or public API changes in this audit. This is the next step
after single-paragraph preformatted recovery, not native-platform work.

## The information loss is demonstrable

These sources need different visible whitespace inside the HTML `pre` element:

```md
<div><pre>

line one
line two

</pre></div>
```

Replace the physical newline between `one` and `line` with one space. The
current importer gives `parseHTMLFlow` **identical segments and complete node
JSON for both inputs**. The CommonMark reference renders different preformatted
text. An adapter cannot infer which input produced that shared representation.
Adding a `textContent` conversion in the server importer cannot repair this.

The executable proof and eight fixed reference outputs live in
[the boundary checker](../scripts/check-markdown-flow-boundaries.mjs) and
[the pending fixture matrix](../tests/fixtures/markdown/html-flow-pre-boundaries-v1.json).
Run `node scripts/check-markdown-conformance.mjs` after a package build. The gate
checks 48 combinations: eight sources, LF/CRLF, and flow-only, flow+inline, and
flow+paragraph routes. These verify explicit fallback, full rollback and exact
unchanged-source export. They are **not** 48 newly supported imports. When a
route gains real recovery, deliberately replace its pending assertions with
semantic, retention and editing checks; do not preserve fallback forever.

## Owning boundaries and imports

| File / function | What it owns | Information unavailable later |
| --- | --- | --- |
| `src/core/importers/markdown-importer.ts`: `inline`, `paragraphBlocks` | Markdown tokens, physical soft breaks, generated marks; imports core schema and Markdown lexical helpers | Paragraph-local raw tokens and `softBreak`/`textRun` metadata are not attached to finished block nodes. |
| Same file: `parseBlocks`, `parseList` | Paragraphs, headings, code and container structure; deferred tight-list context | Original vs generated wrappers, code's rendered terminator, and structural separator events are not described by the flow node variant. |
| Same file: `finishHTMLBlocks`, `MarkdownHTMLFlowSegment` | Calls the optional host adapter with raw HTML blocks and protected Fountain blocks | Only `html` or `node` is provided. A failed container is reparsed without speculative HTML adapters. |
| `src/html/server.ts`: `parseFlowWithReport` | DOM-free parse5 tree recovery, protected-slot identity verification and sanitization | It sees placeholders, not original paragraph token streams. It correctly rejects protected blocks in specialized scopes. |
| Same file: paragraph projection / `projectBlock` | Supports closed text-only pre scopes when paragraph provenance exists | Paragraph-local provenance does not establish a scope spanning other blocks or containers. |
| `scripts/check-markdown-conformance.mjs` | Imports development-only `commonmark`, `commonmark-spec` and `parse5`; compares neutral semantics | The oracle is evidence, not a proposed Fountain runtime parser or required document AST. Runtime source-map checks remain in place. |

An unchanged `parseWithSource` snapshot can return the original complete input,
but that is not a token-to-live-node mapping and does not solve editing or
cross-block reconstruction. Source preservation and semantic recovery are
separate contracts.

## Cases the boundary must distinguish

| Fixture | Required information |
| --- | --- |
| Table containing pre across a blank line | A closing `</pre>` parsed in a Markdown paragraph must still be a raw token, not guessed from ordinary text. |
| Multiline prose | Physical LF must remain distinct from a literal space. |
| List inside pre | Item wrappers and generated separators; `list.textContent` is `onetwo`, not the rendered stream. |
| Fenced code inside pre | Authored and generated pre/code wrappers, nesting and the generated code terminator. |
| Heading inside pre | Structural wrapper events, not just heading text. |
| Hard break inside pre | The break atom and generated LF are distinct; do not flatten the atom. |
| CR entity beside physical LF | Newline normalization must operate on the rendered character stream with tag boundaries intact. |
| Unclosed pre | End-of-container HTML recovery, without inventing an authored closing tag. |

Important: HTML `pre` is **not a raw-text parsing element**. It preserves
whitespace but still parses markup. `script`/`style` and RCDATA elements such as
`textarea` have different tokenizer behavior. A solution for pre must not turn
into permission to recover active content or execute extension code.

## Smallest justified change

Introduce an **import-local projection representation before information is
discarded**, rather than reconstructing HTML from finished Fountain blocks:

1. Capture paragraph raw HTML tokens, original inline nodes, character-run and
   soft-break provenance before invoking paragraph/inline adapters. Retain
   source spans as provenance, not as text to reinterpret heuristically.
2. Retain container boundaries and generated rendering events for paragraphs,
   headings, tight/loose lists and code. Reuse Fountain's existing parse decisions;
   do not run a second competing Markdown parser or export arbitrary node
   attributes to an HTML string.
3. Resolve an eligible whole-container projection before committing local HTML
   conversions. Keep callbacks deterministic and avoid adding speculative
   callback replays. Ordinary containers can keep the existing path.
4. Give the separate HTML adapter that projection plus original-node references.
   The core still imports no DOM/parse5 code. Prototype privately first; only
   expose an additive optional boundary after the representation passes fixtures.
   Keep existing `parseHTMLFlow` behavior and identity guarantees compatible.
5. Keep transformation policy explicit. A code block cannot contain arbitrary
   heading/list/custom block subtrees without changing their representation.
   Retain those subtrees in a supported schema projection or decline. Do not
   silently replace original IDs, attributes or atoms with plain code text.
   Exact unchanged-source export alone does not authorize that loss.

This is a bounded parser/adapter change, but not a one-line rendering fix. The
main risks are callback ordering, nested list context, newline normalization,
source-to-node correspondence, and additional allocations on large imports.
Do not add a public `source` string field alone and call the problem solved:
raw source still needs parsing decisions, reference definitions, dialect policy
and custom-node boundaries to produce the correct rendering stream.

## Acceptance before promoting a capability

- Distinguish the proven newline/space collision without changing either input.
- Match reference-rendered semantics, not literal Fountain/CommonMark ASTs.
- Retain original nodes/attributes/marks where promised and explicitly decline
  unsupported transformations, custom atoms, active/foreign content and limits.
- Cover list/quote nesting, LF/CRLF, escapes, entity newlines, closing tokens,
  duplicate original nodes and forged placeholder attributes.
- Retain exact untouched source and test edited export/reimport, undo and reopen.
- Run compiled Node/worker and bundle/performance gates; keep the oracle dev-only.
- Record and visually inspect the resulting editor and reader workflow before
  presenting this as a supported user-facing conversion.

The 563/652 default and 579/652 block+inline semantic baselines are unchanged.
Neither this audit nor the safe-fallback matrix completes CommonMark support.

Verification for this increment: full sequential `pnpm check` passed, including
1,451 tests in 115 files, the new 48 boundary checks, compiled Node/workerd,
headless/API/package, framework type, size and performance checks. No browser
journey was rerun for these test/documentation-only changes; earlier recordings
do not certify the still-unimplemented whole-container recovery.

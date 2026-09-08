# Whole-container Markdown/HTML recovery boundary audit

Recursive follow-through (Unreleased): `readBlockSources()` now captures
import-local list/item/quote boundaries from the existing parser, with deferred
tightness, ordered starts, raw HTML, empty model placeholders and explicit
unsupported blocks. The separate source-projection adapter consumes these
events without serializing arbitrary finished nodes. Child correspondence,
custom metadata, duplicate nodes and depth/node limits are checked. A reference
failure exposed nested code-language leakage onto the enclosing pre; both HTML
importers now inspect only a direct code child. The strict oracle passes 46
LF/CRLF exact-code/source contracts and 16 complete nested-container semantic/
source contracts. Corpus scores and the identity-preserving flow contract stay
unchanged. Task lists, inline atoms and omitted outer wrappers remain unresolved.

The preceding commit's Linux browser CI (run 34200671647) failed the list-first
code editing test in WebKit on all retries (552 passed, 14 skipped, one failed).
Inspection of its retained trace led to a stronger label-area click test. That
test reproduced lost code input locally in Firefox and WebKit, despite the
editor having focus. The syntax plugin now explicitly places a code caret for
its generated label area. Centre/label checks pass in all three desktop engines;
the hosted Linux rerun remains a separate requirement, not proven by Windows.
Original failure artifacts are retained under `artifacts/list-code-label-focus-before/`
and the downloaded `artifacts/prior-ci-playwright-report/`.

Final local verification: full sequential `pnpm check` passes 1,553 tests / 121
files, including compiled Node/workerd, headless, packaging and performance
checks. Fifteen targeted checks pass across Chromium, Firefox and WebKit:
nested recovery, label handoff, prior paragraph recovery, and centre/label-area
code clicks. Two separate recorded journeys pass; editor/reader screenshots,
narrow layouts and both recording overviews were inspected. The initial
structural screenshot caught smooth scrolling mid-capture; capture now uses
instant scroll plus two animation frames, and the corrected images were checked.
Final evidence: `artifacts/structural-label-final-browser/`,
`artifacts/structural-label-final-recorded/`,
`artifacts/structural-final-regression-browser/`, and
`artifacts/list-code-label-focus-after/`. Production site build passes.
The optional source-tree API changes only the Markdown importer declarations;
its snapshot was reviewed. Measured aggregate code is 1,385.7 KiB ESM and
1,151.4 KiB CJS, with explicit 1,386/1,152 KiB ceilings. Individual entry,
CSS and performance budgets are unchanged; no dependency was added.
Viewport emulation and synthetic public paste events are not physical-device
or OS clipboard certification. Hosted Linux confirmation remains pending.

Opaque-label follow-through (Unreleased): the former code-language schema
restriction is now removed for whitespace-free string metadata. Full fence info
is decoded before its first word is selected; canonical label escaping preserves
entities, backslashes and marker-looking prefixes. Browser/server HTML retain
complete safely escaped labels. The highlighter's inherited-property lookup bug
for `constructor`/`__proto__` is fixed with own-property checks. These are actual
input/rendering corrections, not normalization of the conformance comparator.
See [the contract](MARKDOWN_SOURCE.md#opaque-code-language-labels).

Verification: 34 LF/CRLF reference-label contracts, compiled Node/workerd checks,
and the full sequential check pass (1,542 tests / 120 files). The two public
editor journeys pass in Chromium, Firefox and WebKit (six browser tests); a
separate recorded code-label journey and the production website build pass.
The initial narrow-screen visual inspection exposed clipped long labels. Labels
now wrap above the code, with the original spelling available in a hover title;
the final mobile screenshot, editor/reader screenshots and recording overview
were visually inspected. Evidence is retained under
`artifacts/opaque-code-labels-wrap-browser/` and
`artifacts/opaque-code-labels-recorded/`. Reader preview deliberately has no
author syntax-label decoration; its document labels are independently checked.
This is viewport emulation, not physical-mobile or OS-clipboard certification.
No API snapshot or budget thresholds changed. The strict default/opt-in corpus
scores remain 563/652 and 579/652; nested container recovery is still unfinished.

Code-language follow-through (Unreleased): a compiled oracle probe found that
`c++` and `c#` survived Markdown parsing but became `c` during HTML projection.
Both browser and server HTML importers now consume complete supported language
class tokens, including punctuation/dotted labels, and reject partial class
matches. Nine browser/server unit cases and three text-flow label regressions
cover this. The full sequential check passes 1,515 tests / 119 files, including
the compiled Node/workerd label check. No API/budget threshold changes.

The first browser label assertion failed in all engines because the live syntax
decoration deliberately shows the registered alias `cpp`. Inspection of
`collectCodeDecorations` establishes that this is a view attribute, not a model
transaction. The corrected journey separately asserts the `cpp` decoration,
the public Markdown source's exact `c++` fence label, and the independent
reader's model label. Original failure traces remain under
`artifacts/code-language-flow-browser/`; this is not an alias-normalization
change in the engine or permission to accept truncated source labels.
The corrected journey passes all three desktop engines under
`artifacts/code-language-source-browser/`. A separate recorded run passes under
`artifacts/code-language-flow-recorded/`; its video overview and the C++ reader
screenshot were visually inspected. The production website build passes. The
earlier text-block recording remains separate evidence for the mixed-content
whitespace behavior; no OS clipboard or physical-device certification is claimed.

Text-block follow-through (Unreleased): `readTextBlockSources()` now retains
direct heading and code syntax as well as paragraph provenance. The separate
`parseTextBlockFlow` adapter uses those wrappers and generated code terminators,
while refusing custom metadata/modified blocks. The oracle checks 24 LF/CRLF
exact-code/source contracts; outer-div mismatches remain deliberately visible.
Lists/nested containers and hard-break atoms still need structural source events.
Paragraph-only and identity-preserving flow contracts remain unchanged.
See [the text-block contract](MARKDOWN_SOURCE.md#explicit-text-block-source-flow-recovery).
The default code schema's restrictive fence-language attribute was also exposed
by a hostile-info test; ordinary import of unsupported labels remains a separate
input-policy issue, not a recovered capability.

Verification: full sequential `pnpm check` passes 1,503 tests / 118 files,
including compiled Node/workerd recovery, API/headless/type/package and existing
performance gates. The extended conversion → edit → undo → download → reopen →
reader journey passes Chromium, Firefox and WebKit; it asserts exact code text
and complete replacement of prior headings/lists/tables. A separate recorded
Chromium run passes. Conversion/editor/mobile-reader screenshots and the video
overview were visually inspected under `artifacts/text-block-flow-browser/`
and `artifacts/text-block-flow-recorded/`. Paste uses a public clipboard event
payload, not OS-clipboard certification; the 390px viewport is not a physical
mobile-device test. The production `/fountainjs/` site build passed, retaining
the existing large MathJax chunk warning. Runtime measures 1381.5 KiB ESM /
1148.1 KiB CJS; aggregate caps rise 2 KiB each to 1382/1149, without changing
individual-entry or performance limits.

Latest implementation (Unreleased): the separate `parseParagraphFlow` adapter
now recovers pristine text-only paragraphs across raw HTML boundaries. Four
fixture kinds retain exact preformatted text; the table/pre fixture also matches
full reference structure. Outer `div` wrapper mismatches remain explicit. Lists,
headings, code and hard-break atoms still require structural work; custom data
is refused rather than flattened. The original `parseFlow` contract is unchanged.
See [the explicit API and demo](MARKDOWN_SOURCE.md#explicit-paragraph-source-flow-recovery).

Verification: full sequential check passes 1,484 tests / 117 files, including
compiled Node/workerd recovery, API/headless/type/package and performance gates.
The expanded conversion/edit/undo/download/reopen/reader journey passes Chromium,
Firefox and WebKit. Stronger reruns also assert that no prior headings, tables or
lists survive replacement (`artifacts/paragraph-flow-strict-browser/`). A separate
recording and conversion/editor/mobile-reader screenshots were visually inspected
under `artifacts/paragraph-flow-recorded/`; original cross-browser evidence is in
`artifacts/paragraph-flow-browser/`. The production website build passed.
Runtime code is 1379.1 KiB ESM / 1146.1 KiB CJS; aggregate caps rise 3 KiB each to
1380/1147, with no individual entry or performance threshold changes.

Follow-through (Unreleased): `parseHTMLFlow` now receives lazy paragraph-source
inspection through an optional third context argument. It distinguishes the
LF/space collision below, retains raw tokens and current output-block references,
and does not replay host adapters. This is a paragraph inspection boundary,
not the complete structural projection described in this audit. The original
identity-preserving server flow still declines these eight fixtures. See the
[API contract and limitations](MARKDOWN_SOURCE.md#inspect-paragraph-syntax-from-a-flow-adapter).

Verified follow-through: 1,466 tests / 116 files in the complete sequential check;
compiled Node and workerd inspection; three desktop engines through the existing
edit/undo/download/reopen journey. A separate recording and editor/list-reader/
mobile preformatted screenshots were inspected under
`artifacts/paragraph-sources-recorded/`; three-engine results are under
`artifacts/paragraph-sources-browser/`. These are regression checks of existing
conversion behavior, not visual evidence of the still-missing whole-container
projection. The production `/fountainjs/` website build passed.

A compiled local 10,000-paragraph probe retained every physical break and invoked
the flow callback once: parsing 143 ms, first lazy inspection 88 ms, subsequent
inspection returned the same snapshot. This is a single-machine diagnostic,
not a cross-machine benchmark or memory bound. Runtime code measures 1376.5 KiB
ESM / 1143.9 KiB CJS; only the aggregate ESM cap rises 1 KiB to 1377.

Original audit: investigated on 2026-09-08; capability still unfinished. No runtime,
schema, dependency or public API changes in that audit. This is the next step
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
legacy flow stream gives `parseHTMLFlow` **identical segments and complete node
JSON for both inputs**. The CommonMark reference renders different preformatted
text. An adapter cannot infer which input produced that shared representation.
Adding a `textContent` conversion in the server importer cannot repair this.
The new optional context preserves the missing distinction separately without
changing those existing flow segments.

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

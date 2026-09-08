# Whole-container Markdown/HTML recovery boundary audit

Standard-wrapper reporting correction (2026-09-08, Unreleased): the server HTML
fallback incorrectly suppressed `unmapped-block-wrapper` for recognized standard
block tags, even when no schema node represented the wrapper. Removal is now
reported for all fallback wrappers. This changes reporting, not the projected
document. Registered wrappers remain authoritative; repeated warnings stay
deduplicated and source attribute values are not included. Thirteen added unit
cases cover standard tags, registered-node exemptions and 1,000 repeated wrappers.
The existing typography test still verifies inherited marks, and now also
correctly expects a warning for its removed section. Compiled Node/workerd smoke
checks verify the same reporting boundary. `pnpm check` passes 1,608 tests / 124
files; runtime/API/dependencies and all existing ceilings remain unchanged
(1,388.8 KiB ESM / 1,153.9 KiB CJS).

The public conversion demo now says "reported HTML conversion details", not
"recovered HTML issues", and explicitly says an empty report is not a lossless
guarantee. The styled-report workflow verifies the warning while retaining its
formatting/edit/undo/redo/download/reopen checks. Initial screenshot review also
found the JSON column stretching the complete page into a tall mostly empty
input area. Headless output is now height-bounded with full scrolling; output
regions are named, keyboard focusable and have a visible focus outline. The
journey verifies PageDown actually scrolls the result instead of truncating it.

Final UI verification: TypeScript passes; six browser checks pass across Chromium,
Firefox and WebKit (styled-report handoff plus the public headless pipeline).
A newly recorded styled-report journey passes after the scrolling correction.
Its recording overview and complete conversion-page screenshot were visually
inspected: warning text is visible and the output no longer stretches the page
to the full JSON length. Evidence: `artifacts/standard-wrapper-check.log`,
`artifacts/standard-wrapper-scroll-browser/`, and
`artifacts/standard-wrapper-scroll-recorded/`. Pre-layout-fix recordings remain
in `artifacts/standard-wrapper-recorded/`. Final site build succeeds with the
existing large MathJax warning. Paste remains a synthetic public-event payload,
not OS-clipboard certification; mobile viewports are not physical-device proof.

Next concrete fidelity finding, not fixed here: with the default schema,
`<dl><dt>Latency</dt><dd>Time to respond.</dd><dt>Throughput</dt><dd>Work per second.</dd></dl>`
currently becomes one paragraph with four adjacent text nodes, losing term/
description boundaries. The compiled importer reproduction confirms both lost
structure and the newly explicit wrapper/inline warnings. Definition-list
semantics need an actual representation/import/export/editing contract; a warning
alone does not close this gap. CommonMark 563/579 scores remain unchanged.

Registered-wrapper correction (2026-09-08, Unreleased): a schema-defined HTML
section with `block+` content falsely declined recovery when it contained a
generated Markdown hard break. `configuredNode` first tried inline content, then
block content, but both attempts appended to the same break-visit ledger. The
preservation guard correctly rejected the duplicate evidence even though only
the block interpretation would be returned. Candidate contexts now own their
break-visit arrays; only accepted candidates commit visits to the parent. Nested
rules preserve source order; rejected shapes/rules leave no visit evidence.
Actual missing/reordered protected nodes and breaks still fail, and the unknown-
wrapper/default-schema contract has not been broadened into arbitrary HTML.

Seven regression cases cover LF/CRLF registered/nested sections, headings,
lists, competing high-priority rules, built-in fallback and a deliberately lossy
content selector. The first case was reproduced failing before the runtime fix.
Compiled Node/workerd smoke checks exercise a registered section with a break.
Full `pnpm check` passes 1,595 tests / 124 files; API declarations and all existing
budget/performance limits remain unchanged. Runtime: 1,388.8 KiB ESM / 1,153.9 KiB
CJS, within 1,389 / 1,154 KiB caps, with no new dependency.

The new browser contract registers a custom section through the public extension
API, imports nested sections through source recovery, and then uses real keyboard
typing/undo/redo. It exports HTML, reopens through the browser importer and checks
wrapper attributes/nesting and exactly one visible line-height break at desktop
and 390px widths. Three engines pass; the existing nested-task/image public demo
journey also passes in all three. A recorded contract run passes and its recording
overview plus desktop/mobile editor screenshots were visually inspected. This is
an editor/API contract harness, not a new end-user demo, OS-clipboard test or
physical-mobile certification. Evidence: `artifacts/registered-wrapper-final-check.log`,
`artifacts/registered-wrapper-browser/`, `artifacts/registered-wrapper-regression/`,
and `artifacts/registered-wrapper-recorded/`. Site build passes with its existing
large MathJax chunk warning. The earlier fixture type check caught mixed source
and built-package nominal schema types; the editor fixture now consistently uses
source-module types, while compiled runtime coverage remains in the smoke tests.

Developer documentation now includes a concrete registered-section example and
updates the server guide's stale list/atom limitations. CommonMark 563/579 scores
and the 58/38 reference/source contracts remain unchanged. Unknown wrappers,
attributes/layout and the remaining parity programme still require further work.

Task-source follow-through (2026-09-08, Unreleased): the recursive context now
has distinct `taskList`/`taskItem` discriminants and explicit boolean checked
state. The optional structural adapter validates original attributes/children,
then verifies every complete resulting task-list subtree against its original.
Changed, duplicated or flattened task trees cause whole-flow inert rollback.
Task paragraphs keep explicit wrappers; hard breaks stay protected nodes and
code preserves exact text without generated inline-code marks/renderer LFs.
These are Fountain/GFM-extension semantics, not CommonMark conformance gains.
Custom task metadata and HTML that changes task text remain explicit refusals.

Seventeen new unit cases cover LF/CRLF source retention, checked/unchecked tasks,
nested tasks, ordered lists, quotes, headings, code, hard breaks, inline images,
raw-text/preformatted refusal, custom task metadata and cached frozen context.
Compiled Node/workerd smoke checks cover nested checked state. The public API
snapshot changes only the Markdown importer's two declaration hashes; consumers
exhaustively matching the source union must handle or decline the new cases.
No runtime dependency was added. Runtime measures 1,388.7 KiB ESM / 1,153.8 KiB
CJS, about +1.3 / +1.1 KiB. Only aggregate caps grow to 1,389 / 1,154 KiB;
individual entry, CSS and performance caps remain unchanged.

The first full package check passed 1,588 tests / 123 files, and the extended
public conversion → issue editor → reader workflow passed in Chromium, Firefox
and WebKit, plus a recorded Chromium run. Screenshot inspection then found an
unchecked nested task visually struck through by its completed parent, despite
correct document state. The old descendant/wrapper decoration propagated into
children. Completion styling now applies to text blocks with per-task scoped
variables, so an unfinished subtask is not visually completed by its parent.
The journey now asserts both text-block decoration and undecorated wrappers
after toggling, undo/redo, Markdown download/reopen and reader/mobile preview.
Pre-fix evidence is preserved in `artifacts/task-flow-browser/` and
`artifacts/task-flow-recorded/`; these initial passes are not final visual QA.

Final verification after the styling fix: full `pnpm check` again passes 1,588
tests / 123 files; three updated browser journeys and one recorded journey pass.
The final recording overview, desktop reader and 390px reader screenshots were
visually inspected: the unchecked child remains unstruck while its parent and
completed sibling are struck through. Evidence: `artifacts/task-flow-styling-check.log`,
`artifacts/task-flow-styling-browser/` and `artifacts/task-flow-styling-recorded/`.
CSS measures 85.7 KiB within its unchanged 86 KiB cap. Production site build
passes with the existing large MathJax chunk warning. Browser paste is synthetic
through the public event handler; viewport emulation is not physical mobile or
OS clipboard certification. The preceding inline-object update's hosted Linux
run was still pending during local verification; no hosted success is claimed.

CommonMark remains 563/652 default and 579/652 block+inline, with 58 preformatted
and 38 complete reference-structure/source contracts unchanged. Complete HTML
wrapper/attribute fidelity and the broader parity programme remain unfinished.

Inline-object follow-through (2026-09-08, Unreleased): the pristine-content
comparison now preserves inline nodes as nodes instead of rejecting every atom
up front. Outside preformatted scopes the existing protected-slot machinery
retains their attributes, marks and order. Plain hard breaks retain their
special renderer-whitespace projection; marked/custom breaks use original
node slots. Preformatted conversion still rejects objects it would need to
flatten, and modified inline-adapter output still causes complete inert rollback.
There is no arbitrary-node HTML serialization or new public API.

Twelve unit cases cover inline images in paragraphs/headings/nested lists/quotes,
marked and linked images, marked breaks, custom inline data, optional math/emoji,
preformatted refusal and modified-image rollback. Seven additional LF/CRLF
reference cases increase the complete structure/source matrix from 24 to 38;
the 58 preformatted contracts and 563/579 corpus baselines remain unchanged.
Compiled Node/workerd smoke checks now cover marked image source data.
Full `pnpm check` passes 1,571 tests / 122 files. Including the visible-label
correction below, runtime is 1,387.4 KiB ESM / 1,152.7 KiB CJS, within unchanged
caps; no dependency/API snapshot changes.

The public conversion → incident editor → reader journey now imports a linked
image, edits its alternative text/title through the supplied toolbar, undoes
and redoes, deletes and restores the image without losing surrounding prose,
then downloads/reopens Markdown and checks the image/link again. Three browser
engines pass the extended journey. The diagnostic sidebar now explicitly
distinguishes local raster uploads from imported URLs that can load remotely.
Final browser evidence: `artifacts/inline-flow-edit-browser/`; full check log:
`artifacts/inline-flow-check.log`. Initial editor/mobile reader screenshots
were visually inspected. Synthetic paste and viewport emulation are not OS
clipboard or physical-mobile certification.

Visual inspection also exposed disappearing image-field labels once their
placeholders were replaced by values. The supplied React image form now has
persistent labels for URL, alternative text, optional title/caption and responsive
source fields, using its existing grid and mobile styles. The inline-image
journey checks label visibility and node kind; the regular public image workflow
also checks all six labels with populated values. Final package check log:
`artifacts/inline-flow-final-check.log`.

Final verification: six browser checks pass (both journeys across Chromium,
Firefox and WebKit), a separately recorded extended incident journey passes,
and the final image-controls screenshot plus recording overview were visually
inspected. Evidence: `artifacts/inline-flow-verified-browser/` and
`artifacts/inline-flow-verified-recorded/`. The production website build passes
with its existing large MathJax chunk warning. The first caption-label assertion
mistakenly required exact label text despite a populated textarea contributing
text; it now checks the visible label associated with each field and retains
the populated-value condition. No runtime workaround was used to satisfy it.

The preceding hard-break release `d1da5c1` also completed its full hosted Linux
[CI run](https://github.com/eddolo/fountainjs/actions/runs/34205604435) successfully.
That confirms the preceding change; this inline-object/label update has its own
local evidence and requires its own hosted run after publication.

Plain hard-break follow-through (2026-09-08, Unreleased): structural source
projection now recognizes pristine, unmarked, attribute-free `hard_break`
nodes. It emits a separately tracked generated `br` and a renderer-whitespace
carrier. In preformatted scopes the tag contributes no text and the carrier
becomes LF; elsewhere an empty protected carrier prevents a second line break
or an unwanted leading space beside the actual break.
Generated tags use parse offsets, not user-controlled attributes, and their
order/count is checked. Custom/marked breaks, raw authored break tags inside
pre, other atoms and task lists retain conservative fallbacks. The paragraph-only
and identity-preserving adapters do not acquire this new exception.

The first browser assertions passed while a screenshot exposed a double-height
gap: a literal generated LF beside the break was visible under editor whitespace
rules. The carrier correction fixes this without deleting original source
newlines. The journey now measures exactly one computed line-height after
editing, undo/redo, download/reopen and reader preview, including mobile width.
It also checks both lines align horizontally, after inspection caught a leading
renderer space in the intermediate correction.
Earlier evidence remains under `artifacts/hard-break-workflows-browser/`.

Reference checks now cover 58 LF/CRLF preformatted stream/source contracts and
24 complete structure/source contracts outside pre. Corpus scores remain
563/652 default and 579/652 block+inline. Full sequential `pnpm check` passes
1,559 tests / 121 files, including compiled Node/workerd. Public API declarations
are unchanged. Runtime totals are 1,387.0 KiB ESM / 1,152.4 KiB CJS, with explicit
1,388/1,153 KiB aggregate caps; no individual entry, CSS or performance limit
changes and no new dependency. Full log: `artifacts/hard-break-final-check.log`.

Final public journeys: six tests pass across Chromium, Firefox and WebKit,
covering the nested hard-break editor/reader round trip and discovery/use of
the GitLab-style and Todoist-style workflow showcase. Two separately recorded
journeys pass. Final evidence is under `artifacts/hard-break-aligned-browser/`
and `artifacts/hard-break-aligned-recorded/`; editor/reader captures and both
recording overviews were visually inspected. These are emulated viewports and
public synthetic paste events, not physical-mobile or OS clipboard certification.
The production website build passes with the existing large MathJax chunk warning.

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
or OS clipboard certification. Hosted Linux confirmation subsequently passed:
[CI 34203630460](https://github.com/eddolo/fountainjs/actions/runs/34203630460)
for `b6a8679` completed successfully, including the browser job that previously
failed code-label caret placement. This is evidence for that preceding commit,
not a substitute for CI on the newer hard-break changes above.

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

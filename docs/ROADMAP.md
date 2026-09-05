# FountainJS opportunity roadmap

This roadmap preserves product opportunities that arise from user feedback,
upstream issue boards, editor-community discussions, and FountainJS's own parity
audit. It is not a shipped-feature list and it is not permission to replace
current release gates with a larger pile of unfinished modules.

Demand claims submitted on **2026-09-04** are recorded here as research leads.
Before priority is justified publicly, the original Tiptap/ProseMirror issue or
discussion must be linked, dated, checked for current status, and translated
into an independently tested user outcome. FountainJS will not copy upstream
code or APIs.

## Do not rebuild what is already here

Several requested outcomes already ship and should be hardened rather than put
back into a “future” list:

- provider-neutral threaded comments, mapped annotations, tracked changes, and
  named version history;
- cancellable asynchronous suggestions shared by mentions, slash commands,
  emoji, and other triggers;
- audio, video, files, provider-gated embeds, images, and upload boundaries;
- rowspan/colspan-aware table transforms, selection, resizing, repair, and
  rectangular clipboard interchange;
- Markdown/HTML/JSON/text interchange with explicit loss reporting;
- large-document latency, DOM churn, NodeView churn, and memory budgets.

Their current limitations remain in [TIPTAP_PARITY.md](TIPTAP_PARITY.md); “has
an implementation” never means “has a decade of production evidence.”

## Delivered foundation: extension trust and authoring

PROD-06 owns manifests, exact extension API compatibility, deterministic
requirements, hard duplicate/contribution conflicts, framework-neutral
conformance tests, a safe package generator, and installation-wide diagnostics.
The `fountainjs-editor doctor` command is included here because it is the direct
completion of that contract, not a separate speculative feature. That outcome
is now certified in [TIPTAP_PARITY.md](TIPTAP_PARITY.md) and documented for
extension authors in [EXTENSIONS.md](EXTENSIONS.md).

## Delivered foundation: stable releases and migrations

PROD-07 owns explicit API-stability levels, deprecation windows, document and
extension migration contracts, release evidence, security-support policy, and
repeatable release gates. That outcome is now implemented and publicly
certified in [TIPTAP_PARITY.md](TIPTAP_PARITY.md); the operational contracts are
in [MIGRATIONS.md](MIGRATIONS.md) and [RELEASES.md](RELEASES.md).

## Delivered: print-aware pages and pagination

DOC-14 is the first delivered post-foundation capability. Its measured
layout/persistence architecture includes fixtures for pages, headers, footers,
footnotes, tables, lists, media, manual breaks, and continuous accessibility.
Its first platform-neutral milestone now ships in source: physical geometry,
legal-fragment flow, non-persisted automatic boundaries, manual breaks,
footnote intent/integrity, transient first-reference numbering, standard
Markdown and semantic HTML interchange, canonical default/first/odd/even header/footer
templates, dynamic page fields, renderer-neutral per-page furniture/footnote
projection, undo, HTML/JSON, and Yjs. The browser side now
also has isolated measurement for text lines, direct blockquote children, list
items, rowspan-safe table groups, long-footnote line continuations, and manual
breaks; every fragment maps back to its model and
structural paths plus clip geometry, and every page placement resolves to an
exact validated source slice. A separate read-only renderer now projects those
slices into fixed sheets with repeated furniture, table headers, footnotes,
physical print rules, and one continuous accessibility copy. Chromium, Firefox,
and WebKit verify physical A4/Letter sheet geometry, stable named pages,
furniture/fields, footnotes, page breaks, and print-only accessibility/editor
state. A Chromium PDF gate additionally verifies page count, MediaBoxes, and
representative page-specific content without a duplicate hidden document. Timed reflow
observation is coalesced, and mutation-only cycles reuse unchanged top-level
geometry under 1,000-block/75 ms and alternating-edge 5,000-block/250 ms p95
browser gates. Leading insertion/removal preserves 5,000 unchanged DOM blocks,
rebases their model/source paths, and holds page measurement to two/one geometry
reads under a 500 ms p95 structural gate. A guarded editable surface now places
whole top-level blocks and continues measured paragraphs, canonical list items,
and rowspan-safe table row groups over fixed page shells while retaining one
unchanged contenteditable, direct model paths, identity, native IME, and
cross-page selection. Continuations use reversible accessibility-hidden
widgets or spacing, never document nodes. A split table remains one editable
table; page shells show read-only repeated column headers rebuilt from its one
canonical header. Two-row headers retain safe row/column spans, transitive body
rowspans stay in one fragment, and a header rowspan entering body rows disables
the incomplete repeated copy. Canonical page templates and footnote definitions remain
uniquely editable in ordered rails around the page stack while sanitized,
field-resolved, accessibility-hidden copies appear on their assigned sheets.
Rows taller than a page body remain one editable row with explicit overflow.
Images, audio, details, code blocks, and custom NodeViews now follow the same
canonical keep-together rule: move intact when possible and show explicit
non-clipping overflow when taller than the page body. Pagination-owned
attributes and style variables preserve custom NodeView identity without
weakening recovery for unrelated DOM mutations. The read-only renderer also
continues multi-block blockquotes at their canonical direct-child boundaries
while repeating their measured container overhead, and accepts strictly
validated host-declared custom continuation bands and a
sanitized host-owned placement projection for custom NodeViews, canvases,
embeds, and atomic media whose live DOM is unsuitable for print. This contract
does not mutate the model or claim that an arbitrary widget is safely editable
across pages; the guarded live surface falls back to continuous mode for a
custom split.
Long footnotes use the same neutral measured-fragment contract and exact source
offsets in editable and print projections, with no duplicate persisted definitions.
Mapped comments and top-level movement are certified across continued lists and
tables. The surface returns to continuous mode when either the
viewport or embedding container is narrow, and restores pages without
remounting when space returns. History, tracked suggestions, and bidirectional
Yjs edits remain live across those automatic boundaries without persisting page
numbers. Styled semantic HTML imported through the public schema contract is
now checked across all three desktop engines for marks/alignment, ruby, math,
nested quote/list structure, merged tables, and manual breaks, with exact
Chromium PDF body-token de-duplication. This bounded contract is delivered;
new document families remain hardening work under the same gates. CSS
page-shaped boxes or destructive document splitting do not qualify.

## Delivered: stable node identities and lookup

`DOC-17` now provides configurable, portable identities without forcing IDs onto
text leaves; indexed lookup, update, and selection APIs; deterministic repair for
paste, duplication, and mixed-client collaboration; position-neutral history
mapping; schema filtering and stored-JSON normalization; and compatibility with
arbitrary extension nodes and portable attributes. Identity generation is
injectable for deterministic tests and non-browser runtimes, and an invalid or
duplicate identifier never silently targets the wrong node. The complete
400-test package suite and 278-pass Chromium/Firefox/WebKit/mobile
[CI run for `8fca57c`](https://github.com/eddolo/fountainjs/actions/runs/33967296032),
plus its successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33967296119),
certify the public package and rendered demo.

## Delivered: first-class interactive widget contract

The first-class widget implementation keeps validated values in
portable document attributes; accepted changes are one undoable transaction;
generic Yjs collaboration reproduces them; and explicit focus/cursor handoff,
Tab/Enter/Escape policy, read-only behavior, teardown, and validation are shared
by isolated plain-DOM and React adapters. Public working examples exercise both
renderers. The complete 414-test package suite and 281-pass
Chromium/Firefox/WebKit/mobile
[CI run for `cced9e2`](https://github.com/eddolo/fountainjs/actions/runs/33969832708),
plus its successful
[Pages deployment](https://github.com/eddolo/fountainjs/actions/runs/33969832692),
certify the public package and rendered demos.

## Active now: certify granular collaborative structured attributes

The implementation now defines bounded DOM-free object/array contracts, typed
nested commands, whole-root and schema validation, stable-ID addressing, and an
opt-in nested `Y.Map`/`Y.Array` representation beside backward-compatible flat
JSON. Focused unit and real-browser tests prove separate nested fields,
concurrent array insertions, local-only undo, room replacement, public controls,
and malicious-value failure containment. The remaining work in this milestone
is the complete package/browser matrix and published CI/deployment evidence;
claims stay provisional until those gates pass.

## Prioritized after release foundations

| Priority | Outcome | Current baseline | Required proof before “Delivered” |
| --- | --- | --- | --- |
| 1 | First-class interactive widgets | Delivered and certified in `cced9e2` | Continue browser, accessibility, format, and extension-composition regression coverage as products adopt the contract. |
| 2 | Granular collaborative structured attributes | Implemented; full release certification is running | Complete package/browser matrix, packed ESM/CJS and type-shape checks, public deployed demo, and recorded CI/Pages evidence. |
| 3 | Truly server-native document conversion | Headless model and Markdown exist; safe HTML still uses DOM facilities | DOM-free HTML parse/serialize for Node.js, Bun, Deno, and worker runtimes with CPU/memory budgets, safe parser substitution, identical validation, and packed-runtime tests. |
| 4 | Virtualized or paged rendering for huge documents | 10,000-block engine budgets exist; the view still renders the complete document | Retained selection and IME correctness across mounted windows, search/decorations/NodeViews, scroll anchoring, accessibility, printing, collaboration, and real 100k-block performance evidence. |
| 5 | Native renderer feasibility | Core/view separation exists; DOM/Web Component/React are web surfaces | A written coordinate/input/IME/accessibility bridge design and a prototype for either React Native or Flutter before promising native packages. A web view does not count as native. |
| 6 | Higher-fidelity Markdown source preservation | Semantic round-trips and loss reports exist | CommonMark/GFM corpus, frontmatter, footnotes, raw/parsed switching, source-span preservation where safe, unknown-syntax policy, and format-stability fixtures. Exact source preservation and semantic preservation must be named separately. |

Pagination and footnotes should be designed together because page geometry,
continuation, numbering, print output, and table splitting interact. Stable node
IDs should precede widgets and deeper review/database integrations because it
provides a durable external-reference primitive.

## Secondary research queue

These are useful, narrower ideas. They should become ledger rows only after an
owner defines persistence, selection, accessibility, collaboration, format,
performance, and browser behavior:

- explicit Word, Google Docs, and Excel paste normalization (`DOC-19`), plus
  property-by-property fixtures for MathML/LaTeX, semantic ruby/footnotes,
  tracked changes, comments, and unknown application clipboard formats;
- a visible privacy-aware “Report a bug” route on the website and every demo,
  backed by the existing structured GitHub form; request Fountain version,
  framework/runtime, browser/OS, minimal reproduction, expected/actual behavior,
  and sanitized document JSON without asking users to publish private content;
- table captions and advanced image/text wrapping;
- cross-editor schema-aware drag and drop plus a general inline/block drop cursor;
- footnote/endnote interchange independent of paged rendering;
- configurable soft limits in addition to enforced hard character limits;
- iframe/isolated-surface editing and host focus coordination;
- vertical Japanese writing with logical selection/navigation evidence;
- spell-check, dictionaries, thesaurus, and replaceable language-service hooks;
- visible tabs, non-breaking spaces, and other invisible characters (`DOC-16`);
- YAML frontmatter and raw/visual Markdown switching.

## Broader editor landscape audit

After the active ProseMirror + Tiptap parity work, audit other editor families
for ideas FountainJS can improve or make framework-neutral. This is a research
queue, not a claim that the named projects expose identical capabilities:

- Lexical and Slate: state/update architecture, normalization, operation
  mapping, DOM reconciliation, and custom behavior ergonomics;
- Plate and Remirror: extension composition, typed authoring, supplied UI,
  framework integration, and what happens when their abstraction leaks;
- BlockNote and Editor.js: block-first workflows, structured output, slash and
  drag interactions, and the limits of mixing free-form rich text with blocks;
- CKEditor 5 and TinyMCE: mature authoring workflows, accessibility, import and
  export fidelity, plugin operations, long-term compatibility, and deployment;
- Eddyter and other finished-editor products: onboarding speed, default UI,
  customization boundaries, licensing, and which advertised capabilities have
  independently reproducible evidence.

Use the same evidence template for every audit: public API and license, supplied
features versus paid/hosted services, framework and server portability, input
and IME behavior, collaboration, document fidelity, performance, accessibility,
extension conflicts, documentation quality, and runnable tests. Promote an idea
to the capability ledger only when it has a FountainJS contract and proof plan.

## Sequencing rule

Finish and certify one ledger outcome before beginning another. Each outcome
must remain framework-neutral at its model/command boundary, ship through the
public MIT package, include a working packed-package example, pass applicable
unit/browser/accessibility/performance gates, document honest limitations, and
be compared against ProseMirror + Tiptap as a combined stack. Community size and
years of deployment are evidence gaps that features alone cannot erase.

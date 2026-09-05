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

## Active now: print-aware pages and pagination

DOC-14 owns the first post-foundation capability. It must begin with a measured
layout/persistence architecture and fixtures for pages, headers, footers,
footnotes, tables, lists, media, manual breaks, and continuous accessibility.
Its first platform-neutral milestone now ships in source: physical geometry,
legal-fragment flow, non-persisted automatic boundaries, manual breaks,
footnote intent/integrity, canonical default/first/odd/even header/footer
templates, dynamic page fields, renderer-neutral per-page furniture/footnote
projection, undo, HTML/JSON, and Yjs. The browser side now
also has isolated measurement for text lines, list items, rowspan-safe table
groups, footnotes, and manual breaks; every fragment maps back to its model and
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
weakening recovery for unrelated DOM mutations.
Mapped comments and top-level movement are certified across continued lists and
tables. The surface returns to continuous mode when either the
viewport or embedding container is narrow, and restores pages without
remounting when space returns. History, tracked suggestions, and bidirectional
Yjs edits remain live across those automatic boundaries without persisting page
numbers. Broader adversarial print fidelity and the remaining
immutable evidence are still active. CSS page-shaped boxes or destructive
document splitting do not qualify.

## Prioritized after release foundations

| Priority | Outcome | Current baseline | Required proof before “Delivered” |
| --- | --- | --- | --- |
| 1 | Print-aware pages and pagination | `DOC-14` has tested platform-neutral layout/page intent, isolated real-DOM measurement, canonical rich furniture/fields, strict source projection, a read-only paged screen/print renderer, cross-engine physical A4/Letter print projection, Chromium PDF geometry and representative page-content checks, bounded 1,000-block repeated and 5,000-block alternating-edge mutation reflow, 5,000-block identity-preserving structural insertion/removal, and a guarded editable surface for whole blocks, paragraph lines, canonical list items, transitive rowspan-safe table row groups, safe multi-row/merged repeated headers, canonical page-intent rails, page-local copies, and canonical image/media/details/code/custom-NodeView placement. It preserves one contenteditable, selection/IME/history, reversible container-responsive fallback, tracked decisions, comments, movement, and bidirectional Yjs across the covered automatic boundaries; unsplittable rows and atomic surfaces remain editable with explicit non-clipping overflow. The exhaustive-fidelity outcome is still partial | Add broader adversarial visual/content print fixtures, including specialized continuation/print adapters where keeping a custom surface together is insufficient. CSS boxes alone do not qualify. |
| 2 | Stable node identities and lookup | `DOC-17` is missing | Configurable IDs; indexed lookup/update/select APIs; deterministic paste and collaboration collision repair; undo/mapping; schema filtering; JSON migrations; comments/suggestions compatibility. |
| 3 | First-class interactive widgets | NodeViews are delivered, but product authors assemble form behavior themselves | A framework-neutral widget state contract for controls, focus/cursor handoff, Tab/Enter/Escape policy, validation, undo, remote changes, read-only rendering, teardown, React and plain-DOM examples. |
| 4 | Granular collaborative structured attributes | Yjs maps node attributes independently, but a nested object remains one attribute value | Typed path updates into nested maps/arrays; schema validation at the changed path and whole-node boundary; concurrent non-overlapping edits; undo; JSON portability; malicious-depth/size limits. |
| 5 | Truly server-native document conversion | Headless model and Markdown exist; safe HTML still uses DOM facilities | DOM-free HTML parse/serialize for Node.js, Bun, Deno, and worker runtimes with CPU/memory budgets, safe parser substitution, identical validation, and packed-runtime tests. |
| 6 | Virtualized or paged rendering for huge documents | 10,000-block engine budgets exist; the view still renders the complete document | Retained selection and IME correctness across mounted windows, search/decorations/NodeViews, scroll anchoring, accessibility, printing, collaboration, and real 100k-block performance evidence. |
| 7 | Native renderer feasibility | Core/view separation exists; DOM/Web Component/React are web surfaces | A written coordinate/input/IME/accessibility bridge design and a prototype for either React Native or Flutter before promising native packages. A web view does not count as native. |
| 8 | Higher-fidelity Markdown source preservation | Semantic round-trips and loss reports exist | CommonMark/GFM corpus, frontmatter, footnotes, raw/parsed switching, source-span preservation where safe, unknown-syntax policy, and format-stability fixtures. Exact source preservation and semantic preservation must be named separately. |

Pagination and footnotes should be designed together because page geometry,
continuation, numbering, print output, and table splitting interact. Stable node
IDs should precede widgets and deeper review/database integrations because it
provides a durable external-reference primitive.

## Secondary research queue

These are useful, narrower ideas. They should become ledger rows only after an
owner defines persistence, selection, accessibility, collaboration, format,
performance, and browser behavior:

- explicit Word, Google Docs, and Excel paste normalization (`DOC-19`);
- table captions and advanced image/text wrapping;
- cross-editor schema-aware drag and drop plus a general inline/block drop cursor;
- footnote/endnote interchange independent of paged rendering;
- configurable soft limits in addition to enforced hard character limits;
- iframe/isolated-surface editing and host focus coordination;
- vertical Japanese writing with logical selection/navigation evidence;
- spell-check, dictionaries, thesaurus, and replaceable language-service hooks;
- visible tabs, non-breaking spaces, and other invisible characters (`DOC-16`);
- YAML frontmatter and raw/visual Markdown switching.

## Sequencing rule

Finish and certify one ledger outcome before beginning another. Each outcome
must remain framework-neutral at its model/command boundary, ship through the
public MIT package, include a working packed-package example, pass applicable
unit/browser/accessibility/performance gates, document honest limitations, and
be compared against ProseMirror + Tiptap as a combined stack. Community size and
years of deployment are evidence gaps that features alone cannot erase.

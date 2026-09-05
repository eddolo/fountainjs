# Print-aware pages and pagination

Status: active architecture and implementation work for `DOC-14`. The portable
layout/document-intent foundation, read-only paged preview/print projection, and
a guarded editable page surface for whole blocks, measured paragraph lines,
canonical list items, rowspan-safe table row groups, canonical page-intent
rails, page-local projections, and atomic images/media/disclosures/code/custom
NodeViews are implemented. Measured long footnotes now continue across pages
through the neutral layout, editable shell, and print projection. Unsplittable content has an explicit non-clipping
overflow policy. Physical A4/Letter print projection is exercised in Chromium,
Firefox, and WebKit; Chromium additionally verifies emitted PDF bytes and text.
Exhaustive adversarial print fidelity is not complete. This page is not a claim
that the complete pagination outcome is delivered.

## Implemented platform-neutral foundation

The isolated `fountainjs-editor/pages` entry currently provides:

- `createPageGeometry()` for A4, Letter, and bounded custom geometry;
- `layoutPages()` for deterministic legal-fragment placement, manual break
  intent, keep-with-next, widow/orphan minima, continuation overhead,
  page-local footnote reservation and legal-fragment continuation with optional
  opening/ending minima, maximum-page bounds, and explicit overflow;
- optional `page_break`, `footnote_reference`, and `footnote_definition` nodes;
- canonical rich `page_header` / `page_footer` templates for default, first,
  odd, and even pages, plus `page_field` atoms for current/total page counts;
- atomic `insertPageBreak`, `insertFootnote`, `removeFootnote`, and footnote
  navigation commands, plus template create/replace/select/remove and page-field
  insertion commands;
- `inspectFootnotes()` / `assertFootnotes()` for missing, duplicate, nested,
  and unreferenced definition diagnostics;
- immutable `computeFootnoteNumbering()` output, with display labels derived
  from first-reference order, shared by repeated references, and never stored
  in JSON; HTML and Markdown footnote interchange retain stable IDs, and
  repeated cross-page preview links target the first rendered definition
  fragment;
- `inspectPageTemplates()` / `assertPageTemplates()` for duplicate/nested
  templates and orphan page-field diagnostics;
- an isolated `fountainjs-editor/pages/dom` measurement adapter that converts
  actual line boxes, direct list items, rowspan-safe table row groups, repeated
  table-header cost, footnote line fragments, templates, and manual breaks into neutral flow
  descriptors without changing the DOM;
- immutable DOM-fragment source maps with model paths, structural descendant
  paths, clip offsets, and heights, so continuation renderers do not infer
  identity from pixels or persist automatic boundaries;
- a strict page-content projection that joins every neutral placement to its
  exact contiguous source slice and separates body content from repeated
  continuation overhead;
- `DOMPageLayoutController` for coalesced mutation/resize/font/window/print
  invalidation, timed immutable snapshots, explicit host callbacks, synchronous
  print refresh, deterministic observer/listener teardown, and safe reuse of
  unchanged top-level geometry on mutation-only cycles;
- `DOMEditablePageSurface` and `DOMEditablePageController` for responsive fixed
  page shells around one unchanged contenteditable, transient whole-block
  placement, selection-safe non-model paragraph continuation gaps at measured
  line boundaries, canonical list-item continuation spacing, reversible
  transitive rowspan-safe table-row spacers with read-only repeated multi-row
  column headers that preserve colspans/rowspans and are omitted when a header
  rowspan leaks into body rows,
  uniquely editable canonical header/footer/footnote rails with sanitized,
  field-resolved per-page projections, explicit oversized-row overflow,
  keep-together placement and explicit oversized overflow for images, media,
  disclosures, code, and custom NodeViews,
  viewport/container-responsive continuous fallback, typed
  unsupported-fragment issues, and deterministic restoration on remeasurement
  and teardown;
- `projectPagePresentation()` for immutable page-shell plans that select the
  canonical first/odd/even/default header and footer, resolve page fields, and
  pair reserved footnotes with their one canonical definition;
- an isolated `fountainjs-editor/pages/preview` renderer for fixed-size
  read-only sheets, exact line clips, structural continuations, repeated table
  headers and page furniture, resolved fields, linked page-local footnotes,
  print page breaks, normalized deterministic physical `@page` rules and names,
  namespaced IDs, exact clipped long-footnote continuations, strict opt-in
  custom-block continuation bands, and an optional sanitized host placement
  renderer for custom NodeViews/atomic media whose live DOM is not print-safe,
  transient editor-state removal, and one screen-only continuous accessibility
  copy;
- JSON, semantic HTML, undo, and generic Yjs coverage.

All layout inputs and outputs are frozen ordinary data. The entry imports no
browser global at module evaluation or during geometry/layout, schema,
transaction, history, JSON, or collaboration use. The `parseDOM` callbacks on
the optional nodes execute only when a host explicitly invokes HTML import.

The latest immutable public certification is the 375-test package suite plus
the whole-block, paragraph, list, table, mapped-comment, top-level-movement, and
oversized-row browser matrix, plus canonical page-intent rail/projection
and atomic media/custom-NodeView coverage, including complex merged-table
fragmentation, the physical three-engine A4/Letter print contract, gap-adjacent
selection/IME, mobile fallback, the host-owned sanitized print renderer, and
exact long-footnote continuation without duplicated PDF text in the
[CI run for `e11275a`](https://github.com/eddolo/fountainjs/actions/runs/33958307239).
The corresponding [playground deployment](https://github.com/eddolo/fountainjs/actions/runs/33958307235)
is also green.

```ts
import { CoreExtension, composeExtensions } from 'fountainjs-editor'
import {
  PagesExtension,
  createPageGeometry,
  layoutPages,
} from 'fountainjs-editor/pages'

const kit = composeExtensions([CoreExtension, PagesExtension])
const geometry = createPageGeometry({ size: 'a4', margins: 20 })
const result = layoutPages(measuredFlowItems, geometry)
```

A renderer adapter can make a long footnote continuable by supplying only its
legal measured slices. The neutral engine does not inspect text or the DOM:

```ts
const note = {
  id: 'source-1',
  height: 48,
  fragments: [
    { id: 'source-1:line:1', height: 12 },
    { id: 'source-1:line:2', height: 12 },
    { id: 'source-1:line:3', height: 12 },
    { id: 'source-1:line:4', height: 12 },
  ],
  minimumStart: 1,
  minimumEnd: 2,
}
```

Every fragment ID and height must be stable for the layout pass, their heights
must sum to the measured footnote height, and repeated references with the same
footnote ID must provide the same measurement. Output page placements include
the assigned fragment interval, source clip offset, and continuation flags.

Measurements are adapter input, not persisted editor state. Each template is
edited once in canonical document order. The neutral projector now decides
which canonical furniture and footnotes belong to each measured page, and the
browser adapter supplies real line/list/table/footnote measurements. The
read-only renderer proves repeated DOM furniture and content projection. A real
Chromium PDF gate verifies one output page per projected sheet, A4/Letter
MediaBox dimensions, and page-specific extracted header/field, body, list,
table, footnote, and post-break text without printing the hidden accessibility
copy. A separate print-media contract verifies A4/Letter sheet rectangles,
normalized named-page assignment, headers/page numbers, footnotes, forced page
breaks, hidden accessibility duplication, and removal of live editor state in
Chromium, Firefox, and WebKit. A separate browser fixture proves that the guarded editor retains direct
top-level DOM/model paths, preserves unchanged block identity, commits IME on a
second page, maps one selection across page one and page two, and removes page
decoration on narrow Chrome/Safari surfaces. The desktop fixture also proves
history undo/redo and a narrow-container → paged-container transition without
remounting or losing that cross-page selection. For injected paragraph gaps,
carets on the DOM sides immediately before and after the widget map to one
logical offset; a range across it and composition from either side are verified
in Chromium, Firefox, and WebKit. Mobile Chrome/Safari emulation additionally
verifies composition at the boundary and keeps the logical range while narrow
fallback removes the widget. Lists use reversible spacing on
their real continuation items and keep ordered-list starts, selection, IME,
history, review, and collaboration intact. Tables use reversible non-model
spacer rows at measured rowspan-safe boundaries while the one canonical table
and every real row remain editable. Accessibility-hidden page shells show
read-only clones of leading all-header rows, and those copies refresh after an
edit to the canonical header. Oversized rows stay one editable row, expose an
overflow marker on the affected sheet, and retain edit/undo/redo behavior.
Overlapping/transitive body rowspans are collapsed into one legal fragment, so
no continuation can cut through the merged region. A two-row header fixture
proves preserved header `rowspan`/`colspan`, sanitized copies, continued merged
body groups, editing, and history in Chromium and WebKit. If any leading header
cell spans beyond the all-header band, continuation keeps the affected source
rows together but omits the structurally incomplete repeated header.
Images, audio, native disclosures, code blocks, and custom NodeViews use one
default policy: retain the canonical editable DOM/model node, move it intact to
the next page when it fits, and mark its sheet as overflowing without clipping
when it is taller than the body. The representative custom NodeView remains
interactive, details state persists, and code edits retain undo/redo. For
read-only/print layout, a host may opt one block into `blockContinuation` by
returning at least two ordered, non-overlapping descendant bands, optional
start/end fragment minima, and repeated continuation height. Fountain validates
the ownership and geometry, maps those bands into neutral fragments, and never
changes the model or canonical DOM. `renderPlacement` receives the exact band
range and may return a deterministic print substitute; Fountain clones and
sanitizes it. A custom block split is not assumed safe for live editing, so the
guarded editable surface falls back to continuous mode when such a placement
spans pages. The EditorView
observer recognizes only page-owned attributes and CSS-variable deltas as page
decoration; an unrelated inline-style mutation still restores the model-owned
NodeView DOM.
Canonical templates and definitions stay editable once in ordered rails outside
the sheet stack; sanitized, accessibility-hidden copies resolve page fields and
page-local footnotes inside the sheets. A dedicated multi-page fixture verifies
live header/footer/definition edits, unique model paths and IDs, spacing, and
reversible narrow-container fallback. A separate multi-page fixture has
no manual breaks and proves tracked insertions/decisions, preserved remote
authorship, and bidirectional Yjs convergence on automatically placed blocks.
The same contracts cover paragraph, list-item, and table-row-group boundaries.
Long definitions are measured from their rendered child-block line boxes and
supplied as ordinary fragment data to `layoutPages()`. The first reference
reserves an opening slice; continuation placements carry exact source offsets,
never duplicate or omit a fragment, preserve optional minimum ending lines, and
can share their final page with later body content. Both editable shells and
the read-only print renderer clone the one canonical definition and clip only
the assigned slice; the continuous accessibility copy still contains the full
definition exactly once.
Mapped comment anchors and top-level block movement are covered across split
lists and tables. Exhaustive adversarial visual/content print fidelity remains
active work; only Chromium exposes PDF-byte generation through Playwright.

## Current architecture audit

FountainJS had no page, print, page-break, footnote, header, footer, widow, or
orphan model before this work. The existing boundaries that pagination can use
are:

- `src/core/schema/` owns immutable document semantics and validation;
- `src/core/transaction/` maps logical paths and selections through edits;
- `src/view/dom-renderer.ts` gives every rendered node a stable model path;
- `src/view/view.ts` owns DOM reconciliation, mutation recovery, selection
  synchronization, and view teardown;
- tables already expose row/cell structure and span geometry;
- lists already expose item boundaries and nested structure;
- media and custom NodeViews expose atomic DOM boundaries and lifecycle;
- HTML/Markdown/JSON/text exporters already distinguish exact persistence from
  projections;
- the browser matrix already covers desktop engines and mobile emulation.

The DOM renderer currently places every top-level model node directly inside
one `contenteditable`. There is no renderer hook for page shells, no layout
snapshot, and no print contract. `getBoundingClientRect()` is used only for
menus, drag placement, tables, images, and browser performance tests. This
means page support cannot honestly be described as an existing CSS feature.

## Non-negotiable invariants

1. **Automatic pagination is not document data.** Font availability, zoom,
   viewport, renderer, and print engine can change measured boundaries. Writing
   those boundaries into collaborative JSON would make clients fight over
   layout.
2. **Manual intent is document data.** A deliberate page break and footnote
   content must survive JSON, history, collaboration, and interchange.
3. **The model remains editable and ordered.** Page rendering must not clone
   editable content, duplicate model paths, or make DOM order disagree with
   document order.
4. **Splitting is non-destructive.** A continued list or table is a view
   fragment of one model node, not multiple persisted nodes created by resize.
5. **Measurement is replaceable.** The layout algorithm receives measured
   flow fragments; it does not import `document`, CSS, React, or a browser.
6. **Narrow and assistive surfaces retain a continuous mode.** Page decoration
   can disappear without losing content, focus, selection, or commands.
7. **Print evidence is separate from screen resemblance.** A page-shaped box
   does not prove headers, footers, page numbers, breaks, continuation, or PDF
   fidelity.

## Target layers

```text
document JSON
  manual page break · footnote content · optional header/footer templates
        |
        v
DOM-independent page layout
  physical geometry · measured flow items · legal split boundaries
  widow/orphan constraints · footnote reservation · deterministic pages
        |
        +-- DOM measurement and editable page renderer
        |     paragraphs · lists · tables · media · NodeViews
        |     ResizeObserver · beforeprint/afterprint · continuous fallback
        |
        +-- print/PDF HTML projection
              physical @page size · exact margins · repeated furniture
              manual breaks · continuation semantics
```

`layoutPages()` is the first boundary. It consumes ordinary numbers and frozen
descriptors and returns page placements plus explicit overflow warnings.
`projectPagePresentation()` is the renderer-neutral handoff: it converts layout
pages and canonical document intent into immutable per-page references and
resolved field values without copying model content. `measureDOMPageFlow()` is
the optional browser boundary: it measures line boxes,
list items, table row-span groups, media, and footnotes, but those measurements
never enter editor state and the adapter never moves editable nodes. Its source
map is ordinary frozen data and never retains a DOM element. The strict content
projection then joins page placements to those sources and fails closed if an
external layout is incomplete or inconsistent. The optional controller
automates invalidation and measurement but does not own rendering or state. Its
mutation cache requires identical immutable node and DOM-element identities,
the same body width, and the same referenced footnote heights. Observed DOM
changes dirty their owning block; resize, font, window, manual, and print cycles
invalidate fully. Real-browser gates permit only the root width and changed
block to perform geometry reads: repeated middle edits in 1,000 blocks stay
below a 75 ms p95 cycle budget, while 20 edits alternating between the first and
last ten positions of 5,000 rendered blocks stay below 250 ms p95 under the
parallel cross-engine runner. Leading insertion/removal also preserves all
5,000 unchanged DOM blocks and rebases every rendered and cached source path;
six repeated cycles require exactly two geometry reads per insertion and one
per removal while remaining below 500 ms p95.
The separate preview entry clones those exact slices into visual sheets; it
requires the measured editor width to equal the page body width and never
changes the editor DOM. It emits an unnamed physical page rule for broad print
support and a deterministic named equivalent for engines that support named
pages. Hosts printing multiple geometries in one document can disable those
rules and own the global print stylesheet.
The editable page controller takes a deliberately narrower path. It inserts
non-interactive sibling sheets and never clones or reparents editable model
nodes. Whole top-level source nodes keep their original DOM identity, path,
order, input handlers, and selection mapping; transient CSS `translate` offsets
align them with the body of their assigned sheet. A paragraph placed on several
pages stays one canonical model and rendered block. The surface finds each
measured continuation line in the rendered text, inserts a transient
`contenteditable=false`, `aria-hidden` gap widget before that line, and excludes
the widget from Fountain's DOM-to-model selection mapping. It removes all gaps
before measuring natural content again, cleans the empty text nodes created by
Range insertion, and consumes its own observer records so visual decoration
does not schedule a reflow loop. Real-browser tests cover exact page-body
alignment, stable repeated cleanup, selection through multiple gaps, IME,
undo/redo, tracked review, Yjs convergence, and responsive fallback/restoration.
Lists use reversible margin spacing only on the real continuation item; no list
item is cloned or synthesized. Tables insert accessibility-hidden, non-model
spacer rows before the real row at each rowspan-safe continuation boundary.
The page shell may project read-only copies of the table's leading all-header
rows only when all their rowspans close inside that header band; the original is
the only editable header and every safe copy is rebuilt on reflow. Canonical
headers must precede body content; canonical footers and
footnote definitions must follow it. They remain uniquely editable in rails
before and after the page stack. Sanitized read-only copies in each sheet carry
no model paths, duplicate IDs, editable controls, or accessibility exposure;
resolved page fields and page-local definitions are refreshed from canonical
state on every layout. Unsupported structural sources, invalid intent order, or
presentation-integrity warnings remove every offset/widget/projection and
return typed issues in continuous mode. An individual table row taller than a
body remains one editable row and is marked as overflow rather than split or
clipped. These fail-closed rules avoid cloned editable nodes and duplicate model
paths.
The controller observes the embedding host in addition to the editor root. A
viewport below 720 CSS pixels or a host content box narrower than the physical
sheet uses continuous mode; widening the same mounted host remeasures and
restores its page shells.

## Document semantics

The optional pages extension owns only portable intent:

- `page_break`: a selectable block atom that forces the next legal fragment to
  a new page;
- footnote references and definitions with collision-safe identifiers;
- one canonical rich header/footer template for each default/first/odd/even
  variant;
- current-page and total-page-count fields whose measured values are resolved
  by the renderer rather than persisted.

Automatic page membership is deliberately absent. Header/footer editing keeps
one canonical editable model representation. Repeated preview and editable-page
shell furniture is view-only and excluded from selection, clipboard,
accessibility, and JSON.

## Fragmentation policy

The layout engine treats a normal block as one flow item. A measurement adapter
may expose legal fragments:

- paragraph line boxes, with configurable minimum first/last lines;
- a single-fragment heading kept with the following splittable block's required
  opening fragments whenever that pair fits an empty page;
- list items, preserving nested item content;
- table row groups that never cut through a rowspan, with repeated column
  headers accounted for as continuation overhead;
- captions with their media/table when they fit together;
- atomic media/NodeViews, native disclosures, and code blocks, kept together by
  default; read-only/print layout may use strictly validated host-declared
  descendant bands plus a sanitized placement renderer, while the guarded
  editable surface fails back to continuous mode for an actual custom split;
- footnote bodies reserved on the page containing their first reference, with
  measured legal fragments continued across later pages when the body cannot
  fit intact; definitions containing a block outside the configured safe
  line-fragment types remain whole rather than being clipped through a table,
  media node, or other atomic structure;

If a single unsplittable fragment exceeds the body, the result must identify an
overflow instead of silently clipping it. The renderer may expose a continuous
fallback or a host-provided scale/print replacement, but cannot discard content.

## Required evidence before Delivered

- A4, Letter, and bounded custom physical sizes and margins;
- manual breaks and deterministic automatic reflow in both directions;
- canonical editable headers/footers and page-number fields;
- footnote numbering, reservation, continuation, and interchange (transient
  first-reference numbering, semantic HTML roles, standard Markdown, and the
  measured continuation baseline are implemented; the imported corpus covers
  multiple and repeated references, definition reordering, CRLF Markdown,
  nested definition blocks, and semantic footnote/endnote roles; broader
  document families remain);
- paragraphs with widow/orphan rules;
- nested lists and rowspan/colspan tables split only at legal boundaries
  (including multi-row headers and transitive body spans; broader imported and
  styling combinations remain part of adversarial print coverage);
- images, media, details, code, and custom NodeViews with explicit overflow
  behavior, plus an opt-in custom continuation/print projection that leaves the
  canonical model and editable view untouched, covered by browser tests and
  immutable public CI;
- selection and IME, undo, block movement, comments, tracked changes, Yjs, and
  resize behavior across page boundaries (whole-block, paragraph, list, and
  rowspan-safe table boundaries now cover selection, IME, history, reversible
  container resize, tracked decisions, and bidirectional Yjs; split lists and
  tables also cover mapped comments and top-level movement);
- continuous narrow-screen and assistive fallback;
- print-media fixtures in Chromium, Firefox, and WebKit, plus emitted PDF-byte
  fixtures in Chromium where Playwright exposes that primitive (the physical
  A4/Letter baseline covers both layers, and a mixed fixture combines repeated
  and continued footnotes, reversed definition order, a merged table, page
  furniture, a manual break, and PDF text de-duplication; broader imported and
  styled document families remain);
- reflow latency, measurement count, DOM identity, memory, and bundle budgets
  beyond the current 5,000-block adversarial replacement and structural
  insertion/removal gates;
- packed ESM/CommonJS/types, public docs/demo, and immutable CI/deployment
  evidence.

Until those gates pass, `DOC-14` remains partial or missing in the capability
ledger regardless of how convincing a screenshot looks.

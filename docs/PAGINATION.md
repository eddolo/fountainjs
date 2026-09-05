# Print-aware pages and pagination

Status: active architecture and implementation work for `DOC-14`. The portable
layout/document-intent foundation, read-only paged preview/print projection, and
a guarded editable page surface for whole blocks, measured paragraph lines,
canonical list items, rowspan-safe table row groups, canonical page-intent
rails, page-local projections, and atomic images/media/disclosures/code/custom
NodeViews are implemented. Unsplittable content has an explicit non-clipping
overflow policy. Exhaustive cross-engine PDF fidelity is not. This page is not
a claim that the complete pagination outcome is delivered.

## Implemented platform-neutral foundation

The isolated `fountainjs-editor/pages` entry currently provides:

- `createPageGeometry()` for A4, Letter, and bounded custom geometry;
- `layoutPages()` for deterministic legal-fragment placement, manual break
  intent, keep-with-next, widow/orphan minima, continuation overhead,
  page-local footnote reservation, maximum-page bounds, and explicit overflow;
- optional `page_break`, `footnote_reference`, and `footnote_definition` nodes;
- canonical rich `page_header` / `page_footer` templates for default, first,
  odd, and even pages, plus `page_field` atoms for current/total page counts;
- atomic `insertPageBreak`, `insertFootnote`, `removeFootnote`, and footnote
  navigation commands, plus template create/replace/select/remove and page-field
  insertion commands;
- `inspectFootnotes()` / `assertFootnotes()` for missing, duplicate, nested,
  and unreferenced definition diagnostics;
- `inspectPageTemplates()` / `assertPageTemplates()` for duplicate/nested
  templates and orphan page-field diagnostics;
- an isolated `fountainjs-editor/pages/dom` measurement adapter that converts
  actual line boxes, direct list items, rowspan-safe table row groups, repeated
  table-header cost, footnotes, templates, and manual breaks into neutral flow
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
  print page breaks, deterministic physical `@page` rules, namespaced IDs,
  transient editor-state removal, and one screen-only continuous accessibility
  copy;
- JSON, semantic HTML, undo, and generic Yjs coverage.

All layout inputs and outputs are frozen ordinary data. The entry imports no
browser global at module evaluation or during geometry/layout, schema,
transaction, history, JSON, or collaboration use. The `parseDOM` callbacks on
the optional nodes execute only when a host explicitly invokes HTML import.

The latest immutable public certification is the 367-test package suite plus
the whole-block, paragraph, list, table, mapped-comment, top-level-movement, and
oversized-row browser matrix, plus canonical page-intent rail/projection
and atomic media/custom-NodeView coverage, in the
[CI run for `4e60bed`](https://github.com/eddolo/fountainjs/actions/runs/33953036708).
The corresponding [playground deployment](https://github.com/eddolo/fountainjs/actions/runs/33953036702)
is also green. The complex merged-table contract is the next immutable gate and
is not counted in that earlier run.

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

Measurements are adapter input, not persisted editor state. Each template is
edited once in canonical document order. The neutral projector now decides
which canonical furniture and footnotes belong to each measured page, and the
browser adapter supplies real line/list/table/footnote measurements. The
read-only renderer proves repeated DOM furniture and content projection. A real
Chromium PDF gate verifies one output page per projected sheet, A4/Letter
MediaBox dimensions, and page-specific extracted header/field, body, list,
table, footnote, and post-break text without printing the hidden accessibility
copy. A separate browser fixture proves that the guarded editor retains direct
top-level DOM/model paths, preserves unchanged block identity, commits IME on a
second page, maps one selection across page one and page two, and removes page
decoration on narrow Chrome/Safari surfaces. The desktop fixture also proves
history undo/redo and a narrow-container → paged-container transition without
remounting or losing that cross-page selection. Lists use reversible spacing on
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
interactive, details state persists, and code edits retain undo/redo. The view
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
Mapped comment anchors and top-level block movement are covered across split
lists and tables. Exhaustive cross-engine visual/content print fidelity remains
active work.

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
- atomic media/NodeViews, native disclosures, and code blocks, kept together
  unless a host supplies a specialized continuation/print renderer;
- footnote bodies reserved on the page containing their first reference.

If a single unsplittable fragment exceeds the body, the result must identify an
overflow instead of silently clipping it. The renderer may expose a continuous
fallback or a host-provided scale/print replacement, but cannot discard content.

## Required evidence before Delivered

- A4, Letter, and bounded custom physical sizes and margins;
- manual breaks and deterministic automatic reflow in both directions;
- canonical editable headers/footers and page-number fields;
- footnote numbering, reservation, continuation, and interchange;
- paragraphs with widow/orphan rules;
- nested lists and rowspan/colspan tables split only at legal boundaries
  (including multi-row headers and transitive body spans; broader imported and
  styling combinations remain part of adversarial print coverage);
- images, media, details, code, and custom NodeViews with explicit overflow
  behavior, covered by the canonical editable browser contract and immutable
  public CI;
- selection and IME, undo, block movement, comments, tracked changes, Yjs, and
  resize behavior across page boundaries (whole-block, paragraph, list, and
  rowspan-safe table boundaries now cover selection, IME, history, reversible
  container resize, tracked decisions, and bidirectional Yjs; split lists and
  tables also cover mapped comments and top-level movement);
- continuous narrow-screen and assistive fallback;
- print/PDF fixtures in Chromium, Firefox, and WebKit where the engine exposes
  the required primitive;
- reflow latency, measurement count, DOM identity, memory, and bundle budgets
  beyond the current 5,000-block adversarial replacement and structural
  insertion/removal gates;
- packed ESM/CommonJS/types, public docs/demo, and immutable CI/deployment
  evidence.

Until those gates pass, `DOC-14` remains partial or missing in the capability
ledger regardless of how convincing a screenshot looks.

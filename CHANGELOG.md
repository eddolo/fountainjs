# Changelog

## Unreleased

- Strengthened the CommonMark semantic comparator for paragraph/heading
  formatting scopes, recognizing already-correct example 167 without changing
  runtime behavior. Added independent source/semantic and corruption checks;
  opt-in HTML is 579/652, default remains 563/652. Inline-block HTML fallbacks
  remain explicit nonconformance, not waived failures.

- Exposed the existing HTML-table export option in the issue workflow, with a
  table-scoped schema importer on source/file reopen. Headerless and mixed-role
  tables, merged cells and multi-paragraph content now have a demonstrated
  preservation route. Pipe Markdown remains the compatibility default, with
  explicit loss reports; this does not make arbitrary Markdown readers lossless.

- Fixed browser/server HTML import dropping bold, emphasis, colors and supported
  typography around multiple blocks, list items and table groups/rows/cells.
  Nearer supported inline colors now override outer colors. Shared portable
  typography rules no longer emit spurious DOM-only fallback warnings. This is
  not arbitrary CSS cascade or headerless-table Markdown fidelity support.

- Added a real-world workflow hub prominently linked above the ten integration
  demos, with GitLab-style issue editing and a new unofficial Todoist-style task
  workspace. The task demo exercises independent descriptions/history, host-owned
  metadata, reader preview and local Markdown download/reopen. Guides explain
  implementation and persistence boundaries; no original-product integration is implied.
- Fixed escaped tildes adjoining strikethrough markers and protected pipes after
  backslashes in GFM table cells. Added 420 text/mark/container round-trip checks,
  ten captured GitHub semantic fixtures and a recorded editing/handoff journey.
  Public API and bundle limits are unchanged; full CommonMark parity remains open.

- Fixed literal LF/CR text becoming spaces, headings, lists, or paragraphs on
  Markdown export/reopen. Character references now decode after source soft-break
  handling; canonical text encodes its own line endings, and multiline inline
  code uses the existing inert style envelope. Structural hard breaks and normal
  CommonMark code-span normalization are unchanged.

- Fixed canonical Markdown export turning literal delimiters or unlinked
  addresses into formatting, math nodes, or links on reopen. The same protection
  applies to regenerated blocks in source-preserving export; actual structured
  links/code/math and unchanged source blocks retain their existing semantics.

- Added `MarkdownImportOptions.autolinkLiterals`: hosts can keep bare web/email
  addresses as text while preserving explicit links and safe angle autolinks.
  Default GFM-style behavior is unchanged. The headless demo exposes the choice,
  with cross-browser DOCX handoff tests and a separate CommonMark policy gate.

- Normal push/PR CI now includes the API snapshot, Node/Worker smoke tests and
  independent math-reference checks already required locally and for releases.
  A regression test guards coverage of every constituent of `pnpm check`.

- Markdown source snapshots retain standalone root reference definitions after
  unrelated edits and block moves/deletions, including their duplicate-definition
  precedence. Container definitions and ambiguous boundaries still fall
  back to canonical output. The issue workflow now demonstrates reference-style
  source retention. These changes are **not** in the published 0.4.0-beta.1 tarball.
- Root definitions directly before a paragraph or heading now receive the same
  retention guarantees, including after movement/deletion. Only parser-proven
  prefixes are extracted; literal/rejected definitions and container fallbacks
  retain their existing semantics. The issue demo exercises this compact form.

## 0.4.0-beta.1 — Capability preview

Published capability preview (2026-09-07), approved by the maintainer on npm.
The intended default tag is `latest`; publishing and changing a tag are separate
npm approval operations. The verified tarball was built from commit `a8c4890`.
This is not completion of the ProseMirror + Tiptap parity programme. Full
CommonMark conformance, native Word/whole-paper export fidelity, physical-device
IME/accessibility certification and equivalent framework UI suites remain open.
The detailed changes below cover the work since 0.3.0.

### Added

- Unofficial issue-editor workflow lab with visual/source switching, explicitly
  reported Markdown preservation, separate reader preview, local draft download/
  reopen and a bounded raster-image adapter. No online issue submission or
  automatic persistence is implied. See `docs/ISSUE_EDITOR_DEMO.md`.
- Full-document server HTML import now projects only the parsed body, preventing
  head title/styles from becoming editable paragraphs. `document-shell-omitted`
  reports discarded page metadata/styles/attributes; fragment APIs retain their
  existing Markdown contract. HTML remains a lossy interchange format.
- Native ranges selecting inline atoms now retain their node selection through
  asynchronous selection events and Delete; ordinary text clicks still move
  the caret. This repairs a regression detected by full browser CI.

- Optional Markdown `parseHTMLFlow` / `onHTMLFlowFallback` and server HTML
  `parseFlow` / `parseFlowWithReport` resolve raw HTML scopes across blank-line
  block boundaries. Protected Markdown blocks retain source and attributes;
  unchanged paths stay shared and added mark paths are copied. Recovery that consumes them
  falls back to inert source. The conversion demo now reconstructs split HTML
  tables. Specialized raw-text scopes over protected blocks remain
  explicitly unsupported, not silently flattened; full CommonMark is not claimed.

- Server HTML `parseFragment` / `parseFragmentWithReport` return validated block
  arrays without adding a standalone document's empty caret paragraph. Markdown's
  optional HTML-block adapter accepts these arrays (including empty arrays), so
  comment-only HTML no longer inserts phantom paragraphs in the conversion demo.
  Existing document-returning adapters and default inert HTML remain unchanged.

- Optional `fountainjs-editor/angular` entry with injection-scoped
  `createFountain`, signal-based `fountainState`, and standalone
  `FountainEditorDirective`. Angular 22 remains an external optional peer;
  partial-Ivy compilation and inert SSR are separate from the no-DOM core.
  The campaign demo uses real Angular controls, retains local-image bytes,
  and supports media metadata editing, deletion/undo and view/owner lifecycles.
  Other media uploads explicitly require a host storage adapter. See
  `docs/ANGULAR.md`; equivalent optional framework UI suites remain open.

- Optional `fountainjs-editor/svelte` entry with `createFountain`, `fountainState`
  and `fountainEditor`: client ownership, lazy readable state and a DOM action
  that preserves external engine ownership. Svelte 5 is an optional external
  peer. The report demo now uses compiled Svelte components for its toolbar,
  editor and inspector, with view-remount/history, owner-reset, pure-Node SSR
  and custom-block teardown checks. See `docs/SVELTE.md`.

- Optional `fountainjs-editor/vue` entry with `useFountain`, `useFountainState`
  and `FountainEditor`: client-mount ownership, shallow state subscriptions,
  external-editor/view separation and inert SSR. Vue 3.5+ is an optional external
  peer, never bundled into the engine. The Vue runbook now runs actual Vue
  controls and an inspector, with lifecycle and three-browser interaction tests.
  Equivalent optional framework UI suites remain pending.

### Fixed

- Alignment applies to all selected paragraphs/headings, including nested and
  empty blocks, container/all-document selections and selected table cells, in
  one undoable transaction. A range ending at the next paragraph's start leaves
  that unselected paragraph alone. No-op, invalid, read-only and filtered changes
  return false without mutation. Native paragraph-element selection endpoints
  (for example Chrome Home/Shift+Up) now map to document text, preventing toolbar
  actions from using a stale caret. The declaration snapshot only adds a private
  selection-reader helper; public command signatures are unchanged.

- DOCX export gives each numbered/bullet list an independent instance and
  explicit base/restart definition, preserving supported custom starts and
  nested indentation instead of resetting every list to 1. Import respects
  numbering-instance identity and level/start overrides, keeping adjacent and
  nested restarted lists separate. Independent browser-viewer counters are
  visually checked; native Word rendering and arbitrary restart rules remain
  unverified.

- Zero-based ordered lists keep their original numbering when selected items
  are lifted or converted, including nested-list remainder slices. Browser and
  server HTML imports now parse list starts as HTML integer prefixes with a
  bounded native range instead of JavaScript numbers, avoiding an Infinity
  validation failure. Server reports explicitly identify unsupported reversed,
  negative, non-decimal and per-item override numbering; these are not yet
  preserved by the supplied schema.

- HTML import now uses native table section order (header, body, footer) in both
  browser and server paths, preserving stable row order within each section.
  Early footers and late headers no longer move to the wrong visible position
  when pasted. Source-group span calculation remains independent; nested tables
  are isolated. Server reports make source-order projection explicit.

- Browser and server HTML import now resolve `rowspan="0"` within its source
  row group instead of silently importing it as one row. Shared integer parsing
  avoids JavaScript-only numeric interpretations and invalid fractional spans.
  Server reports distinguish explicit zero-span expansion from the existing
  100-row/column geometry limit. Nested tables do not affect parent row counts.
  The CommonMark comparator also recognizes equivalent unit spans/cell wrappers
  while rejecting fourteen structural/content losses.

- Failed Markdown HTML flows now restore inline and nested HTML source as well
  as raw block tokens. With both conversion options enabled, an inline closing
  `</pre>` could previously disappear before the surrounding flow fell back.
  Recovery is scoped to the failed container; successful siblings stay converted.
  The corpus gate additionally locks 578 exact opt-in HTML semantic-projection
  matches separately from the default inert policy and source-retention checks.
  Remaining comparisons are explicitly unresolved, not a full-conformance claim.

- The CommonMark comparator now binds code-block terminator handling to actual
  Markdown-generated reference HTML offsets. Authored raw `<pre>` newlines are
  no longer mistaken for canonical code terminators. Twenty LF/CRLF contracts
  and six deliberate newline corruptions verify the distinction, including
  byte-identical HTML generated from different source kinds. No runtime change.

- Optional HTML flow conversion now carries surrounding semantic/style/custom
  marks into existing Markdown blocks. Original inline marks win collisions,
  inner HTML scopes override outer scopes, and unchanged subtrees remain shared.
  Source, attributes and block identifiers survive immutable mark-path copies.
  Raw-text scopes requiring source reinterpretation still fall back explicitly.

- Restored the Svelte report's structural cursor-placement control after its
  framework migration. Media metadata drafts no longer reset on unrelated
  selection updates in the Angular demo. Removed the obsolete demonstration
  adapters that substituted stock assets for the user's chosen file.

- Exact text endpoints no longer jump across a block boundary during selection
  mapping. This fixes the caret leaving a final paragraph converted to a quote
  when the trailing-editable-block plugin adds a paragraph. Adjacent marked
  spans still respect mapping association, and real structural gaps still
  resolve toward the requested side.

- Browser/server HTML imports retain table caption content, rich marks, links
  and paragraphs instead of silently discarding them. Captions become editable
  blocks before the table, with a server warning for lost caption association,
  placement and attributes; native table-caption support is not claimed.

- DOCX nested quotes/list items now traverse blocks rather than flattening
  tables/equations. Aligned quotes use a single paragraph-properties element;
  continuation paragraphs do not each receive a fresh list marker. Unsupported
  Office-math imports now show an explicit warning/placeholder instead of
  concatenating fraction/script text into a misleading equation.
- Paged-preview references now resolve across cloned blocks/pages rather than
  jumping back to the editor. Each render has isolated IDs; HTML/SVG links,
  local SVG resources and accessibility references stay within their visual
  or accessible projection. Missing fragment links are explicitly disabled.
- Whole-document opening, undo/redo, version restore and remote snapshots now
  retain root-level metadata rather than replacing only children and keeping
  stale attributes. `replaceDocument` validates same-schema roots, replaces
  attributes exactly and preserves positions for metadata-only updates.
- Transactions no longer throw when structural replacement removes every text
  leaf. Text carets/ranges and removed inline-node selections recover a nearby
  block gap; empty intermediate documents use an all-document selection.
  Nested insertion, explicit subsequent selection, undo/redo and native typing
  after atom-only replacement are covered. No synthetic text is added by mapping.

### Added

- Browser/server HTML figure imports preserve surrounding prose, multiple images,
  nested blocks and rich captions instead of extracting only media. Simple media
  captions stay attached; complex figure grouping loss is reported by the server
  importer and exposed through the optional Markdown HTML adapter.

- Opt-in DOCX equation-source restoration with versioned metadata and unique
  bookmark bindings. Unchanged projections restore exact TeX and accessibility
  labels; edited, missing, duplicated or namespace-mismatched projections are
  refused with warnings. Default import is unchanged. General Word equation
  import, native Word edit/save verification and full-file round trips remain open.
- Optional repository example converting a bounded base/AMS TeX subset into
  native DOCX math using MathJax. The recorded diagnostic now converts newly
  edited formulas, exposes unsupported-syntax reasons, and saves each actual
  export for inspection. No parser is added to the library runtime; complete
  TeX conversion and native Word/LibreOffice fidelity remain unverified.
- Recorded native-math export comparison against an independent browser DOCX
  viewer, with explicit missing/misrendered-equation diagnostics. Three-engine
  checks cover editing, stale-preview clearing, source fallback and undo; the
  observed viewer limitations are documented, not counted as Word fidelity.
- Experimental optional DOCX semantic math projection through `resolveMath`:
  validated fractions, roots, scripts, delimiters, matrices, accents and large
  operators emit OMML with original TeX metadata. No TeX parser or runtime
  dependency is added. Word/LibreOffice visual editing, source restoration and
  equation numbering/references remain open; reports remain explicitly lossy.
- Equation-lab browser printing/Save as PDF for current paged snapshots, with
  stale-output protection. Recorded Chromium exports are checked for physical
  page sizes, internal equation destinations and text duplication, and all sample
  pages were independently rendered and visually inspected. Native Word math,
  accessible PDF and full-paper layout fidelity are not claimed.
- Equation-lab paged snapshots with real SVG reference navigation and explicit
  rebuild feedback after edits. Landscape Letter geometry is a demonstration,
  not a reproduction of the source paper or certified PDF/DOCX output.
- Equation lab local JSON/Markdown downloads and validated JSON reopening,
  including fresh-instance reference rebuilding, undoable opening, file bounds,
  loss rejection and collision-free generated equation labels after reopening.
  Portable document JSON only; asset packaging and an `.fjs` reader are not shipped.
- Separate document-aware equation-reference lab with a host-owned MathJax SVG
  adapter, bundled TeX fonts/notices, namespaced reader links, source editing,
  reorder/renumbering and visible unresolved/duplicate-label failures. Optional
  website integration only: no MathJax runtime dependency or new package export.
  Synchronous resource limits, narrow-screen scrolling and glyph fallback are
  explicit; whole-paper, asynchronous and PDF/DOCX parity remain pending.
- Opt-in document-aware math renderer context and post-reconciliation NodeView
  document notifications, without adding a runtime math dependency. Real MathJax
  semantic tests cover forward references, reorder/undo/redo, deleted targets,
  isolated scopes and error recovery. The separate host lab supplies a visual
  adapter and reader; matching export rendering remains pending.
- Two-equation reorder/edit sample in the math renderer lab, with recorded
  source-editing, history and Markdown-export checks and a mobile control gutter.

- Development-only MathJax 4.1.3 reference checks for the original paper's
  numbered equations, suppressed rows, forward/backward references, reordering,
  deleted targets, duplicate labels and manual tags. Source hashes and runtime
  isolation are enforced. This establishes expected semantics, not delivered
  Fountain equation-reference rendering or a new engine dependency.

- Opt-in TeX `tabular` projection into editable cells with l/c/r alignment,
  escaped text and inline math. The real paper's 21 values are checked against
  pinned source. Float placement and rules produce explicit import diagnostics;
  unsupported commands, captions, spans, widths and row-spacing syntax stay
  literal. The public lab includes the table and visible conversion differences.

- Explicit `MarkdownImportOptions.texMathEnvironments` recognition for complete
  equation/align/gather/multline/displaymath source with labels and comments
  retained. Reference and footnote discovery cannot consume those math blocks.
  Both original JOSS paper equations now import through this opt-in dialect;
  unsupported label rendering, TeX tables and full-paper fidelity remain open.

- Public math-renderer capability lab with host-owned KaTeX, local fonts,
  source editing, history, document/export inspection, and visible failures.
  Two attributed, unchanged equation excerpts from the real JOSS reference
  paper expose unsupported labels rather than claiming whole-paper parity.
  KaTeX remains development/demo-only, with runtime bundle isolation checked.

- Development-only `commonmark@0.31.2` oracle for the explicit inert-HTML policy.
  It reproduces all 652 official outputs before checking 72 exact-token,
  rendered-semantic, source, and canonical-round-trip contracts plus 144
  generated block/container/inline variants. Ten deliberately corrupted
  outcomes test guard sensitivity. Runtime source maps must exclude the
  reference parser. Fountain retains its own parser and schema, and the
  default conformance classification remains 563 matching / 72 pending / 17
  intentional; opt-in HTML conversion/loss work is still unfinished.

- Opt-in `MarkdownImportOptions.parseHTMLInline` receives immutable raw-token /
  original-node segments after Fountain's own inline parsing. The isolated
  `ServerHTMLImporter.parseInline` / instance `parseInlineWithReport` methods
  apply HTML scopes without reparsing original Markdown nodes. Protected-slot
  checks reject content consumption, duplication, or reordering; failed or
  declined adapters retain the exact inert interpretation and report through
  `onHTMLInlineFallback`. Local Markdown marks survive on HTML-created atoms.
  The conversion demo exposes a separate default-off option and loss/fallback
  details. This is not full CommonMark HTML conformance or lossless HTML import.

- `MarkdownExportOptions.tableFormat: 'html'` emits safe HTML table fragments
  through Fountain's existing serializer, preserving supported rich cell
  blocks, spans, column widths, and header scope. Newlines are encoded as HTML
  character references so code with blank lines cannot terminate a Markdown
  HTML block. Pipe tables remain the default. A conservative compatibility
  note documents the required HTML-enabled reader and unverified arbitrary
  metadata boundary. Demo Markdown panels expose the choice and export notes
  separately from import diagnostics.

- Opt-in `MarkdownImportOptions.parseHTMLBlock` connects a host-owned,
  synchronous HTML importer to recognized raw HTML blocks without importing a
  DOM or HTML parser into the core. Nested lists, quotes, disclosures, and
  footnotes use the same adapter. Invalid/declined conversions retain literal
  source and report through `onHTMLBlockFallback`. Source snapshots verify
  provenance with the same parsing policy. The headless conversion demo exposes
  this option using the isolated server HTML importer. This is block-only
  projection, not complete CommonMark HTML conformance or lossless conversion.

### Fixed

- Reused custom block views now follow the same immutable block identity as DOM
  reconciliation after moves and deletions. Previously a moved DOM subtree could
  retain another block's live path, targeting the wrong source on later edits.
- Document-context hook errors no longer prevent other views from refreshing or
  leave the mutation observer disconnected.

- The KaTeX adapter now defaults to thrown syntax errors, so unsupported input
  reaches the existing editable-source fallback and error callback. An
  always-denying trust callback also reports rejected trust commands instead
  of returning a red pseudo-render. Caller options cannot enable trust.

- Multiline math source uses textareas in the node view and demo toolbar.
  Inspecting a formula no longer strips line breaks or clears an unchanged
  accessibility description. Display Enter inserts a line; Ctrl/Command+Enter
  finishes editing. Selected-node synchronization preserves focus in native
  controls instead of moving subsequent typing into the document. Live edits
  remain undoable; this does not add whole-document LaTeX import or layout.

- Server HTML reports now identify omitted comments, unmapped inline elements,
  and rejected built-in link/image URLs without copying private source payloads
  into diagnostics. Repeated losses are aggregated. Extension content candidates
  are evaluated lazily, and only the accepted candidate contributes content-loss
  reports, avoiding false warnings from discarded speculative interpretations.
  Both HTML and opt-in Markdown conversion demos expose these specific notes.

- Browser and server HTML import preserve multiple paragraphs, headings,
  lists, quotes, code, media, math, custom blocks, and nested tables within
  table/header cells instead of flattening the entire cell into one paragraph.
  Footer rows are retained, empty cells keep an editable paragraph, and loose
  inline cell content keeps the cell's alignment. This also applies to rich
  clipboard paste and opt-in Markdown HTML-block conversion.
- Standalone NBSP, narrow NBSP, BOM, and other non-collapsible Unicode text
  between HTML blocks no longer disappears as if it were markup indentation.
  Browser/server import only ignores plain HTML whitespace-only inline runs
  between blocks; the same rule covers list items and table cells.

- Server HTML import now reports invalid custom-rule projections instead of
  silently disguising thrown attribute readers, malformed results, missing
  content elements, or schema rejection as ordinary successful conversion.
  The additive `invalid-rule-result` issue identifies the contribution and
  selector, preserves readable fallback, and does not expose thrown payloads.
  Intentional `false` declines remain quiet and still allow later rules.

- Empty supported text marks survive Markdown and browser/server HTML
  interchange. Empty bold, emphasis, code, strike, underline, sub/superscript,
  highlight, nested marks, and formatted empty links no longer turn into
  delimiter characters or disappear. Canonical Markdown reuses the inert
  styled-text envelope; typing into a pasted blank retains its formatting,
  including after undo. Explicit blank-paragraph omission still reports the
  loss, while empty links keep their meaningful destinations.
- Markdown preserves authored empty paragraph blocks by default using a narrow,
  inert `<p data-fountain-empty="text"></p>` dialect marker (`block` for a
  childless paragraph). This includes leading/trailing/consecutive blanks and
  blanks before code in list items. The additive `emptyParagraphs: 'omit'`
  export option reports each omitted paragraph and keeps following blocks
  inside their list. Empty pipe-table cells retain their existing syntax.
  Existing source snapshots still return untouched original source exactly.
  General safe raw-HTML conversion remains separate, unfinished work.
  Childless text blocks also get a view-only hit target; clicking and typing
  fills the selected block without changing its type or attributes or adding
  model content merely by rendering it.
- Nested reference and footnote discovery respects list/quote containers,
  fenced code, and inert HTML. Browser/server HTML import no longer inserts
  a fake paragraph before list-first code, headings, or nested lists; explicit
  blank paragraphs and genuinely empty item caret hosts are retained.
- Markdown now recognizes all seven raw-HTML block boundary types and keeps
  their content as editable literal text rather than interpreting embedded
  headings, lists, reference definitions, or root footnote definitions.
  Canonical export preserves edge whitespace, consecutive hard breaks, and
  literal line-leading block syntax. All 44 official HTML-block fixtures have
  a separate exact Fountain round-trip gate; safe HTML schema projection and
  deeper container integration remain unfinished, not advertised as full
  CommonMark conformance. Empty document/list/quote caret hosts also have
  explicit typing, deletion, and undo browser coverage.
- Unknown inline HTML remains inert literal text without accidentally decoding
  backslash escapes or entities in its attribute source. The remaining 80
  CommonMark cases now have enforced work-group ownership: 72 raw-HTML cases
  and eight empty-document/container policy cases. This classification does
  not claim additional CommonMark matches or enable executable HTML.
- Empty Markdown link labels retain their destination and title instead of
  silently losing the link. Browser and server HTML import preserve safe empty
  anchors, top-level inline formatting, and surrounding text in mixed clipboard
  fragments. The CommonMark baseline now locks 563 matches, with 80 pending and
  nine intentional differences; unsafe or missing anchor destinations do not
  acquire link marks. Text links in the supplied editor stylesheet stay
  underlined despite a host's global anchor reset, with a customizable
  `--fountain-link-color` instead of styling attachment controls or navigation.
- Markdown list content now follows each marker's width and padding, including
  tabs, multi-digit numbering, nested containers, lazy paragraphs, and code.
  Canonical export preserves these structures, distinct adjacent lists, and
  blank code lines. Unclosed fences no longer acquire an extra EOF line.
  The CommonMark oracle preserves meaningful trailing code newlines and now
  locks 561 matching examples (82 pending, nine intentional differences).
  HTML link coalescing also stops at intervening links with other attributes.
- Product-style capabilities now have an explicit end-to-end completion gate
  covering developer integration, author configuration, end-user permissions,
  persistence/submission, failure paths, and paired documentation. Markdown
  import/export additionally preserves lazy blockquote `===` text, accepts safe
  empty reference destinations, rejects unseparated reference titles, and keeps
  one logical mixed-format link continuous in semantic HTML. Seven additional
  official CommonMark examples are regression-locked.
- HTML export now respects Fountain's outer-to-inner mark order, so nested
  emphasis, strong, code, and links remain one continuous semantic range instead
  of being inverted or fragmented across adjacent inline nodes. This promotes 28
  additional official CommonMark cases without changing Fountain's native AST.
- The ten demo pages now distinguish content-author controls, portable stored
  data, and the reader/product rendering instead of presenting those roles as
  one ambiguous "live" surface. The incident widget defaults to a clean product
  card and exposes label, state, severity, and owner only in explicit authoring
  mode; new instances can be inserted from the supplied toolbar.
- Markdown hard breaks now retain active emphasis, strong, and strike marks
  during import, canonical export, and HTML projection. Adjacent marked inline
  runs are emitted as one semantic wrapper instead of fragmenting around the
  break, promoting CommonMark 0.31.2 examples 369, 373, 389, 407-409, 419,
  425-427, and 638-639 into the regression gate.
- The neutral CommonMark oracle now recognizes Fountain's intentionally richer
  captionless block-image figure as the same portable image meaning. This keeps
  the native schemas independent and removes 18 false AST-shape mismatches.
- The public AI streaming demo now preserves leading and trailing whitespace at
  mark boundaries, so accepting a proposal beside bold, italic, or another
  adjacent fragment cannot silently join two words.
- Direct or supplied-toolbar LaTeX source editing now clears a stale custom
  accessibility description and falls back to announcing the new exact
  expression; programmatic callers may still replace source and description
  together.
- Native disclosure toggles now survive an equivalent selection/decorations
  view update that occurs before the browser's asynchronous `toggle` event.
  Selection-only table-of-contents updates also preserve the existing index
  when the active heading is unchanged.
- React's `FountainEditor` now forwards its declared source-aware `paste`
  policy to the DOM view instead of silently dropping that option.
- Word clipboard normalization now keeps numeric ordered-list starts, separates
  adjacent Office list identities instead of merging them, and removes reported
  external comment/annotation attributes from the portable HTML.

- Documents using `StarterKit` now retain a real editable paragraph after a
  terminal table, media item, divider, widget, quote, list, or other non-text
  block. The schema-aware repair is idempotent, history-neutral, configurable
  for nested roots, and safely rebroadcast after collaborative transactions.
  Focusing a table resize handle also keeps its owning cell active, so the next
  merge, split, or header command does not unexpectedly target the trailing
  paragraph.
- Block-style changes now apply to every paragraph/heading in a cross-block
  selection instead of changing only its first block. The supplied quote
  control now wraps the current block range and unwraps an existing quote,
  making the same visible control useful for creation and removal.
- Clipboard insertion now keeps rich HTML ahead of plain-text paste rules,
  commits a rich replacement as one editor action, keeps multi-block HTML
  inside nested containers such as table cells and list items, replaces inline
  atoms with inline content, and turns multiline text pasted over a structural
  selection into real visible blocks instead of embedding collapsed newline
  characters in one paragraph.
- A copied Fountain selection now carries exact schema document JSON alongside
  clean semantic HTML and readable plain text. Compatible Fountain editors keep
  nested blocks, marks, attributes, table spans, media tracks, and custom atoms;
  differently configured editors fall back safely, while unrelated rich and
  text-only editors receive standard usable clipboard content. Single atomic
  blocks are no longer misclassified as empty inline fragments during paste.
- Block handles now highlight the complete active block, show a stronger grabbed
  state for pointer and keyboard interaction, and render the before/after drop
  position as a separate overlay. Space/Enter grab, Arrow movement, and Escape
  release expose the same visual state as pointer dragging.
- Empty paragraphs now render a real caret line, repeated Enter/Backspace
  creates and removes visibly distinct lines without leaving phantom height,
  backward keyboard and pointer selections retain their direction, Enter
  replaces multi-format or multi-paragraph selections with a real block
  boundary, selected atomic blocks can be continued with Enter, adjacent
  inline atoms are deleted without eating surrounding text, blockquotes can be
  unwrapped or exited with ordinary editing keys, and both Ctrl/Cmd+Shift+Z
  and Ctrl+Y perform redo.
- Responsive block images now fall back from a failed `srcset` candidate to
  their ordinary `src` without triggering a NodeView remount loop; Retry
  deliberately restores the responsive candidates.
- Focused controls inside a retained custom NodeView now keep DOM identity and
  focus across model updates and undo/redo; compatible same-path history
  changes may be accepted by the NodeView's own `update` contract.
- Semantic HTML import no longer turns indentation-only whitespace between
  nested blocks into empty paragraphs.
- The ESM React entry now keeps `react-dom/client` external and has package
  import and build-budget gates, preventing an embedded CommonJS runtime from
  breaking ESM import or silently inflating release assets.

### Added

- An isolated DOM-free `fountainjs-editor/docx` entry now imports and exports
  bounded Word OOXML in browsers and server runtimes. It preserves common
  paragraphs, headings, marks, links, nested lists, quotes, code, table spans,
  header rows, A4/Letter geometry, and verified embedded PNG/JPEG/GIF/WebP
  block or inline images with alternatives, dimensions, and captions. Import
  and export enforce media byte/file limits; data images embed directly, while
  application URLs require an explicit host-owned byte resolver and are never
  fetched by Fountain. Oversized ZIP/XML/media input fails closed, and immutable
  fidelity reports cover tracked revisions and unsupported content. The public
  Node conversion demo provides real DOCX download and re-import controls, and
  the recorded human audit exercises the round trip.
- Export verification now includes a recorded side-by-side rendering of the
  same document in Fountain and an independent DOCX viewer, plus a real A4 PDF
  rasterized page by page with Poppler. The visual comparison corrected heading
  scale, paragraph spacing, raster-image alignment, quote treatment, table
  borders, and portable font fallback instead of relying on XML/text equality.
- A DOM-free `fountainjs-editor/ai/generated-media` entry now provides
  inspectable private-by-default requests, bounded byte-backed candidates,
  generation progress, cancellation, provenance, and explicit accept/reject
  decisions. Accepted candidates cross the existing host-owned image/media
  upload boundary before a portable node enters the document; an optional React
  surface provides local previews and distinct generation/upload status without
  bundling a model or storage SDK.
- A DOM-free `fountainjs-editor/ai/conversation` entry now supplies bounded
  multi-turn context, cancellable streaming, inspectable requests, optimistic
  host-store revisions, and reusable prompt-store contracts. The optional
  `FountainAIConversation` React surface exposes persisted turns, live output,
  prompt selection, stopping, and guarded history clearing without bundling a
  model client, database, account, or Fountain cloud.
- `pnpm audit:ui` now records repeatable human-style release journeys across
  the public playground and Go-documentation demo, covering ordinary editing,
  backward selection, quotes, tables, math, Lean source, real clipboard paste,
  outline/integrity/reordering feedback, streamed review, structured agent
  tools, and undo while failing on page or console errors.
- An isolated DOM-free `fountainjs-editor/ai/document-tools` entry now exposes
  bounded schema/path reads plus provider-neutral read, insert, replace, format,
  and structure descriptors. Mutation calls create immutable review proposals,
  validate portable JSON and the active schema, enforce allowlists and resource
  limits, refuse stale documents, and apply only after explicit acceptance as
  one ordinary undoable transaction. ESM/CommonJS package and no-DOM type/source
  gates exercise the actual published boundary.

- Provider-neutral AI adapters may now stream bounded append-only proposal and
  explanation deltas. Partial output remains transient, inspectable, and
  cancellable; it never mutates the document, cannot be accepted before
  completion, and becomes the same stale-checked one-transaction proposal only
  when the stream finishes. The optional React review UI exposes live progress
  and a Stop action, while the public demo uses a deterministic local stream.

- A hardened optional Lean 4 loopback workflow now pairs the browser-side
  `createLeanLoopbackProvider` with a separately launched
  `fountainjs-lean-bridge`. It binds only to loopback, uses exact-origin and
  per-session-secret checks, exposes no arbitrary command/path operation,
  bounds requests/output/time/concurrency, removes temporary source, and has a
  dedicated real-Lean CI proof gate. Source-only Lean remains the default.

- A default-on, framework-neutral general drop cursor now renders an inline
  caret or atomic/block boundary for native drags carrying data.
  It is state/selection-neutral, yields to schema-valid block reordering, is
  forwarded by React and Custom Elements, and can be restyled, replaced, or
  disabled by the host.

- Isolated text-integrity entries now provide DOM-free Unicode/code-point,
  UTF-8, line-ending, normalization, invisible-character, and invalid-surrogate
  inspection; preview-first per-category sanitization with stale-selection
  refusal; bounded view-only invisible markers; eligible literal code/verbatim
  input; and an optional accessible React inspector. No cleanup is automatic,
  and the default React bundle remains unchanged.

- An isolated `fountainjs-editor/table-of-contents` module with DOM-free flat
  and hierarchical heading indexes, stable identity-backed anchors,
  active-section state, framework-neutral navigation, validated configuration,
  view-only heading decorations, and an accessible React Navigator adapter.

- Source-aware external paste normalization for Microsoft Word, Excel, Google
  Docs, MathML, and generic HTML, with configurable list/revision/metadata
  policy, executable-content removal, schema validation, safe fallback, and an
  immutable report describing normalization and loss.

- The supplied toolbar now presents table editing through one contextual,
  labelled menu by default, with explicit selection, row, column, cell, header,
  sizing, merge/split, and whole-table deletion language. Products that prefer
  every table icon can opt into `tableControls: 'expanded'`. Highlight colour
  and removal are available from the Highlight control itself. Image-type file
  attachments render a safe thumbnail beside metadata and a separate download
  action; their editor NodeView also exposes an explicit selection action for
  host-owned edit/delete controls.
- Table insertion now accepts explicit row/column dimensions in the supplied
  toolbar and public demos, while `deleteTable` removes the complete active
  table. Math nodes can be edited directly when selected, external controls can
  inspect them with `getActiveMath`, and `createMathExtension` offers neutral
  `plain`, `tinted`, or `outlined` visual treatments; `plain` is the default.
  The public demos also expose arbitrary highlight colours and label structural
  gap insertion as an insertion point rather than a page break.
- An immutable Markdown source snapshot for raw/visual workflows:
  `parseWithSource` retains exact input, line endings, and inert YAML
  frontmatter; `exportWithSource` returns unchanged source exactly or
  preserves the frontmatter while canonicalizing a visually edited body; and an
  explicit `exact`/`blocks`/`mapped-blocks`/`frontmatter`/`canonical` result
  prevents false source-fidelity claims. Unknown body syntax is deliberately
  not promised after a model edit.
- Conservative top-level Markdown source spans preserve unchanged aligned
  blocks, their whitespace, and their original line endings around a visual
  edit. A `blocks` result makes that stronger outcome explicit; ambiguous
  ownership and reference-owning changes fall back to frontmatter-only or
  canonical output instead of guessing.
- Identity-first structural source mapping retains unchanged block spelling
  through insertion, deletion, and movement while canonicalizing inter-block
  separators. Preserved immutable node identity safely distinguishes equal
  originals; duplicated references and reconstructed ambiguous equals remain
  unmapped. The explicit `mapped-blocks` result distinguishes this from aligned
  preservation.
- An initial versioned CommonMark 0.31.2/GFM 0.29-oriented compatibility corpus,
  plus ATX/Setext headings, indented and variable backtick/tilde code fences,
  variable-delimiter code spans with standard whitespace normalization, safe
  angle-bracket URI/email autolinks, star emphasis, backslash hard breaks, and
  collision-safe code export. Tab-stop code now works inside blockquotes and
  list items, and list items may begin with nested lists or thematic breaks.
  This is documented as a supported subset, not a false claim of complete
  standards conformance.
- Strict semicolon-terminated HTML5 named, decimal, and hexadecimal character
  references now decode everywhere CommonMark permits them, including link
  destinations, titles, visible link text, and fence info strings, but remain
  literal in code. All ASCII punctuation escapes are recognized; escaped
  ampersands remain literal; decoded URLs pass protocol validation; and
  canonical export protects literal entity-shaped text from changing meaning.
- Safe path-relative and query-relative URLs now pass the shared link policy.
  Markdown links additionally handle balanced destination parentheses and
  angle destinations containing `)`, reject unescaped title closers and labels
  beyond CommonMark's 999-character reference bound, and no longer extract
  reference definitions from fenced/indented code or paragraph continuation
  text. Destinations and titles can continue across nonblank definition lines,
  including multiline titles and escaped closing brackets in labels, and
  definitions nested in blockquotes remain global as CommonMark requires.
  Malformed inline destinations can now fall back to a defined shortcut
  reference without consuming their literal suffix, while syntactically valid
  empty destinations keep inline precedence. A real link nested in link text
  suppresses the outer link; link-looking text inside a code span does not.
  Reference labels now use locale-neutral full Unicode 17 case folding rather
  than JavaScript lowercasing, backed by a pinned, reproducible exception table
  generated from the official Unicode Character Database.
  Definition labels may span nonblank physical lines and normalize internal
  whitespace for matching; unescaped nested brackets are rejected instead of
  being mistaken for a definition.
  Explicit empty links now round-trip as links through Markdown, browser HTML,
  server-only HTML, JSON, and DOM rendering. Anchors with no `href` remain
  ordinary content, and empty image/source/action URLs remain invalid.
  Link-label scanning now treats code spans, URI/email autolinks, and valid
  inline HTML tags/comments/declarations as opaque. Brackets inside them cannot
  close an outer label or create a hidden reference link; unknown HTML remains
  inert readable text in the Fountain document.
  Reference identifiers now match normalized source spelling as CommonMark
  requires: case and whitespace fold, but escape and entity spelling remains
  significant until the resolved link's visible label is parsed. Normalization
  collapses only spaces, tabs, and line endings, preserves other Unicode space
  characters, and measures the 999-character bound in Unicode code points.
  Adjacent full and shortcut references follow the specified precedence rather
  than allowing an earlier shortcut to steal a later link label.
  Markdown image descriptions now become plain alt text after parsing nested
  emphasis, links, and images, instead of leaking their source punctuation into
  accessibility metadata.
  Emphasis opening delimiters now use Unicode-aware flanking checks, preventing
  intraword underscores and whitespace-prefixed runs from becoming accidental
  formatting. Double underscores and triple star/underscore runs add strong
  and combined strong-emphasis support; canonical emphasis uses stars so
  adjacent word characters remain round-trip safe.
  Non-ambiguous nested strong/emphasis runs now resolve inside their enclosing
  mark, while links, code spans, autolinks, and inline HTML remain tighter than
  emphasis. When adjacent text-node boundaries cannot be represented safely by
  independent delimiters, canonical export uses Fountain's inert semantic span
  inside the requested inline/reference link form and re-imports it losslessly.
  Ambiguous star and underscore runs now apply CommonMark's rule-of-three and
  overlap precedence, preserving compact nested strong/emphasis forms where the
  inner run has no surrounding whitespace.
  Uneven delimiter runs now consume only the characters needed for the resolved
  mark; unmatched prefix/suffix characters remain literal and canonical export
  can re-import escaped markers immediately beside emphasis.
  Shared delimiter runs now retain parse-order nesting, including repeated
  emphasis and multiple strong levels. Duplicate identical marks use the inert
  semantic-span fallback so canonical export does not collapse a level.
  Indefinite mixed nesting now survives soft line breaks and link labels. A
  non-outermost link stays at its exact mark-stack position in semantic output,
  and generated inline HTML applies the shared safe-URL policy on import.
  GFM strikethrough recognizes exact one- and two-tilde runs, stops at paragraph
  boundaries, and treats code, links, autolinks, and inline HTML as opaque.
  Boundary-safe GFM bare web and email autolinks validate domains and trim only
  the specified path punctuation, unmatched parentheses, entity-looking
  suffixes, and final email periods. Angle autolinks add case-preserving XMPP
  alongside HTTP(S) and `mailto:` while unknown and scriptable schemes remain
  inert under the shared safe-URL policy.
  Physical line endings are retained until inline syntax validation, preventing
  a forbidden newline inside a link destination from becoming a valid space.
  Link-title separation now uses only CommonMark's ASCII whitespace rather than
  incorrectly treating non-breaking spaces as syntax.
  Marks can now belong to any inline node rather than text alone. Linked and
  emphasized image atoms import and export correctly through Markdown,
  browser/server HTML, DOM rendering, JSON, and Yjs; marks on block nodes remain
  invalid.
  Markdown emphasis closing delimiters now obey Unicode-aware CommonMark
  flanking through the end of an inline fragment, and list markers accept only
  ASCII spaces or tabs as syntax instead of consuming non-breaking spaces.
  Thematic breaks accept standard spaces or tabs between three or more matching
  markers, up to three leading spaces, and take precedence over list items.
  ATX headings discard trailing spaces and correctly recognize a hash-only
  optional closing sequence as syntax rather than document text.
  Bullet lists accept `+` markers, and a change of bullet marker or ordered-list
  delimiter starts a distinct adjacent list instead of merging list identity.
  Ordered lists beginning above `1` remain valid at a block boundary but no
  longer interrupt an existing paragraph.
  Setext underlines can terminate a multiline paragraph, producing one heading
  with inline formatting preserved across its soft line breaks.
- A public `fountainjs-editor/core` entry for the platform-neutral document
  engine, logical selection, transactions, commands, history, portable
  extensions, collaboration lifecycle, formats, migrations, stable node IDs,
  and structured attributes; the source graph is import-gated, the package
  declarations compile with `ES2023` and no DOM library, ESM/CommonJS exports
  are smoke-tested, and pure-Node behavior includes collaboration and Yjs with
  no fake DOM. Browser presence rendering remains in the compatible root entry.
- Opt-in top-level `EditorView` virtualization with a renderer-independent
  measured-height/position index, viewport and semantic-selection islands,
  stable structural scroll anchoring, full-model decoration positions,
  deterministic NodeView lifecycle, rich wide-selection copy/cut preparation,
  automatic full-document print rendering, an explicit accessibility/export
  suspension API, React and Web Component forwarding, and 100,000-block
  Chromium/Firefox/WebKit/mobile browser contracts.
- Pure-Node HTML conversion through the isolated
  `fountainjs-editor/html/server` entry: a standards-oriented parser and CSS
  selector engine bundled without jsdom; portable `parseHTML` extension rules;
  retained browser-only `parseDOM` compatibility; full schema validation;
  malformed-input and unsupported-rule reports; URL and attribute safety;
  configurable input/tree/depth/attribute/error bounds; ESM/CommonJS package
  smoke checks; browser/server semantic parity fixtures; and enforced
  10,000-block CPU, growth, memory, and bundle budgets.
- Granular collaborative structured attributes through the new DOM-free
  `fountainjs-editor/structured-attributes` entry and opt-in
  `YjsCollaborationAdapterOptions.structuredAttributes`: bounded immutable JSON
  contracts; typed nested set/delete/array commands; one-step schema-validated
  transactions; stable-ID-addressed nested `Y.Map`/`Y.Array` projection;
  concurrent non-overlapping field and array-insertion convergence; canonical
  flat-JSON repair; local-only undo across both representations; hostile shared
  value and identity failure containment; pure-Node coverage; package exports;
  developer documentation; and working controls in the two-editor public demo.
- First-class portable interactive widgets through isolated
  `fountainjs-editor/widgets`, `fountainjs-editor/widgets/dom`, and
  `fountainjs-editor/react/widgets` entries: immutable definitions; attribute
  and cross-field validation; block/inline/content shapes; protected identity;
  insert/update/remove/selection commands; live-path controllers; transaction
  metadata; one-step history; generic Yjs synchronization; safe bounded HTML
  state; explicit Tab/Enter/Escape focus policy; read-only and accessibility
  state; separate controls/contentDOM ownership; deterministic teardown; plain
  DOM and React renderers; package/API/bundle gates; documentation; unit tests;
  and two package-backed public demos.
- An isolated `fountainjs-editor/node-ids` module with configurable portable
  `nodeId` assignment; injected and deterministic generation; immutable O(1)
  lookup; fail-closed duplicate diagnostics; lookup, update, selection, pure
  normalization, and schema-valid JSON migration APIs; single-pass repair;
  history-neutral position mapping; generic Yjs repair rebroadcast; custom
  block/inline eligibility; package exports and budgets; and Node-only
  10,000-block performance plus legacy-peer convergence coverage.
- An isolated `fountainjs-editor/pages` foundation with DOM-independent
  A4/Letter/custom geometry and legal-fragment flow; manual page-break and rich
  footnote schema intent; one canonical rich header/footer template per
  default/first/odd/even variant; portable current-page/page-count fields;
  integrity diagnostics; atomic commands; explicit
  overflow/constraint results; JSON and semantic HTML interchange; generic
  history/Yjs behavior; an isolated browser measurement adapter for line boxes,
  list items, rowspan-safe table groups, footnotes, and manual breaks; package
  budgets; a coalesced mutation/resize/font/print reflow controller with timed
  snapshots and deterministic teardown; immutable per-page selection of
  canonical furniture, resolved fields, and footnotes; DOM fragment source maps
  with model/structural paths and clip geometry; strict page-placement/source
  projection with separated continuation overhead; an isolated read-only page
  preview/print renderer with repeated furniture, structural continuation,
  footnotes, width validation, ID/transient-editor-state isolation, one
  screen-only accessibility copy, physical print-page rules, and real A4/Letter
  PDF geometry plus page-content extraction checks; and an
  improved keep-with-next rule that reserves a splittable block's required
  opening lines; plus indexed top-level lookup, identity/footnote-safe
  mutation-cycle measurement reuse, and 1,000-/5,000-block browser reflow budgets
  covering repeated middle edits and alternating document-edge edits; plus
  identity-preserving top-level insertion/removal, exact rendered-path and
  cached-source rebasing, and a 5,000-block structural budget that retains every
  unchanged DOM block while limiting insertion/removal to two/one geometry reads;
  plus a guarded editable page-shell controller that retains one unchanged
  contenteditable/model-path tree, supports native cross-page selection and
  IME plus history across whole-block/manual boundaries, restores continuous
  editing for narrow viewports and embedding containers, returns to pages on
  resize without remounting, preserves tracked-change decisions and bidirectional
  Yjs convergence across automatic whole-block boundaries; plus selection-safe,
  accessibility-hidden paragraph continuation gaps at measured line boundaries
  with stable cleanup, exact page-body alignment, responsive fallback, IME,
  history, tracked-change decisions, and bidirectional Yjs coverage; plus
  canonical list-item continuation spacing that preserves ordered starts,
  selection, IME, history, tracked decisions, Yjs convergence, and exact
  page-body alignment without cloned or synthetic list items; plus canonical
  rowspan-safe table-row continuation with reversible non-model spacer rows,
  read-only repeated column-header projections, live header reflow, selection,
  IME, history, tracked decisions, and Yjs convergence without cloning the
  editable table; explicit oversized-row overflow without clipping or model
  splitting; and mapped shared-comment anchors plus top-level movement across
  continued lists and tables. Canonical page templates and footnote definitions
  now remain uniquely editable in ordered rails while sanitized,
  accessibility-hidden page-shell copies resolve fields and update after every
  edit. It still fails closed before cloning unsupported split content; plus an
  honest staged pagination contract; plus a keep-together policy for canonical
  images, audio, disclosures, code blocks, and custom NodeViews. Unsplittable
  content moves intact when it fits and receives explicit, non-clipping page
  overflow when it exceeds the body. Pagination-owned attributes and CSS
  variables no longer cause custom NodeViews to be mistaken for foreign DOM
  mutations, while unrelated mutations still recover from immutable state.
  Complex table measurement now keeps transitive body rowspans together,
  preserves merged-column geometry, and repeats multi-row headers only when
  every header rowspan remains inside the header band; a rowspan leaking into
  body rows disables the unsafe repeated copy. A real-browser fixture keeps the
  canonical merged table editable with history across continuation pages.
  Carets on either DOM side of an injected paragraph page gap now map to the
  same logical text offset; cross-gap ranges and composition from both sides are
  covered in Chromium, Firefox, and WebKit without persisting the widget.
  Mobile Chrome/Safari emulation additionally verifies composition at that
  boundary and selection preservation while responsive fallback removes gaps.
  A physical print-media contract now verifies A4/Letter sheet rectangles,
  stable normalized page names, headers/page numbers, page-local footnotes,
  forced breaks, accessibility isolation, and transient-editor-state removal in
  Chromium, Firefox, and WebKit while retaining Chromium PDF-byte verification.
  `renderDOMPagePreview` now accepts a framework-neutral `renderPlacement` hook
  for custom NodeViews and atomic media; returned host templates are cloned,
  namespaced, made read-only, and stripped of live editor state without moving
  either the template or canonical source DOM. `pages/dom` now also accepts a
  host-owned `blockContinuation` adapter for custom rendered blocks. It strictly
  validates ordered descendant bands, fragment minima, continuation overhead,
  geometry, and source ownership; maps them to neutral immutable flow sources;
  and lets the preview render exact sanitized band ranges without changing the
  model or live NodeView. A custom split remains read-only/print-only and causes
  guarded editable pagination to fall back to continuous mode. Long footnote definitions now
  expose measured line fragments to the neutral layout engine, continue without
  duplicated or dropped content, retain configurable opening/ending minima,
  and render exact sanitized clips in both editable page shells and print
  previews. Inline references outside a text line's vertical center fall back
  to the nearest legal line instead of losing their reservation.
  Footnote display numbers are now derived from first-reference order without
  changing stable JSON IDs, update after structural movement, stay shared by
  repeated references, and round-trip through standard Markdown footnotes and
  semantic HTML noteref/footnote roles. Context-sensitive node DOM output now
  receives document/path context and explicitly opts out of stale DOM reuse.
  Paged previews route repeated cross-page references to the first rendered
  fragment of their shared definition instead of a nonexistent local anchor.
  One-line headings now carry the same keep-with-next intent as measured
  multi-line headings, preventing an ordinary heading from being stranded at
  the bottom of a page while its following block moves to the next sheet.
  Read-only and print pagination now exposes `block-child` fragments and can
  continue a multi-block blockquote at its canonical direct-child boundaries,
  preserving repeated container decoration without cloning or mutating the
  source document. Imported styled semantic HTML is covered across Chromium,
  Firefox, and WebKit, including marks, nested quote/list structure, merged
  tables, math, manual breaks, and Chromium PDF text de-duplication.
  A mixed three-engine print fixture now combines reversed footnote-definition
  order, repeated citations, continued notes, merged tables, page furniture,
  a manual break, and Chromium PDF text de-duplication.
  Broader adversarial/cross-engine print fidelity remains active work rather
  than a claimed capability.
- A DOM-independent versioned document envelope and deterministic sequential
  migration runner, historical bare-JSON compatibility, typed fail-closed
  diagnostics, a published structural JSON Schema, schema-validation hooks,
  isolated ESM/CommonJS exports, package tests, and deployment guidance.
- A written API-stability, deprecation, security-support, release, and rollback
  contract plus a machine-checked package-version/tag/changelog gate and
  reviewed public-declaration snapshot, complete trusted-publisher package-entry
  verification, and intended-file dry-run.
- Versioned extension manifests, deterministic ordered requirements, a safe
  package scaffold command, a framework-neutral checked example, and an
  isolated `fountainjs-editor/testing` conformance entry covering composition,
  document round-trips, command dry-runs/execution, whole-installation doctor diagnostics, packaging,
  compatibility, and author guidance.
- A complete validated text-style suite in `CoreExtension` and `StarterKit`,
  with foreground/background colour, font family, font size, and line height;
  framework-neutral commands and mixed-selection inspection through the
  isolated `fountainjs-editor/text-style` entry; safe HTML and lossless
  Fountain Markdown interchange in browsers and headless Node.js; generic Yjs
  synchronization; a responsive React toolbar panel; documentation, package
  budgets, and desktop/mobile browser contracts.
- An isolated `fountainjs-editor/ruby` module for semantic furigana and other
  pronunciation guides, with marked editable base text, validated readings,
  set/update/unset/toggle commands, accessible and IME-safe replaceable editing
  UI, JSON/HTML/Markdown/text interchange, generic Yjs synchronization, package
  budgets, documentation, and browser contracts.
- An isolated `fountainjs-editor/details` module with semantic, editable native
  details/summary nodes; arbitrary and nested block bodies; public
  insert/wrap/unwrap/open commands; persisted disclosure state; summary/body
  keyboard transitions; JSON, safe HTML, Markdown, and text interchange; generic
  Yjs synchronization; package budgets; documentation; and desktop/mobile
  browser contracts.
- Isolated public MIT named-version entries with replaceable bounded providers,
  manual and debounced automatic checkpoints, optimistic heads and exact
  idempotency, immutable structural/text/format comparison, non-destructive
  preview, permission hooks, backup-first one-transaction restoration,
  tracked-change compatibility, an accessible confirmation-gated React panel,
  package budgets, tests, and production integration/security guidance.
- An isolated, provider-independent tracked-changes engine for text insertion,
  deletion, exact replacement, mark changes, node attributes, atoms, tables,
  and structural edits; portable author/time/reason/comment metadata;
  individual/range/author/filtered batch accept or reject; selection/hover and
  lifecycle events; programmatic proposals; history and Yjs integration;
  accessible full-text React review UI; package/bundle gates; documentation;
  and browser/unit contracts.
- An isolated, provider-independent threaded-comments engine with overlapping
  inline/cross-block, point, block, and document anchors; mapped movement,
  deterministic recovery and orphan reattachment; text or rich-JSON replies,
  editing, reactions, resolution, archival, deletion, immutable events and
  permission hooks; authoritative adapter operations and a shared in-memory
  store; plus an isolated accessible React panel, package gates, tests, public
  demo, and production integration/security guidance.
- A provider-independent collaboration extension plus optional
  `fountainjs-editor/yjs` adapter with conflict-free text/structure,
  deterministic simultaneous-room initialization, relative remote selections,
  accessible presence decorations, local-origin undo/redo, validated remote
  state, host-owned provider/persistence boundaries, package checks, detailed
  integration guidance, and real-browser two-editor coverage.
- Lifecycle-safe collaboration replacement with generation-scoped adapter
  contexts, stale document/provider isolation, one-time retirement, bounded
  Yjs presence publishing, duplicate-listener reconnect tests, and a
  Strict-Mode-safe React editor constructor lifecycle. Multi-editor DOM
  selection ownership now prevents an unfocused remote view from stealing the
  active editor's browser selection.
- Markdown full/collapsed/shortcut reference links and images with titles,
  deterministic deduplicated reference export, recursive quote and loose-list
  parsing, aligned tables with escaped pipes and row normalization, complete
  schema validation, and immutable path-based loss reports for unsupported
  nodes, marks, and attributes.
- Schema-owned `parseDOM` rules for extension-defined block/inline nodes and
  marks, nested `contentElement` parsing, complete imported-tree validation,
  custom-mark export, broader common CSS/link preservation, and hardened
  generic HTML tag/attribute/style serialization with real-browser paste
  coverage.
- Schema-safe `canMoveNode` / `moveNode` commands for same-parent and
  cross-parent nested moves, plus optional framework-neutral drag handles,
  before/after indicators, accessible move buttons, host candidate/label
  policy, React/Web Component passthrough, and desktop/mobile browser coverage.
- A configurable, icon-based React toolbar with stable group/action IDs,
  ordering and visibility controls, label/icon/render overrides, public
  root/group/button/icon primitives, composer passthrough, selection-preserving
  pointer behavior, RTL keyboard navigation, and responsive scrolling.
- Framework-neutral, opt-in bubble and floating menu controllers with named
  instances, safe visibility predicates, reusable selection geometry,
  collision-aware placement, accessible React toolbars, and package-backed
  desktop/mobile demos.
- A framework-neutral slash-command extension with ranked multi-term filtering,
  cancellable async sources, live runtime registrations, atomic rollback,
  eleven schema-aware defaults, an accessible React renderer, and package-backed
  desktop/mobile demo coverage.
- Independent mention, emoji, typography, and character-count extensions; a
  framework-neutral cancellable suggestion controller; accessible React
  suggestion/count UI; an isolated complete RGI emoji-data entry; enforced
  transaction filtering; safe interchange; package-backed desktop/mobile
  demos; and behavioral, packaging, accessibility, and browser contracts.
- A framework-neutral `MediaExtension`, included by `StarterKit`, with typed
  native audio/video and WebVTT tracks, file attachments, provider-gated
  sandboxed embeds, safe HTML/text/Markdown boundaries, mapped observable asset
  uploads, paste/drop events, React controls, a Web Component demo, and unit
  plus cross-browser contracts.
- Production block and inline images with mapped progress/cancel/retry uploads,
  safe replacement, editable captions, alignment, load recovery, accessible
  pointer/touch/keyboard resizing, responsive metadata, expanded interchange,
  framework-neutral commands, and complete React controls.
- Opt-in, editor-local clipboard history with bounded deduplicated slots,
  unchanged native copy/paste behavior, a Mod-Alt-V command, explicit host
  persistence, framework-neutral state/commands, and a searchable React picker
  with full-value expansion, paste, remove, and clear controls.
- Span-aware production tables with geometry repair, merged-cell-safe row and
  column transforms, merge/split, scoped header toggles, full-row/column
  selection, accessible pointer/keyboard resizing, persisted column widths,
  and TSV plus HTML clipboard exchange.
- Live language-aware code blocks with safe token decorations, non-persisted
  line numbers, canonical language aliases, host tokenizer injection, public
  settings commands, React language/line-number UI, and real-browser editing.
- Professional bullet, ordered, and task-list transforms with multi-block
  wrapping, range conversion, mixed nesting, multi-item indent/lift, correct
  ordered starts after splits, boundary joins, React controls, and nested
  HTML/Markdown round trips.
- Starter link behavior with safe normalization and validation hooks, typed
  web/email autolinking, selection/caret link-on-paste, whole-link editing and
  removal, host-owned activation events, and a complete React link popover.
- Opt-in Lean 4 foundation with portable source blocks, Unicode shortcut entry,
  highlighting, zero-provider source-only mode, explicit provider trust
  metadata, and cancellable/stale-safe check, diagnostic, goal, hover, and
  completion contracts, plus mapped transient diagnostics and a safe
  framework-neutral InfoView.
- Opt-in native mathematics extension with inline/display TeX nodes, insertion
  and source-update commands, isolated input/paste rules, accessible source
  fallback, caller-owned DOM rendering, a safe KaTeX adapter, format round
  trips, tests, and a live headless demo.
- Configurable local history depth and grouping delay, adjacent browser
  typing/composition/deletion groups, explicit `closeHistory` boundaries,
  browser history-input support, and focused undo contracts.
- Cross-engine input contracts for alternate IME commit ordering, mobile
  replacement input, rich structured paste, mixed RTL/LTR and nested text, and
  native undoable drag-move of selected top-level blocks.
- Pixel/Chromium and iPhone/WebKit emulation projects covering virtual-keyboard
  input types and public-site mobile overflow alongside the desktop matrix.
- Production NodeView reconciliation with transaction-mapped identity, live path
  accessors, update/recreate and cleanup contracts, model-owned `contentDOM`,
  semantic selection hooks, embedded-control event isolation, mutation recovery,
  reversible decorations, and real-browser coverage.
- An optional `createReactNodeView` adapter with typed component props, attribute
  and deletion helpers, selection state, separate React/model DOM ownership,
  mapped reuse, cleanup tests, and a live custom-node demo.
- A mapped selection hierarchy for text, node, structural-gap, all-document,
  and rectangular table-cell selections, including semantic command behavior,
  undo restoration, native DOM synchronization, pointer interaction, keyboard
  navigation, non-colour visual states, public demos, and cross-browser tests.

- Structural `StepMap` and composable `Mapping` primitives with inversion and
  deletion metadata.
- Automatic transaction-selection mapping through text edits, block changes,
  and mark-created text fragments.
- Public conversion helpers between path-based text points and structural
  document positions.
- Immutable inline, node, and widget decorations supplied by plugins and mapped
  through transactions without entering document JSON.
- DOM rendering for overlapping decorated text and non-editable widgets, with
  widget content excluded from selection offset calculations.
- Public, extension-owned input rules with ordered matching, transaction
  handlers, a text-replacement helper, and immediate Backspace undo.
- Markdown shortcuts rebuilt on the public input-rule API, including optional
  language names in fenced-code triggers.
- Playwright browser contracts for real input events, cross-block selection,
  mapped decorations, input-rule undo, and the public React playground across
  Chromium, Firefox, and WebKit, with CI traces retained on failure.
- Typed command managers with immediate commands, atomic fluent chains,
  short-circuit rollback, one-step history, and non-mutating `can()` checks.
- View-aware focus commands for current, start, and end positions, including
  side-effect-free capability checks and real-browser chained-edit coverage.
- Extension-owned paste rules with transaction/document/text results, repeated-
  match processing, and reusable text, mark, and block-wrapping helpers.
- Atomic multiline plain-text paste, so one clipboard action creates one history
  entry even when it inserts several document blocks.
- Deterministic segmentation for partially overlapping inline decorations,
  verified while mapping alongside node and widget decorations in real browsers.
- Immutable selection bookmarks that map through composed changes and recover
  to valid text cursors when their original ranges or blocks are deleted.
- A release-gated Tiptap parity programme that distinguishes delivered,
  partial, and missing capabilities.

## 0.3.0 — Rebuilt as a modular editor engine

This release replaces the `0.2.x` proof of concept.

### Added

- Immutable JSON document model with schema-owned construction and validation.
- Framework-neutral extension composition for nodes, marks, plugins, commands, formats, and host services.
- DOM API, standards-based Web Component, and isolated React entry point over the same editor store.
- Range-aware transactions, typed editing commands, and working 100-step undo/redo history.
- Selection, replacement, and formatting across inline mark boundaries and multiple document blocks.
- Rich-content commands for images, links, quotes, lists, tasks, tables, nested block splitting, and boundary-aware deletion.
- Text alignment, colour, subscript, superscript, semantic hard breaks, and cross-mark document find/replace.
- Image URL, upload-adapter, inline data, clipboard paste, and drag/drop workflows.
- Rich schema for headings, quotes, ordered/bullet/task lists, code, tables, media, links, highlights, dividers, and hard breaks.
- Markdown and HTML importers plus safe HTML, Markdown, JSON, and text exporters.
- Accessible DOM editor with selection synchronization, keyboard input, paste, and Markdown shortcuts.
- React composer, toolbar, state hooks, outline navigator, and optional AI review panel.
- Provider-neutral `AIController` with inspectable request envelopes, data-minimal defaults, before/after proposals, stale-target protection, accept/reject decisions, cancellation, and undoable acceptance.
- MCP Streamable HTTP client and `MCPAIAdapter` with lifecycle negotiation, sessions, pagination, tool discovery and calls, JSON/SSE responses, errors, and timeouts.
- Live loopback MCP integration coverage for the complete connect/discover/call/apply/close lifecycle.
- Interactive extension NodeViews plus beforeinput, paste, drop, and click plugin hooks.
- Behavioral tests, package smoke checks, CI, npm release automation, and GitHub Pages deployment.
- A dedicated, responsive developer guide plus a detailed repository architecture reference and source tour.
- A gallery of ten dedicated, interactive integration pages spanning React, plain DOM, Web Components, Vue, Svelte, Angular, headless Node.js, and Python/Go/Java JSON boundaries.

### Fixed

- Undo and redo are no longer placeholders.
- DOM edits no longer flatten every supported block into plain paragraphs.
- Selections no longer stop working when they cross paragraphs or formatting boundaries.
- Accept-change text remains visible on hover and keyboard focus.
- Outline entries show complete, wrapping heading labels and retain the full text in hover tooltips.
- Modularity walkthrough cards keep their numbers, titles, and descriptions on consistent rows.
- ESM and CommonJS consumers now receive unambiguous declarations with explicit internal module paths; legacy React subpath typing is included.
- Marks serialize by stable type names instead of class objects.
- HTML output escapes text and rejects unsafe image and link protocols.
- The README installs and imports the actual package name, `fountainjs-editor`.
- Git remote credentials are no longer embedded in the repository URL.

### Repository

- Removed thousands of committed dependency files and generated bundles.
- Removed duplicate completion reports and the unrelated portfolio demo.
- Removed the confusing screenplay positioning; FountainJS is a modular, framework-neutral editor library.
- Consolidated usage, API, formats, AI/MCP, contribution, and security documentation.

### Breaking changes

- React APIs live at `fountainjs-editor/react`; the framework-neutral root does not load React.
- `undo` and `redo` receive an `Editor`, not an `EditorState`.
- Mark transactions are range-aware.
- `MCPIntegration` speaks MCP Streamable HTTP instead of a proprietary `/messages` payload.
- `useFountain` returns an `Editor` rather than `Editor | null`.
- Fountain screenplay nodes and format helpers were removed from the core package.

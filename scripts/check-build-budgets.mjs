import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const kibibyte = 1024;
const limits = Object.freeze({
  'dist/index.js': 111 * kibibyte,
  'dist/index.cjs': 93 * kibibyte,
  // The headless facade exports the existing engine and portable utilities;
  // shared implementation chunks are counted by the aggregate ceilings.
  // Platform-neutral semantic-math validation adds ~0.4 KiB to the facade.
  'dist/core.js': 9 * kibibyte,
  // Row schema metadata reshuffles shared CJS aliases by less than 128 bytes.
  'dist/core.cjs': 8 * kibibyte + 128,
  // Provider-neutral document tools are an isolated, DOM-free entry. Their
  // bounded reads, complete portable function schemas, strict structural
  // validation, and reviewed schema-valid mutations are all opt-in.
  'dist/ai-document-tools.js': 18 * kibibyte,
  'dist/ai-document-tools.cjs': 15 * kibibyte,
  // Host-owned multi-turn history and reusable prompts remain a separate,
  // DOM-free opt-in entry rather than adding a provider or persistence SDK.
  'dist/ai-conversation.js': 17 * kibibyte,
  'dist/ai-conversation.cjs': 14 * kibibyte,
  // Generated candidates are bounded and reviewed in a DOM-free entry. The
  // root browser bridge reuses the existing host-owned upload pipeline.
  'dist/ai-generated-media.js': 11 * kibibyte,
  'dist/ai-generated-media.cjs': 10 * kibibyte,
  // Bounded OOXML import/export, verified embedded raster media, and the ZIP
  // codec are isolated from every editor, React, collaboration, page, and core entry.
  // Experimental validated semantic math/OMML and exact-source packaging add
  // ~7.1 KiB ESM / 6.1 KiB CJS, including nested-block traversal fixes.
  // Bound equation-source restoration adds ~7.4 / 6.1 KiB for namespace-aware
  // comparison, unique bookmark verification, metadata validation and mixed
  // paragraph handling. Measured optional entries: 70.0 / 56.0 KiB; no dependency.
  // Shared body/cell/control traversal retains visible SDT content with explicit
  // loss reports. Measured 71.2 / 57.0 KiB (+~0.5 each), no new dependency.
  // Versioned glossary controls, schema-validated role restoration and visible
  // paragraph presentation add ~3.7 / 3.1 KiB to this optional boundary only.
  // The 2026-09-12 fidelity bridge adds bounded package inventory, footnotes,
  // header/footer stories, page settings/breaks, styles/themes, paragraph and
  // table geometry, and native OMML import. The entry is still opt-in and has
  // no browser or Office runtime; measured raw/gzip output is ~148/44 KiB ESM
  // and ~120/40 KiB CJS. Keep only a narrow raw regression allowance.
  // Attached rich image captions reuse editable inline marks/hyperlinks and add
  // ~0.7 KiB ESM / ~0.4 KiB CJS to this opt-in bridge.
  // Fixed/automatic layout import/export adds ~0.4 KiB ESM / ~0.3 KiB CJS.
  // Missing fixed-column geometry must be reported rather than silently filled.
  // Those diagnostics add ~0.9 / 0.7 KiB; measured 152.1 / 123.0 KiB.
  // Namespace-aware repeated-header on/off validation adds ~0.4 / 0.3 KiB;
  // current measured DOCX entries are 152.5 / 123.3 KiB, within these limits.
  // Direct table/cell border and margin import/export plus located loss reports
  // add ~6.6 / 5.4 KiB. Identical-duplicate coalescing and conflict diagnostics
  // add another ~1 / 0.8 KiB. Measured 160.1 / 129.5 KiB; no new dependency.
  // Independent preferred table width validation/native units add ~2.2 / 1.9
  // KiB to this optional bridge. Measured 162.3 / 131.4 KiB, no new dependency.
  // Paragraph font context and native paragraph/run font projection add about
  // 2.8 KiB ESM / 2.3 KiB CJS. Keep the increase bounded to measured growth.
  // Break-run retention and unresolved paragraph-font reporting add 0.3 KiB.
  // Signed character pitch in the native cascade and run import/export adds
  // about 1.2 / 1.0 KiB. Measured 167.8 / 135.9 KiB; no new dependency.
  // Located paragraph-mark pitch-loss reporting adds ~0.3 KiB. Keep a half-KiB
  // allowance rather than widening the unrelated editor/framework ceilings.
  // Independent repeat intent, strict semantic-cell controls and located
  // native-policy diagnostics add ~2.1 / 1.7 KiB. No new codec/runtime dependency.
  // Bounded table-style ancestry, namespace-aware property/edge merging and
  // used-style loss diagnostics add ~5.4 / 4.4 KiB to this isolated entry.
  // Measured 175.7 / 142.2 KiB; no new dependency or public API change.
  // Conditional region selection, inherited overrides, Word row-wide margin
  // semantics and explicit unsupported/merged-fill diagnostics add ~4.5 / 3.5
  // KiB. Measured 180.2 / 145.6 KiB; still optional and dependency-free.
  // Table-owned text uses the existing run/paragraph decoders and cascade,
  // with Word-specific absolute toggles and explicit Normal-precedence warnings.
  // Measured 182.1 / 147.1 KiB (+1.9 / 1.5); no new dependency/public API.
  // Source-owned quote containers now use a neutral native paragraph style
  // instead of reintroducing Word Quote's border/indent. Shared validation is
  // reused. Measured 182.7 / 147.6 KiB; add only half a KiB to this optional
  // entry's ceilings, leaving every editor/framework/CSS/performance cap fixed.
  // Block direction/logical alignment get explicit Word loss reports and a
  // physical alignment approximation, not a claim of native bidi fidelity.
  // Measured addition ~0.8 / 0.7 KiB to this optional entry, no new dependency.
  'dist/docx.js': 184 * kibibyte,
  'dist/docx.cjs': 148.75 * kibibyte,
  // Complete strict HTML5 character-reference decoding is shared by Markdown
  // and the already bundled server HTML parser. Track that transitive cost
  // explicitly so entry-file sizes cannot hide it.
  // The inline HTML adapter shares the strict token lexer with core. Rollup
  // now co-locates that lexer with the entity decoder (source-map verified).
  'HTML5 entity decoder ESM': 43 * kibibyte,
  'HTML5 entity decoder CommonJS': 41 * kibibyte,
  'dist/document-utilities.js': 36 * kibibyte,
  'dist/document-utilities.cjs': 30 * kibibyte,
  // The complete Unicode catalogue is isolated from every runtime entry and
  // compresses to roughly 31 KiB over the network.
  'dist/emoji-data.js': 340 * kibibyte,
  'dist/emoji-data.cjs': 280 * kibibyte,
  // The supplied text-style panel adds five validated controls without
  // changing the framework-neutral command surface. The contextual table and
  // highlight panels replace ambiguous icon-only interactions with labelled,
  // selection-aware controls while retaining an explicit compact allowance.
  // Live AI review plus the optional host-owned conversation surface remain
  // dependency-free and add no provider client or persistence SDK.
  // View-owned physical controls add ~0.4 KiB ESM / 0.3 KiB CJS here;
  // including their shared DOM ownership boundary, ~2.3 / 2.0 KiB overall.
  // No headless entry, dependency, CSS or runtime-performance cap is changed.
  'dist/react.js': 91.5 * kibibyte,
  // Named configuration panels, trigger ownership/focus and native field keys
  // add ~1.6 KiB ESM / 1.4 KiB CJS only here; ESM still fits its existing cap.
  'dist/react.cjs': 68.75 * kibibyte,
  // Vue remains an external optional peer; only lifecycle/state/view glue ships here.
  'dist/vue.js': 3 * kibibyte,
  'dist/vue.cjs': 3 * kibibyte,
  'dist/svelte.js': 2 * kibibyte,
  'dist/svelte.cjs': 2 * kibibyte,
  'dist/angular/index.js': 5 * kibibyte,
  // Provider-independent collaboration stays in the root; the optional Yjs
  // adapter remains a separately loaded peer-backed entry. Granular structured
  // attributes add nested Y.Map/Y.Array reconciliation and validation only to
  // this opt-in peer-backed surface.
  'dist/yjs.js': 30 * kibibyte,
  'dist/yjs.cjs': 25 * kibibyte,
  // Thread state, mapped anchors, storage operations, and the optional React
  // discussion panel remain isolated from the root and React entry points.
  'dist/comments.js': 30 * kibibyte,
  'dist/comments.cjs': 25 * kibibyte,
  'dist/react-comments.js': 11 * kibibyte,
  'dist/react-comments.cjs': 8 * kibibyte,
  // Review metadata, deterministic resolution, and the optional React review
  // panel are isolated entry points; applications that do not use suggestions
  // do not download either surface.
  'dist/tracked-changes.js': 30 * kibibyte,
  'dist/tracked-changes.cjs': 25 * kibibyte,
  'dist/react-tracked-changes.js': 9 * kibibyte,
  'dist/react-tracked-changes.cjs': 7 * kibibyte,
  // Named snapshots, structural comparison, and the optional React history
  // surface stay isolated from applications that do not enable versioning.
  'dist/versions.js': 35 * kibibyte,
  'dist/versions.cjs': 30 * kibibyte,
  'dist/react-versions.js': 18 * kibibyte,
  'dist/react-versions.cjs': 14 * kibibyte,
  // Native disclosure structure and commands stay isolated from applications
  // that do not add collapsible document sections.
  'dist/details.js': 10 * kibibyte,
  'dist/details.cjs': 8 * kibibyte,
  // Ruby annotations, commands, and the optional accessible annotation editor
  // remain isolated from applications that do not compose the module.
  'dist/ruby.js': 12 * kibibyte,
  'dist/ruby.cjs': 10 * kibibyte,
  // The direct entry is a small facade over shared style schema and commands;
  // aggregate budgets below account for the shared implementation exactly once.
  'dist/text-style.js': 2 * kibibyte,
  'dist/text-style.cjs': 2 * kibibyte,
  // Author-only conformance diagnostics are isolated from every editor runtime.
  'dist/testing.js': 7 * kibibyte,
  'dist/testing.cjs': 6 * kibibyte,
  // The immutable migration runner is isolated for server consumers and keeps
  // schema validation host-owned.
  'dist/migrations.js': 8 * kibibyte,
  'dist/migrations.cjs': 7 * kibibyte,
  // Portable identity inspection, deterministic repair, and O(1) lookup are
  // opt-in and do not increase the default editor entry.
  'dist/node-ids.js': 9 * kibibyte,
  'dist/node-ids.cjs': 8 * kibibyte,
  // Stable heading indexes, hierarchy, active-section state, navigation, and
  // view-only anchor decorations stay in one opt-in, DOM-free entry.
  'dist/table-of-contents.js': 7 * kibibyte,
  'dist/table-of-contents.cjs': 6 * kibibyte,
  // Raw Unicode inspection/sanitization is headless; DOM markers and verbatim
  // input stay in a second opt-in renderer entry.
  'dist/integrity.js': 13 * kibibyte,
  'dist/integrity.cjs': 11 * kibibyte,
  'dist/integrity-dom.js': 6 * kibibyte,
  'dist/integrity-dom.cjs': 5 * kibibyte,
  'dist/react-integrity.js': 12 * kibibyte,
  'dist/react-integrity.cjs': 10 * kibibyte,
  // Bounded portable values and typed-path commands remain DOM/Yjs independent.
  'dist/structured-attributes.js': 11 * kibibyte,
  'dist/structured-attributes.cjs': 9 * kibibyte,
  // The opt-in server importer bundles a WHATWG-oriented HTML parser and CSS
  // selector engine so packed Node consumers do not need jsdom, a fake DOM, or
  // undeclared runtime dependencies. Its gzip footprint is roughly 72/68 KiB;
  // the default editor, React, DOM, and collaboration entries do not import it.
  'dist/html-server.js': 270 * kibibyte,
  'dist/html-server.cjs': 225 * kibibyte,
  // Explicit unknown-inline preservation is a separate entry, not StarterKit.
  // The optional entry now includes explicitly inert raw-text capture as well
  // as unknown-inline preservation. Existing editor-entry/CSS caps stay fixed.
  // Shared block-wrapper mode + explicit paragraph authoring: measured
  // 6.0 / 5.1 KiB. No new dependency; default editor/CSS ceilings stay fixed.
  'dist/html-inert.js': 7 * kibibyte,
  'dist/html-inert.cjs': 6 * kibibyte,
  // Portable widget definitions and commands, browser lifecycle/focus policy,
  // and the React bridge remain three opt-in surfaces. Hosts pay only for the
  // renderers they actually use.
  'dist/widgets.js': 9 * kibibyte,
  'dist/widgets.cjs': 8 * kibibyte,
  'dist/widgets-dom.js': 5 * kibibyte,
  'dist/widgets-dom.cjs': 5 * kibibyte,
  'dist/react-widgets.js': 2 * kibibyte,
  'dist/react-widgets.cjs': 2 * kibibyte,
  // Portable page geometry, legal-fragment flow, page/footnote intent, and
  // canonical header/footer templates stay outside the default editor until
  // an application opts in.
  'dist/pages.js': 23 * kibibyte,
  'dist/pages.cjs': 19 * kibibyte,
  // Browser geometry, strict placement/source projection, coalesced reflow,
  // guarded single-contenteditable page shells, editable paragraph/list/table
  // continuations, and identity-rebased structural measurement caching remain
  // isolated from the neutral model.
  // Exact rendered-text intervals for semantic continuation clips and strict
  // host-declared custom-block continuation validation/mapping add about
  // 4.3/2.9 KiB to this optional browser adapter. The default entry is
  // unchanged.
  'dist/pages-dom.js': 54 * kibibyte,
  'dist/pages-dom.cjs': 45 * kibibyte,
  // The non-destructive read-only page/print projection is separately loaded
  // from both the neutral model and browser measurement lifecycle. Clipped
  // long-footnote continuations and non-duplicating print text masks add about
  // 1.9/1.5 KiB to this opt-in entry.
  // Cross-placement HTML/SVG/IDREF remapping and preview-instance isolation:
  // ~13.2 KiB ESM / 11.2 KiB CJS; optional entry, no added dependency.
  'dist/pages-preview.js': 14 * kibibyte,
  'dist/pages-preview.cjs': 12 * kibibyte,
  // Accessible block handles, visible drop states, page-preview print rules,
  // responsive editable page shells, and the three opt-in math appearances
  // remain inside one measured stylesheet.
  // Generated footnote labels add a small marker rule without affecting hosts
  // that omit the optional pages schema. Contextual table controls and image
  // attachment previews add the labelled interaction and responsive states.
  // Whole-block hover/focus/grab treatment and the independent drop-position
  // overlay add about 1.1 KiB to the single supplied stylesheet.
  // The optional multi-turn conversation surface adds about 4.5 KiB of fully
  // themeable, responsive, accessible states to the shared stylesheet.
  // Generated-media review adds preview, state, and responsive decision styles
  // without importing a model/provider SDK or changing document rendering.
  // Anonymous inline flow must override editable text's pre-wrap policy.
  // One 93-byte rule; bound the addition at 128 bytes, not a whole new KiB.
  // Link hit padding, code focus rings and background-preserving structural
  // highlights add ~0.2 KiB. Bound the stylesheet at 86.4 KiB.
  'dist/styles.css': 86.75 * kibibyte,
  // The aggregate includes every independently loadable surface. The optional
  // slash registry added about 10 KiB and contextual-menu core/React support
  // added about 9.5 KiB. Framework-neutral nested block controls add another
  // roughly 7 KiB across emitted shared chunks; individual entry ceilings stay
  // unchanged so no consumer-facing entry can hide that growth. Schema-owned
  // custom HTML parsing and hardened output add another roughly 4.6/3.8 KiB.
  // Reference-aware nested Markdown parsing and explicit projection reports
  // add roughly 5.3/2.6 KiB, including about 1 KiB in the ESM root entry.
  // Collaboration lifecycle plus the optional Yjs adapter add roughly
  // 23/20 KiB while keeping Yjs itself external to every FountainJS bundle.
  // Provider-neutral threaded comments and their optional React surface add
  // roughly 37/28 KiB without changing the core or standard React boundaries.
  // Tracked changes add about 35/28 KiB across their two independently loaded
  // entries and shared chunks. Keep only a small regression allowance above it.
  // Complete text styles, including headless interchange, add roughly 6.4/3.9
  // KiB across shared ESM/CJS chunks and 2.5/1.6 KiB to React.
  // Lifecycle-safe adapter replacement, Yjs presence coalescing, and React
  // Strict Mode ownership add roughly 2.8/2.4 KiB across shared chunks.
  // The isolated extension conformance surface and manifest validation add
  // roughly 9.5/10.5 KiB across entry points and shared ESM/CJS chunks,
  // including the whole-installation doctor. Keep a small allowance above it.
  // Versioned document envelopes and the isolated migration runner add about
  // 7/6 KiB respectively. The platform-neutral page foundation adds about
  // 21/18 KiB as an isolated opt-in entry, including canonical page-template
  // semantics. Browser fragment mapping and strict placement projection add
  // about 6/5 KiB; read-only screen/print projection stays in its own entry.
  // Physical print rules add less than 1 KiB. Guarded editable page shells add
  // about 9.6/6.8 KiB without changing the default editor entry. Structural
  // DOM reuse and path-aware page-cache rebasing add about 2.2/1 KiB. Editable
  // paragraph continuation boundaries add about 3.5/2.8 KiB while remaining
  // isolated from the default editor. Canonical list continuation adds about
  // 2.9/2.4 KiB to that same optional entry. Rowspan-safe editable table
  // continuation and read-only repeated header projection add about 4.6/4 KiB
  // plus 1.9 KiB of CSS. Canonical editable page-intent rails and sanitized
  // furniture/footnote projection add about 4.2/3.7 KiB plus 1.2 KiB of CSS.
  // Measured long-footnote fragmentation, neutral continuation placement, and
  // editable/print clips, including searchable PDF text de-duplication, add
  // about 6.5/4.9 KiB across the optional page entries.
  // Context-aware DOM serialization, derived footnote numbering, and standard
  // Markdown/semantic-HTML footnote interchange add about 4.1/3.2 KiB across
  // shared and opt-in chunks without increasing the default root entry.
  // Host-declared custom continuation validation and source mapping add about
  // 3.4/2.9 KiB to the optional pages/DOM entry and no default-entry code.
  // Stable node identities add about 7.8/6.4 KiB as an isolated entry while a
  // shared collaboration metadata constant adds only a few bytes elsewhere.
  // First-class widgets add about 14.9/12.5 KiB across their neutral, DOM, and
  // React entries, including focus-preserving generic NodeView reuse. None of
  // this code enters the default root or standard React entry.
  // Granular structured attributes add about 19.6/16.8 KiB across the neutral
  // command entry and optional Yjs bridge while leaving the root/React entries
  // unchanged.
  // Standards-oriented pure-Node HTML import adds about 263/219 KiB only to its
  // isolated self-contained entry (roughly 72/68 KiB compressed). Shared editor
  // entries stay within their prior ceilings.
  // The schema is data and is not counted.
  // The independently loadable core facade adds about 7 KiB of entry glue
  // while sharing the existing model, commands, formats, and utilities.
  // Strict CommonMark character references reuse the server HTML parser's
  // existing entity trie in a shared ~40/39 KiB raw chunk. This adds less than
  // 1 KiB to aggregate emitted code, though Markdown consumers now load the
  // decoder when they use that format boundary.
  // Context-aware single/multiline reference extraction and balanced relative-
  // link parsing and precedence add about 2.7 KiB without changing the default entry or core
  // facade ceilings.
  // The pinned Unicode 17 full-case-fold exceptions add about 3.3/2.6 KiB to
  // Markdown's shared format chunk without introducing a runtime dependency.
  // Unicode-aware emphasis flanking/nesting and lossless marked-node boundary
  // projection add about 1.8/1.4 KiB to that same shared format chunk.
  // Shared delimiter-run consumption and duplicate-mark semantic projection
  // add about 0.6/0.3 KiB without moving any public entry-point ceiling.
  // Exact one/two-tilde GFM strikethrough and opaque-token precedence add
  // about 0.5/0.3 KiB without moving any public entry-point ceiling.
  // GFM extended web-autolink domain/path validation adds about 1.1/0.9 KiB
  // to the shared format chunk without moving public entry-point ceilings.
  // GFM bare-email domain/tail validation adds about 0.4/0.3 KiB more.
  // The strict XMPP safe-URL branch fits inside the existing shared-core margin.
  // Atomic selected-Enter handling and safe adjacent-inline deletion add about
  // 0.4 KiB to the aggregate ESM graph without moving any public entry ceiling.
  // Exact blank-line joining, defensive placeholder rendering, and the native
  // Windows redo chord add about 0.7/0.4 KiB, again without moving an entry ceiling.
  // Direct math-source editing, configurable math presentation, explicit table
  // sizing/deletion, and structure-preserving clipboard insertion add about
  // 5.2/4.3 KiB while every consumer-facing entry remains below its own cap.
  // Contextual table/highlight controls, quote toggling, and explicit media
  // selection add about 5.3/3.7 KiB across the normal React and core chunks.
  // The default schema-aware trailing-block invariant and cell-focus retention
  // add about 2.2/2.5 KiB while every consumer entry remains below its own cap.
  // Source-aware Office/Docs/MathML normalization plus exact Fountain and
  // standards-based external clipboard flavors add about 20.2/17.9 KiB. The
  // root, React, and every optional consumer-facing entry keep their own caps.
  // The isolated live table-of-contents entry adds about 5.6/4.7 KiB. The
  // independent integrity scanner/sanitizer and DOM renderer add about
  // 16.6/13.8 KiB without entering the root package. Its optional React
  // inspector adds about 8/6 KiB in a separate entry; default React is intact.
  // Bounded provider-neutral streaming proposals add about 4/3 KiB across the
  // existing AI controller and React review UI, with no model SDK dependency.
  // The isolated schema-aware agent-tool entry adds about 16.5/13.7 KiB,
  // including its complete portable JSON Schemas and strict payload/schema
  // validation; the default editor entry grows by only 0.3 KiB.
  // Host-owned conversation orchestration and prompt contracts add about
  // 19/15.5 KiB across one isolated entry and the optional React surface.
  // Generated-media review adds about 17/14 KiB across its isolated controller,
  // the normal upload bridge, and optional React review surface.
  // DOM-free DOCX interchange, verified raster relationships, and explicit
  // portable Word styles add about 56/44 KiB as an isolated opt-in entry,
  // including the bundled ZIP codec.
  // Existing consumer entries do not grow.
  // Fixed-point outer-to-inner HTML mark projection adds less than 1 KiB across
  // the duplicated ESM entry graph while preserving every individual ceiling.
  // Marker-relative lists, complete inline HTML fragments, and opaque literal
  // HTML attributes bring the aggregate to about 1303 KiB. Keep every entry's
  // individual ceiling; round this aggregate ceiling up by one KiB.
  // The shared seven-class inert HTML block scanner and exact multiline
  // literal export add roughly 2.5 KiB; consumer-entry ceilings stay unchanged.
  // Shared nested-container discovery and opaque footnote/reference handling
  // add about 1.9 KiB ESM / 1.4 KiB CJS; consumer-entry ceilings stay fixed.
  // Explicit empty-paragraph preservation/omission plus childless-block hit
  // targets/typing add ~2.0 KiB ESM / 1.6 KiB CJS; no new runtime dependency.
  // Optional host HTML block projection adds ~0.9 KiB ESM / ~0.7 KiB CJS;
  // no parser dependency enters core and individual entry ceilings stay fixed.
  // Server-only custom-rule diagnostics add ~0.6 KiB per module format;
  // the optional server entry and all consumer-entry ceilings remain fixed.
  // Browser/server wrapper structure, its diagnostic, and pipe-table fixes add
  // ~0.8 KiB ESM / ~0.7 KiB CJS; no dependency or individual-entry cap changes.
  // Shared deterministic raw-HTML lexical grammar adds ~0.8 KiB ESM / ~0.6
  // KiB CJS, replacing two different heuristics; individual caps stay fixed.
  // Equivalent selection-boundary handling adds ~0.6 KiB ESM / ~0.5 KiB CJS;
  // caret/IME replacement keeps marks without changing consumer-entry caps.
  // Protected inline-node projection and its opt-in server adapter add about
  // 5.1 KiB ESM / 4.4 KiB CJS. No new dependency or individual-entry cap change.
  // Explicit discarded-comment/inline-element/URL diagnostics and accepted-
  // branch reporting add ~0.9 KiB ESM; CJS remains within its current ceiling.
  // Opt-in TeX environment boundaries and opaque definition/container handling
  // measure 1323.3 KiB ESM / 1104.1 KiB CJS (+2.4 / +1.7 KiB). No dependency,
  // individual-entry, CSS or performance-ceiling changes.
  // Bounded TeX tabular projection and explicit layout/fallback diagnostics
  // add ~3.5 KiB ESM / 2.7 KiB CJS; existing consumer-entry caps stay unchanged.
  // Opt-in document-context view refresh and identity-consistent NodeView moves
  // measure 1328.7 KiB ESM / 1108.2 KiB CJS (+1.9 / +1.4 KiB). No renderer
  // dependency or individual-entry, CSS, or performance-ceiling change.
  // Recovery from textless transaction snapshots adds ~0.5 KiB ESM / 0.4 KiB
  // CJS (1329.2 / 1108.6 KiB measured); only the aggregate ESM cap changes.
  // Preview reference registry adds ~1.7 KiB ESM / 1.2 KiB CJS. Main/core,
  // other optional entries, CSS and performance limits are unchanged.
  // Optional DOCX math and nested traversal measure 1338.6 / 1116.5 KiB total.
  // Verified, bound source restoration measures 1346.0 / 1122.6 KiB total.
  // Main/core, other entries, CSS and performance ceilings remain unchanged.
  // Figure retention and canonical attachment-preview recognition add ~1.4 KiB
  // ESM (1347.4 KiB total), shared across browser/server imports.
  // First-party Vue adds ~2.5 KiB ESM / 1.9 KiB CJS, with no bundled Vue runtime.
  // First-party Svelte action/stores add ~1.1 KiB ESM / 0.9 KiB CJS.
  // Measured totals: 1351.6 / 1127.1 KiB; Svelte stays an external peer.
  // Angular's unminified partial-Ivy entry adds 4.1 KiB; no Angular runtime is bundled.
  // Block-fragment HTML APIs plus Markdown fragment validation add ~0.9 KiB
  // ESM (~0.8 KiB CJS). Existing individual entry ceilings are unchanged.
  // Opt-in cross-block HTML flow adds ~4.4 KiB ESM / 3.6 KiB CJS for
  // container collection, bounded slots and content-preservation verification.
  // Shared HTML integer parsing and row-group-aware spans add ~1.1 KiB ESM /
  // 0.9 KiB CJS (1362.9 / 1133.2 KiB measured). No individual entry cap changes.
  // Native table section ordering/reporting adds ~0.6 KiB ESM / 0.5 KiB CJS
  // (1363.5 / 1133.7 KiB measured); CJS and all individual ceilings still fit.
  // Native list-start parsing and explicit numbering-loss reports add ~0.6 KiB
  // per format (1364.1 / 1134.3 KiB measured); individual caps stay unchanged.
  // Multi-block alignment and native paragraph-boundary selection mapping:
  // +1.7 KiB ESM / +1.2 KiB CJS, no dependencies or individual entry cap changes.
  // Full-document body projection and exact inline-node range preservation.
  // Standalone reference-definition provenance adds ~0.9 KiB ESM; measured
  // aggregate 1368.5 KiB. Individual entry and performance limits are unchanged.
  // Literal text LF/CR retention adds ~0.2 KiB (1369.1 KiB measured).
  // Only aggregate ESM grows by 1 KiB; CJS and entry/performance caps stay fixed.
  // Paragraph-level HTML recovery adds a validated block-returning adapter.
  // 2026-09-08: measured 1371.6 KiB; individual entry budgets remain unchanged.
  // Source-span list context and deferred paragraph recovery add about 1.4 KiB.
  // Preformatted text provenance/recovery: measured 1374.9 KiB, entry caps unchanged.
  // Continuous-run CRLF + empty-slot/Markdown-scope initial-LF correction:
  // measured 1375.9 KiB; no new dependency or individual entry ceiling change.
  // Recursive source events and validated list/quote projection add ~3.2 KiB
  // ESM / ~2.5 KiB CJS; no runtime dependency or individual entry cap change.
  // Explicit label-area caret placement adds a further ~0.9 / 0.7 KiB.
  // Source-aware hard breaks add ~1.3 KiB ESM / 1 KiB CJS; no entry/CSS cap changes.
  // Explicit task source events and whole-subtree verification add ~1.3 KiB
  // ESM / 1.1 KiB CJS (1388.7 / 1153.8 measured). No new dependency or change
  // to individual entries, CSS or performance ceilings.
  // Native definition-list nodes, shared browser/server projection, editing
  // commands, toolbar controls and boundary-aware text output add ~4.8 KiB.
  // Measured 1393.6 KiB ESM; no new dependency or per-entry budget increase.
  // Generated-code ending provenance adds ~0.7 KiB ESM / ~0.4 KiB CJS.
  // Measured 1394.3 / 1158.7 KiB; only this aggregate ESM cap changes.
  // No new dependency; individual entry, CSS and performance caps stay fixed.
  // Optional HTML containers, attribute enumeration and canonical handoff add
  // ~1.7 / 1.5 KiB; measured 1400.2 / 1163.8, no entry/CSS ceiling changes.
  // Optional section authoring commands and block-first import selection add
  // ~2.3 / 2.1 KiB. Measured 1402.5 / 1165.9; entry/CSS/performance caps unchanged.
  // Whole-document HTML source projection and explicit whitespace-layout reports
  // add ~2.3 / 1.8 KiB; measured 1404.8 / 1167.7. No entry/CSS cap changes.
  // Scope-sensitive source capture adds ~0.2 KiB; measured just above 1405.
  // Only the aggregate ESM ceiling changes; entry/CSS/CJS caps stay unchanged.
  // Native Web Component form integration adds ~2.2 / 1.9 KiB ESM/CJS.
  // Measured 1407.2 / 1169.7; individual entry and CSS caps remain unchanged.
  // The optional DOCX fidelity bridge above is the measured aggregate increase;
  // default editor and framework entry ceilings remain unchanged.
  // Rich image-caption content plus selectable non-atomic NodeView boundaries
  // add ~2.2 KiB ESM across the optional format/view entries.
  // Independent caption alignment/layout projection adds 1.6 KiB ESM (1500.8 total).
  // Shared fixed-table view/grid projection adds ~1.7 KiB ESM (1502.6 total).
  // Incomplete fixed-grid diagnostics bring the measured total to 1503.5 KiB.
  // Repeated-header validation brings the current total to 1503.9 KiB.
  // Validated portable table appearance and shared context projection plus the
  // optional native bridge measure 1516.6 KiB after duplicate handling.
  // Other entry/CSS/perf caps stay fixed.
  // Preferred table width adds ~3.9 KiB across the native and shared projections.
  // Default-width policy/reporting and border-inclusive fixed-grid ratios:
  // measured 1521.2 KiB (+~0.7 KiB), no new dependency. Only this aggregate
  // ceiling increases 1 KiB; individual entry, CSS and performance caps stay.
  // Located paragraph-font diagnostics and active-mark break insertion add
  // about 0.3 KiB to the previously measured font-context total.
  // Character spacing adds ~4.0 KiB across the mark, commands, toolbar, native
  // cascade and HTML/Markdown projections. Measured 1529.6 KiB; CSS and
  // performance limits are unchanged.
  // Inert body page-settings interchange and paragraph-mark loss diagnostics
  // bring the measured total to 1530.6 KiB (+~1.0); no dependency or CSS change.
  // Optional inert comment model/import/export and opaque-data safeguards:
  // measured 1533.5 KiB, +2.9 KiB; no dependency, core CSS or performance change.
  // Opt-in anonymous flow/model import, native whitespace boundaries and
  // normal Enter/paste/join behavior: measured 1535.1 / 1276.9 KiB.
  // No dependency or entry/performance ceiling changes.
  // Separate row intent, HTML/page projection and the selectable React control
  // add ~4.3 KiB overall, including the optional DOCX slice counted above.
  // Table text projection adds ~1.9 KiB; measured total 1551.8 KiB.
  // Protected Markdown block image/rule source projection and refusal guards:
  // +~2.1 KiB, measured 1553.9 KiB; no dependency, entry or performance changes.
  // Protected pipe-table cell source/default validation adds ~1.5 KiB;
  // measured 1555.4 KiB. No dependency or entry/CSS/performance cap changes.
  // Neutral quote DOM/HTML projection, strict marker import, Markdown loss
  // reporting and the native style above bring the graph to 1556.7 KiB.
  // Account for this bounded feature cost, not an unbounded safety margin.
  // Initial resize ARIA values, private per-table geometry/width caching and
  // control-owned cell selection add ~1.3 KiB; measured 1558.0 KiB. Allow only
  // 1 KiB more here; individual entry, headless and performance limits remain.
  // Continuous linked text paths and keyboard browsing/edit entry/paste for
  // scrolling code and literal code paste add ~3.0 KiB ESM / 2.5 KiB CJS.
  // Measured totals: 1561.1 / 1298.0 KiB. No runtime dependency.
  // The same optional React panel behavior measures 1562.7 / 1299.4 KiB total.
  // Public API, core/headless, CSS and performance limits remain unchanged.
  // Opt-in lexical inspection and the isolated inert-inline factory add about
  // 5 KiB ESM / 4 KiB CJS. No default editor import or runtime dependency;
  // preserve every pre-existing entry, latency, scaling and heap ceiling.
  // Explicit raw-text source capture, literal Unicode HTML import and empty
  // inline-code input (including pointer targeting) add ~2.0 KiB ESM / 1.8 KiB
  // CJS. Aggregate caps gain 2 / 1 KiB; the optional entry gains 1 KiB each.
  // All unrelated entry/CSS/latency/scaling/heap ceilings remain unchanged.
  // Literal HTML link controls, escaped Markdown destinations and bounded
  // native backslash carriers add ~2.0 KiB ESM / ~1.9 KiB CJS over the raw-text
  // checkpoint. Measured 1572.1 / 1307.7 KiB. No new runtime dependency;
  // every entry/CSS/latency/scaling/heap ceiling remains unchanged.
  // Source-bound HTML navigation preserves original URL interpretation without
  // weakening literal Markdown links. Shared import/export and ruby-carrier
  // handling measure 1574.7 / 1309.9 KiB (+2.6 / +2.2 KiB). Aggregate caps
  // gain 2 KiB each; individual entries, CSS and performance caps stay fixed.
  // Opt-in inert block wrappers add ~0.9 KiB; measured total 1575.6 KiB.
  // Optional block direction, shared HTML projection, logical alignment and
  // schema-normalized attribute steps add ~2.4 KiB. Explicit pointer focus
  // adds a small existing-view fix; keep a narrow measured allowance only.
  // Explicit physical-left authoring/projection adds ~1.3 KiB across entries.
  // Existing per-entry/CSS and all latency/scaling/heap ceilings stay fixed.
  // Supported inherited inline alignment and anonymous wrapper/list projection
  // add ~0.3 KiB ESM. The first frozen build is 21 bytes over 1581 KiB; retain
  // that failure and allow only 0.5 KiB aggregate feature capacity. Individual
  // entries, CommonJS, CSS, latency, scaling and heap limits stay unchanged.
  // Structural dir attributes, guarded import inheritance, RTL view handling
  // and author controls: measured 1586.1 KiB after sharing DOCX loss reporting.
  // This adds feature capacity only; latency, growth and heap limits stay put.
  // Schema-aware fixed list-direction retention and atomic transform rejection
  // add ~1.4 KiB ESM. Measured 1590.0 KiB; preserve the failed prior-cap log.
  // Only measured code capacity grows; entry/CSS/runtime performance caps stay.
  // Fixed-direction generic moves and focus-owned whole-container controls
  // reuse the existing paths, adding ~0.4 KiB ESM / ~0.3 KiB CJS. Measured
  // 1590.4 / 1323.0 KiB: CJS still fits. Preserve the prior ESM-cap failure and
  // add only 0.25 KiB ESM feature capacity; no entry/CSS/runtime/heap cap change.
  'all ESM runtime code': 1590.5 * kibibyte,
  // Empty styled-text runs add ~0.2 KiB CJS; ESM remains within its ceiling.
  // Multiline math editing and selected-control caret protection measure
  // 1320.8 KiB ESM / 1102.3 KiB CJS. Only the aggregate CJS cap rises 1 KiB;
  // individual entries, ESM, CSS and performance ceilings stay unchanged.
  // Whole-document replacement and restoration of root metadata add ~0.6 KiB
  // CJS (1109.2 KiB total). Individual entries, ESM and CSS caps stay fixed.
  // Figure retention and canonical attachment-preview recognition add
  // ~1.2 KiB CJS (1123.8 KiB total). Individual entries and performance are unchanged.
  // Direct table-caption content retention adds ~0.4 KiB CJS (1124.2 total).
  // ESM remains within 1348 KiB; individual entries and performance stay fixed.
  // Shared cross-block mark projection adds ~0.7 KiB ESM / 0.6 KiB CJS;
  // the existing aggregate ESM and individual importer ceilings still fit.
  // Literal delimiter/address export protection fixes silent text→mark/atom
  // conversion on reopen. CJS measures 1138.1 KiB, ~0.2 KiB above the previous
  // implementation. Only this aggregate ceiling grows by 1 KiB; ESM, individual
  // entries, CSS and all performance/memory limits remain unchanged.
  // Same additive paragraph recovery API; measured 1140.3 KiB.
  // Same list-context implementation; individual entry ceilings unchanged.
  // Same source-aware preformatted projection: measured 1142.7 KiB.
  // Same newline-stream correction: measured 1143.5 KiB.
  // Same definition-list feature: measured 1158.3 KiB CJS (+~4.4 KiB).
  // Same content-control projection: 1159.2 KiB. ESM/CSS/performance caps unchanged.
  // The same rich-caption boundary adds ~0.8 KiB CJS.
  // Equivalent caption layout retention adds 1.3 KiB CJS (1247.1 total).
  // Equivalent table layout projection adds ~1.6 KiB CJS (1248.8 total).
  // The same incomplete-grid diagnostics bring the measured total to 1249.5 KiB.
  // Repeated-header validation brings the current total to 1249.8 KiB.
  // The equivalent table-appearance increment measures 1260.7 KiB CommonJS.
  // Equivalent preferred-width boundary: measured 1264.1 KiB total.
  // Shift+Enter intent normalization with keyup/blur/IME cleanup adds ~0.6 KiB
  // to the browser view only. Measured total 1268.5; no new dependency.
  // Equivalent character-spacing implementation: +~3.4 KiB, 1271.9 measured.
  // Equivalent HTML metadata/located loss boundary: 1272.8 KiB measured.
  // Equivalent comment boundary: measured 1275.3 KiB, +2.6 KiB.
  // The same addition measures ~3.8 KiB CJS. Other entry ceilings are unchanged.
  // Table text projection adds ~1.5 KiB; measured total 1290.2 KiB.
  // The same source/guard addition is ~1.7 KiB CJS, measured 1291.9 KiB.
  // Equivalent table protection adds ~1.2 KiB, measured total 1293.1 KiB.
  // Equivalent source-owned quote projection: measured 1294.4 KiB. No new
  // dependency; all latency/scaling/heap limits remain unchanged.
  // The equivalent accessibility/control-focus projection measures 1295.5 KiB.
  // Narrow +1 KiB allowance; no dependency or individual entry cap increase.
  // Same opt-in raw-text and empty-source editing addition as the ESM graph.
  // Same measured link/carrier addition as ESM; no unrelated cap increase.
  // Same optional block mode: measured total 1310.7 KiB.
  // Same direction and explicit pointer-focus addition, ~2.1 KiB CJS.
  // Structural-direction warnings add ~0.4 KiB to the opt-in server importer.
  // Only aggregate CJS gains 0.5 KiB feature capacity; ESM, entries, CSS and
  // runtime performance/heap limits are unchanged. Keep the failed old-cap log.
  // Structural RTL plus preserving cell overrides through rebuilds measures
  // 1,351,195 bytes (27 bytes over 1319.5 KiB); retain that failed build log.
  // The same list boundary adds ~1.1 KiB CJS, measured 1322.7 KiB.
  'all CommonJS runtime code': 1323 * kibibyte,
});

const entries = await readdir('dist', { withFileTypes: true });
const runtimeFiles = entries.filter((entry) => entry.isFile() && !entry.name.endsWith('.map'));
const sizeOf = async (path) => (await stat(path)).size;
const measured = new Map();
measured.set('dist/html-inert.js', await sizeOf('dist/html-inert.js'));
measured.set('dist/html-inert.cjs', await sizeOf('dist/html-inert.cjs'));
const esmEntityDecoder = runtimeFiles.find((entry) => /^(?:decode|markdown-html)-.*\.js$/u.test(entry.name));
const cjsEntityDecoder = runtimeFiles.find((entry) => /^(?:decode|markdown-html)-.*\.cjs$/u.test(entry.name));
if (!esmEntityDecoder || !cjsEntityDecoder) throw new Error('HTML5 entity decoder chunks were not emitted.');
measured.set('HTML5 entity decoder ESM', await sizeOf(join('dist', esmEntityDecoder.name)));
measured.set('HTML5 entity decoder CommonJS', await sizeOf(join('dist', cjsEntityDecoder.name)));
measured.set('dist/vue.js', await sizeOf('dist/vue.js'));
measured.set('dist/vue.cjs', await sizeOf('dist/vue.cjs'));
measured.set('dist/svelte.js', await sizeOf('dist/svelte.js'));
measured.set('dist/svelte.cjs', await sizeOf('dist/svelte.cjs'));
measured.set('dist/angular/index.js', await sizeOf('dist/angular/index.js'));

for (const path of ['dist/index.js', 'dist/index.cjs', 'dist/core.js', 'dist/core.cjs', 'dist/ai-document-tools.js', 'dist/ai-document-tools.cjs', 'dist/ai-conversation.js', 'dist/ai-conversation.cjs', 'dist/ai-generated-media.js', 'dist/ai-generated-media.cjs', 'dist/docx.js', 'dist/docx.cjs', 'dist/document-utilities.js', 'dist/document-utilities.cjs', 'dist/emoji-data.js', 'dist/emoji-data.cjs', 'dist/react.js', 'dist/react.cjs', 'dist/yjs.js', 'dist/yjs.cjs', 'dist/comments.js', 'dist/comments.cjs', 'dist/react-comments.js', 'dist/react-comments.cjs', 'dist/tracked-changes.js', 'dist/tracked-changes.cjs', 'dist/react-tracked-changes.js', 'dist/react-tracked-changes.cjs', 'dist/versions.js', 'dist/versions.cjs', 'dist/react-versions.js', 'dist/react-versions.cjs', 'dist/react-integrity.js', 'dist/react-integrity.cjs', 'dist/details.js', 'dist/details.cjs', 'dist/ruby.js', 'dist/ruby.cjs', 'dist/text-style.js', 'dist/text-style.cjs', 'dist/testing.js', 'dist/testing.cjs', 'dist/migrations.js', 'dist/migrations.cjs', 'dist/node-ids.js', 'dist/node-ids.cjs', 'dist/table-of-contents.js', 'dist/table-of-contents.cjs', 'dist/integrity.js', 'dist/integrity.cjs', 'dist/integrity-dom.js', 'dist/integrity-dom.cjs', 'dist/structured-attributes.js', 'dist/structured-attributes.cjs', 'dist/html-server.js', 'dist/html-server.cjs', 'dist/widgets.js', 'dist/widgets.cjs', 'dist/widgets-dom.js', 'dist/widgets-dom.cjs', 'dist/react-widgets.js', 'dist/react-widgets.cjs', 'dist/pages.js', 'dist/pages.cjs', 'dist/pages-dom.js', 'dist/pages-dom.cjs', 'dist/pages-preview.js', 'dist/pages-preview.cjs', 'dist/styles.css']) {
  measured.set(path, await sizeOf(path));
}
measured.set('all ESM runtime code', await sizeOf('dist/angular/index.js') + (await Promise.all(
  runtimeFiles.filter((entry) => entry.name.endsWith('.js') && entry.name !== 'emoji-data.js').map((entry) => sizeOf(join('dist', entry.name))),
)).reduce((total, size) => total + size, 0));
measured.set('all CommonJS runtime code', (await Promise.all(
  runtimeFiles.filter((entry) => entry.name.endsWith('.cjs') && entry.name !== 'emoji-data.cjs').map((entry) => sizeOf(join('dist', entry.name))),
)).reduce((total, size) => total + size, 0));

const failures = [];
for (const [name, limit] of Object.entries(limits)) {
  const size = measured.get(name);
  if (typeof size !== 'number') throw new Error(`No build measurement was produced for ${name}.`);
  console.log(`${name}: ${(size / kibibyte).toFixed(1)} KiB / ${Number((limit / kibibyte).toFixed(1))} KiB`);
  if (size > limit) failures.push(`${name} exceeds its budget by ${((size - limit) / kibibyte).toFixed(1)} KiB`);
}

if (failures.length) throw new Error(`Build budget failed:\n- ${failures.join('\n- ')}`);

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const kibibyte = 1024;
const limits = Object.freeze({
  'dist/index.js': 111 * kibibyte,
  'dist/index.cjs': 93 * kibibyte,
  // The headless facade exports the existing engine and portable utilities;
  // shared implementation chunks are counted by the aggregate ceilings.
  'dist/core.js': 8 * kibibyte,
  'dist/core.cjs': 8 * kibibyte,
  // Complete strict HTML5 character-reference decoding is shared by Markdown
  // and the already bundled server HTML parser. Track that transitive cost
  // explicitly so entry-file sizes cannot hide it.
  'HTML5 entity decoder ESM': 42 * kibibyte,
  'HTML5 entity decoder CommonJS': 40 * kibibyte,
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
  'dist/react.js': 73 * kibibyte,
  'dist/react.cjs': 55 * kibibyte,
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
  // Bounded portable values and typed-path commands remain DOM/Yjs independent.
  'dist/structured-attributes.js': 11 * kibibyte,
  'dist/structured-attributes.cjs': 9 * kibibyte,
  // The opt-in server importer bundles a WHATWG-oriented HTML parser and CSS
  // selector engine so packed Node consumers do not need jsdom, a fake DOM, or
  // undeclared runtime dependencies. Its gzip footprint is roughly 72/68 KiB;
  // the default editor, React, DOM, and collaboration entries do not import it.
  'dist/html-server.js': 270 * kibibyte,
  'dist/html-server.cjs': 225 * kibibyte,
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
  'dist/pages-preview.js': 12 * kibibyte,
  'dist/pages-preview.cjs': 10 * kibibyte,
  // Accessible block handles, visible drop states, page-preview print rules,
  // responsive editable page shells, and the three opt-in math appearances
  // remain inside one measured stylesheet.
  // Generated footnote labels add a small marker rule without affecting hosts
  // that omit the optional pages schema. Contextual table controls and image
  // attachment previews add the labelled interaction and responsive states.
  // Whole-block hover/focus/grab treatment and the independent drop-position
  // overlay add about 1.1 KiB to the single supplied stylesheet.
  'dist/styles.css': 69 * kibibyte,
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
  'all ESM runtime code': 1150 * kibibyte,
  'all CommonJS runtime code': 965 * kibibyte,
});

const entries = await readdir('dist', { withFileTypes: true });
const runtimeFiles = entries.filter((entry) => entry.isFile() && !entry.name.endsWith('.map'));
const sizeOf = async (path) => (await stat(path)).size;
const measured = new Map();
const esmEntityDecoder = runtimeFiles.find((entry) => /^decode-.*\.js$/u.test(entry.name));
const cjsEntityDecoder = runtimeFiles.find((entry) => /^decode-.*\.cjs$/u.test(entry.name));
if (!esmEntityDecoder || !cjsEntityDecoder) throw new Error('HTML5 entity decoder chunks were not emitted.');
measured.set('HTML5 entity decoder ESM', await sizeOf(join('dist', esmEntityDecoder.name)));
measured.set('HTML5 entity decoder CommonJS', await sizeOf(join('dist', cjsEntityDecoder.name)));

for (const path of ['dist/index.js', 'dist/index.cjs', 'dist/core.js', 'dist/core.cjs', 'dist/document-utilities.js', 'dist/document-utilities.cjs', 'dist/emoji-data.js', 'dist/emoji-data.cjs', 'dist/react.js', 'dist/react.cjs', 'dist/yjs.js', 'dist/yjs.cjs', 'dist/comments.js', 'dist/comments.cjs', 'dist/react-comments.js', 'dist/react-comments.cjs', 'dist/tracked-changes.js', 'dist/tracked-changes.cjs', 'dist/react-tracked-changes.js', 'dist/react-tracked-changes.cjs', 'dist/versions.js', 'dist/versions.cjs', 'dist/react-versions.js', 'dist/react-versions.cjs', 'dist/details.js', 'dist/details.cjs', 'dist/ruby.js', 'dist/ruby.cjs', 'dist/text-style.js', 'dist/text-style.cjs', 'dist/testing.js', 'dist/testing.cjs', 'dist/migrations.js', 'dist/migrations.cjs', 'dist/node-ids.js', 'dist/node-ids.cjs', 'dist/structured-attributes.js', 'dist/structured-attributes.cjs', 'dist/html-server.js', 'dist/html-server.cjs', 'dist/widgets.js', 'dist/widgets.cjs', 'dist/widgets-dom.js', 'dist/widgets-dom.cjs', 'dist/react-widgets.js', 'dist/react-widgets.cjs', 'dist/pages.js', 'dist/pages.cjs', 'dist/pages-dom.js', 'dist/pages-dom.cjs', 'dist/pages-preview.js', 'dist/pages-preview.cjs', 'dist/styles.css']) {
  measured.set(path, await sizeOf(path));
}
measured.set('all ESM runtime code', (await Promise.all(
  runtimeFiles.filter((entry) => entry.name.endsWith('.js') && entry.name !== 'emoji-data.js').map((entry) => sizeOf(join('dist', entry.name))),
)).reduce((total, size) => total + size, 0));
measured.set('all CommonJS runtime code', (await Promise.all(
  runtimeFiles.filter((entry) => entry.name.endsWith('.cjs') && entry.name !== 'emoji-data.cjs').map((entry) => sizeOf(join('dist', entry.name))),
)).reduce((total, size) => total + size, 0));

const failures = [];
for (const [name, limit] of Object.entries(limits)) {
  const size = measured.get(name);
  if (typeof size !== 'number') throw new Error(`No build measurement was produced for ${name}.`);
  console.log(`${name}: ${(size / kibibyte).toFixed(1)} KiB / ${(limit / kibibyte).toFixed(0)} KiB`);
  if (size > limit) failures.push(`${name} exceeds its budget by ${((size - limit) / kibibyte).toFixed(1)} KiB`);
}

if (failures.length) throw new Error(`Build budget failed:\n- ${failures.join('\n- ')}`);

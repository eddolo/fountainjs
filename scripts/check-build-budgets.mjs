import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const kibibyte = 1024;
const limits = Object.freeze({
  'dist/index.js': 111 * kibibyte,
  'dist/index.cjs': 93 * kibibyte,
  'dist/document-utilities.js': 36 * kibibyte,
  'dist/document-utilities.cjs': 30 * kibibyte,
  // The complete Unicode catalogue is isolated from every runtime entry and
  // compresses to roughly 31 KiB over the network.
  'dist/emoji-data.js': 340 * kibibyte,
  'dist/emoji-data.cjs': 280 * kibibyte,
  // The supplied text-style panel adds five validated controls without
  // changing the framework-neutral command surface.
  'dist/react.js': 69 * kibibyte,
  'dist/react.cjs': 52 * kibibyte,
  // Provider-independent collaboration stays in the root; the optional Yjs
  // adapter remains a separately loaded peer-backed entry. Its explicit
  // provider replacement and bounded presence scheduler add about 1.3 KiB.
  'dist/yjs.js': 19 * kibibyte,
  'dist/yjs.cjs': 16 * kibibyte,
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
  // Portable page geometry, legal-fragment flow, page/footnote intent, and
  // canonical header/footer templates stay outside the default editor until
  // an application opts in.
  'dist/pages.js': 23 * kibibyte,
  'dist/pages.cjs': 19 * kibibyte,
  // Browser geometry, strict placement/source projection, and the coalesced
  // reflow controller are isolated from the neutral page model.
  'dist/pages-dom.js': 15 * kibibyte,
  'dist/pages-dom.cjs': 13 * kibibyte,
  // Accessible block handles and visible drop states add roughly 1.8 KiB while
  // leaving every JavaScript entry ceiling unchanged.
  'dist/styles.css': 56 * kibibyte,
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
  // about 6/5 KiB. The schema is data and is not counted as runtime JS.
  'all ESM runtime code': 700 * kibibyte,
  'all CommonJS runtime code': 594 * kibibyte,
});

const entries = await readdir('dist', { withFileTypes: true });
const runtimeFiles = entries.filter((entry) => entry.isFile() && !entry.name.endsWith('.map'));
const sizeOf = async (path) => (await stat(path)).size;
const measured = new Map();

for (const path of ['dist/index.js', 'dist/index.cjs', 'dist/document-utilities.js', 'dist/document-utilities.cjs', 'dist/emoji-data.js', 'dist/emoji-data.cjs', 'dist/react.js', 'dist/react.cjs', 'dist/yjs.js', 'dist/yjs.cjs', 'dist/comments.js', 'dist/comments.cjs', 'dist/react-comments.js', 'dist/react-comments.cjs', 'dist/tracked-changes.js', 'dist/tracked-changes.cjs', 'dist/react-tracked-changes.js', 'dist/react-tracked-changes.cjs', 'dist/versions.js', 'dist/versions.cjs', 'dist/react-versions.js', 'dist/react-versions.cjs', 'dist/details.js', 'dist/details.cjs', 'dist/ruby.js', 'dist/ruby.cjs', 'dist/text-style.js', 'dist/text-style.cjs', 'dist/testing.js', 'dist/testing.cjs', 'dist/migrations.js', 'dist/migrations.cjs', 'dist/pages.js', 'dist/pages.cjs', 'dist/pages-dom.js', 'dist/pages-dom.cjs', 'dist/styles.css']) {
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

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const kibibyte = 1024;
const limits = Object.freeze({
  'dist/index.js': 102 * kibibyte,
  'dist/index.cjs': 85 * kibibyte,
  'dist/document-utilities.js': 36 * kibibyte,
  'dist/document-utilities.cjs': 30 * kibibyte,
  // The complete Unicode catalogue is isolated from every runtime entry and
  // compresses to roughly 31 KiB over the network.
  'dist/emoji-data.js': 340 * kibibyte,
  'dist/emoji-data.cjs': 280 * kibibyte,
  'dist/react.js': 64 * kibibyte,
  'dist/react.cjs': 48 * kibibyte,
  // Provider-independent collaboration stays in the root; the optional Yjs
  // adapter remains a separately loaded peer-backed entry.
  'dist/yjs.js': 16 * kibibyte,
  'dist/yjs.cjs': 14 * kibibyte,
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
  // Accessible block handles and visible drop states add roughly 1.8 KiB while
  // leaving every JavaScript entry ceiling unchanged.
  'dist/styles.css': 54 * kibibyte,
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
  'all ESM runtime code': 610 * kibibyte,
  'all CommonJS runtime code': 515 * kibibyte,
});

const entries = await readdir('dist', { withFileTypes: true });
const runtimeFiles = entries.filter((entry) => entry.isFile() && !entry.name.endsWith('.map'));
const sizeOf = async (path) => (await stat(path)).size;
const measured = new Map();

for (const path of ['dist/index.js', 'dist/index.cjs', 'dist/document-utilities.js', 'dist/document-utilities.cjs', 'dist/emoji-data.js', 'dist/emoji-data.cjs', 'dist/react.js', 'dist/react.cjs', 'dist/yjs.js', 'dist/yjs.cjs', 'dist/comments.js', 'dist/comments.cjs', 'dist/react-comments.js', 'dist/react-comments.cjs', 'dist/tracked-changes.js', 'dist/tracked-changes.cjs', 'dist/react-tracked-changes.js', 'dist/react-tracked-changes.cjs', 'dist/versions.js', 'dist/versions.cjs', 'dist/react-versions.js', 'dist/react-versions.cjs', 'dist/styles.css']) {
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

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { CoreSchemaSpec, HTMLExporter, createEditor } from '../dist/index.js';

// Exercises the process-global private caches through shipped public exports.
// The existing 8/16 MiB live/destroyed ceilings are reused, not raised. This
// intentionally has no history plugin: retained undo documents are legitimate.
assert.equal(typeof globalThis.gc, 'function', 'Run with Node --expose-gc');
const content = count => ({ type: 'doc', content: Array.from({ length: count }, (_, index) => ({
  type: 'paragraph', attrs: { dir: 'auto', directionGroup: 'retention' },
  content: [{ type: 'text', text: index ? `123 ${index}` : 'שלום' }],
})) });
const collect = () => { globalThis.gc(); globalThis.gc(); return process.memoryUsage().heapUsed; };
const project = editor => HTMLExporter.export(editor.state.doc, { document: false });
let editor = createEditor({ schema: CoreSchemaSpec, content: content(1_000) });
project(editor);
const baseline = collect(), started = performance.now();
for (let index = 0; index < 2_000; index += 1) {
  const text = index % 2 ? 'שלום' : 'English שלום';
  const anchor = editor.state.doc.child(0);
  editor.dispatch(editor.createTransaction().replaceNode([0], [anchor.copy([editor.state.schema.text(text)])]));
  const html = project(editor);
  assert.equal((html.match(new RegExp(`dir="${index % 2 ? 'rtl' : 'ltr'}"`, 'g')) ?? []).length, 1_000);
}
const elapsedMs = performance.now() - started;
const liveGrowth = Math.max(0, collect() - baseline);
assert(liveGrowth <= 8 * 1024 * 1024, `Live indexed projection retained ${liveGrowth} bytes`);
editor.destroy(); editor = undefined;
const destroyedBaseline = collect();
for (let index = 0; index < 40; index += 1) {
  const temporary = createEditor({ schema: CoreSchemaSpec, content: content(250) });
  project(temporary); temporary.destroy();
}
const destroyedGrowth = Math.max(0, collect() - destroyedBaseline);
assert(destroyedGrowth <= 16 * 1024 * 1024, `Destroyed indexed projections retained ${destroyedGrowth} bytes`);
console.log(JSON.stringify({ scope: 'Bounded public HTML projection with shared direction; no DOM or history plugin',
  edits: 2_000, blocks: 1_000, elapsedMs, liveGrowthBytes: liveGrowth, liveLimitBytes: 8 * 1024 * 1024,
  destroyedEditors: 40, destroyedGrowthBytes: destroyedGrowth, destroyedLimitBytes: 16 * 1024 * 1024,
}, null, 2));

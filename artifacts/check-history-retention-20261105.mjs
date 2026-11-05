import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { CoreSchemaSpec, createEditor, createHistoryPlugin, historyKey, undo } from '../dist/index.js';

assert.equal(typeof globalThis.gc, 'function', 'Run with --expose-gc');
const collect = async () => {
  for (let index = 0; index < 3; index++) { await new Promise(resolve => setImmediate(resolve)); globalThis.gc(); }
  const memory = process.memoryUsage(); return memory.heapUsed + memory.arrayBuffers;
};
const cases = [];
for (const grouped of [false, true]) {
  const baseline = await collect();
  let editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin({ depth: 32 })], content: {
    type: 'doc', content: Array.from({ length: 1000 }, (_, index) => ({ type: 'paragraph', content: [{ type: 'text', text: `Block ${index}` }] })),
  } });
  const roots = [], started = performance.now();
  for (let index = 0; index < 2000; index++) {
    if (index > 0 && index < 1900 && index % 100 === 0) roots.push(new WeakRef(editor.state.doc));
    const transaction = editor.createTransaction().insertText([999, 0], index, 'Z');
    if (grouped) transaction.setMeta('fountain$historyGroup', 'typing').setMeta('fountain$historyTime', index);
    editor.dispatch(transaction);
  }
  const elapsedMs = performance.now() - started;
  const retained = historyKey.get(editor.state).done.length;
  assert.equal(retained, grouped ? 1 : 32);
  const liveGrowthBytes = Math.max(0, await collect() - baseline);
  const discardedRootsCollected = roots.filter(reference => reference.deref() === undefined).length;
  assert.equal(discardedRootsCollected, roots.length, 'Map chains must not retain discarded historical document roots');
  assert.equal(undo(editor), true);
  assert.equal(editor.state.doc.child(999).textContent, (grouped ? '' : 'Z'.repeat(1999)) + 'Block 999');
  editor.destroy(); editor = undefined;
  const releasedGrowthBytes = Math.max(0, await collect() - baseline);
  // Reuse the established 8/16 MiB live/released allowances; none are raised.
  assert.ok(liveGrowthBytes <= 8 * 1024 * 1024, `Live history retained ${liveGrowthBytes} bytes`);
  assert.ok(releasedGrowthBytes <= 16 * 1024 * 1024, `Released history retained ${releasedGrowthBytes} bytes`);
  cases.push({ grouped, edits: 2000, blocks: 1000, retainedGroups: retained, elapsedMs, discardedRootsCollected,
    sampledDiscardedRoots: roots.length, liveGrowthBytes, releasedGrowthBytes });
}
console.log(JSON.stringify({ scope: 'Built Node engine history: bounded groups, one long group, discarded roots and exact undo', cases }, null, 2));

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, cpus, platform, release } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Diagnostic only: semantic assertions are mandatory; timing/size thresholds
// must be established from reviewed measurements, not invented by this script.
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index], value = process.argv[index + 1];
  assert(['--package-root', '--sizes', '--cycles', '--checkpoint-every', '--output', '--tarball'].includes(key), `Unknown option: ${key}`);
  assert(value && !value.startsWith('--') && !options.has(key), `Expected one value for ${key}`);
  options.set(key, value);
}
assert(options.has('--package-root'), 'Pass --package-root pointing to the installed fountainjs-editor package directory.');
assert.equal(typeof globalThis.document, 'undefined', 'Run in pure Node, without a fake DOM.');
assert.equal(typeof globalThis.gc, 'function', 'Run Node with --expose-gc for live/destroyed heap measurements.');
const packageRoot = realpathSync(resolve(options.get('--package-root')));
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'fountainjs-editor');
const requirePackage = createRequire(join(packageRoot, 'package.json'));
// Resolve the actual public CommonJS exports and this installed consumer's peer.
const core = requirePackage('fountainjs-editor');
const yjs = requirePackage('fountainjs-editor/yjs');
const checkpoints = requirePackage('fountainjs-editor/experimental/yjs-retained');
const nodeIds = requirePackage('fountainjs-editor/node-ids');
const Y = requirePackage('yjs');
const { CoreExtension, Selection, composeExtensions, createEditor, getCollaborationState,
  insertText, splitBlock, toggleQuote, undoCollaboration, redoCollaboration,
  canUndoCollaboration, closeCollaborationHistory } = core;
const sizes = (options.get('--sizes') ?? '100,1000').split(',').map(Number);
const cycles = Number(options.get('--cycles') ?? 12);
const checkpointEvery = Number(options.get('--checkpoint-every') ?? 6);
assert(sizes.length && sizes.length <= 10 && sizes.every(value => Number.isSafeInteger(value) && value >= 1 && value <= 25_000));
assert(Number.isSafeInteger(cycles) && cycles >= 1 && cycles <= 10_000);
assert(Number.isSafeInteger(checkpointEvery) && checkpointEvery >= 1 && checkpointEvery <= 10_000);
const output = resolve(options.get('--output') ?? 'artifacts/yjs-endurance-diagnostic.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);

function packageFingerprint() {
  const files = [];
  const visit = path => {
    if (statSync(path).isDirectory()) for (const entry of readdirSync(path).sort()) visit(join(path, entry));
    else files.push(path);
  };
  // Hash shipped runtime/declarations and the export manifest, without following
  // the consumer's node_modules or accidentally hashing a workspace's artifacts.
  visit(join(packageRoot, 'dist')); files.push(join(packageRoot, 'package.json'));
  const hash = createHash('sha256'); let bytes = 0;
  for (const path of files.sort()) {
    const value = readFileSync(path); bytes += value.length;
    hash.update(relative(packageRoot, path).replaceAll('\\', '/')).update('\0').update(value).update('\0');
  }
  return { algorithm: 'SHA-256(sorted relative path + NUL + contents + NUL)', scope: 'dist/** and package.json',
    sha256: hash.digest('hex'), files: files.length, bytes };
}

const collectMemory = () => {
  globalThis.gc(); globalThis.gc();
  const { heapUsed, arrayBuffers, external, rss } = process.memoryUsage();
  return { heapUsed, arrayBuffers, heapAndArrayBuffers: heapUsed + arrayBuffers, external, rss };
};
const paragraph = (id, text) => ({ type: 'paragraph', attrs: { nodeId: id }, content: [{ type: 'text', text }] });
function fixture(size) {
  return { type: 'doc', attrs: { diagnostic: 'retained-endurance-v1', reviewCycle: -1 }, content: [
    paragraph('working-paragraph', 'Alpha beta gamma.'),
    ...Array.from({ length: size - 1 }, (_, index) => paragraph(`paragraph-${index}`, `Reference paragraph ${index}.`)),
    { type: 'heading', attrs: { nodeId: 'reference-heading', level: 2 }, content: [{ type: 'text', text: 'Reference material' }] },
    { type: 'blockquote', attrs: { nodeId: 'reference-quote' }, content: [paragraph('quoted-paragraph', 'Keep this quotation unchanged.')] },
    { type: 'bullet_list', attrs: { nodeId: 'reference-list' }, content: [
      { type: 'list_item', attrs: { nodeId: 'reference-item' }, content: [paragraph('listed-paragraph', 'Keep this list item unchanged.')] },
    ] },
    { type: 'table', attrs: { nodeId: 'reference-table' }, content: [{ type: 'table_row', content: [
      { type: 'table_cell', content: [paragraph('cell-left', 'Input')] },
      { type: 'table_cell', content: [paragraph('cell-right', 'Result')] },
    ] }] },
    { type: 'image_super', attrs: { nodeId: 'reference-image', src: 'https://example.test/figure.png', alt: 'Untouched figure', width: '320px', height: '180px' } },
  ] };
}

function summary(samples) {
  if (!samples.length) return { count: 0 };
  const ordered = [...samples].sort((a, b) => a - b), at = q => ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * q) - 1)];
  return { count: samples.length, firstMs: samples[0], medianMs: at(0.5), p95Ms: at(0.95), maximumMs: ordered.at(-1), samplesMs: samples };
}

async function profile(size) {
  const samples = {}, milestones = [], traffic = { updates: 0, bytes: 0, duplicateUpdates: 0, duplicateBytes: 0 };
  let left, right, stage = 'initialize', cycle = -1;
  const measure = (name, action) => {
    const start = performance.now();
    try { return action(); } finally { (samples[name] ??= []).push(performance.now() - start); }
  };
  const measureAsync = async (name, action) => {
    const start = performance.now();
    try { return await action(); } finally { (samples[name] ??= []).push(performance.now() - start); }
  };
  const make = (document, author, content = fixture(size)) => {
    const kit = composeExtensions([CoreExtension, nodeIds.StableNodeIdsExtension,
      yjs.createYjsCollaborationExtension({ document, user: { id: author, name: author, color: '#7048e8' } })]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    try { assert.equal(getCollaborationState(editor)?.status, 'connected', getCollaborationState(editor)?.error?.message); }
    catch (error) { editor.destroy(); throw error; }
    return { document, editor, destroy() { editor.destroy(); document.destroy(); } };
  };
  const healthy = peer => {
    assert.equal(getCollaborationState(peer.editor)?.status, 'connected', getCollaborationState(peer.editor)?.error?.message);
    assert.deepEqual(nodeIds.inspectStableNodeIds(peer.editor.state.doc), []);
  };
  const action = (peer, name, work) => {
    assert.equal(closeCollaborationHistory(peer.editor), true);
    assert.equal(measure(name, work), true, `${name} refused at cycle ${cycle}`);
    assert.equal(closeCollaborationHistory(peer.editor), true);
    healthy(peer);
  };
  const point = (peer, offset) => {
    const paragraph = peer.editor.state.doc.child(0);
    assert.equal(paragraph.type.name, 'paragraph');
    for (let index = 0; index < paragraph.childCount; index++) {
      const child = paragraph.child(index); assert.equal(child.isText, true);
      if (offset <= child.nodeSize) return { path: [0, index], offset };
      offset -= child.nodeSize;
    }
    throw new Error('Working paragraph text offset is out of bounds.');
  };
  const select = (peer, offset) => {
    const target = point(peer, offset);
    assert.equal(peer.editor.dispatch(peer.editor.createTransaction().setSelection(Selection.cursor(target.path, target.offset))), true);
  };
  const deliver = (peer, update, duplicate = false) => {
    traffic.updates++; traffic.bytes += update.length;
    if (duplicate) { traffic.duplicateUpdates++; traffic.duplicateBytes += update.length; }
    measure('remote.apply', () => Y.applyUpdate(peer.document, update, 'endurance-relay'));
    healthy(peer);
  };
  const synchronize = (reverse = false, duplicate = false) => {
    let updates, firstUpdates;
    // A second exchange carries any schema-owned repair generated on receipt.
    for (let round = 0; round < 2; round++) {
      updates = measure('transport.encode', () => [
        Y.encodeStateAsUpdate(left.document, Y.encodeStateVector(right.document)),
        Y.encodeStateAsUpdate(right.document, Y.encodeStateVector(left.document)),
      ]);
      firstUpdates ??= updates;
      if (reverse) { deliver(left, updates[1]); deliver(right, updates[0]); }
      else { deliver(right, updates[0]); deliver(left, updates[1]); }
    }
    assert.deepEqual(left.editor.getJSON(), right.editor.getJSON(), 'Peers did not converge');
    if (duplicate) {
      const before = [left, right].map(peer => Y.encodeStateAsUpdate(peer.document));
      deliver(right, firstUpdates[0], true); deliver(left, firstUpdates[1], true);
      for (const [index, peer] of [left, right].entries()) assert.deepEqual(Y.encodeStateAsUpdate(peer.document), before[index], 'Duplicate delivery created shared state');
    }
  };
  const milestone = name => {
    const documents = [left, right].map(peer => ({
      author: peer === left ? 'Ada' : 'Grace', nativeClientID: peer.document.clientID, sharedBytes: Y.encodeStateAsUpdate(peer.document).length,
      sharedSha256: sha256(Y.encodeStateAsUpdate(peer.document)), documentSha256: sha256(canonical(peer.editor.getJSON())),
      topLevelBlocks: peer.editor.state.doc.childCount, characters: peer.editor.state.doc.textContent.length,
      canUndo: canUndoCollaboration(peer.editor),
    }));
    milestones.push({ name, cycle, documents, memory: collectMemory(), traffic: { ...traffic } });
  };
  const reopen = async () => {
    const source = Y.encodeStateAsUpdate(left.document), expected = left.editor.getJSON();
    const checkpoint = await measureAsync('checkpoint.capture', () => checkpoints.captureRetainedCheckpoint(left.document, left.editor.state.schema, 'endurance-v1'));
    assert.deepEqual(Y.encodeStateAsUpdate(left.document), source, 'Capture mutated its source');
    const restored = await measureAsync('checkpoint.restore', () => checkpoints.restoreRetainedCheckpoint(checkpoint, left.editor.state.schema, 'endurance-v1'));
    assert.deepEqual(restored.baseDocument.toJSON(), expected);
    assert.equal(restored.manifest.roomId, checkpoint.manifest.roomId);
    right.destroy(); right = undefined;
    try { right = make(restored.document, 'Grace-reopened', expected); }
    catch (error) { restored.document.destroy(); throw error; }
    assert.equal(canUndoCollaboration(right.editor), false, 'Checkpoints must not invent restored local history');
    assert.deepEqual(right.editor.getJSON(), expected);
    milestone('checkpoint-reopened');
    select(left, 0);
    action(left, 'local.continue-after-reopen', () => insertText(left.editor, '[reopen]'));
    synchronize(cycle % 2 === 1);
    const continued = left.editor.getJSON();
    action(left, 'local.undo', () => undoCollaboration(left.editor)); synchronize();
    assert.deepEqual(right.editor.getJSON(), expected, 'Old peer undo failed against the reopened room');
    action(left, 'local.redo', () => redoCollaboration(left.editor)); synchronize(true);
    assert.deepEqual(right.editor.getJSON(), continued);
    action(left, 'local.undo', () => undoCollaboration(left.editor)); synchronize();
    assert.deepEqual(right.editor.getJSON(), expected);
    assert.equal(canUndoCollaboration(right.editor), false, 'Receiving updates must not create author history');
  };

  try {
    const leftDocument = new Y.Doc(); leftDocument.clientID = 101;
    try { left = make(leftDocument, 'Ada'); } catch (error) { leftDocument.destroy(); throw error; }
    const rightDocument = new Y.Doc(); rightDocument.clientID = 202;
    try { Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(left.document)); right = make(rightDocument, 'Grace'); }
    catch (error) { rightDocument.destroy(); throw error; }
    const unchanged = left.editor.getJSON().content.slice(1).map(node => [node.attrs.nodeId, canonical(node)]);
    let expectedText = 'Alpha beta gamma.';
    milestone('seed');
    for (cycle = 0; cycle < cycles; cycle++) {
      stage = 'typing and partial deletion';
      const suffix = ` visit-${String(cycle).padStart(4, '0')}`;
      select(left, expectedText.length);
      action(left, 'local.typing-burst', () => {
        for (const character of suffix) assert.equal(insertText(left.editor, character), true);
        return true;
      });
      expectedText += suffix;
      synchronize();
      action(left, 'local.delete', () => {
        const start = point(left, expectedText.length - 2), end = point(left, expectedText.length);
        return left.editor.dispatch(left.editor.createTransaction().replaceTextRange(start.path, start.offset, end.path, end.offset, ''));
      });
      expectedText = expectedText.slice(0, -2); synchronize(true);
      stage = 'formatting';
      action(left, 'local.mark-add', () => {
        const start = point(left, 0), end = point(left, 5);
        return left.editor.dispatch(left.editor.createTransaction().addMarkRange(start.path, start.offset, end.path, end.offset, left.editor.state.schema.mark('strong')));
      }); synchronize();
      action(left, 'local.mark-remove', () => {
        const start = point(left, 0), end = point(left, 5);
        return left.editor.dispatch(left.editor.createTransaction().removeMarkRange(start.path, start.offset, end.path, end.offset, left.editor.state.schema.marks.strong));
      }); synchronize(true);
      stage = 'offline structural editing';
      select(left, 3);
      action(left, cycle % 2 ? 'local.wrap' : 'local.split', () => cycle % 2 ? toggleQuote(left.editor) : splitBlock(left.editor));
      const peerToken = `[B${cycle}]`, beforePeerText = expectedText;
      select(right, 2); action(right, 'local.offline-peer-text', () => insertText(right.editor, peerToken));
      expectedText = expectedText.slice(0, 2) + peerToken + expectedText.slice(2);
      synchronize(cycle % 2 === 1, true);
      assert.equal(left.editor.state.doc.textContent.split(peerToken).length - 1, 1);
      stage = 'history-neutral metadata and author undo';
      action(right, 'local.neutral-metadata', () => right.editor.dispatch(right.editor.createTransaction()
        .setNodeAttrs([], { reviewCycle: cycle }).setMeta('addToHistory', false)));
      synchronize(); const merged = left.editor.getJSON();
      action(left, 'local.undo', () => undoCollaboration(left.editor)); synchronize(true);
      assert.equal(left.editor.state.doc.child(0).type.name, 'paragraph');
      assert.equal(left.editor.state.doc.child(0).textContent, expectedText, 'Author undo lost peer text');
      assert.equal(left.editor.state.doc.child(0).attrs.nodeId, 'working-paragraph');
      action(left, 'local.redo', () => redoCollaboration(left.editor)); synchronize();
      assert.deepEqual(left.editor.getJSON(), merged, 'Structural redo changed the merged document');
      action(left, 'local.undo', () => undoCollaboration(left.editor)); synchronize();
      action(right, 'local.undo', () => undoCollaboration(right.editor)); synchronize(true);
      assert.equal(left.editor.state.doc.child(0).textContent, beforePeerText);
      assert.equal(left.editor.state.doc.attrs.reviewCycle, cycle, 'Undo removed history-neutral metadata');
      action(right, 'local.redo', () => redoCollaboration(right.editor)); synchronize();
      assert.equal(left.editor.state.doc.child(0).textContent, expectedText);
      for (const [id, json] of unchanged) assert.equal(canonical(nodeIds.getNodeById(left.editor, id)?.toJSON()), json, `Untouched block changed: ${id}`);
      milestone('cycle-complete');
      if ((cycle + 1) % checkpointEvery === 0 || cycle === cycles - 1) { stage = 'checkpoint and continuation'; await reopen(); }
    }
    stage = 'complete'; milestone('complete');
    return { size, cycles, ok: true, traffic, milestones, measurements: Object.fromEntries(Object.entries(samples).map(([key, value]) => [key, summary(value)])) };
  } catch (error) {
    return { size, cycles, ok: false, failedStage: stage, failedCycle: cycle, error: { message: error.message, stack: error.stack },
      traffic, milestones, measurements: Object.fromEntries(Object.entries(samples).map(([key, value]) => [key, summary(value)])) };
  } finally { right?.destroy(); left?.destroy(); right = undefined; left = undefined; }
}

const report = {
  format: 'fountain-yjs-endurance-diagnostic/1', startedAt: new Date().toISOString(),
  package: { root: packageRoot, version: manifest.version, fingerprint: packageFingerprint(),
    ...(options.has('--tarball') ? { tarball: resolve(options.get('--tarball')), tarballSha256: sha256(readFileSync(resolve(options.get('--tarball')))) } : {}) },
  runtime: { node: process.version, yjs: requirePackage('yjs/package.json').version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
  configuration: { sizes, cycles, checkpointEvery, gc: true, entry: 'fountainjs-editor/yjs', module: 'CommonJS public exports', clientIDs: [101, 202],
    transport: 'deterministic in-memory state-vector update relay; relay withheld for offline edits', timingThresholds: null },
  scope: 'Semantic diagnostic, not a production performance certification. No history clearing, forced Yjs GC policy changes, network transport, compaction, or migration. Same-room checkpoints preserve native identity but do not restore local undo stacks.',
  profiles: [],
};
mkdirSync(dirname(output), { recursive: true });
for (const size of sizes) {
  process.stderr.write(`Retained Yjs diagnostic: ${size} paragraphs, ${cycles} cycles\n`);
  const baseline = collectMemory(), result = await profile(size);
  // Return from the async workload and release its fixtures before measuring.
  await new Promise(done => setImmediate(done));
  const destroyed = collectMemory();
  result.memory = { before: baseline, afterDestroy: destroyed, retainedHeapAndArrayBuffers: destroyed.heapAndArrayBuffers - baseline.heapAndArrayBuffers,
    note: 'After forced JS GC; public modules/JIT and this numeric report remain resident. No universal leak threshold is asserted.' };
  report.profiles.push(result);
  report.ok = report.profiles.every(value => value.ok); report.finishedAt = new Date().toISOString();
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  if (!result.ok) { process.exitCode = 1; break; }
}
process.stderr.write(`Diagnostic ${report.ok ? 'passed semantic checks' : 'FAILED'}: ${output}\n`);

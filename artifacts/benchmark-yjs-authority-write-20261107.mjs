import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as Y from 'yjs';

const [baselinePath, candidatePath, operation = 'write', count = '1'] = process.argv.slice(2);
assert(baselinePath && candidatePath, 'Pass the baseline and candidate authority build directories.');
assert(operation === 'read' || operation === 'write', 'Choose read or write.');
const readers = Number(count);
assert(Number.isInteger(readers) && readers >= 1 && readers <= 16 && (operation === 'read' || readers === 1),
  'Pass a reader count between 1 and 16 for the read profile.');
const version = 'write-benchmark-1';
const key = 'bench:retained-write';
const user = { id: 'author', name: 'Author', color: '#7048e8' };
const warmup = 2;
const samples = 8;

async function load(path) {
  const entry = name => import(pathToFileURL(resolve(path, name + '.js')).href);
  const modules = await Promise.all(['engine', 'adapter', 'checkpoint', 'authority', 'sqlite'].map(entry));
  return Object.assign({}, ...modules);
}

async function measure(api, blocks) {
  const folder = await mkdtemp(join(tmpdir(), 'fountain-write-benchmark-'));
  const repository = new api.SQLiteRetainedRoomRepository(join(folder, 'rooms.sqlite'));
  const document = new Y.Doc();
  const kit = api.composeExtensions([api.CoreExtension, api.createRetainedYjsCollaborationExtension({ document, user })]);
  const editor = api.createEditor({
    schema: kit.schema, plugins: kit.plugins,
    content: { type: 'doc', content: Array.from({ length: blocks }, (_, index) => ({
      type: 'paragraph', content: [{ type: 'text', text: `Incident ${index + 1}. Review the field notes before the next release.` }],
    })) },
  });
  const schema = editor.state.schema;
  const room = new api.CoordinatedDocumentRoom(repository, key, schema, version);
  const subtle = crypto.subtle;
  const digest = subtle.digest.bind(subtle);
  let digests = 0;
  const times = [], digestCounts = [];
  try {
    const initial = await api.captureRetainedCheckpoint(document, schema, version);
    const opened = await room.openForEditing({ protocols: ['retained'], loadCheckpoint: () => initial });
    let saved = opened.snapshot, lease = opened.admission;
    subtle.digest = (...args) => { digests++; return digest(...args); };
    for (let edit = 0; edit < warmup + samples; edit++) {
      const vector = Y.encodeStateVectorFromUpdate(saved.checkpoint.update);
      const path = [Math.floor(blocks / 2), 0];
      editor.dispatch(editor.createTransaction().insertText(path, 3 + edit, 'x'));
      const update = Y.encodeStateAsUpdate(document, vector);
      const write = () => room.write({ epoch: saved.epoch, protocol: 'retained', update });
      if (operation === 'read') saved = await write();
      digests = 0;
      const start = performance.now();
      const next = await (operation === 'read'
        ? Promise.all(Array.from({ length: readers }, () => room.pollRetained(lease)))
        : write());
      if (edit >= warmup) { times.push(performance.now() - start); digestCounts.push(digests); }
      assert(next);
      if (Array.isArray(next)) assert.deepEqual(next, Array(readers).fill(saved));
      else saved = next;
      lease = { ...lease, revision: saved.revision };
      assert.equal(saved.revision, edit + 1);
    }
    const restored = await api.restoreRetainedCheckpoint(saved.checkpoint, schema, version);
    try { assert.deepEqual(restored.baseDocument.toJSON(), editor.getJSON()); }
    finally { restored.document.destroy(); }
    return { times, digestCounts, documentSha256: saved.checkpoint.manifest.documentSha256 };
  } finally {
    delete subtle.digest;
    editor.destroy();
    document.destroy();
    repository.close();
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert(basename(folder).startsWith('fountain-write-benchmark-'));
    await rm(folder, { recursive: true, force: true });
  }
}

function summarize(runs) {
  const times = runs.flatMap(run => run.times).sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  return {
    medianMs: Number(((times[middle - 1] + times[middle]) / 2).toFixed(2)),
    measuredOperations: times.length,
    digestsPerOperation: [...new Set(runs.flatMap(run => run.digestCounts))],
  };
}

const [baseline, candidate] = await Promise.all([load(baselinePath), load(candidatePath)]);
const results = [];
for (const blocks of [250, 1_000]) {
  const before = [], after = [];
  before.push(await measure(baseline, blocks));
  after.push(await measure(candidate, blocks), await measure(candidate, blocks));
  before.push(await measure(baseline, blocks));
  assert.equal(new Set([...before, ...after].map(run => run.documentSha256)).size, 1);
  results.push({ blocks, baseline: summarize(before), candidate: summarize(after) });
}
console.log(JSON.stringify({ runtime: process.version, operation, readers, warmupOperationsPerRun: warmup, results }, null, 2));

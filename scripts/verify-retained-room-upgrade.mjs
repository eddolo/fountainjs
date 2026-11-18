import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = { type: 'doc', attrs: { run_id: 'river-07' }, content: [
  { type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: 'North' }] },
  { type: 'paragraph', attrs: { align: 'center' }, content: [
    { type: 'text', text: 'Gauge ' },
    { type: 'text', text: 'ready', marks: [{ type: 'strong' }] },
  ] },
] };

function runPeer(project, input) {
  const require = createRequire(join(resolve(project), 'package.json'));
  const Y = require('yjs');
  const { createEditor, CoreExtension, composeExtensions, undoCollaboration, redoCollaboration } =
    require('fountainjs-editor');
  const { createYjsCollaborationExtension } = require('fountainjs-editor/yjs');
  const room = new Y.Doc();
  const apply = update => Y.applyUpdate(room, Buffer.from(update, 'base64'), 'provider');
  if (input.room) apply(input.room);
  const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({
    document: room, user: { id: input.user, name: input.user, color: '#306651' },
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: input.room ? undefined : source });
  try {
    assert.deepEqual(editor.getJSON(), input.initial);
    const vector = Y.encodeStateVector(room);
    if (input.edit) {
      const { path, at, text } = input.edit;
      assert.equal(editor.dispatch(editor.createTransaction().insertText(path, at, text)), true);
    }
    const delta = Buffer.from(Y.encodeStateAsUpdate(room, vector)).toString('base64');
    if (input.remote) {
      apply(input.remote);
      apply(input.remote);
    }
    assert.deepEqual(editor.getJSON(), input.expected);
    if (input.afterUndo) {
      assert.equal(undoCollaboration(editor), true);
      assert.deepEqual(editor.getJSON(), input.afterUndo);
      assert.equal(redoCollaboration(editor), true);
      assert.deepEqual(editor.getJSON(), input.expected);
    }
    return {
      version: require('fountainjs-editor/package.json').version,
      room: Buffer.from(Y.encodeStateAsUpdate(room)).toString('base64'),
      vector: Buffer.from(Y.encodeStateVector(room)).toString('base64'), delta,
    };
  } finally {
    editor.destroy();
    room.destroy();
  }
}

function peer(project, user, data) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--peer', project], {
    input: JSON.stringify({ user, ...data }), encoding: 'utf8', timeout: 30000,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw Error(child.stderr || 'Peer process failed.');
  return JSON.parse(child.stdout);
}

if (process.argv[2] === '--peer') {
  process.stdout.write(JSON.stringify(runPeer(process.argv[3], JSON.parse(readFileSync(0, 'utf8')))));
} else {
  const [published, candidate] = process.argv.slice(2);
  if (!published || !candidate) throw Error('Pass the published and candidate consumer directories, each with fountainjs-editor and yjs installed.');
  const seeded = peer(published, 'seed', { initial: source, expected: source });
  const edits = [
    { path: [0, 0], at: 5, text: ' station' },
    { path: [1, 0], at: 5, text: ' B' },
  ];
  function expected(...indices) {
    const doc = structuredClone(source);
    for (const index of indices) {
      const { at, text } = edits[index];
      const span = doc.content[index].content[0];
      span.text = span.text.slice(0, at) + text + span.text.slice(at);
    }
    return doc;
  }
  const projects = [published, candidate];
  const offline = projects.map((project, index) => peer(project, 'author-' + index, {
    initial: source, room: seeded.room, edit: edits[index], expected: expected(index),
  }));
  const connected = projects.map((project, index) => peer(project, 'reconnect-' + index, {
    initial: expected(index), room: offline[index].room, remote: offline[1 - index].delta, expected: expected(0, 1),
  }));
  assert.equal(connected[0].vector, connected[1].vector, 'Both peers must have received the same Yjs clocks.');
  for (const [index, project] of projects.entries()) {
    const other = 1 - index;
    const merged = peer(project, 'author-' + index, {
      initial: source, room: seeded.room, edit: edits[index], remote: offline[other].delta,
      expected: expected(0, 1), afterUndo: expected(other),
    });
    peer(projects[other], 'reader', { initial: expected(0, 1), room: merged.room, expected: expected(0, 1) });
  }
  console.log('Verified retained-room reopen, mixed-version edits, duplicate delivery and author undo/redo between %s and %s.', offline[0].version, offline[1].version);
}

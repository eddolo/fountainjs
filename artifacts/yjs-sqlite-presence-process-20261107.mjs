import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';
import { CoreExtension, composeExtensions, createEditor } from './yjs-authority-admission-build-20261107/engine.js';
import { SQLiteRetainedRoomRepository } from './yjs-authority-admission-build-20261107/sqlite.js';
import { CoordinatedDocumentRoom } from './yjs-authority-admission-build-20261107/authority.js';
import { createRetainedYjsCollaborationExtension } from './yjs-authority-admission-build-20261107/adapter.js';
import { captureRetainedCheckpoint } from './yjs-authority-admission-build-20261107/checkpoint.js';

const [mode, path, serialized, token] = process.argv.slice(2);
const cursor = { fountain: { user: 'Remote process' } };
if (mode === 'publish' || mode === 'leave') {
  const repository = new SQLiteRetainedRoomRepository(path, () => 100);
  const lease = JSON.parse(serialized);
  try {
    if (mode === 'leave') repository.leavePresence(lease.key, lease.epoch, token);
    else {
      const published = repository.bindPresence(lease);
      repository.exchangePresence(lease, published, cursor);
      process.stdout.write(published);
    }
  } finally { repository.close(); }
} else {
  const root = await mkdtemp(join(tmpdir(), 'fountain-presence-process-'));
  const file = join(root, 'rooms.sqlite');
  const repository = new SQLiteRetainedRoomRepository(file, () => 100);
  const doc = new Y.Doc();
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({
    document: doc, user: { id: 'seed', name: 'Seed', color: '#7048e8' },
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  try {
    const schema = editor.state.schema, version = 'presence-1';
    const room = new CoordinatedDocumentRoom(repository, 'paper', schema, version);
    const opened = await room.openForEditing({ protocols: ['retained'], loadCheckpoint: () => captureRetainedCheckpoint(doc, schema, version) });
    const lease = opened.admission, observer = repository.bindPresence(lease);
    const invoke = (operation, ...extra) => execFileSync(process.execPath,
      [fileURLToPath(import.meta.url), operation, file, JSON.stringify(lease), ...extra],
      { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    const remote = invoke('publish');
    assert.deepEqual(repository.exchangePresence(lease, observer, null), [[-2, cursor]]);
    invoke('leave', remote);
    assert.deepEqual(repository.exchangePresence(lease, observer, null), []);
    assert.deepEqual(await room.snapshot(), opened.snapshot);
    process.stdout.write('Separate Node processes publish and clear the same cursor without revising the document.\n');
  } finally {
    editor.destroy(); doc.destroy(); repository.close();
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('fountain-presence-process-')) throw new Error('Unsafe cleanup path.');
    await rm(root, { recursive: true, force: true });
  }
}

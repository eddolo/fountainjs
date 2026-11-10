import assert from 'node:assert/strict';

// Modules are injected so the same contract exercises ESM, isolated CommonJS,
// and a genuinely packed/installed consumer without mixing Yjs constructors.
export async function checkRetainedYjs(core, retained, Y, loadLegacy, room, assertLegacyDeferred, defaultEntry) {
  const create = defaultEntry?.createYjsCollaborationExtension ?? retained.createRetainedYjsCollaborationExtension;
  const retainedNames = ['RetainedYjsCollaborationAdapter', 'createRetainedYjsCollaborationExtension', 'captureRetainedCheckpoint', 'restoreRetainedCheckpoint'];
  for (const name of retainedNames) {
    assert.equal(typeof retained[name], 'function', `Missing retained export: ${name}`);
    assert.equal(core[name], undefined, `Retained preview leaked into the default entry: ${name}`);
  }
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof globalThis.MutationObserver, 'undefined');
  const { CoreExtension, Selection, composeExtensions, createEditor, getCollaborationState,
    insertText, toggleQuote, toggleList, setMark, splitBlock, undoCollaboration, redoCollaboration } = core;
  const content = { type: 'doc', attrs: { audit: 'packed' }, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
    { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } },
  ] };
  const make = (document, id, admission) => {
    const kit = composeExtensions([CoreExtension, create({
      document, user: { id, name: id, color: '#7048e8' }, captureTimeout: 0, ...(admission ? { admission } : {}),
    })]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    if (defaultEntry) assert.ok(core.getCollaborationAdapter(editor) instanceof defaultEntry.YjsCollaborationAdapter);
    return editor;
  };
  let cases = 0;
  for (const reverse of [false, true]) for (const kind of ['quote', 'bullet', 'ordered', 'task', 'mark', 'split']) {
    const a = new Y.Doc(), left = make(a, 'left'), b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const right = make(b, 'right');
    const sync = () => {
      const first = Y.encodeStateAsUpdate(a), second = Y.encodeStateAsUpdate(b);
      if (reverse) { Y.applyUpdate(b, first); Y.applyUpdate(a, second); }
      else { Y.applyUpdate(a, second); Y.applyUpdate(b, first); }
      for (const editor of [left, right]) assert.equal(getCollaborationState(editor).status, 'connected', `${kind} disconnected`);
      assert.deepEqual(left.getJSON(), right.getJSON(), `${kind} did not converge`);
    };
    try {
      const image = left.state.doc.child(1).toJSON();
      left.dispatch(left.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
      assert.equal(insertText(left, 'X'), true);
      right.dispatch(right.createTransaction().setSelection(kind === 'mark' ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
      assert.equal(kind === 'quote' ? toggleQuote(right) : kind === 'mark' ? setMark(right, 'strong') : kind === 'split' ? splitBlock(right) : toggleList(right, kind), true);
      sync();
      if (kind === 'split') assert.deepEqual(left.state.doc.content.slice(0, 2).map(node => node.textContent), ['AlXp', 'ha']);
      else assert.equal(left.state.doc.child(0).textContent, 'AlXpha');
      assert.deepEqual(left.state.doc.content.at(-1).toJSON(), image);
      assert.deepEqual(left.state.doc.attrs, { audit: 'packed' });
      assert.equal(undoCollaboration(right), true); sync();
      assert.equal(left.state.doc.child(0).type.name, 'paragraph');
      assert.equal(left.state.doc.child(0).textContent, 'AlXpha');
      assert.equal(redoCollaboration(right), true); sync();
      const checkpoint = await retained.captureRetainedCheckpoint(a, left.state.schema, 'packed-v1');
      const restored = await retained.restoreRetainedCheckpoint(checkpoint, left.state.schema, 'packed-v1');
      try { assert.deepEqual(restored.baseDocument.toJSON(), left.getJSON()); }
      finally { restored.document.destroy(); }
      cases++;
    } finally { left.destroy(); right.destroy(); a.destroy(); b.destroy(); }
  }
  const wrapDocs = [303, 202, 101].map(clientID => {
    const document = new Y.Doc();
    document.clientID = clientID;
    return document;
  });
  const wrapper = make(wrapDocs[0], 'quote');
  const initial = Y.encodeStateAsUpdate(wrapDocs[0]);
  for (const document of wrapDocs.slice(1)) Y.applyUpdate(document, initial);
  const authors = [wrapper, make(wrapDocs[1], 'ordered'), make(wrapDocs[2], 'bullet')];
  const mergeWraps = (type) => {
    const updates = wrapDocs.map(document => Y.encodeStateAsUpdate(document));
    for (const document of wrapDocs) for (const update of updates) Y.applyUpdate(document, update);
    for (const editor of authors) {
      assert.equal(getCollaborationState(editor).status, 'connected');
      assert.equal(editor.state.doc.child(0).type.name, type);
      assert.equal(editor.state.doc.child(0).textContent, 'AlXpha');
    }
  };
  try {
    for (const editor of authors) editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    assert.equal(toggleQuote(authors[0]), true);
    assert.equal(toggleList(authors[1], 'ordered'), true);
    assert.equal(insertText(authors[2], 'X'), true);
    assert.equal(toggleList(authors[2], 'bullet'), true);
    mergeWraps('blockquote');
    assert.equal(undoCollaboration(authors[0]), true);
    mergeWraps('ordered_list');
    assert.equal(undoCollaboration(authors[1]), true);
    mergeWraps('bullet_list');
    cases++;
  } finally {
    for (const editor of authors) editor.destroy();
    for (const document of wrapDocs) document.destroy();
  }
  // Admission is usable without importing any private source/backend class.
  const seedDoc = new Y.Doc(), seed = make(seedDoc, 'seed');
  try {
    const checkpoint = await retained.captureRetainedCheckpoint(seedDoc, seed.state.schema, 'packed-v1');
    const epoch = globalThis.crypto.randomUUID();
    const snapshot = { key: 'packed-room', epoch, revision: 0, phase: 'active', protocol: 'retained', checkpoint };
    if (room) {
      assert.equal(core.openYjsRoom, undefined);
      assertLegacyDeferred?.();
      assert.equal(room.createRetainedYjsCollaborationExtension, retained.createRetainedYjsCollaborationExtension);
      assert.equal(room.captureRetainedCheckpoint, retained.captureRetainedCheckpoint);
      assert.equal(typeof room.captureLegacyCheckpoint, 'function');
      const offer = { key: snapshot.key, epoch, revision: 0, protocol: 'retained', room: checkpoint.manifest.room, identity: checkpoint.manifest.roomId };
      const open = () => room.openYjsRoom({
        expected: { key: snapshot.key }, schema: seed.state.schema, schemaVersion: 'packed-v1',
        open: async protocols => { assert.deepEqual(protocols, ['retained']); return offer; },
        admit: async accepted => { assert.deepEqual(accepted, offer); return snapshot; },
      });
      const bound = await open();
      const replacement = await open();
      let starts = 0;
      const extension = bound.createExtension({ user: { id: 'verified', name: 'Verified', color: '#7048e8' }, provider: { connect() { starts++; } } });
      assert.equal(starts, 0);
      const kit = composeExtensions([CoreExtension, extension]);
      const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: bound.baseDocument.toJSON() });
      try {
        assert.equal(starts, 1);
        assert.ok(core.getCollaborationAdapter(editor) instanceof retained.RetainedYjsCollaborationAdapter);
        assert.deepEqual(editor.getJSON(), seed.getJSON());
        const fragment = bound.document.getXmlFragment(bound.lease.room);
        bound.document.transact(() => {
          const replacement = fragment.get(0).clone();
          fragment.delete(0, 1);
          fragment.insert(0, [replacement]);
        }, 'retired-provider');
        const received = Y.encodeStateAsUpdate(bound.document);
        assert.equal(getCollaborationState(editor).status, 'error');
        assert.match(getCollaborationState(editor).error.message, /admitted room root/);
        assert.equal(undoCollaboration(editor), false);
        editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Local: '));
        assert.ok(editor.state.doc.textContent.startsWith('Local: '));
        assert.deepEqual(Y.encodeStateAsUpdate(bound.document), received);
        const installed = core.replaceCollaborationAdapter(editor, () => replacement.createAdapter({
          user: { id: 'replacement', name: 'Replacement', color: '#7048e8' },
        }));
        assert.equal(installed, true);
        assert.equal(getCollaborationState(editor).status, 'connected');
        assert.deepEqual(editor.getJSON(), seed.getJSON());
        assert.equal(undoCollaboration(editor), false);
      } finally { editor.destroy(); replacement.document.destroy(); bound.document.destroy(); }
      assertLegacyDeferred?.();
      cases++;
    }
    const target = new Y.Doc(); let started = 0, bound;
    const kit = composeExtensions([CoreExtension, create({
      document: target, user: { id: 'joined', name: 'Joined', color: '#7048e8' },
      provider: { connect() { assert.ok(bound); started++; } },
      admission: { schemaVersion: 'packed-v1', load: () => snapshot, authority: { key: snapshot.key, bind: lease => { bound = lease; } } },
    })]);
    const joined = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    try {
      for (let i = 0; i < 200 && getCollaborationState(joined).status === 'connecting'; i++) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(getCollaborationState(joined).status, 'connected');
      assert.equal(started, 1); assert.equal(bound.epoch, epoch); assert.ok(Object.isFrozen(bound));
      assert.deepEqual(joined.getJSON(), seed.getJSON());
      assert.equal(undoCollaboration(joined), false);
      cases++;
    } finally { joined.destroy(); target.destroy(); }
    // Existing XML data is preserved and refused, never automatically migrated.
    const legacy = loadLegacy();
    assert.equal(legacy.openYjsRoom, undefined);
    for (const name of retainedNames) assert.equal(legacy[name], undefined, `Retained preview leaked into /yjs: ${name}`);
    const oldDoc = new Y.Doc();
    const oldKit = composeExtensions([CoreExtension, legacy.createYjsCollaborationExtension({ document: oldDoc, user: { id: 'old', name: 'Old', color: '#7048e8' } })]);
    const old = createEditor({ schema: oldKit.schema, plugins: oldKit.plugins, content });
    old.destroy();
    const before = Y.encodeStateAsUpdate(oldDoc), refused = make(oldDoc, 'refused');
    try { assert.equal(getCollaborationState(refused).status, 'error'); assert.deepEqual(Y.encodeStateAsUpdate(oldDoc), before); cases++; }
    finally { refused.destroy(); oldDoc.destroy(); }
  } finally { seed.destroy(); seedDoc.destroy(); }
  return cases;
}

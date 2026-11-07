// @vitest-environment node
import * as Y from 'yjs';
import { expect, it } from 'vitest';
import { retainedHttpReceipt, restoreRetainedHttpReceipt } from '../examples/backends/retained-http-delta';
import { CoreExtension, composeExtensions, createEditor } from '../src';
import type { DocumentRoomSnapshot } from '../src/yjs/document-room';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { applyRetainedRoomUpdate } from '../src/yjs/retained-room-store';

const paragraph = 'The team used a validated, shared incident report to preserve every local edit. '.repeat(180);

it.each([true, false])('reconstructs authoritative insertion and deletion receipts with gc=%s', async gc => {
  const document = new Y.Doc({ gc });
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({
    document, user: { id: 'ada', name: 'Ada', color: '#7048e8' },
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: paragraph }] }] },
  });
  try {
    const base = await captureRetainedCheckpoint(document, editor.state.schema, 'delta-test');
    const basis = { updateSha256: base.manifest.updateSha256, vector: Y.encodeStateVectorFromUpdate(base.update) };
    editor.dispatch(editor.createTransaction().replaceText([0, 0], 2, 14, ' revised '));
    const checkpoint = await applyRetainedRoomUpdate(base, editor.state.schema, 'delta-test', Y.encodeStateAsUpdate(document, basis.vector));
    const snapshot: DocumentRoomSnapshot = { key: 'paper', epoch: 'test-epoch', revision: 1, protocol: 'retained', phase: 'active', checkpoint };
    const receipt = retainedHttpReceipt(snapshot, basis);
    if (!('delta' in receipt)) throw new Error('Expected a delta for a small edit to a large checkpoint.');
    expect(receipt.delta.length).toBeLessThan(checkpoint.update.length / 10);
    expect(await restoreRetainedHttpReceipt(receipt, base)).toEqual(snapshot);
    await expect(restoreRetainedHttpReceipt({ ...receipt, baseUpdateSha256: '0'.repeat(64) }, base)).rejects.toThrow('accepted checkpoint');
    await expect(restoreRetainedHttpReceipt({ ...receipt, manifest: { ...receipt.manifest, updateSha256: '0'.repeat(64) } }, base)).rejects.toThrow('checksum');
    expect(retainedHttpReceipt(snapshot, { ...basis, vector: new Uint8Array(16_385) })).toBe(snapshot);
    expect(retainedHttpReceipt(snapshot, { ...basis, vector: new Uint8Array([255]) })).toBe(snapshot);
    expect(retainedHttpReceipt(snapshot)).toBe(snapshot);
  } finally { editor.destroy(); document.destroy(); }
});

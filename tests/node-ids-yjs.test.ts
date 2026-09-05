// @vitest-environment node

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  CoreExtension,
  composeExtensions,
  createEditor,
  type CollaborationUser,
  type Editor,
  type NodeJSON,
} from '../src';
import { createStableNodeIdsExtension, inspectStableNodeIds } from '../src/node-ids';
import { createYjsCollaborationExtension } from '../src/yjs';

const ada: CollaborationUser = { id: 'ada', name: 'Ada', color: '#a855f7' };
const grace: CollaborationUser = { id: 'grace', name: 'Grace', color: '#10b981' };

const initial = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    attrs: { nodeId: 'shared-id' },
    content: [{ type: 'text', text: 'Shared' }],
  }],
} as const;

function createPeer(document: Y.Doc, user: CollaborationUser, stable: boolean, content: NodeJSON): Editor {
  const extensions = [
    CoreExtension,
    ...(stable ? [createStableNodeIdsExtension()] : []),
    createYjsCollaborationExtension({ document, user }),
  ];
  const kit = composeExtensions(extensions);
  return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
}

function sync(left: Y.Doc, right: Y.Doc): void {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate, 'right-peer');
  Y.applyUpdate(right, leftUpdate, 'left-peer');
}

describe('stable identities through Yjs', () => {
  it('repairs a duplicate from a legacy peer and writes the convergent repair back to Yjs', () => {
    expect(typeof document).toBe('undefined');
    const legacyDocument = new Y.Doc();
    const legacy = createPeer(legacyDocument, ada, false, initial);
    const stableDocument = new Y.Doc();
    Y.applyUpdate(stableDocument, Y.encodeStateAsUpdate(legacyDocument), 'initial-sync');
    const stable = createPeer(stableDocument, grace, true, legacy.getJSON());

    const copied = legacy.state.doc.child(0);
    expect(legacy.dispatch(legacy.state.createTransaction().replace(1, 1, [copied]))).toBe(true);
    Y.applyUpdate(stableDocument, Y.encodeStateAsUpdate(legacyDocument), 'legacy-peer');

    expect(inspectStableNodeIds(stable.state.doc)).toEqual([]);
    const stableIds = stable.state.doc.content.map((node) => node.attrs.nodeId);
    expect(stableIds[0]).toBe('shared-id');
    expect(stableIds[1]).toMatch(/^fjs-/);
    expect(stableIds[1]).not.toBe(stableIds[0]);

    sync(legacyDocument, stableDocument);
    expect(legacy.getJSON()).toEqual(stable.getJSON());
    expect(legacy.state.doc.content.map((node) => node.attrs.nodeId)).toEqual(stableIds);
  });
});

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
import { createWidgetExtension, defineWidget, updateWidget } from '../src/widgets';
import { createYjsCollaborationExtension } from '../src/yjs';

const ada: CollaborationUser = { id: 'ada', name: 'Ada', color: '#7c3aed' };
const grace: CollaborationUser = { id: 'grace', name: 'Grace', color: '#db2777' };

const profileWidget = defineWidget({
  name: 'profile_field',
  attributes: {
    title: { default: '', validate: (value) => typeof value === 'string' },
    color: { default: '#000000', validate: (value) => /^#[0-9a-f]{6}$/i.test(String(value)) },
  },
});

const initial: NodeJSON = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Collaborative widget' }] },
    { type: 'profile_field', attrs: { title: 'Owner', color: '#000000' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
  ],
};

function createPeer(document: Y.Doc, user: CollaborationUser, content: NodeJSON): Editor {
  const kit = composeExtensions([
    CoreExtension,
    createWidgetExtension(profileWidget),
    createYjsCollaborationExtension({ document, user }),
  ]);
  return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
}

function sync(left: Y.Doc, right: Y.Doc): void {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate, 'right-peer');
  Y.applyUpdate(right, leftUpdate, 'left-peer');
}

describe('portable widgets through Yjs', () => {
  it('propagates remote widget state and merges concurrent independent attributes', () => {
    expect(typeof document).toBe('undefined');
    const leftDocument = new Y.Doc();
    const left = createPeer(leftDocument, ada, initial);
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const right = createPeer(rightDocument, grace, left.getJSON());

    expect(updateWidget(left, profileWidget, [1], { title: 'Incident commander' })).toBe(true);
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'left-peer');
    expect(right.state.doc.child(1).attrs.title).toBe('Incident commander');

    expect(updateWidget(left, profileWidget, [1], { title: 'Primary owner' })).toBe(true);
    expect(updateWidget(right, profileWidget, [1], { color: '#10b981' })).toBe(true);
    sync(leftDocument, rightDocument);

    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.state.doc.child(1).attrs).toMatchObject({ title: 'Primary owner', color: '#10b981' });
  });
});

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  CoreExtension,
  composeExtensions,
  createEditor,
  defineExtension,
  getCollaborationState,
  reconnectCollaboration,
  setNodeAttributes,
  undoCollaboration,
  type CollaborationUser,
  type Editor,
  type NodeJSON,
} from '../src';
import {
  defineStructuredAttribute,
  insertStructuredAttributeItems,
  setStructuredAttribute,
} from '../src/structured-attributes';
import { createYjsCollaborationExtension } from '../src/yjs';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';

const ada: CollaborationUser = { id: 'ada', name: 'Ada', color: '#a855f7' };
const linus: CollaborationUser = { id: 'linus', name: 'Linus', color: '#10b981' };

const panelExtension = defineExtension({
  name: 'structured-panel-yjs',
  nodes: {
    structured_panel: {
      group: 'block',
      atom: true,
      attrs: {
        nodeId: { validate: (value) => typeof value === 'string' },
        config: { validate: (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value)) },
      },
      toDOM: () => ['div', { 'data-structured-panel': '' }, 'Panel'],
    },
  },
});

const configDefinition = defineStructuredAttribute({
  nodeType: 'structured_panel',
  attribute: 'config',
  root: 'object',
});

const content: NodeJSON = {
  type: 'doc',
  content: [{
    type: 'structured_panel',
    attrs: {
      nodeId: 'panel-1',
      config: {
        title: 'Launch',
        layout: { columns: 2, compact: false },
        filters: [{ field: 'status', value: 'open' }],
      },
    },
  }],
};

function createCollaborativeEditor(
  document: Y.Doc,
  user: CollaborationUser,
  initial: NodeJSON = content,
): Editor {
  const collaboration = createYjsCollaborationExtension({
    document,
    user,
    captureTimeout: 0,
    structuredAttributes: { definitions: [configDefinition] },
  });
  const kit = composeExtensions([CoreExtension, panelExtension, collaboration]);
  return createEditor({ schema: kit.schema, plugins: kit.plugins, content: initial });
}

function cloneDocument(source: Y.Doc): Y.Doc {
  const target = new Y.Doc();
  Y.applyUpdate(target, Y.encodeStateAsUpdate(source), 'initial-sync');
  return target;
}

function sync(left: Y.Doc, right: Y.Doc): void {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate, 'right-peer');
  Y.applyUpdate(right, leftUpdate, 'left-peer');
}

function config(editor: Editor): any {
  return editor.state.doc.child(0).attrs.config;
}

describe('granular Yjs structured attributes', () => {
  it.each([
    ['legacy', createYjsCollaborationExtension],
    ['retained', createRetainedYjsCollaborationExtension],
  ] as const)('keeps the draft after a %s adapter rejects a local edit and a peer keeps writing', (_format, extension) => {
    const initial: NodeJSON = { type: 'doc', content: [
      content.content![0], { type: 'paragraph', content: [{ type: 'text', text: 'Original note' }] },
    ] };
    const mount = (document: Y.Doc, user: CollaborationUser) => {
      const kit = composeExtensions([CoreExtension, panelExtension, extension({
        document, user, structuredAttributes: { definitions: [configDefinition] },
      })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: initial });
    };
    const leftDocument = new Y.Doc(), left = mount(leftDocument, ada);
    const rightDocument = cloneDocument(leftDocument), right = mount(rightDocument, linus);
    try {
      left.dispatch(left.createTransaction().insertText([1, 0], 0, 'Shared '));
      sync(leftDocument, rightDocument);
      const shared = Y.encodeStateAsUpdate(leftDocument);
      left.dispatch(left.createTransaction().replace(1, 1, [left.state.doc.child(0)]));
      expect(getCollaborationState(left)?.error?.message).toMatch(/Duplicate collaboration node ID.*Preserve the local draft/);
      expect(Y.encodeStateAsUpdate(leftDocument)).toEqual(shared);
      const draft = left.getJSON();
      expect(undoCollaboration(left)).toBe(false);
      right.dispatch(right.createTransaction().insertText([1, 0], 0, 'Peer '));
      sync(leftDocument, rightDocument);
      expect(left.getJSON()).toEqual(draft);
      expect(right.getText()).toContain('Peer Shared Original note');
      const received = Y.encodeStateAsUpdate(leftDocument);
      left.dispatch(left.createTransaction().insertText([2, 0], 0, 'Local '));
      expect(left.getText()).toContain('Local Shared Original note');
      expect(Y.encodeStateAsUpdate(leftDocument)).toEqual(received);
      expect(reconnectCollaboration(left)).toBe(false);
      expect(getCollaborationState(left)?.status).toBe('error');
    } finally { left.destroy(); right.destroy(); leftDocument.destroy(); rightDocument.destroy(); }
  });

  it.each([
    ['legacy', createYjsCollaborationExtension],
    ['retained', createRetainedYjsCollaborationExtension],
  ] as const)('preserves unowned map entries while the %s editor edits, deletes, and undoes', (_format, extension) => {
    const display = defineStructuredAttribute({ nodeType: 'structured_panel', attribute: 'display', root: 'object' });
    const initial: NodeJSON = { type: 'doc', content: [
      { type: 'structured_panel', attrs: { ...content.content![0].attrs, display: { theme: 'light' } } },
      { type: 'paragraph', content: [{ type: 'text', text: 'Keep this paragraph.' }] },
    ] };
    const mount = (document: Y.Doc, user: CollaborationUser, definitions: typeof configDefinition[]) => {
      const kit = composeExtensions([CoreExtension, panelExtension, extension({
        document, user, captureTimeout: 0, structuredAttributes: { definitions },
      })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: initial });
    };
    const seed = new Y.Doc();
    const author = mount(seed, ada, [configDefinition, display]);
    const copy = cloneDocument(seed);
    const older = mount(copy, linus, [configDefinition]);
    try {
      const map = copy.getMap('fountain:structured-attributes');
      const configKey = 'v1:["structured_panel","panel-1","config"]';
      const displayKey = 'v1:["structured_panel","panel-1","display"]';
      const savedDisplay = map.get(displayKey) as Y.Map<unknown>;
      expect(savedDisplay.get('theme')).toBe('light');
      copy.transact(() => map.set('host:unrelated', 'keep me'), 'another-client');

      expect(setStructuredAttribute(older, [0], configDefinition, ['layout', 'columns'], 4)).toBe(true);
      expect(config(older).layout.columns).toBe(4);
      expect(map.get(displayKey)).toBe(savedDisplay);
      expect(map.get('host:unrelated')).toBe('keep me');
      sync(seed, copy);
      expect(author.state.doc.child(0).attrs.display).toEqual({ theme: 'light' });
      expect(config(author).layout.columns).toBe(4);

      older.dispatch(older.createTransaction().replaceNode([0], []));
      expect(map.has(configKey)).toBe(false);
      expect(map.get(displayKey)).toBe(savedDisplay);
      expect(map.get('host:unrelated')).toBe('keep me');
      expect(undoCollaboration(older)).toBe(true);
      expect(config(older).layout.columns).toBe(4);
      expect(map.has(configKey)).toBe(true);
      expect(map.get(displayKey)).toBe(savedDisplay);
    } finally { older.destroy(); author.destroy(); copy.destroy(); seed.destroy(); }
  });

  it('merges concurrent edits to separate nested object fields without changing Fountain JSON', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada);
    const rightDocument = cloneDocument(leftDocument);
    const right = createCollaborativeEditor(rightDocument, linus);

    expect(setStructuredAttribute(left, [0], configDefinition, ['layout', 'columns'], 4)).toBe(true);
    expect(setStructuredAttribute(right, [0], configDefinition, ['layout', 'compact'], true)).toBe(true);
    sync(leftDocument, rightDocument);

    expect(left.getJSON()).toEqual(right.getJSON());
    expect(config(left)).toMatchObject({ layout: { columns: 4, compact: true } });
    expect(left.getJSON()).toEqual({
      type: 'doc',
      content: [{
        type: 'structured_panel',
        attrs: {
          nodeId: 'panel-1',
          config: {
            title: 'Launch',
            layout: { columns: 4, compact: true },
            filters: [{ field: 'status', value: 'open' }],
          },
        },
      }],
    });
    const root = leftDocument.getXmlFragment('fountain').get(0) as Y.XmlElement;
    const canonical = root.get(0) as Y.XmlElement;
    expect(JSON.parse(canonical.getAttribute('fountain:attr:config') as string)).toMatchObject({
      layout: { columns: 4, compact: true },
    });
  });

  it('merges separate fields inside an existing shared array object', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada);
    const rightDocument = cloneDocument(leftDocument);
    const right = createCollaborativeEditor(rightDocument, linus);

    expect(setStructuredAttribute(left, [0], configDefinition, ['filters', 0, 'field'], 'workflow')).toBe(true);
    expect(setStructuredAttribute(right, [0], configDefinition, ['filters', 0, 'value'], 'closed')).toBe(true);
    sync(leftDocument, rightDocument);

    expect(left.getJSON()).toEqual(right.getJSON());
    expect(config(left).filters).toEqual([{ field: 'workflow', value: 'closed' }]);
  });

  it('preserves concurrent array insertions from both authors', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada);
    const rightDocument = cloneDocument(leftDocument);
    const right = createCollaborativeEditor(rightDocument, linus);

    expect(insertStructuredAttributeItems(left, [0], configDefinition, ['filters'], 1, [
      { field: 'owner', value: 'ada' },
    ])).toBe(true);
    expect(insertStructuredAttributeItems(right, [0], configDefinition, ['filters'], 1, [
      { field: 'priority', value: 'high' },
    ])).toBe(true);
    sync(leftDocument, rightDocument);

    expect(left.getJSON()).toEqual(right.getJSON());
    expect(config(left).filters).toHaveLength(3);
    expect(config(left).filters).toEqual(expect.arrayContaining([
      { field: 'status', value: 'open' },
      { field: 'owner', value: 'ada' },
      { field: 'priority', value: 'high' },
    ]));
  });

  it('undoes only the local nested field and preserves a remote nested field', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada);
    const rightDocument = cloneDocument(leftDocument);
    const right = createCollaborativeEditor(rightDocument, linus);

    expect(setStructuredAttribute(left, [0], configDefinition, ['layout', 'columns'], 4)).toBe(true);
    sync(leftDocument, rightDocument);
    expect(setStructuredAttribute(right, [0], configDefinition, ['layout', 'compact'], true)).toBe(true);
    sync(leftDocument, rightDocument);

    expect(undoCollaboration(left)).toBe(true);
    expect(config(left).layout).toEqual({ columns: 2, compact: true });
    sync(leftDocument, rightDocument);
    expect(left.getJSON()).toEqual(right.getJSON());
  });

  it('applies a valid direct nested Yjs update and repairs canonical flat JSON', () => {
    const document = new Y.Doc();
    const editor = createCollaborativeEditor(document, ada);
    const store = document.getMap('fountain:structured-attributes');
    const root = [...store.values()][0] as Y.Map<unknown>;
    const layout = root.get('layout') as Y.Map<unknown>;

    document.transact(() => layout.set('columns', 5), 'provider-peer');

    expect(config(editor).layout.columns).toBe(5);
    const documentRoot = document.getXmlFragment('fountain').get(0) as Y.XmlElement;
    const canonical = documentRoot.get(0) as Y.XmlElement;
    expect(JSON.parse(canonical.getAttribute('fountain:attr:config') as string).layout.columns).toBe(5);
  });

  it('fails closed for missing identities and hostile nested shared values', () => {
    const missingId: NodeJSON = {
      type: 'doc',
      content: [{ type: 'structured_panel', attrs: { nodeId: '', config: { title: 'Unsafe' } } }],
    };
    const invalidDocument = new Y.Doc();
    const invalid = createCollaborativeEditor(invalidDocument, ada, missingId);
    expect(getCollaborationState(invalid)).toMatchObject({
      status: 'error', error: { recoverable: true },
    });

    const document = new Y.Doc();
    const editor = createCollaborativeEditor(document, ada);
    const before = editor.getJSON();
    const store = document.getMap('fountain:structured-attributes');
    const root = [...store.values()][0] as Y.Map<unknown>;
    document.transact(() => root.set('__proto__', 'hostile'), 'hostile-peer');
    expect(editor.getJSON()).toEqual(before);
    expect(getCollaborationState(editor)).toMatchObject({
      status: 'error', error: { recoverable: true },
    });
  });

  it('preflights local structured values before changing the shared canonical tree', () => {
    const document = new Y.Doc();
    const editor = createCollaborativeEditor(document, ada);
    const documentRoot = document.getXmlFragment('fountain').get(0) as Y.XmlElement;
    const panel = documentRoot.get(0) as Y.XmlElement;
    const canonicalBefore = panel.getAttribute('fountain:attr:config');

    expect(setNodeAttributes(editor, [0], {
      config: { ...config(editor), unsupported: new Date('2026-01-01T00:00:00Z') },
    })).toBe(true);

    expect(panel.getAttribute('fountain:attr:config')).toBe(canonicalBefore);
    expect(getCollaborationState(editor)).toMatchObject({
      status: 'error', error: { recoverable: true },
    });
  });
});

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  CoreExtension,
  composeExtensions,
  createEditor,
  defineExtension,
  getCollaborationState,
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
});

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  HTMLExporter,
  MarkdownExporter,
  MarkdownImporter,
  Selection,
  TextExporter,
  composeExtensions,
  createCommandManager,
  createCoreCollaborationExtension,
  createEditor,
  createHistoryPlugin,
  defineExtension,
  insertText,
  getCollaborationState,
  type CollaborationAdapterContext,
  undo,
} from '../src/headless';
import { createYjsCollaborationExtension } from '../src/yjs';

const portableDocument = defineExtension({
  name: 'portable-document',
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseHTML: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline', inline: true },
  },
  marks: {
    strong: { parseHTML: [{ tag: 'strong' }], toDOM: () => ['strong', 0] },
  },
  commands: { insertText },
});

describe('platform-neutral core entry', () => {
  it('composes, edits, undoes, and converts a document in pure Node.js', () => {
    expect('document' in globalThis).toBe(false);
    const kit = composeExtensions([portableDocument]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: [createHistoryPlugin()],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Portable' }] }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 8)));
    const commands = createCommandManager(editor, kit.commands);

    expect(commands.commands.insertText(' core')).toBe(true);
    expect(TextExporter.export(editor.state)).toBe('Portable core');
    expect(undo(editor)).toBe(true);
    expect(TextExporter.export(editor.state)).toBe('Portable');

    const parsed = MarkdownImporter.parse('**Server** document', editor.state.schema);
    expect(MarkdownExporter.export(parsed)).toBe('**Server** document');
    expect(HTMLExporter.export(parsed, { document: false })).toBe('<p><strong>Server</strong> document</p>');
    editor.destroy();
  });

  it('runs collaboration state and remote transactions without a DOM renderer', () => {
    expect('document' in globalThis).toBe(false);
    let context: CollaborationAdapterContext | undefined;
    let localUpdates = 0;
    const collaboration = createCoreCollaborationExtension({
      adapter: () => ({
        connect(value) { context = value; },
        onLocalUpdate() { localUpdates += 1; },
      }),
    });
    const kit = composeExtensions([portableDocument, collaboration]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Local' }] }],
      },
    });

    expect(context).toBeDefined();
    expect(getCollaborationState(editor)?.status).toBe('connected');
    context?.setPresences([{
      clientId: 'remote-1',
      user: { id: 'grace', name: 'Grace', color: '#d93682' },
      selection: { anchor: 1, head: 3 },
    }]);
    expect(getCollaborationState(editor)?.presences[0]?.user.name).toBe('Grace');

    context?.applyRemoteDocument({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remote' }] }],
    });
    expect(TextExporter.export(editor.state)).toBe('Remote');
    expect(localUpdates).toBe(0);

    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    createCommandManager(editor, kit.commands).commands.insertText(' edit');
    expect(localUpdates).toBe(1);
    editor.destroy();
  });

  it('runs the first-party Yjs adapter in pure Node.js without a fake DOM', () => {
    expect('document' in globalThis).toBe(false);
    expect('window' in globalThis).toBe(false);
    const ydoc = new Y.Doc();
    const collaboration = createYjsCollaborationExtension({
      document: ydoc,
      user: { id: 'server', name: 'Server worker', color: '#6d45ff' },
    });
    const kit = composeExtensions([portableDocument, collaboration]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yjs' }] }],
      },
    });

    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    createCommandManager(editor, kit.commands).commands.insertText(' server');
    expect(TextExporter.export(editor.state)).toBe('Yjs server');
    expect(ydoc.getXmlFragment('fountain').length).toBeGreaterThan(0);
    editor.destroy();
    ydoc.destroy();
  });
});

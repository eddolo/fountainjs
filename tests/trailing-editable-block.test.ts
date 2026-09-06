import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  CoreExtension,
  HistoryExtension,
  REBROADCAST_APPEND_TRANSACTION_META,
  TRAILING_EDITABLE_BLOCK_META,
  TrailingEditableBlockExtension,
  composeExtensions,
  createCollaborationExtension,
  createEditor,
  createTrailingEditableBlockExtension,
  createTrailingEditableBlockTransaction,
  ensureTrailingEditableBlocks,
  getCollaborationState,
  redo,
  undo,
  type CollaborationAdapterContext,
  type NodeJSON,
} from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';

const paragraph = (text = '') => ({ type: 'paragraph', content: [{ type: 'text', text }] }) as const;
const rule = { type: 'horizontal_rule' } as const;

function createTrailingEditor(content: NodeJSON, extra = [TrailingEditableBlockExtension]) {
  const kit = composeExtensions([CoreExtension, HistoryExtension, ...extra]);
  return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
}

describe('trailing editable block extension', () => {
  it('adds one visible editable block after a non-text block and remains idempotent', () => {
    const editor = createTrailingEditor({ type: 'doc', content: [rule] });
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['horizontal_rule', 'paragraph']);
    expect(editor.state.doc.child(1).child(0).text).toBe('');
    expect(ensureTrailingEditableBlocks(editor)).toBe(false);

    const transaction = createTrailingEditableBlockTransaction(editor.state);
    expect(transaction).toBeNull();
    editor.destroy();
  });

  it('recognizes paragraphs, headings, and code blocks as directly editable endings', () => {
    for (const final of [
      paragraph('Paragraph'),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
      { type: 'code_block', attrs: { language: 'text', lineNumbers: true }, content: [{ type: 'text', text: 'code' }] },
    ] satisfies NodeJSON[]) {
      const editor = createTrailingEditor({ type: 'doc', content: [final] });
      expect(editor.state.doc.childCount).toBe(1);
      editor.destroy();
    }
  });

  it('repairs configured nested roots from the deepest container outward', () => {
    const nested = createTrailingEditableBlockExtension({ rootTypes: ['doc', 'blockquote'] });
    const editor = createTrailingEditor({
      type: 'doc',
      content: [{ type: 'blockquote', content: [rule] }],
    }, [nested]);

    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['blockquote', 'paragraph']);
    expect(editor.state.doc.child(0).content.map((node) => node.type.name)).toEqual(['horizontal_rule', 'paragraph']);
    editor.destroy();
  });

  it('supports a schema-valid custom trailing text block and rejects invalid configuration', () => {
    const headingTail = createTrailingEditableBlockExtension({ nodeType: 'heading', nodeAttributes: { level: 3 } });
    const editor = createTrailingEditor({ type: 'doc', content: [rule] }, [headingTail]);
    expect(editor.state.doc.child(1).type.name).toBe('heading');
    expect(editor.state.doc.child(1).attrs.level).toBe(3);
    editor.destroy();

    const invalid = createTrailingEditableBlockExtension({ nodeType: 'horizontal_rule' });
    const kit = composeExtensions([CoreExtension, invalid]);
    expect(() => createEditor({ schema: kit.schema, plugins: kit.plugins })).toThrow('must be a non-atomic block');
  });

  it('keeps the automatic repair in the originating undo step', () => {
    const editor = createTrailingEditor({ type: 'doc', content: [paragraph('Start'), paragraph('Replace me')] });
    const horizontalRule = editor.state.schema.node('horizontal_rule');
    editor.dispatch(editor.state.createTransaction().replace(1, 2, [horizontalRule]));
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'horizontal_rule', 'paragraph']);

    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph']);
    expect(editor.state.doc.textContent).toBe('StartReplace me');
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'horizontal_rule', 'paragraph']);
    editor.destroy();
  });

  it('marks a remote structural repair for one provider-independent rebroadcast', () => {
    let context!: CollaborationAdapterContext;
    const updates = vi.fn();
    const collaboration = createCollaborationExtension({
      adapter: () => ({
        connect: (next) => { context = next; },
        onLocalUpdate: updates,
      }),
    });
    const kit = composeExtensions([CoreExtension, TrailingEditableBlockExtension, collaboration]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [paragraph('Local')] } });

    expect(context.applyRemoteDocument({ type: 'doc', content: [paragraph('Remote'), rule] }, { origin: 'peer' })).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'horizontal_rule', 'paragraph']);
    expect(updates).toHaveBeenCalledTimes(1);
    const update = updates.mock.calls[0]?.[0];
    expect(update.transaction.getMeta(TRAILING_EDITABLE_BLOCK_META)).toEqual([[]]);
    expect(update.transaction.getMeta(REBROADCAST_APPEND_TRANSACTION_META)).toBe(true);
    editor.destroy();
  });

  it('converges the repaired ending through the Yjs adapter without duplicate blocks', () => {
    const leftDocument = new Y.Doc();
    const leftCollaboration = createYjsCollaborationExtension({ document: leftDocument, user: { id: 'left', name: 'Left', color: '#6d5dfc' } });
    const leftKit = composeExtensions([CoreExtension, TrailingEditableBlockExtension, leftCollaboration]);
    const left = createEditor({ schema: leftKit.schema, plugins: leftKit.plugins, content: { type: 'doc', content: [paragraph('Shared')] } });
    expect(getCollaborationState(left)?.status).toBe('connected');
    expect(leftDocument.getXmlFragment('fountain').length).toBe(1);

    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const rightCollaboration = createYjsCollaborationExtension({ document: rightDocument, user: { id: 'right', name: 'Right', color: '#d63384' } });
    const rightKit = composeExtensions([CoreExtension, TrailingEditableBlockExtension, rightCollaboration]);
    const right = createEditor({ schema: rightKit.schema, plugins: rightKit.plugins, content: left.getJSON() });

    left.dispatch(left.state.createTransaction().replace(left.state.doc.childCount, left.state.doc.childCount, [left.state.schema.node('horizontal_rule')]));
    expect(leftDocument.getXmlFragment('fountain').toString()).toContain('horizontal_rule');
    const leftUpdate = Y.encodeStateAsUpdate(leftDocument);
    const rightUpdate = Y.encodeStateAsUpdate(rightDocument);
    Y.applyUpdate(leftDocument, rightUpdate, 'right-peer');
    Y.applyUpdate(rightDocument, leftUpdate, 'left-peer');

    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'horizontal_rule', 'paragraph']);
    left.destroy();
    right.destroy();
  });
});

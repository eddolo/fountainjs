// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  EditorView,
  Plugin,
  Selection,
  composeExtensions,
  connectCollaboration,
  createCollaborationExtension,
  createEditor,
  disconnectCollaboration,
  getCollaborationState,
  insertText,
  reconnectCollaboration,
  type CollaborationAdapter,
  type CollaborationAdapterContext,
  type CollaborationLocalUpdate,
} from '../src';

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] } as const;
}

describe('provider-independent collaboration boundary', () => {
  it('connects one adapter per editor, publishes local updates, and applies remote documents without echo', () => {
    let context!: CollaborationAdapterContext;
    const updates: CollaborationLocalUpdate[] = [];
    const adapter: CollaborationAdapter = {
      connect: vi.fn((value) => { context = value; }),
      disconnect: vi.fn(),
      onLocalUpdate: vi.fn((update) => { updates.push(update); }),
      onLocalSelection: vi.fn(),
    };
    const extension = createCollaborationExtension({ adapter: () => adapter });
    const kit = composeExtensions([CoreExtension, extension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: {
      type: 'doc', content: [paragraph('Alpha')],
    } });

    expect(getCollaborationState(editor)?.status).toBe('connected');
    expect(adapter.connect).toHaveBeenCalledTimes(1);
    expect(insertText(editor, ' Beta')).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].before.textContent).toBe('Alpha');
    expect(updates[0].document.textContent).toBe(' BetaAlpha');

    const remote = { type: 'doc', content: [paragraph('Remote document')] } as const;
    expect(context.applyRemoteDocument(remote, { origin: 'peer-7' })).toBe(true);
    expect(editor.state.doc.textContent).toBe('Remote document');
    expect(updates).toHaveLength(1);
    expect(adapter.onLocalSelection).toHaveBeenCalled();

    expect(disconnectCollaboration(editor)).toBe(true);
    expect(getCollaborationState(editor)?.status).toBe('disconnected');
    expect(connectCollaboration(editor)).toBe(true);
    expect(reconnectCollaboration(editor)).toBe(true);
    expect(adapter.connect).toHaveBeenCalledTimes(3);
    expect(adapter.disconnect).toHaveBeenCalledTimes(2);

    editor.destroy();
    expect(adapter.disconnect).toHaveBeenCalledTimes(3);
    expect(context.applyRemoteDocument(remote)).toBe(false);
  });

  it('validates remote trees and contains adapter failures', async () => {
    let context!: CollaborationAdapterContext;
    const adapter: CollaborationAdapter = {
      connect: (value) => { context = value; },
      onLocalUpdate: () => { throw new Error('transport failed'); },
    };
    const extension = createCollaborationExtension({ adapter: () => adapter });
    const kit = composeExtensions([CoreExtension, extension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: {
      type: 'doc', content: [paragraph('Safe')],
    } });

    expect(context.applyRemoteDocument({ type: 'doc', content: [{ type: 'unknown' }] })).toBe(false);
    expect(getCollaborationState(editor)).toMatchObject({
      status: 'error', error: { recoverable: true },
    });
    expect(editor.state.doc.textContent).toBe('Safe');

    expect(reconnectCollaboration(editor)).toBe(true);
    expect(insertText(editor, '!')).toBe(true);
    await Promise.resolve();
    expect(getCollaborationState(editor)?.error?.message).toBe('transport failed');
    expect(editor.state.doc.textContent).toBe('!Safe');
  });

  it('normalizes untrusted presence and renders accessible range and caret decorations', () => {
    let context!: CollaborationAdapterContext;
    const extension = createCollaborationExtension({
      adapter: () => ({ connect: (value) => { context = value; } }),
    });
    const kit = composeExtensions([CoreExtension, extension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: {
      type: 'doc', content: [paragraph('Alpha Beta')],
    } });
    context.setPresences([
      {
        clientId: 'peer-b',
        user: { id: 'user-b', name: '<Ada & team>', color: '#A855F7', avatar: 'javascript:alert(1)' },
        selection: { anchor: 1, head: 6 },
      },
      {
        clientId: 'peer-a',
        user: { id: 'user-a', name: 'Invalid colour', color: 'url(javascript:alert(1))' },
        selection: { anchor: 0, head: 999_999 },
      },
    ]);

    const state = getCollaborationState(editor);
    expect(state?.presences).toHaveLength(1);
    expect(state?.presences[0]).toMatchObject({
      clientId: 'peer-b', user: { name: '<Ada & team>', color: '#a855f7' },
    });
    expect(state?.presences[0]?.user.avatar).toBeUndefined();
    expect(Object.isFrozen(state?.presences)).toBe(true);

    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const range = mount.querySelector<HTMLElement>('[data-fountain-collaborator="peer-b"]:not(.fountain-collaboration-caret)');
    const caret = mount.querySelector<HTMLElement>('.fountain-collaboration-caret');
    expect(range?.textContent).toBe('Alpha');
    expect(range?.style.getPropertyValue('--fountain-collaborator-color')).toBe('#a855f7');
    expect(caret?.getAttribute('aria-label')).toBe("<Ada & team>'s cursor");
    expect(caret?.textContent).toBe('<Ada & team>');
    expect(mount.querySelector('script')).toBeNull();
    view.destroy();
  });

  it('respects transaction filters for remote updates and can start disconnected', () => {
    let context!: CollaborationAdapterContext;
    const collaboration = createCollaborationExtension({
      autoConnect: false,
      adapter: () => ({ connect: (value) => { context = value; } }),
    });
    const denyRemote = new Plugin({
      filterTransaction: (transaction) => transaction.getMeta('fountain$collaborationRemote') !== true,
    });
    const kit = composeExtensions([CoreExtension, collaboration]);
    const editor = createEditor({
      schema: kit.schema, plugins: [...kit.plugins, denyRemote], content: { type: 'doc', content: [paragraph('Local')] },
    });

    expect(getCollaborationState(editor)?.status).toBe('disconnected');
    expect(connectCollaboration(editor)).toBe(true);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(context.applyRemoteDocument({ type: 'doc', content: [paragraph('Denied')] })).toBe(false);
    expect(editor.state.doc.textContent).toBe('Local');
  });

  it('applies a remote selection even when the collaborative document is unchanged', () => {
    let context!: CollaborationAdapterContext;
    const collaboration = createCollaborationExtension({
      adapter: () => ({ connect: (value) => { context = value; } }),
    });
    const kit = composeExtensions([CoreExtension, collaboration]);
    const editor = createEditor({
      schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [paragraph('Alpha')] },
    });

    expect(context.applyRemoteDocument(editor.state.doc, {
      selection: Selection.cursor([0, 0], 3), origin: 'undo-selection',
    })).toBe(true);
    expect(editor.state.selection).toMatchObject({ path: [0, 0], from: 3, to: 3 });
  });

  it('surfaces rejected asynchronous connections and allows retry', async () => {
    let attempts = 0;
    const disconnect = vi.fn();
    const extension = createCollaborationExtension({
      adapter: () => ({
        connect: async () => {
          attempts++;
          if (attempts === 1) throw new Error('offline');
        },
        disconnect,
      }),
    });
    const kit = composeExtensions([CoreExtension, extension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    await Promise.resolve();
    await Promise.resolve();

    expect(getCollaborationState(editor)).toMatchObject({ status: 'error', error: { message: 'offline' } });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(connectCollaboration(editor)).toBe(true);
    await Promise.resolve();
    expect(getCollaborationState(editor)?.status).toBe('connected');
  });
});

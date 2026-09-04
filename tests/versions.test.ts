import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  CoreExtension,
  CoreSchemaSpec,
  HistoryExtension,
  Schema,
  composeExtensions,
  createEditor,
  createHistoryPlugin,
  insertText,
  undo,
  type NodeJSON,
} from '../src';
import { createTrackedChangesExtension, findTrackedSuggestions } from '../src/tracked-changes';
import { createYjsCollaborationExtension } from '../src/yjs';
import {
  InMemoryVersionProvider,
  VersionConflictError,
  VersionController,
  compareVersionDocuments,
  versionContentFingerprint,
  versionContentsEqual,
  type VersionProvider,
  type VersionSaveInput,
} from '../src/versions';

const paragraph = (text: string): NodeJSON => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});

const document = (text: string): NodeJSON => ({ type: 'doc', content: [paragraph(text)] });

function saveInput(
  id: string,
  operationId: string,
  content: NodeJSON,
  expectedHeadId: string | null,
): VersionSaveInput {
  return {
    id,
    operationId,
    documentId: 'document-1',
    name: `Named ${id}`,
    kind: 'manual',
    createdAt: '2026-09-04T12:00:00.000Z',
    createdBy: { id: 'ada', name: 'Ada Lovelace' },
    content,
    contentFingerprint: versionContentFingerprint(content),
    expectedHeadId,
  };
}

function ids() {
  let value = 0;
  return (kind: 'version' | 'operation') => `${kind}-${++value}`;
}

afterEach(() => vi.useRealTimers());

describe('portable document versions', () => {
  it('uses stable key-order-independent content identities without mutating input', () => {
    const left = {
      type: 'doc',
      attrs: { language: 'en', direction: 'ltr' },
      content: [{ type: 'paragraph', attrs: { align: 'left', id: 'intro' }, content: [{ type: 'text', text: 'Entire sentence' }] }],
    } satisfies NodeJSON;
    const right = {
      content: [{ content: [{ text: 'Entire sentence', type: 'text' }], attrs: { id: 'intro', align: 'left' }, type: 'paragraph' }],
      attrs: { direction: 'ltr', language: 'en' },
      type: 'doc',
    } satisfies NodeJSON;

    expect(versionContentFingerprint(left)).toBe(versionContentFingerprint(right));
    expect(versionContentsEqual(left, right)).toBe(true);
    expect(Object.isFrozen(left)).toBe(false);
    expect(versionContentsEqual(left, document('Different'))).toBe(false);
  });

  it('provides bounded pagination, strict optimistic heads, exact idempotency, and monotonic revisions', async () => {
    const provider = new InMemoryVersionProvider({ maximumVersionsPerDocument: 4 });
    const firstInput = saveInput('v1', 'op1', document('One'), null);
    const first = await provider.save(firstInput);
    expect(await provider.save(firstInput)).toBe(first);
    expect(() => provider.save({ ...firstInput, name: 'Changed request body' })).toThrow(VersionConflictError);
    expect(() => provider.save(saveInput('stale', 'op-stale', document('Stale'), null))).toThrow(VersionConflictError);

    await provider.save(saveInput('v2', 'op2', document('Two'), 'v1'));
    await provider.save(saveInput('v3', 'op3', document('Three'), 'v2'));
    await provider.remove?.({ documentId: 'document-1', versionId: 'v3', operationId: 'remove-v3' });
    await provider.remove?.({ documentId: 'document-1', versionId: 'v3', operationId: 'remove-v3' });
    const fourth = await provider.save(saveInput('v4', 'op4', document('Four'), 'v2'));
    expect(fourth.revision).toBe(4);

    const firstPage = await provider.list({ documentId: 'document-1', limit: 2 });
    expect(firstPage.versions.map((version) => [version.id, version.revision])).toEqual([['v4', 4], ['v2', 2]]);
    expect(firstPage.nextCursor).toBe('2');
    const secondPage = await provider.list({ documentId: 'document-1', limit: 2, cursor: firstPage.nextCursor });
    expect(secondPage.versions.map((version) => version.id)).toEqual(['v1']);
    expect(Object.isFrozen(firstPage.versions)).toBe(true);
  });

  it('reports full text, structure, formatting, and attribute changes without ellipses', () => {
    const schema = new Schema(CoreSchemaSpec);
    const before = schema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [{ type: 'text', text: 'This deliberately long sentence must remain completely visible.', marks: [{ type: 'strong' }] }],
      }],
    });
    const after = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { align: 'center' },
          content: [{ type: 'text', text: 'This deliberately long sentence must remain completely visible and exact.', marks: [{ type: 'em' }] }],
        },
        paragraph('A complete newly inserted paragraph.'),
      ],
    });
    const comparison = compareVersionDocuments(before, after,
      { id: 'v1', label: 'Before', contentFingerprint: versionContentFingerprint(before.toJSON()) },
      { id: 'v2', label: 'After', contentFingerprint: versionContentFingerprint(after.toJSON()) });

    expect(comparison.identical).toBe(false);
    expect(comparison.counts).toEqual({ inserted: 2, deleted: 0, replaced: 0, formatting: 1, attributes: 1 });
    expect(comparison.changes.find((change) => change.kind === 'text-inserted')).toMatchObject({
      beforeText: '',
      afterText: ' and exact',
    });
    expect(comparison.changes.find((change) => change.kind === 'node-inserted')?.afterNode)
      .toEqual(schema.nodeFromJSON(paragraph('A complete newly inserted paragraph.')).toJSON());
    expect(JSON.stringify(comparison)).not.toContain('…');

    const separatedInsertions = compareVersionDocuments(
      schema.nodeFromJSON({ type: 'doc', content: [paragraph('A'), paragraph('B'), paragraph('C')] }),
      schema.nodeFromJSON({ type: 'doc', content: [paragraph('A'), paragraph('X'), paragraph('B'), paragraph('Y'), paragraph('C')] }),
      { id: 'v3', label: 'Three blocks', contentFingerprint: 'fjs1-0000000000000000' },
      { id: 'v4', label: 'Five blocks', contentFingerprint: 'fjs1-0000000000000001' },
    );
    expect(separatedInsertions.changes.map((change) => [change.kind, change.afterPath])).toEqual([
      ['node-inserted', [1]],
      ['node-inserted', [3]],
    ]);
  });

  it('saves, previews without editing, compares, safely restores, and undoes restoration as one transaction', async () => {
    const provider = new InMemoryVersionProvider();
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [createHistoryPlugin()],
      content: document('Original complete paragraph.'),
    });
    const controller = new VersionController({
      editor,
      provider,
      documentId: 'document-1',
      user: { id: 'ada', name: 'Ada Lovelace' },
      idFactory: ids(),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
      autoLoad: false,
    });
    const events: string[] = [];
    controller.on((event) => events.push(event.type));
    const original = await controller.save({ name: 'Complete first draft' });

    editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, editor.getText().length, 'Current unsaved paragraph.'));
    expect(controller.getSnapshot().dirty).toBe(true);
    const preview = await controller.preview(original.id);
    expect(preview.content).toEqual(editor.state.schema.nodeFromJSON(document('Original complete paragraph.')).toJSON());
    expect(editor.getText()).toBe('Current unsaved paragraph.');
    const comparison = await controller.compare(original.id);
    expect(comparison.changes.find((change) => change.kind === 'text-replaced')).toMatchObject({
      beforeText: 'Original complete',
      afterText: 'Current unsaved',
    });

    const restored = await controller.restore(original.id);
    expect(restored).toMatchObject({ kind: 'restore', restoredFromVersionId: original.id });
    expect(editor.getText()).toBe('Original complete paragraph.');
    expect(controller.getSnapshot().versions.map((version) => version.kind)).toEqual(['restore', 'backup', 'manual']);
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('Current unsaved paragraph.');
    expect(events).toEqual([
      'version-saved', 'preview-opened', 'comparison-created',
      'version-saved', 'version-saved', 'version-restored',
    ]);
    controller.destroy();
  });

  it('does not turn restoration into tracked suggestions', async () => {
    const trackedIds = ids();
    const tracked = createTrackedChangesExtension({
      user: { id: 'ada', name: 'Ada Lovelace' },
      idFactory: () => trackedIds('version'),
    });
    const kit = composeExtensions([CoreExtension, HistoryExtension, tracked]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: document('Original') });
    const controller = new VersionController({
      editor,
      provider: new InMemoryVersionProvider(),
      documentId: 'document-1',
      user: { id: 'ada', name: 'Ada Lovelace' },
      idFactory: ids(),
      autoLoad: false,
    });
    const original = await controller.save();
    insertText(editor, 'Suggested');
    expect(findTrackedSuggestions(editor.state.doc).length).toBeGreaterThan(0);
    await controller.restore(original.id);
    expect(editor.getText()).toBe('Original');
    expect(findTrackedSuggestions(editor.state.doc)).toEqual([]);
    controller.destroy();
  });

  it('propagates a restoration through the optional Yjs collaboration adapter', async () => {
    const leftDocument = new Y.Doc();
    const leftCollaboration = createYjsCollaborationExtension({
      document: leftDocument,
      user: { id: 'ada', name: 'Ada', color: '#6d4aff' },
    });
    const leftKit = composeExtensions([CoreExtension, leftCollaboration]);
    const left = createEditor({ schema: leftKit.schema, plugins: leftKit.plugins, content: document('Original shared draft') });
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-version-sync');
    const rightCollaboration = createYjsCollaborationExtension({
      document: rightDocument,
      user: { id: 'grace', name: 'Grace', color: '#d23877' },
    });
    const rightKit = composeExtensions([CoreExtension, rightCollaboration]);
    const right = createEditor({ schema: rightKit.schema, plugins: rightKit.plugins, content: document('Original shared draft') });
    const sync = () => {
      Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'left-version-sync');
      Y.applyUpdate(leftDocument, Y.encodeStateAsUpdate(rightDocument), 'right-version-sync');
    };
    const controller = new VersionController({
      editor: left,
      provider: new InMemoryVersionProvider(),
      documentId: 'shared-document',
      user: { id: 'ada', name: 'Ada' },
      idFactory: ids(),
      autoLoad: false,
    });
    const original = await controller.save();
    left.dispatch(left.state.createTransaction().replaceText([0, 0], 0, left.getText().length, 'Current shared draft'));
    sync();
    expect(right.getText()).toBe('Current shared draft');

    await controller.restore(original.id);
    sync();
    expect(left.getText()).toBe('Original shared draft');
    expect(right.getText()).toBe('Original shared draft');
    controller.destroy();
    left.destroy();
    right.destroy();
    leftDocument.destroy();
    rightDocument.destroy();
  });

  it('debounces optional automatic versions and lets the host turn them off', async () => {
    vi.useFakeTimers();
    const provider = new InMemoryVersionProvider();
    const editor = createEditor({ schema: CoreSchemaSpec, content: document('A') });
    const controller = new VersionController({
      editor,
      provider,
      documentId: 'document-1',
      user: { id: 'ada', name: 'Ada Lovelace' },
      idFactory: ids(),
      autoLoad: false,
      autoSave: { delayMs: 250, name: () => 'Automatic checkpoint' },
    });
    editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, 1, 'B'));
    editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, 1, 'C'));
    await vi.advanceTimersByTimeAsync(249);
    expect((await provider.list({ documentId: 'document-1' })).versions).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect((await provider.list({ documentId: 'document-1' })).versions).toMatchObject([{ kind: 'automatic', name: 'Automatic checkpoint' }]);

    editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, 1, 'D'));
    controller.setAutoSave(false);
    await vi.advanceTimersByTimeAsync(500);
    expect((await provider.list({ documentId: 'document-1' })).versions).toHaveLength(1);
    controller.destroy();
  });

  it('enforces host permissions once and rejects a provider that substitutes saved content', async () => {
    const base = new InMemoryVersionProvider();
    const editor = createEditor({ schema: CoreSchemaSpec, content: document('Safe') });
    const denied = new VersionController({
      editor,
      provider: base,
      documentId: 'document-1',
      user: { id: 'reader', name: 'Read Only' },
      permissions: { save: () => false },
      autoLoad: false,
    });
    const errors = vi.fn();
    denied.on((event) => { if (event.type === 'error') errors(event.error); });
    await expect(denied.save()).rejects.toThrow('cannot perform');
    expect(denied.getSnapshot().error).toMatchObject({ code: 'permission-denied', recoverable: false });
    expect(errors).toHaveBeenCalledTimes(1);
    denied.destroy();

    const substituting: VersionProvider = {
      list: (request) => base.list(request),
      load: (request) => base.load(request),
      save: async (input) => ({
        ...(await base.save(input)),
        id: 'different-id',
      }),
    };
    const guarded = new VersionController({
      editor,
      provider: substituting,
      documentId: 'document-1',
      user: { id: 'ada', name: 'Ada Lovelace' },
      autoLoad: false,
    });
    await expect(guarded.save()).rejects.toThrow('different record');
    expect(guarded.getSnapshot().error?.code).toBe('provider-error');
    guarded.destroy();
  });

  it('aborts pending provider work on destroy without publishing a late error', async () => {
    let receivedSignal: AbortSignal | undefined;
    const provider: VersionProvider = {
      list: () => ({ versions: [] }),
      load: () => undefined,
      save: (input) => new Promise((_resolve, reject) => {
        receivedSignal = input.signal;
        input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
      }),
    };
    const controller = new VersionController({
      editor: createEditor({ schema: CoreSchemaSpec, content: document('Pending') }),
      provider,
      documentId: 'document-1',
      user: { id: 'ada', name: 'Ada' },
      autoLoad: false,
    });
    const errors = vi.fn();
    controller.on((event) => { if (event.type === 'error') errors(event); });
    const saving = controller.save();
    await Promise.resolve();
    expect(receivedSignal?.aborted).toBe(false);
    controller.destroy();
    await expect(saving).rejects.toMatchObject({ name: 'AbortError' });
    expect(receivedSignal?.aborted).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it('never replaces the editor when the pre-restore backup fails', async () => {
    const memory = new InMemoryVersionProvider();
    let saves = 0;
    const provider: VersionProvider = {
      list: (request) => memory.list(request),
      load: (request) => memory.load(request),
      save: (input) => {
        saves += 1;
        if (saves === 2) throw new Error('Backup storage is unavailable.');
        return memory.save(input);
      },
    };
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], content: document('Saved source') });
    const controller = new VersionController({
      editor,
      provider,
      documentId: 'document-1',
      user: { id: 'ada', name: 'Ada' },
      idFactory: ids(),
      autoLoad: false,
    });
    const source = await controller.save();
    editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, editor.getText().length, 'Unsaved work'));
    await expect(controller.restore(source.id)).rejects.toThrow('Backup storage is unavailable.');
    expect(editor.getText()).toBe('Unsaved work');
    expect(controller.getSnapshot().error).toMatchObject({ code: 'provider-error', recoverable: true });
    expect((await memory.list({ documentId: 'document-1' })).versions).toHaveLength(1);
    controller.destroy();
  });
});

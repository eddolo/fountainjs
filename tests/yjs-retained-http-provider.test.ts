// @vitest-environment node
import * as Y from 'yjs';
import { expect, it, vi } from 'vitest';
import { CoreExtension, composeExtensions, createEditor } from '../src';
import { createRetainedHttpProvider } from '../examples/backends/retained-http-provider';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint } from '../src/yjs/retained-checkpoint';

it('backs off repeated failures without typing resetting the retry timer', async () => {
  const document = new Y.Doc();
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({
    document, user: { id: 'ada', name: 'Ada', color: '#7048e8' },
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Incident report' }] }] },
  });
  const checkpoint = await captureRetainedCheckpoint(document, editor.state.schema, 'transport-test');
  const lease = { key: 'room', epoch: crypto.randomUUID(), revision: 0, protocol: 'retained' as const,
    room: checkpoint.manifest.room, identity: checkpoint.manifest.roomId };
  const snapshot = { key: lease.key, epoch: lease.epoch, revision: 0, phase: 'active' as const, protocol: lease.protocol, checkpoint };
  const failure = Object.assign(new Error('Offline'), { code: 'network' });
  const poll = vi.fn(async () => { throw failure; });
  const write = vi.fn(async () => { throw failure; });
  const onStatus = vi.fn();
  const provider = createRetainedHttpProvider({ document, bound: () => ({ lease, snapshot }), poll, write, merge: async () => {}, onStatus });
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await provider.connect();
    await vi.advanceTimersByTimeAsync(400);
    expect(poll).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting', failure);
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Pending '));
    await vi.advanceTimersByTimeAsync(374);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(749);
    expect(write).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(2);
    for (const delay of [1_500, 3_000, 6_000, 6_000]) {
      const before = write.mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(write).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(write).toHaveBeenCalledTimes(before + 1);
    }
    provider.disconnect();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(write).toHaveBeenCalledTimes(6);
    expect(editor.getText()).toBe('Pending Incident report');
  } finally {
    provider.disconnect();
    vi.useRealTimers();
    random.mockRestore();
    editor.destroy();
    document.destroy();
  }
});

it('refuses a write receipt that changes the checkpoint under the same revision', async () => {
  const document = new Y.Doc();
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({
    document, user: { id: 'ada', name: 'Ada', color: '#7048e8' },
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  const checkpoint = await captureRetainedCheckpoint(document, editor.state.schema, 'transport-test');
  const lease = { key: 'room', epoch: crypto.randomUUID(), revision: 0, protocol: 'retained' as const,
    room: checkpoint.manifest.room, identity: checkpoint.manifest.roomId };
  const snapshot = { key: lease.key, epoch: lease.epoch, revision: 0, phase: 'active' as const, protocol: lease.protocol, checkpoint };
  const write = vi.fn<() => Promise<typeof snapshot>>();
  const merge = vi.fn(async () => {});
  const onStatus = vi.fn();
  const provider = createRetainedHttpProvider({
    document, bound: () => ({ lease, snapshot }), poll: async () => null, write, merge, onStatus,
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await provider.connect();
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Pending brief'));
    write.mockResolvedValue({ ...snapshot, checkpoint: await captureRetainedCheckpoint(document, editor.state.schema, 'transport-test') });
    await vi.advanceTimersByTimeAsync(75);
    expect(write).toHaveBeenCalledOnce();
    expect(merge).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith('disconnected', expect.objectContaining({ message: expect.stringContaining('without advancing its revision') }));
    expect(editor.getText()).toBe('Pending brief');
  } finally {
    provider.disconnect();
    vi.useRealTimers();
    editor.destroy();
    document.destroy();
  }
});

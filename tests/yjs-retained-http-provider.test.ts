// @vitest-environment node
import * as Y from 'yjs';
import { expect, it, vi } from 'vitest';
import { CoreExtension, composeExtensions, createEditor } from '../src';
import { createRetainedHttpProvider } from '../examples/backends/retained-http-provider';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint } from '../src/yjs/retained-checkpoint';

it.each([false, true])('reuses a verified admission only when its installed bytes still match (local change: %s)', async diverged => {
  const document = new Y.Doc();
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({
    document, user: { id: 'ada', name: 'Ada', color: '#7048e8' },
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  const checkpoint = await captureRetainedCheckpoint(document, editor.state.schema, 'transport-test');
  const lease = { key: 'room', epoch: crypto.randomUUID(), revision: 0, protocol: 'retained' as const,
    room: checkpoint.manifest.room, identity: checkpoint.manifest.roomId };
  const snapshot = { key: lease.key, epoch: lease.epoch, revision: 0, phase: 'active' as const, protocol: lease.protocol, checkpoint };
  const merge = vi.fn(async () => {});
  const onStatus = vi.fn();
  const onSnapshot = vi.fn();
  const provider = createRetainedHttpProvider({
    document, bound: () => ({ lease, snapshot, admittedSnapshot: snapshot }),
    poll: async () => null, write: async () => snapshot, merge, onStatus, onSnapshot,
  });
  try {
    if (diverged) editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Pending note'));
    await provider.connect();
    expect(merge).toHaveBeenCalledTimes(diverged ? 1 : 0);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    expect(onStatus).toHaveBeenLastCalledWith('connected');
    if (diverged) expect(editor.getText()).toBe('Pending note');
  } finally {
    provider.disconnect();
    editor.destroy();
    document.destroy();
  }
});

it.each(['network', 'frozen'])('backs off repeated %s failures without typing resetting the retry timer', async code => {
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
  const failure = Object.assign(new Error('Room temporarily unavailable'), { code });
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
    poll.mockClear();
    const retry = code === 'frozen' ? poll : write;
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Pending '));
    await vi.advanceTimersByTimeAsync(374);
    expect(retry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(retry).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(749);
    expect(retry).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(retry).toHaveBeenCalledTimes(2);
    for (const delay of [1_500, 3_000, 6_000, 6_000]) {
      const before = retry.mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(retry).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(retry).toHaveBeenCalledTimes(before + 1);
    }
    provider.disconnect();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(retry).toHaveBeenCalledTimes(6);
    if (code === 'frozen') expect(write).not.toHaveBeenCalled();
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

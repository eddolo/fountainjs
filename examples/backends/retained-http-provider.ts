import * as Y from 'yjs';
import type { DocumentRoomSnapshot } from '../../src/yjs/document-room';
import type { RetainedAdmissionLease } from '../../src/yjs/retained-admission';
import type { RetainedCheckpoint } from '../../src/yjs/retained-checkpoint';

interface BoundTransport {
  readonly lease: RetainedAdmissionLease;
  readonly snapshot: DocumentRoomSnapshot;
}

interface RetainedHttpOptions {
  readonly document: Y.Doc;
  readonly bound: () => BoundTransport;
  readonly poll: (lease: RetainedAdmissionLease, signal: AbortSignal) => Promise<DocumentRoomSnapshot | null>;
  readonly write: (lease: RetainedAdmissionLease, update: Uint8Array, signal: AbortSignal) => Promise<DocumentRoomSnapshot>;
  readonly merge: (checkpoint: RetainedCheckpoint, signal: AbortSignal) => Promise<void>;
  readonly onStatus: (status: 'connected' | 'reconnecting' | 'disconnected', error?: unknown) => void;
  readonly onSnapshot?: (snapshot: DocumentRoomSnapshot) => void;
}

function checkpointFor(snapshot: DocumentRoomSnapshot, lease: RetainedAdmissionLease): RetainedCheckpoint {
  if (snapshot.key !== lease.key || snapshot.epoch !== lease.epoch || snapshot.protocol !== lease.protocol
    || snapshot.phase !== 'active' || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < lease.revision) {
    throw new Error('Transport received a stale or incompatible room. Local changes were retained.');
  }
  const checkpoint = snapshot.checkpoint as RetainedCheckpoint;
  if (checkpoint.manifest.room !== lease.room || checkpoint.manifest.roomId !== lease.identity) {
    throw new Error('Transport received a different native room. Local changes were retained.');
  }
  return checkpoint;
}

function retryable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'network' || code === 'revision-conflict';
}

/** Application-owned reference provider. It never connects before authority
 * binding. Keep the adapter mounted during a network failure so edits stay in
 * the Y.Doc. Only the transport stops when the authority retires that session. */
export function createRetainedHttpProvider(options: RetainedHttpOptions) {
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const document = options.document;
  let onUpdate: ((_bytes: Uint8Array, _origin: unknown, _document: Y.Doc, transaction: Y.Transaction) => void) | undefined;

  function disconnect() {
    controller?.abort();
    controller = undefined;
    clearTimeout(timer);
    if (onUpdate) document.off('update', onUpdate);
    onUpdate = undefined;
  }

  async function connect() {
    disconnect();
    const session = new AbortController();
    controller = session;
    const { signal } = session;
    const bound = options.bound();
    let lease = bound.lease;
    let vector: Uint8Array;
    let edited = 0, acknowledged = 0;
    let running = false;

    async function accept(snapshot: DocumentRoomSnapshot) {
      const checkpoint = checkpointFor(snapshot, lease);
      await options.merge(checkpoint, signal);
      signal.throwIfAborted();
      vector = Y.encodeStateVectorFromUpdate(checkpoint.update);
      lease = { ...lease, revision: snapshot.revision };
      options.onSnapshot?.(snapshot);
    }

    function schedule(delay: number) {
      if (signal.aborted) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void exchange(); }, delay);
    }

    async function exchange() {
      if (signal.aborted) return;
      running = true;
      const sending = edited;
      let delay: number | undefined;
      try {
        const snapshot = sending > acknowledged
          ? await options.write(lease, Y.encodeStateAsUpdate(document, vector), signal)
          : await options.poll(lease, signal);
        signal.throwIfAborted();
        if (snapshot) {
          const beforeMerge = edited;
          try { await accept(snapshot); }
          catch (error) {
            if (beforeMerge === edited || signal.aborted) throw error;
            // The verified merge candidate was invalidated by another local edit.
            // Keep the old cursor and let the next exchange catch up.
            delay = 75;
            return;
          }
        }
        acknowledged = sending;
        options.onStatus('connected');
      } catch (error) {
        if (signal.aborted) return;
        if (retryable(error)) {
          delay = 500;
          options.onStatus('reconnecting', error);
        } else {
          disconnect();
          options.onStatus('disconnected', error);
        }
      } finally {
        running = false;
        schedule(delay ?? (edited > acknowledged ? 75 : 400));
      }
    }

    try {
      await accept(bound.snapshot);
      const incoming = (bound.snapshot.checkpoint as RetainedCheckpoint).update;
      const local = Y.encodeStateAsUpdate(document);
      if (incoming.length !== local.length || !incoming.every((byte, index) => local[index] === byte)) edited += 1;
      onUpdate = (_bytes, _origin, _document, transaction) => {
        if (!transaction.local) return;
        edited += 1;
        if (!running && edited === acknowledged + 1) schedule(75);
      };
      document.on('update', onUpdate);
      options.onStatus('connected');
      schedule(edited > acknowledged ? 75 : 400);
    } catch (error) {
      if (controller === session) disconnect();
      throw error;
    }
  }

  return { connect, disconnect };
}

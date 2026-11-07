import * as Y from 'yjs';
import type { DocumentRoomSnapshot } from '../../src/yjs/document-room';
import type { RetainedAdmissionLease } from '../../src/yjs/retained-admission';
import type { RetainedCheckpoint } from '../../src/yjs/retained-checkpoint';
import { createRetainedHttpAwareness, type PresencePeer, type PresenceState } from './retained-http-presence';
import { restoreRetainedHttpReceipt, type RetainedDeltaBasis, type RetainedHttpReceipt } from './retained-http-delta';

interface BoundPresence {
  readonly exchange: (lease: RetainedAdmissionLease, state: PresenceState | null, signal: AbortSignal) => Promise<readonly PresencePeer[]>;
  readonly leave: () => Promise<void>;
}

interface BoundTransport {
  readonly lease: RetainedAdmissionLease;
  readonly snapshot: DocumentRoomSnapshot;
  readonly presence?: BoundPresence;
}

interface RetainedHttpOptions {
  readonly document: Y.Doc;
  readonly requestTimeoutMs?: number;
  readonly bound: () => BoundTransport;
  readonly poll: (lease: RetainedAdmissionLease, signal: AbortSignal, basis?: RetainedDeltaBasis) => Promise<RetainedHttpReceipt | null>;
  readonly write: (lease: RetainedAdmissionLease, update: Uint8Array, signal: AbortSignal, basis: RetainedDeltaBasis) => Promise<RetainedHttpReceipt>;
  readonly merge: (checkpoint: RetainedCheckpoint, signal: AbortSignal) => Promise<void>;
  readonly onStatus: (status: 'connected' | 'reconnecting' | 'disconnected', error?: unknown) => void;
  readonly onSnapshot?: (snapshot: DocumentRoomSnapshot) => void;
}

function assertReceiptScope(snapshot: Omit<DocumentRoomSnapshot, 'checkpoint'>, lease: RetainedAdmissionLease): void {
  if (snapshot.key !== lease.key || snapshot.epoch !== lease.epoch || snapshot.protocol !== lease.protocol
    || snapshot.phase !== 'active' || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < lease.revision) {
    throw new Error('Transport received a stale or incompatible room. Local changes were retained.');
  }
}

function checkpointFor(snapshot: DocumentRoomSnapshot, lease: RetainedAdmissionLease): RetainedCheckpoint {
  assertReceiptScope(snapshot, lease);
  const checkpoint = snapshot.checkpoint as RetainedCheckpoint;
  if (checkpoint.manifest.format !== 'fountain-retained-checkpoint/1'
    || checkpoint.manifest.room !== lease.room || checkpoint.manifest.roomId !== lease.identity) {
    throw new Error('Transport received a different native room. Local changes were retained.');
  }
  return checkpoint;
}

function containsSentUpdate(bytes: Uint8Array, vector: Uint8Array, sent: Uint8Array): boolean {
  const state = Y.decodeStateVector(vector);
  const update = Y.decodeUpdate(sent);
  if (update.structs.some(({ id, length }) => (state.get(id.client) ?? 0) < id.clock + length)) return false;
  if (!update.ds.clients.size) return true;

  // A state vector alone cannot acknowledge a deletion. Yjs encodes the
  // checkpoint's delete ranges in increasing order, merging adjacent ranges.
  const deletes = Y.decodeUpdate(bytes).ds.clients;
  for (const [client, pending] of update.ds.clients) {
    const accepted = deletes.get(client) ?? [];
    let index = 0;
    for (const { clock, len } of pending) {
      while (index < accepted.length && accepted[index].clock + accepted[index].len <= clock) index++;
      const range = accepted[index];
      if (!range || range.clock > clock || range.clock + range.len < clock + len) return false;
    }
  }
  return true;
}

function retryable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'network' || code === 'revision-conflict' || code === 'timeout';
}

async function requestWithDeadline<T>(session: AbortSignal, timeoutMs: number, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  session.throwIfAborted();
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([session, timeout]);
  let abort!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    const pending = Promise.resolve().then(() => {
      signal.throwIfAborted();
      return request(signal);
    });
    const value = await Promise.race([stopped, pending]);
    signal.throwIfAborted();
    return value;
  } catch (error) {
    if (!session.aborted && timeout.aborted) {
      throw Object.assign(new Error('The authority request timed out. Local changes were retained.', { cause: error }), { code: 'timeout' });
    }
    throw error;
  } finally { signal.removeEventListener('abort', abort); }
}

/** Application-owned reference provider. It never connects before authority
 * binding. Keep the adapter mounted during a network failure so edits stay in
 * the Y.Doc. Only the transport stops when the authority retires that session. */
export function createRetainedHttpProvider(options: RetainedHttpOptions) {
  const timeoutMs = options.requestTimeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new TypeError('Invalid retained HTTP request timeout.');
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const document = options.document;
  const presence = createRetainedHttpAwareness(document.clientID);
  let onUpdate: ((_bytes: Uint8Array, _origin: unknown, _document: Y.Doc, transaction: Y.Transaction) => void) | undefined;
  let leavePresence: (() => Promise<void>) | undefined;

  function disconnect() {
    controller?.abort();
    controller = undefined;
    clearTimeout(timer);
    if (onUpdate) document.off('update', onUpdate);
    onUpdate = undefined;
    presence.replace([]);
    if (leavePresence) void leavePresence().catch(() => undefined);
    leavePresence = undefined;
  }

  async function connect() {
    disconnect();
    const session = new AbortController();
    controller = session;
    const { signal } = session;
    const bound = options.bound();
    leavePresence = bound.presence?.leave;
    let lease = bound.lease;
    let base: RetainedCheckpoint;
    let basis: RetainedDeltaBasis;
    let edited = 0, acknowledged = 0;
    let retryCount = 0;
    let running = false;
    let presenceRequest: AbortController | undefined;
    let lastPresenceRequest = Number.NEGATIVE_INFINITY;

    function exchangePresence() {
      if (!bound.presence || presenceRequest || performance.now() - lastPresenceRequest < 350) return;
      const request = new AbortController();
      presenceRequest = request;
      lastPresenceRequest = performance.now();
      const deadline = AbortSignal.any([signal, request.signal, AbortSignal.timeout(1_500)]);
      void bound.presence.exchange(lease, presence.local(), deadline).then(peers => {
        if (!deadline.aborted) presence.replace(peers);
      }, () => {
        if (!signal.aborted) presence.replace([]);
      }).finally(() => { presenceRequest = undefined; });
    }

    async function accept(snapshot: DocumentRoomSnapshot, sent?: Uint8Array) {
      const checkpoint = checkpointFor(snapshot, lease);
      const bytes = checkpoint.update;
      if (!(bytes instanceof Uint8Array) || bytes.length !== checkpoint.manifest.bytes || !bytes.length || bytes.length > 64 * 1024 * 1024) {
        throw new Error('Invalid checkpoint update length.');
      }
      const vector = Y.encodeStateVectorFromUpdate(bytes);
      if (sent && !containsSentUpdate(bytes, vector, sent)) {
        throw Object.assign(new Error('The authority checkpoint is missing the sent edit. Retrying local changes.'), { code: 'revision-conflict' });
      }
      await options.merge(checkpoint, signal);
      signal.throwIfAborted();
      base = checkpoint;
      basis = { updateSha256: checkpoint.manifest.updateSha256, vector };
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
      const writing = sending > acknowledged;
      let delay: number | undefined;
      try {
        const update = writing ? Y.encodeStateAsUpdate(document, basis.vector) : undefined;
        const receipt = await requestWithDeadline(signal, timeoutMs, requestSignal => update
          ? options.write(lease, update, requestSignal, basis)
          : options.poll(lease, requestSignal, basis));
        signal.throwIfAborted();
        if (!receipt && writing) throw new Error('The authority returned no write acknowledgement. Local changes were retained.');
        if (receipt) {
          assertReceiptScope('baseUpdateSha256' in receipt ? receipt.snapshot : receipt, lease);
          let snapshot: DocumentRoomSnapshot;
          try { snapshot = await restoreRetainedHttpReceipt(receipt, base); }
          catch (error) {
            signal.throwIfAborted();
            // Fall back once to a newly fenced full receipt. An invalid or
            // empty fallback must never acknowledge the outgoing edit.
            const full = await requestWithDeadline(signal, timeoutMs, requestSignal => options.poll(lease, requestSignal));
            if (!full || 'baseUpdateSha256' in full) throw error;
            snapshot = full;
          }
          signal.throwIfAborted();
          if (writing && snapshot.revision <= lease.revision) throw new Error('The authority did not advance the write revision. Local changes were retained.');
          const beforeMerge = edited;
          try { await accept(snapshot, update); }
          catch (error) {
            if (beforeMerge === edited || signal.aborted) throw error;
            // The verified merge candidate was invalidated by another local edit.
            // Keep the old cursor and let the next exchange catch up.
            delay = 75;
            return;
          }
        }
        acknowledged = sending;
        retryCount = 0;
        options.onStatus('connected');
        exchangePresence();
      } catch (error) {
        if (signal.aborted) return;
        if (retryable(error)) {
          const ceiling = 500 * 2 ** retryCount;
          retryCount = Math.min(retryCount + 1, 4);
          delay = Math.ceil(ceiling * (0.75 + 0.25 * Math.random()));
          presenceRequest?.abort();
          presence.replace([]);
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
        if (!running && retryCount === 0 && edited === acknowledged + 1) schedule(75);
      };
      document.on('update', onUpdate);
      options.onStatus('connected');
      exchangePresence();
      schedule(edited > acknowledged ? 75 : 400);
    } catch (error) {
      if (controller === session) disconnect();
      throw error;
    }
  }

  return { awareness: presence.awareness, connect, disconnect };
}

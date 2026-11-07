import type { NodeJSON } from '../../src/core/schema';
import type { DocumentRoomSnapshot } from '../../src/yjs/document-room';
import type { RetainedAdmissionLease } from '../../src/yjs/retained-admission';
import type { RetainedCheckpoint } from '../../src/yjs/retained-checkpoint';

export interface BrowserDraft {
  readonly schemaVersion: string;
  readonly model: NodeJSON;
  /** Edits made before admission have no native room state. */
  readonly source: {
    readonly lease: RetainedAdmissionLease;
    readonly checkpoint: RetainedCheckpoint;
    /** The visible draft contains edits never represented in this checkpoint. */
    readonly diverged?: true;
  } | null;
}

export interface SavedBrowserDraft extends BrowserDraft {
  readonly scope: string;
  readonly id: string;
  readonly savedAt: number;
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Local draft storage aborted.'));
  });
}

/** The application supplies a database name and a stable account/room/author
 * scope. This is origin-local recovery storage, not an authorization boundary. */
export async function openBrowserDrafts(databaseName: string, scope: string) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('drafts', { keyPath: ['scope', 'id'] });
      store.createIndex('scope', 'scope');
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  database.onversionchange = () => database.close();

  async function write(draft: BrowserDraft, id: string, replace: boolean): Promise<SavedBrowserDraft> {
    const record = { ...draft, scope, id, savedAt: Date.now() };
    const transaction = database.transaction('drafts', 'readwrite', { durability: 'strict' });
    const store = transaction.objectStore('drafts');
    if (replace) store.put(record);
    else store.add(record);
    await committed(transaction);
    return record;
  }

  return {
    save(draft: BrowserDraft): Promise<SavedBrowserDraft> {
      return write(draft, crypto.randomUUID(), false);
    },
    /** One rolling copy per mounted editor. Opening another tab, reloading or
     * explicitly changing sessions never takes ownership of a previous slot. */
    createAutosaveSlot() {
      const id = crypto.randomUUID();
      return (draft: BrowserDraft) => write(draft, id, true);
    },
    async list(): Promise<SavedBrowserDraft[]> {
      const transaction = database.transaction('drafts');
      const request = transaction.objectStore('drafts').index('scope').getAll(scope);
      await committed(transaction);
      return (request.result as SavedBrowserDraft[]).sort((a, b) => b.savedAt - a.savedAt);
    },
    close(): void { database.close(); },
  };
}

/** Coalesce local changes and serialize writes to one recovery slot. A failed
 * write stays pending. A later edit or explicit flush can retry it. */
export function scheduleBrowserDraftAutosave(
  write: () => Promise<void>,
  report: (status: 'pending' | 'saved' | 'failed', error?: unknown) => void,
  delayMs = 300,
) {
  let revision = 0;
  let saved = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let stopped = false;

  async function drain() {
    while (!stopped && saved < revision) {
      const target = revision;
      try { await write(); }
      catch (error) {
        if (stopped) return;
        // A new edit can invalidate an asynchronous checkpoint capture.
        if (target !== revision) continue;
        report('failed', error);
        throw error;
      }
      saved = target;
    }
    if (!stopped && revision > 0) report('saved');
  }

  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    running ??= drain().finally(() => { running = undefined; });
    return running;
  }

  return {
    changed(): void {
      if (stopped) return;
      revision += 1;
      report('pending');
      // Keep the first timer during a burst so continuous typing is not starved.
      if (!running && timer === undefined) timer = setTimeout(() => { void flush().catch(() => undefined); }, delayMs);
    },
    flush,
    stop(): void {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

/** Eligibility only. Restore and validate the checkpoint in isolation, then
 * run ordinary admission and server-side write fencing before sending updates. */
export function isSameDraftSession(draft: BrowserDraft, current: DocumentRoomSnapshot): boolean {
  if (!draft.source || draft.source.diverged || current.protocol !== 'retained' || current.phase !== 'active') return false;
  const { lease, checkpoint } = draft.source;
  const saved = checkpoint.manifest;
  const live = (current.checkpoint as RetainedCheckpoint).manifest;
  return lease.protocol === 'retained' && current.key === lease.key && current.epoch === lease.epoch
    && current.revision >= lease.revision && saved.room === lease.room && live.room === lease.room
    && saved.roomId === lease.identity && live.roomId === lease.identity
    && saved.schemaVersion === draft.schemaVersion && live.schemaVersion === draft.schemaVersion;
}

import type { NodeJSON } from '../../src/core/schema';
import type { DocumentRoomSnapshot } from '../../src/yjs/document-room';
import type { RetainedAdmissionLease } from '../../src/yjs/retained-admission';
import type { RetainedCheckpoint } from '../../src/yjs/retained-checkpoint';

export interface BrowserDraft {
  readonly schemaVersion: string;
  readonly model: NodeJSON;
  /** Edits made before admission have no native room state. */
  readonly source: { readonly lease: RetainedAdmissionLease; readonly checkpoint: RetainedCheckpoint } | null;
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

  return {
    async save(draft: BrowserDraft): Promise<SavedBrowserDraft> {
      const record = structuredClone({ ...draft, scope, id: crypto.randomUUID(), savedAt: Date.now() });
      const transaction = database.transaction('drafts', 'readwrite', { durability: 'strict' });
      // Append, so another tab or a newer session cannot overwrite this copy.
      transaction.objectStore('drafts').add(record);
      await committed(transaction);
      return record;
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

/** Eligibility only. Restore and validate the checkpoint in isolation, then
 * run ordinary admission and server-side write fencing before sending updates. */
export function isSameDraftSession(draft: BrowserDraft, current: DocumentRoomSnapshot): boolean {
  if (!draft.source || current.protocol !== 'retained' || current.phase !== 'active') return false;
  const { lease, checkpoint } = draft.source;
  const saved = checkpoint.manifest;
  const live = (current.checkpoint as RetainedCheckpoint).manifest;
  return lease.protocol === 'retained' && current.key === lease.key && current.epoch === lease.epoch
    && current.revision >= lease.revision && saved.room === lease.room && live.room === lease.room
    && saved.roomId === lease.identity && live.roomId === lease.identity
    && saved.schemaVersion === draft.schemaVersion && live.schemaVersion === draft.schemaVersion;
}

import type { SerializedContentResult } from './serialized_content';
import type { GitLabMarkdownInsertion } from './markdown_insertion';

export interface GitLabUploadContext {
  signal: AbortSignal;
  reportProgress(fraction: number): void;
}
export type GitLabUploadHandler = (file: File, context: GitLabUploadContext) => Promise<string>;
export interface GitLabUploadInsertion {
  readonly operation: 'replace-media';
  insert(source: (signal: AbortSignal) => Promise<string>, signal: AbortSignal): Promise<SerializedContentResult>;
  close(): void;
}
export interface GitLabUploadSnapshot {
  readonly id: string;
  readonly fileName: string;
  readonly status: 'queued' | 'uploading' | 'inserting' | 'failed';
  readonly progress: number;
  readonly errorCode?: string;
  readonly source?: string;
  readonly operation?: 'replace-media';
}
interface UploadEntry {
  id: string;
  file: File;
  status: GitLabUploadSnapshot['status'];
  progress: number;
  markdown?: string;
  errorCode?: string;
  cancel: AbortController;
  insertion?: GitLabUploadInsertion;
}

/** Files remain outside document state; completed tasks release their file handles. */
export class GitLabAttachmentUploads {
  private readonly entries = new Map<string, UploadEntry>();
  private nextId = 0;
  private destroyed = false;

  constructor(
    private readonly insertions: GitLabMarkdownInsertion,
    private readonly upload: GitLabUploadHandler | undefined,
    private readonly changed: (uploads: readonly GitLabUploadSnapshot[]) => void,
    private readonly capacity = 100,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)
      throw new RangeError('INVALID_GITLAB_UPLOAD_CAPACITY');
  }

  get snapshots(): readonly GitLabUploadSnapshot[] {
    return Object.freeze([...this.entries.values()].map(entry => Object.freeze({
      id: entry.id, fileName: entry.file.name, status: entry.status,
      progress: entry.progress, errorCode: entry.errorCode,
      source: entry.status === 'failed' ? entry.markdown : undefined,
      ...(entry.insertion ? { operation: entry.insertion.operation } : {}),
    })));
  }
  get hasFailures(): boolean {
    return [...this.entries.values()].some(entry => entry.status === 'failed');
  }
  get availableSlots(): number {
    return this.destroyed ? 0 : this.capacity - this.entries.size;
  }

  async add(file: File, insertion?: GitLabUploadInsertion): Promise<SerializedContentResult> {
    try {
      if (this.destroyed) throw new Error('GITLAB_UPLOADS_DESTROYED');
      if (!this.upload) throw new Error('GITLAB_UPLOAD_ADAPTER_REQUIRED');
      if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 1024
        || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.type !== 'string')
        throw new TypeError('GITLAB_INVALID_UPLOAD_FILE');
      if (this.entries.size >= this.capacity) throw new Error('GITLAB_UPLOAD_QUEUE_FULL');
    } catch (error) { insertion?.close(); throw error; }
    const entry: UploadEntry = { id: `gitlab-upload-${++this.nextId}`, file,
      status: 'queued', progress: 0, cancel: new AbortController(), insertion };
    this.entries.set(entry.id, entry);
    return this.run(entry);
  }

  retry(id: string): Promise<SerializedContentResult> {
    const entry = this.entries.get(id);
    if (this.destroyed || !entry || entry.status !== 'failed')
      return Promise.reject(new Error('GITLAB_UPLOAD_NOT_RETRYABLE'));
    entry.cancel = new AbortController();
    entry.status = 'queued';
    entry.errorCode = undefined;
    return this.run(entry);
  }

  cancel(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    entry.cancel.abort();
    entry.insertion?.close();
    this.notify();
    return true;
  }

  private async run(entry: UploadEntry): Promise<SerializedContentResult> {
    try {
      const resolveSource = async (signal: AbortSignal): Promise<string> => {
        if (entry.markdown === undefined) {
          entry.status = 'uploading';
          entry.progress = 0;
          this.notify();
          const markdown = await this.upload!(entry.file, { signal,
            reportProgress: fraction => {
              if (signal.aborted || this.destroyed || this.entries.get(entry.id) !== entry
                || !Number.isFinite(fraction)) return;
              entry.progress = Math.max(entry.progress, Math.max(0, Math.min(1, fraction)));
              this.notify();
            },
          });
          if (signal.aborted || this.destroyed || this.entries.get(entry.id) !== entry)
            throw new Error('GITLAB_UPLOAD_CANCELLED');
          if (typeof markdown !== 'string' || !markdown || markdown.length > 16_384)
            throw new Error('GITLAB_INVALID_UPLOAD_RESPONSE');
          entry.markdown = markdown;
        }
        entry.status = 'inserting';
        entry.progress = 1;
        this.notify();
        return entry.markdown;
      };
      const pending = entry.insertion
        ? entry.insertion.insert(resolveSource, entry.cancel.signal)
        : this.insertions.insertFrom(resolveSource, entry.cancel.signal);
      this.notify();
      const result = await pending;
      this.entries.delete(entry.id);
      entry.insertion?.close();
      return result;
    } catch (error) {
      if (this.destroyed || entry.cancel.signal.aborted) return { status: 'superseded' };
      entry.status = 'failed';
      const message = error instanceof Error ? error.message : '';
      entry.errorCode = /^[A-Z][A-Z0-9_]+$/u.test(message) ? message : 'GITLAB_UPLOAD_FAILED';
      throw error;
    } finally {
      this.notify();
    }
  }

  private notify(): void {
    if (!this.destroyed) this.changed(this.snapshots);
  }
  dispose(): void {
    this.destroyed = true;
    for (const entry of this.entries.values()) { entry.cancel.abort(); entry.insertion?.close(); }
    this.entries.clear();
  }
}

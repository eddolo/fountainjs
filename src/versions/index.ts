import { AllSelection, NodeSelection, Selection, type Editor, type Node, type NodeJSON } from '../core';
import { compareVersionDocuments, type VersionComparison } from './diff';
import {
  InMemoryVersionProvider,
  VersionConflictError,
  VersionNotFoundError,
  normalizeDocumentVersion,
  normalizeDocumentVersionSummary,
  normalizeVersionAuthor,
  normalizeVersionListResult,
  versionContentFingerprint,
  versionContentsEqual,
  type DocumentVersion,
  type DocumentVersionKind,
  type DocumentVersionSummary,
  type VersionAuthor,
  type VersionProvider,
  type VersionSaveInput,
} from './model';

export * from './diff';
export * from './model';

export const VERSION_RESTORE_META = 'fountain$versionRestore';
const TRACKED_CHANGES_INTERNAL_META = 'fountain$trackedChangesInternal';
let generatedId = 0;

export type VersionControllerStatus = 'idle' | 'loading' | 'saving' | 'comparing' | 'previewing' | 'restoring' | 'removing' | 'error';
export type VersionPermissionAction = 'save' | 'restore' | 'remove';

export interface VersionControllerError {
  readonly message: string;
  readonly code: 'conflict' | 'not-found' | 'permission-denied' | 'provider-error' | 'invalid-data';
  readonly recoverable: boolean;
}

export interface VersionPermissionContext {
  readonly action: VersionPermissionAction;
  readonly user: VersionAuthor;
  readonly version?: DocumentVersionSummary;
}

export type VersionPermission = (context: VersionPermissionContext) => boolean;

export interface VersionPermissions {
  readonly save?: VersionPermission;
  readonly restore?: VersionPermission;
  readonly remove?: VersionPermission;
}

export interface VersionAutoSaveOptions {
  readonly delayMs?: number;
  readonly name?: (context: { readonly editor: Editor; readonly nextRevision: number }) => string | undefined;
  readonly data?: (context: { readonly editor: Editor; readonly nextRevision: number }) => Readonly<Record<string, unknown>> | undefined;
  readonly shouldSave?: (context: { readonly editor: Editor; readonly dirty: boolean }) => boolean;
}

export interface VersionControllerOptions {
  readonly editor: Editor;
  readonly documentId: string;
  readonly provider: VersionProvider;
  readonly user: VersionAuthor;
  readonly permissions?: VersionPermissions;
  readonly pageSize?: number;
  readonly autoLoad?: boolean;
  readonly autoSave?: false | VersionAutoSaveOptions;
  readonly now?: () => Date | string;
  readonly idFactory?: (kind: 'version' | 'operation') => string;
  /** Call `provider.destroy()` with the controller. Off by default because providers may be shared. */
  readonly destroyProvider?: boolean;
}

export interface VersionControllerSnapshot {
  readonly status: VersionControllerStatus;
  readonly versions: readonly DocumentVersionSummary[];
  readonly nextCursor?: string;
  readonly dirty: boolean;
  readonly autoSaveEnabled: boolean;
  readonly selectedVersionId?: string;
  readonly preview?: DocumentVersion;
  readonly comparison?: VersionComparison;
  readonly error?: VersionControllerError;
}

export interface SaveVersionOptions {
  readonly id?: string;
  readonly name?: string;
  readonly kind?: DocumentVersionKind;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly restoredFromVersionId?: string;
  readonly expectedHeadId?: string | null;
}

export interface RestoreVersionOptions {
  /** Save unsaved current content before replacing it. Defaults to true. */
  readonly saveCurrent?: boolean;
  /** Save the restored state as a new head version. Defaults to true. */
  readonly saveRestored?: boolean;
  readonly backupName?: string;
  readonly restoredName?: string;
}

export type VersionControllerEvent =
  | { readonly type: 'version-saved'; readonly version: DocumentVersion }
  | { readonly type: 'version-removed'; readonly versionId: string }
  | { readonly type: 'version-restored'; readonly source: DocumentVersion; readonly createdVersion?: DocumentVersion }
  | { readonly type: 'preview-opened'; readonly version: DocumentVersion }
  | { readonly type: 'preview-closed' }
  | { readonly type: 'comparison-created'; readonly comparison: VersionComparison }
  | { readonly type: 'error'; readonly error: VersionControllerError };

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 240 && /^[\w.:@/-]+$/.test(value);
}

function validDocumentId(value: string): boolean {
  return value.length > 0 && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value);
}

function now(options: VersionControllerOptions): string {
  const value = options.now?.() ?? new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Version operations require a valid timestamp.');
  return date.toISOString();
}

function id(options: VersionControllerOptions, kind: 'version' | 'operation'): string {
  const supplied = options.idFactory?.(kind);
  if (supplied !== undefined) {
    if (!validId(supplied)) throw new TypeError(`Invalid ${kind} id.`);
    return supplied;
  }
  generatedId += 1;
  return `${kind}-${Date.now().toString(36)}-${generatedId.toString(36)}`;
}

function summary(version: DocumentVersion): DocumentVersionSummary {
  const { content: _content, ...value } = version;
  return Object.freeze(value);
}

function immutableError(error: unknown): VersionControllerError {
  if (error instanceof VersionConflictError) return Object.freeze({ message: error.message, code: 'conflict', recoverable: true });
  if (error instanceof VersionNotFoundError) return Object.freeze({ message: error.message, code: 'not-found', recoverable: true });
  if (error instanceof VersionPermissionDeniedError) return permissionError();
  if (error instanceof TypeError || error instanceof RangeError) {
    return Object.freeze({ message: error.message, code: 'invalid-data', recoverable: false });
  }
  return Object.freeze({
    message: error instanceof Error ? error.message : 'The version provider failed.',
    code: 'provider-error',
    recoverable: true,
  });
}

function selectionAtStart(document: Node) {
  let textPath: readonly number[] | undefined;
  document.descendants((node, path) => {
    if (textPath || !node.isText) return;
    textPath = Object.freeze([...path]);
    return false;
  });
  if (textPath) return Selection.cursor(textPath, 0);
  if (document.childCount) return new NodeSelection(document, [0]);
  return new AllSelection(document);
}

function permissionError(): VersionControllerError {
  return Object.freeze({ message: 'This user cannot perform that version action.', code: 'permission-denied', recoverable: false });
}

class VersionPermissionDeniedError extends Error {
  readonly name = 'VersionPermissionDeniedError';
}

function versionLabel(version: DocumentVersionSummary): string {
  return version.name ?? `Version ${version.revision}`;
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

export class VersionController {
  private snapshot: VersionControllerSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(event: VersionControllerEvent) => void>();
  private readonly cache = new Map<string, DocumentVersion>();
  private readonly options: VersionControllerOptions;
  private readonly user: VersionAuthor;
  private unsubscribeEditor: () => void;
  private readController?: AbortController;
  private mutationController?: AbortController;
  private autoSaveTimer?: ReturnType<typeof setTimeout>;
  private mutationPending = false;
  private destroyed = false;

  constructor(options: VersionControllerOptions) {
    if (!options?.editor || !options.provider || !validDocumentId(options.documentId)) {
      throw new TypeError('VersionController requires an editor, provider, and valid document id.');
    }
    const pageSize = options.pageSize ?? 50;
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new RangeError('Version page size must be between 1 and 100.');
    if (options.autoSave && options.autoSave.delayMs !== undefined
      && (!Number.isFinite(options.autoSave.delayMs) || options.autoSave.delayMs < 250 || options.autoSave.delayMs > 86_400_000)) {
      throw new RangeError('Automatic version delay must be between 250ms and 24 hours.');
    }
    this.options = Object.freeze({ ...options, pageSize });
    this.user = normalizeVersionAuthor(options.user) as VersionAuthor;
    this.snapshot = Object.freeze({
      status: 'idle',
      versions: Object.freeze([]),
      dirty: true,
      autoSaveEnabled: options.autoSave !== false && options.autoSave !== undefined,
    });
    this.unsubscribeEditor = options.editor.subscribe((_state, transaction) => {
      if (!transaction.docChanged) return;
      const dirty = this.currentFingerprint() !== this.snapshot.versions[0]?.contentFingerprint;
      this.publish({
        dirty,
        ...(this.snapshot.comparison?.to.id === 'current' ? { comparison: undefined } : {}),
      });
      this.scheduleAutoSave();
    });
    if (options.autoLoad !== false) void this.refresh().catch(() => {});
  }

  getSnapshot = (): VersionControllerSnapshot => this.snapshot;

  /** Whether this controller was configured to create automatic checkpoints. */
  get autoSaveAvailable(): boolean { return Boolean(this.options.autoSave); }

  /** Checks the host policy without mutating editor or provider state. */
  can(action: VersionPermissionAction, version?: DocumentVersionSummary): boolean {
    this.assertAlive();
    if (action === 'remove' && !this.options.provider.remove) return false;
    try {
      return this.options.permissions?.[action]?.({ action, user: this.user, ...(version ? { version } : {}) }) !== false;
    } catch {
      return false;
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  on = (listener: (event: VersionControllerEvent) => void): (() => void) => {
    this.assertAlive();
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  };

  async refresh(): Promise<readonly DocumentVersionSummary[]> {
    this.assertAlive();
    const controller = this.startRead();
    this.publish({ status: 'loading', error: undefined });
    try {
      const result = normalizeVersionListResult(await this.options.provider.list({
        documentId: this.options.documentId,
        limit: this.options.pageSize,
        signal: controller.signal,
      }), this.options.documentId);
      if (controller.signal.aborted || this.destroyed) return this.snapshot.versions;
      this.cache.clear();
      this.publish({
        status: 'idle',
        versions: result.versions,
        nextCursor: result.nextCursor,
        dirty: this.currentFingerprint() !== result.versions[0]?.contentFingerprint,
        error: undefined,
      });
      return result.versions;
    } catch (error) {
      if (controller.signal.aborted || this.destroyed) return this.snapshot.versions;
      this.fail(error);
      throw error;
    }
  }

  async loadMore(): Promise<readonly DocumentVersionSummary[]> {
    this.assertAlive();
    if (!this.snapshot.nextCursor) return this.snapshot.versions;
    const controller = this.startRead();
    const cursor = this.snapshot.nextCursor;
    this.publish({ status: 'loading', error: undefined });
    try {
      const result = normalizeVersionListResult(await this.options.provider.list({
        documentId: this.options.documentId,
        limit: this.options.pageSize,
        cursor,
        signal: controller.signal,
      }), this.options.documentId);
      if (controller.signal.aborted || this.destroyed) return this.snapshot.versions;
      const versions = [...this.snapshot.versions, ...result.versions];
      const ids = new Set<string>();
      const revisions = new Set<number>();
      versions.forEach((version, index) => {
        if (ids.has(version.id) || revisions.has(version.revision)
          || index > 0 && version.revision >= (versions[index - 1] as DocumentVersionSummary).revision) {
          throw new Error('Version pages overlap or are not consistently ordered.');
        }
        ids.add(version.id);
        revisions.add(version.revision);
      });
      this.publish({ status: 'idle', versions: Object.freeze(versions), nextCursor: result.nextCursor, error: undefined });
      return this.snapshot.versions;
    } catch (error) {
      if (controller.signal.aborted || this.destroyed) return this.snapshot.versions;
      this.fail(error);
      throw error;
    }
  }

  async save(options: SaveVersionOptions = {}): Promise<DocumentVersion> {
    this.assertAlive();
    return this.runMutation('saving', async (signal) => this.saveCurrent(options, true, signal));
  }

  async saveAutomatic(): Promise<DocumentVersion | undefined> {
    this.assertAlive();
    if (!this.snapshot.autoSaveEnabled || !this.snapshot.dirty) return undefined;
    const automatic = this.options.autoSave || {};
    if (automatic.shouldSave && !automatic.shouldSave({ editor: this.options.editor, dirty: true })) return undefined;
    const nextRevision = (this.snapshot.versions[0]?.revision ?? 0) + 1;
    return this.runMutation('saving', async (signal) => this.saveCurrent({
      kind: 'automatic',
      name: automatic.name?.({ editor: this.options.editor, nextRevision }),
      data: automatic.data?.({ editor: this.options.editor, nextRevision }),
    }, true, signal));
  }

  async preview(versionId: string): Promise<DocumentVersion> {
    this.assertAlive();
    const controller = this.startRead();
    this.publish({ status: 'previewing', error: undefined });
    try {
      const version = await this.loadVersion(versionId, controller.signal);
      if (controller.signal.aborted || this.destroyed) return version;
      this.publish({ status: 'idle', selectedVersionId: version.id, preview: version, error: undefined });
      this.emit({ type: 'preview-opened', version });
      return version;
    } catch (error) {
      if (!controller.signal.aborted && !this.destroyed) this.fail(error);
      throw error;
    }
  }

  closePreview(): void {
    this.assertAlive();
    if (!this.snapshot.preview) return;
    this.publish({ preview: undefined });
    this.emit({ type: 'preview-closed' });
  }

  async compare(fromVersionId: string, toVersionId?: string): Promise<VersionComparison> {
    this.assertAlive();
    const controller = this.startRead();
    this.publish({ status: 'comparing', error: undefined });
    try {
      const fromVersion = await this.loadVersion(fromVersionId, controller.signal);
      const toVersion = toVersionId ? await this.loadVersion(toVersionId, controller.signal) : undefined;
      const before = this.options.editor.state.schema.nodeFromJSON(fromVersion.content);
      const afterJSON = toVersion?.content ?? this.options.editor.getJSON();
      const after = this.options.editor.state.schema.nodeFromJSON(afterJSON);
      const comparison = compareVersionDocuments(before, after, {
        id: fromVersion.id,
        label: versionLabel(fromVersion),
        contentFingerprint: fromVersion.contentFingerprint,
      }, toVersion ? {
        id: toVersion.id,
        label: versionLabel(toVersion),
        contentFingerprint: toVersion.contentFingerprint,
      } : {
        id: 'current',
        label: 'Current document',
        contentFingerprint: versionContentFingerprint(afterJSON),
      });
      if (!controller.signal.aborted && !this.destroyed) {
        this.publish({ status: 'idle', selectedVersionId: fromVersion.id, comparison, error: undefined });
        this.emit({ type: 'comparison-created', comparison });
      }
      return comparison;
    } catch (error) {
      if (!controller.signal.aborted && !this.destroyed) this.fail(error);
      throw error;
    }
  }

  clearComparison(): void {
    this.assertAlive();
    this.publish({ comparison: undefined });
  }

  async restore(versionId: string, options: RestoreVersionOptions = {}): Promise<DocumentVersion | undefined> {
    this.assertAlive();
    return this.runMutation('restoring', async (signal) => {
      const source = await this.loadVersion(versionId, signal);
      abortIfNeeded(signal);
      this.assertPermission('restore', source);
      const target = this.options.editor.state.schema.nodeFromJSON(source.content);
      const currentFingerprint = this.currentFingerprint();
      if (currentFingerprint === source.contentFingerprint) return undefined;

      let expectedHeadId = this.snapshot.versions[0]?.id ?? null;
      if (options.saveCurrent !== false && this.snapshot.dirty) {
        const backup = await this.saveCurrent({
          kind: 'backup',
          name: options.backupName ?? `Before restoring ${versionLabel(source)}`,
          expectedHeadId,
        }, false, signal);
        expectedHeadId = backup.id;
      }

      const transaction = this.options.editor.state.createTransaction()
        .replace(0, this.options.editor.state.doc.childCount, target.content)
        .setSelection(selectionAtStart(target))
        .setMeta(VERSION_RESTORE_META, Object.freeze({ versionId: source.id }))
        .setMeta(TRACKED_CHANGES_INTERNAL_META, true);
      if (!this.options.editor.dispatch(transaction)) throw new Error('The editor refused the version restoration transaction.');

      let createdVersion: DocumentVersion | undefined;
      if (options.saveRestored !== false) {
        createdVersion = await this.saveCurrent({
          kind: 'restore',
          name: options.restoredName ?? `Restored ${versionLabel(source)}`,
          restoredFromVersionId: source.id,
          expectedHeadId,
        }, false, signal);
      }
      this.publish({ preview: undefined, comparison: undefined, selectedVersionId: source.id });
      this.emit({ type: 'version-restored', source, ...(createdVersion ? { createdVersion } : {}) });
      return createdVersion;
    });
  }

  async remove(versionId: string): Promise<void> {
    this.assertAlive();
    if (!this.options.provider.remove) throw new Error('This version provider does not support removal.');
    await this.runMutation('removing', async (signal) => {
      const version = this.snapshot.versions.find((candidate) => candidate.id === versionId)
        ?? summary(await this.loadVersion(versionId));
      this.assertPermission('remove', version);
      await this.options.provider.remove?.({
        documentId: this.options.documentId,
        versionId,
        operationId: id(this.options, 'operation'),
        signal,
      });
      abortIfNeeded(signal);
      this.cache.delete(versionId);
      const versions = this.snapshot.versions.filter((candidate) => candidate.id !== versionId);
      this.publish({
        versions: Object.freeze(versions),
        dirty: this.currentFingerprint() !== versions[0]?.contentFingerprint,
        ...(this.snapshot.selectedVersionId === versionId ? { selectedVersionId: undefined, preview: undefined, comparison: undefined } : {}),
      });
      this.emit({ type: 'version-removed', versionId });
    });
  }

  setAutoSave(enabled: boolean): void {
    this.assertAlive();
    if (enabled && !this.options.autoSave) throw new Error('Automatic versions were not configured.');
    this.publish({ autoSaveEnabled: enabled });
    if (!enabled && this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = undefined;
    if (enabled) this.scheduleAutoSave();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeEditor();
    this.readController?.abort();
    this.mutationController?.abort();
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    if (this.options.destroyProvider) this.options.provider.destroy?.();
    this.listeners.clear();
    this.eventListeners.clear();
  }

  private async saveCurrent(options: SaveVersionOptions, publishStatus = true, signal?: AbortSignal): Promise<DocumentVersion> {
    this.assertPermission('save');
    const content = this.options.editor.getJSON();
    const input: VersionSaveInput = {
      id: options.id ?? id(this.options, 'version'),
      documentId: this.options.documentId,
      ...(options.name ? { name: options.name } : {}),
      kind: options.kind ?? 'manual',
      createdAt: now(this.options),
      createdBy: this.user,
      content,
      contentFingerprint: versionContentFingerprint(content),
      ...(options.data ? { data: options.data } : {}),
      ...(options.restoredFromVersionId ? { restoredFromVersionId: options.restoredFromVersionId } : {}),
      expectedHeadId: options.expectedHeadId === undefined ? this.snapshot.versions[0]?.id ?? null : options.expectedHeadId,
      operationId: id(this.options, 'operation'),
      signal,
    };
    const saved = normalizeDocumentVersion(await this.options.provider.save(input), this.options.documentId);
    abortIfNeeded(signal);
    if (saved.id !== input.id || saved.kind !== input.kind
      || saved.contentFingerprint !== input.contentFingerprint
      || saved.restoredFromVersionId !== input.restoredFromVersionId
      || !versionContentsEqual(saved.content, input.content)) {
      throw new Error('The version provider returned a different record than the one it was asked to save.');
    }
    this.options.editor.state.schema.nodeFromJSON(saved.content);
    this.cache.set(saved.id, saved);
    const versions = Object.freeze([
      summary(saved),
      ...this.snapshot.versions.filter((version) => version.id !== saved.id && version.revision !== saved.revision),
    ].sort((left, right) => right.revision - left.revision));
    this.publish({
      ...(publishStatus ? { status: 'idle' as const } : {}),
      versions,
      dirty: this.currentFingerprint() !== saved.contentFingerprint,
      error: undefined,
    });
    this.emit({ type: 'version-saved', version: saved });
    return saved;
  }

  private async loadVersion(versionId: string, signal?: AbortSignal): Promise<DocumentVersion> {
    if (!validId(versionId)) throw new TypeError('A valid version id is required.');
    const cached = this.cache.get(versionId);
    if (cached) return cached;
    const value = await this.options.provider.load({ documentId: this.options.documentId, versionId, signal });
    if (!value) throw new VersionNotFoundError(versionId);
    const version = normalizeDocumentVersion(value, this.options.documentId);
    this.options.editor.state.schema.nodeFromJSON(version.content);
    this.cache.set(version.id, version);
    return version;
  }

  private async runMutation<T>(status: Extract<VersionControllerStatus, 'saving' | 'restoring' | 'removing'>, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.mutationPending) throw new VersionConflictError('Another version mutation is still running.');
    this.mutationPending = true;
    this.readController?.abort();
    const controller = new AbortController();
    this.mutationController = controller;
    this.publish({ status, error: undefined });
    try {
      const result = await operation(controller.signal);
      if (!this.destroyed) this.publish({ status: 'idle', error: undefined });
      return result;
    } catch (error) {
      if (!this.destroyed) this.fail(error);
      throw error;
    } finally {
      if (this.mutationController === controller) this.mutationController = undefined;
      this.mutationPending = false;
    }
  }

  private startRead(): AbortController {
    this.readController?.abort();
    const controller = new AbortController();
    this.readController = controller;
    return controller;
  }

  private currentFingerprint(): string {
    return versionContentFingerprint(this.options.editor.getJSON());
  }

  private assertPermission(action: VersionPermissionAction, version?: DocumentVersionSummary): void {
    const permission = this.options.permissions?.[action];
    if (permission?.({ action, user: this.user, ...(version ? { version } : {}) }) === false) {
      throw new VersionPermissionDeniedError(permissionError().message);
    }
  }

  private scheduleAutoSave(): void {
    if (!this.snapshot.autoSaveEnabled || !this.snapshot.dirty || !this.options.autoSave) return;
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = undefined;
      if (!this.mutationPending && !this.destroyed) void this.saveAutomatic().catch(() => {});
    }, this.options.autoSave.delayMs ?? 2_000);
  }

  private fail(value: unknown): void {
    const error = immutableError(value);
    this.publish({ status: 'error', error });
    this.emit({ type: 'error', error });
  }

  private emit(event: VersionControllerEvent): void {
    this.eventListeners.forEach((listener) => {
      try { listener(event); } catch { /* Event listeners cannot own controller state. */ }
    });
  }

  private publish(patch: Partial<VersionControllerSnapshot>): void {
    if (this.destroyed) return;
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    this.listeners.forEach((listener) => {
      try { listener(); } catch { /* UI subscribers cannot own controller state. */ }
    });
  }

  private assertAlive(): void {
    if (this.destroyed || this.options.editor.isDestroyed) throw new Error('This version controller has been destroyed.');
  }
}

export function createVersionController(options: VersionControllerOptions): VersionController {
  return new VersionController(options);
}

export { InMemoryVersionProvider };

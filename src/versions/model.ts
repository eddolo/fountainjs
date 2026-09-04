import { isSafeURL, type NodeJSON } from '../core';

const MAX_ID_LENGTH = 240;
const MAX_NAME_LENGTH = 300;
const MAX_AUTHOR_NAME_LENGTH = 200;
const MAX_DATA_LENGTH = 1_000_000;
const MAX_DOCUMENT_LENGTH = 10_000_000;
const MAX_PAGE_SIZE = 100;

export interface VersionAuthor {
  readonly id: string;
  readonly name: string;
  readonly avatar?: string;
}

export type DocumentVersionKind = 'manual' | 'automatic' | 'backup' | 'restore';

export interface DocumentVersionSummary {
  readonly id: string;
  readonly documentId: string;
  readonly revision: number;
  readonly kind: DocumentVersionKind;
  readonly name?: string;
  readonly createdAt: string;
  readonly createdBy?: VersionAuthor;
  readonly contentFingerprint: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly restoredFromVersionId?: string;
}

export interface DocumentVersion extends DocumentVersionSummary {
  readonly content: NodeJSON;
}

export interface VersionListRequest {
  readonly documentId: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface VersionListResult {
  readonly versions: readonly DocumentVersionSummary[];
  readonly nextCursor?: string;
}

export interface VersionLoadRequest {
  readonly documentId: string;
  readonly versionId: string;
  readonly signal?: AbortSignal;
}

export interface VersionSaveInput {
  readonly id: string;
  readonly documentId: string;
  readonly name?: string;
  readonly kind?: DocumentVersionKind;
  readonly createdAt: string;
  readonly createdBy?: VersionAuthor;
  readonly content: NodeJSON;
  readonly contentFingerprint: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly restoredFromVersionId?: string;
  /** `null` means the document must not have a head; omission disables the check. */
  readonly expectedHeadId?: string | null;
  readonly operationId: string;
  readonly signal?: AbortSignal;
}

export interface VersionRemoveRequest extends VersionLoadRequest {
  readonly operationId: string;
}

/** Persistence boundary. Authentication, authorization, retention, and audit stay server-owned. */
export interface VersionProvider {
  list(request: VersionListRequest): VersionListResult | Promise<VersionListResult>;
  load(request: VersionLoadRequest): DocumentVersion | undefined | Promise<DocumentVersion | undefined>;
  save(input: VersionSaveInput): DocumentVersion | Promise<DocumentVersion>;
  remove?(request: VersionRemoveRequest): void | Promise<void>;
  destroy?(): void;
}

export class VersionConflictError extends Error {
  readonly name = 'VersionConflictError';

  constructor(message = 'The document version head changed. Refresh and try again.') {
    super(message);
  }
}

export class VersionNotFoundError extends Error {
  readonly name = 'VersionNotFoundError';

  constructor(versionId: string) {
    super(`Unknown document version: ${versionId}`);
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_ID_LENGTH
    && /^[\w.:@/-]+$/.test(value);
}

function validDocumentId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 500
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function cloneJSON<T>(value: T, label: string, maximum: number): T {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); }
  catch { throw new TypeError(`${label} must be JSON serializable.`); }
  if (encoded === undefined || encoded.length > maximum) throw new RangeError(`${label} exceeds the safety limit.`);
  return deepFreeze(JSON.parse(encoded) as T);
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 50 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError('Document versions require a valid creation timestamp.');
  }
  return new Date(value).toISOString();
}

function normalizeName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError('Version names must be bounded, non-empty text.');
  }
  return value.trim();
}

export function normalizeVersionAuthor(value: VersionAuthor | undefined): VersionAuthor | undefined {
  if (value === undefined) return undefined;
  if (!validId(value.id) || typeof value.name !== 'string' || !value.name.trim()
    || value.name.length > MAX_AUTHOR_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(value.name)) {
    throw new TypeError('Document versions require a valid author identity.');
  }
  if (value.avatar !== undefined && (typeof value.avatar !== 'string' || value.avatar.length > 2_048
    || !isSafeURL(value.avatar, { allowDataImage: true }))) {
    throw new TypeError('Version author avatars must be bounded URLs.');
  }
  return Object.freeze({ id: value.id, name: value.name.trim(), ...(value.avatar ? { avatar: value.avatar.trim() } : {}) });
}

function normalizeData(value: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Version data must be an object.');
  return cloneJSON(value, 'Version data', MAX_DATA_LENGTH);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}

/** Stable non-cryptographic content identity used for dirty checks and deduplication. */
export function versionContentFingerprint(content: NodeJSON): string {
  const normalized = cloneJSON(content, 'Version document', MAX_DOCUMENT_LENGTH);
  const input = canonical(normalized);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `fjs1-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

/** Exact, key-order-independent equality for portable version documents. */
export function versionContentsEqual(left: NodeJSON, right: NodeJSON): boolean {
  return canonical(cloneJSON(left, 'Version document', MAX_DOCUMENT_LENGTH))
    === canonical(cloneJSON(right, 'Version document', MAX_DOCUMENT_LENGTH));
}

export function normalizeDocumentVersionSummary(value: DocumentVersionSummary, expectedDocumentId?: string): DocumentVersionSummary {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid document version summary.');
  const name = normalizeName(value.name);
  if (value.restoredFromVersionId !== undefined && !validId(value.restoredFromVersionId)) {
    throw new TypeError('Invalid restored-from version id.');
  }
  if (value.kind === 'restore' && !value.restoredFromVersionId) {
    throw new TypeError('Restored versions must identify their source version.');
  }
  if (!value || !validId(value.id) || !validDocumentId(value.documentId)
    || (expectedDocumentId !== undefined && value.documentId !== expectedDocumentId)
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !['manual', 'automatic', 'backup', 'restore'].includes(value.kind)
    || typeof value.contentFingerprint !== 'string' || !/^fjs1-[0-9a-f]{16}$/.test(value.contentFingerprint)) {
    throw new TypeError('Invalid document version summary.');
  }
  return Object.freeze({
    id: value.id,
    documentId: value.documentId,
    revision: value.revision,
    kind: value.kind,
    ...(name ? { name } : {}),
    createdAt: timestamp(value.createdAt),
    ...(value.createdBy ? { createdBy: normalizeVersionAuthor(value.createdBy) } : {}),
    contentFingerprint: value.contentFingerprint,
    ...(value.data ? { data: normalizeData(value.data) } : {}),
    ...(value.restoredFromVersionId ? { restoredFromVersionId: value.restoredFromVersionId } : {}),
  });
}

export function normalizeDocumentVersion(value: DocumentVersion, expectedDocumentId?: string): DocumentVersion {
  const summary = normalizeDocumentVersionSummary(value, expectedDocumentId);
  const content = cloneJSON(value.content, 'Version document', MAX_DOCUMENT_LENGTH);
  if (!content || typeof content !== 'object' || typeof content.type !== 'string') throw new TypeError('Invalid version document.');
  if (versionContentFingerprint(content) !== summary.contentFingerprint) {
    throw new Error(`Version ${summary.id} content does not match its fingerprint.`);
  }
  return Object.freeze({ ...summary, content });
}

export function normalizeVersionListResult(value: VersionListResult, documentId: string): VersionListResult {
  if (!value || !Array.isArray(value.versions) || value.versions.length > MAX_PAGE_SIZE) {
    throw new TypeError('Invalid document version list.');
  }
  if (value.nextCursor !== undefined && (typeof value.nextCursor !== 'string' || !value.nextCursor.length
    || value.nextCursor.length > 500 || /[\u0000-\u001f\u007f]/.test(value.nextCursor))) {
    throw new TypeError('Invalid document version cursor.');
  }
  const versions = value.versions.map((version) => normalizeDocumentVersionSummary(version, documentId));
  const ids = new Set<string>();
  const revisions = new Set<number>();
  versions.forEach((version, index) => {
    if (ids.has(version.id) || revisions.has(version.revision)) throw new Error('Version pages cannot contain duplicate ids or revisions.');
    if (index > 0 && version.revision >= (versions[index - 1] as DocumentVersionSummary).revision) {
      throw new Error('Version pages must be ordered newest first.');
    }
    ids.add(version.id);
    revisions.add(version.revision);
  });
  return Object.freeze({ versions: Object.freeze(versions), ...(value.nextCursor ? { nextCursor: value.nextCursor } : {}) });
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

function versionFromInput(input: VersionSaveInput, revision: number): DocumentVersion {
  return normalizeDocumentVersion({
    id: input.id,
    documentId: input.documentId,
    revision,
    kind: input.kind ?? 'manual',
    ...(input.name ? { name: input.name } : {}),
    createdAt: input.createdAt,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    contentFingerprint: input.contentFingerprint,
    ...(input.data ? { data: input.data } : {}),
    ...(input.restoredFromVersionId ? { restoredFromVersionId: input.restoredFromVersionId } : {}),
    content: input.content,
  }, input.documentId);
}

export interface InMemoryVersionProviderOptions {
  readonly maximumVersionsPerDocument?: number;
}

/** Deterministic local reference provider. Production authorization still belongs on the server. */
export class InMemoryVersionProvider implements VersionProvider {
  private readonly documents = new Map<string, DocumentVersion[]>();
  private readonly nextRevisions = new Map<string, number>();
  private readonly operations = new Map<string, {
    readonly type: 'save' | 'remove';
    readonly documentId: string;
    readonly versionId: string;
    readonly result?: DocumentVersion;
    readonly expectedHeadId?: string | null;
  }>();
  private readonly maximum: number;

  private rememberOperation(operationId: string, value: {
    readonly type: 'save' | 'remove';
    readonly documentId: string;
    readonly versionId: string;
    readonly result?: DocumentVersion;
    readonly expectedHeadId?: string | null;
  }): void {
    this.operations.set(operationId, value);
    const maximumOperations = Math.max(1_000, this.maximum * 4);
    while (this.operations.size > maximumOperations) {
      const oldest = this.operations.keys().next().value as string | undefined;
      if (!oldest) break;
      this.operations.delete(oldest);
    }
  }

  constructor(options: InMemoryVersionProviderOptions = {}) {
    const maximum = options.maximumVersionsPerDocument ?? 5_000;
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 100_000) {
      throw new RangeError('maximumVersionsPerDocument must be between 1 and 100000.');
    }
    this.maximum = maximum;
  }

  list(request: VersionListRequest): VersionListResult {
    abortIfNeeded(request.signal);
    if (!validDocumentId(request.documentId)) throw new TypeError('A valid document id is required.');
    const limit = request.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new RangeError('Version page size must be between 1 and 100.');
    const beforeRevision = request.cursor === undefined ? Number.POSITIVE_INFINITY : Number(request.cursor);
    if (!(beforeRevision === Number.POSITIVE_INFINITY || Number.isSafeInteger(beforeRevision) && beforeRevision > 0)) {
      throw new TypeError('Invalid version cursor.');
    }
    const matches = (this.documents.get(request.documentId) ?? []).filter((version) => version.revision < beforeRevision);
    const page = matches.slice(0, limit);
    return Object.freeze({
      versions: Object.freeze(page.map(({ content: _content, ...summary }) => Object.freeze(summary))),
      ...(matches.length > page.length && page.length ? { nextCursor: String((page.at(-1) as DocumentVersion).revision) } : {}),
    });
  }

  load(request: VersionLoadRequest): DocumentVersion | undefined {
    abortIfNeeded(request.signal);
    if (!validDocumentId(request.documentId) || !validId(request.versionId)) throw new TypeError('Valid document and version ids are required.');
    return this.documents.get(request.documentId)?.find((version) => version.id === request.versionId);
  }

  save(input: VersionSaveInput): DocumentVersion {
    abortIfNeeded(input.signal);
    if (!validId(input.operationId) || !validId(input.id) || !validDocumentId(input.documentId)) {
      throw new TypeError('Version saves require valid operation, version, and document ids.');
    }
    const repeated = this.operations.get(input.operationId);
    if (repeated) {
      if (repeated.type === 'save' && repeated.documentId === input.documentId
        && repeated.versionId === input.id && repeated.result
        && repeated.expectedHeadId === input.expectedHeadId
        && canonical(versionFromInput(input, repeated.result.revision)) === canonical(repeated.result)) return repeated.result;
      throw new VersionConflictError('The operation id was already used for a different version mutation.');
    }
    const versions = this.documents.get(input.documentId) ?? [];
    const head = versions[0];
    if (input.expectedHeadId !== undefined && input.expectedHeadId !== (head?.id ?? null)) throw new VersionConflictError();
    if (versions.some((version) => version.id === input.id)) throw new VersionConflictError(`Version id already exists: ${input.id}`);
    if (versions.length >= this.maximum) throw new RangeError('The document version limit has been reached.');
    const revision = this.nextRevisions.get(input.documentId) ?? ((head?.revision ?? 0) + 1);
    const record = versionFromInput(input, revision);
    this.documents.set(input.documentId, [record, ...versions]);
    this.nextRevisions.set(input.documentId, revision + 1);
    this.rememberOperation(input.operationId, {
      type: 'save', documentId: input.documentId, versionId: input.id, result: record,
      expectedHeadId: input.expectedHeadId,
    });
    return record;
  }

  remove(request: VersionRemoveRequest): void {
    abortIfNeeded(request.signal);
    if (!validId(request.operationId) || !validDocumentId(request.documentId) || !validId(request.versionId)) {
      throw new TypeError('Version removal requires valid operation, version, and document ids.');
    }
    const repeated = this.operations.get(request.operationId);
    if (repeated) {
      if (repeated.type === 'remove' && repeated.documentId === request.documentId && repeated.versionId === request.versionId) return;
      throw new VersionConflictError('The operation id was already used for a different version mutation.');
    }
    const versions = this.documents.get(request.documentId) ?? [];
    if (!versions.some((version) => version.id === request.versionId)) throw new VersionNotFoundError(request.versionId);
    this.documents.set(request.documentId, versions.filter((version) => version.id !== request.versionId));
    this.rememberOperation(request.operationId, {
      type: 'remove', documentId: request.documentId, versionId: request.versionId,
    });
  }
}

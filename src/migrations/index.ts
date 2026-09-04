import type { NodeJSON } from '../core';

/** Stable media type for versioned FountainJS document envelopes. */
export const FOUNTAIN_DOCUMENT_FORMAT = 'fountainjs' as const;

/** Current persisted-document format. This is independent of package SemVer. */
export const FOUNTAIN_DOCUMENT_VERSION = 1 as const;

const MAXIMUM_MIGRATIONS = 100;
const MAXIMUM_PORTABLE_DEPTH = 100;
const MAXIMUM_PORTABLE_VALUES = 250_000;
const MAXIMUM_PORTABLE_STRING = 10_000_000;

export interface FountainDocumentEnvelope {
  readonly format: typeof FOUNTAIN_DOCUMENT_FORMAT;
  readonly version: number;
  readonly document: NodeJSON;
}

export interface FountainDocumentMigrationContext {
  readonly id: string;
  readonly fromVersion: number;
  readonly toVersion: number;
}

export interface FountainDocumentMigration {
  /** Stable diagnostic name, for example `core-v1-to-v2`. */
  readonly id: string;
  readonly from: number;
  /** Migrations are deliberately sequential, so this must equal `from + 1`. */
  readonly to: number;
  readonly migrate: (
    document: NodeJSON,
    context: FountainDocumentMigrationContext,
  ) => NodeJSON;
}

export interface FountainDocumentMigratorOptions {
  /** Defaults to `FOUNTAIN_DOCUMENT_VERSION`. */
  readonly currentVersion?: number;
  readonly migrations?: readonly FountainDocumentMigration[];
  /** Bare historical `NodeJSON` is implicit format version 1 by default. */
  readonly allowLegacyNodeJSON?: boolean;
  /** Runs after migration and before an envelope is returned. */
  readonly validate?: (document: NodeJSON) => void;
}

export interface FountainDocumentMigrationResult {
  readonly envelope: FountainDocumentEnvelope;
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly legacyInput: boolean;
  readonly appliedMigrations: readonly string[];
}

export type FountainDocumentMigrationErrorCode =
  | 'invalid-definition'
  | 'invalid-document'
  | 'invalid-envelope'
  | 'future-version'
  | 'missing-migration'
  | 'migration-failed';

export class FountainDocumentMigrationError extends Error {
  constructor(
    public readonly code: FountainDocumentMigrationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FountainDocumentMigrationError';
  }
}

function validVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

function portableClone(value: unknown): unknown {
  let values = 0;
  const ancestors = new Set<object>();
  const clone = (candidate: unknown, depth: number): unknown => {
    values += 1;
    if (values > MAXIMUM_PORTABLE_VALUES) {
      throw new FountainDocumentMigrationError('invalid-document', 'Document data exceeds the portable value limit.');
    }
    if (depth > MAXIMUM_PORTABLE_DEPTH) {
      throw new FountainDocumentMigrationError('invalid-document', 'Document data exceeds the portable depth limit.');
    }
    if (candidate === null || typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'string') {
      if (candidate.length > MAXIMUM_PORTABLE_STRING) {
        throw new FountainDocumentMigrationError('invalid-document', 'Document data exceeds the portable string limit.');
      }
      return candidate;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) {
        throw new FountainDocumentMigrationError('invalid-document', 'Document data cannot contain non-finite numbers.');
      }
      return candidate;
    }
    if (!candidate || typeof candidate !== 'object') {
      throw new FountainDocumentMigrationError('invalid-document', 'Document data must contain only JSON-compatible values.');
    }
    if (ancestors.has(candidate)) {
      throw new FountainDocumentMigrationError('invalid-document', 'Document data cannot contain circular values.');
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        if (Object.getOwnPropertySymbols(candidate).length) {
          throw new FountainDocumentMigrationError('invalid-document', 'Document arrays cannot contain symbol properties.');
        }
        const keys = Object.keys(candidate);
        if (keys.length !== candidate.length || keys.some((key, index) => key !== String(index))) {
          throw new FountainDocumentMigrationError('invalid-document', 'Document arrays must be dense and cannot contain named properties.');
        }
        return Object.freeze(keys.map((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
          if (!descriptor || !('value' in descriptor)) {
            throw new FountainDocumentMigrationError('invalid-document', 'Document data cannot contain accessor properties.');
          }
          return clone(descriptor.value, depth + 1);
        }));
      }
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new FountainDocumentMigrationError('invalid-document', 'Document data must use plain objects and arrays.');
      }
      if (Object.getOwnPropertySymbols(candidate).length) {
        throw new FountainDocumentMigrationError('invalid-document', 'Document objects cannot contain symbol properties.');
      }
      const result: Record<string, unknown> = {};
      for (const name of Object.keys(candidate)) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, name);
        if (!descriptor || !('value' in descriptor)) {
          throw new FountainDocumentMigrationError('invalid-document', 'Document data cannot contain accessor properties.');
        }
        Object.defineProperty(result, name, {
          value: clone(descriptor.value, depth + 1),
          enumerable: true,
          configurable: false,
          writable: false,
        });
      }
      return Object.freeze(result);
    } finally {
      ancestors.delete(candidate);
    }
  };
  return clone(value, 0);
}

function portableDocument(value: unknown): NodeJSON {
  const document = portableClone(value) as Partial<NodeJSON>;
  if (!document || typeof document !== 'object' || typeof document.type !== 'string' || !document.type) {
    throw new FountainDocumentMigrationError('invalid-document', 'A FountainJS document requires a non-empty root node type.');
  }
  return document as NodeJSON;
}

function migrationDefinition(value: FountainDocumentMigration): FountainDocumentMigration {
  if (!value || typeof value !== 'object' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value.id ?? '')) {
    throw new FountainDocumentMigrationError('invalid-definition', 'Document migrations require a stable 1-128 character id.');
  }
  if (!validVersion(value.from) || !validVersion(value.to) || value.to !== value.from + 1) {
    throw new FountainDocumentMigrationError('invalid-definition', `Migration ${value.id} must advance exactly one positive format version.`);
  }
  if (typeof value.migrate !== 'function') {
    throw new FountainDocumentMigrationError('invalid-definition', `Migration ${value.id} requires a migrate function.`);
  }
  return Object.freeze({ id: value.id, from: value.from, to: value.to, migrate: value.migrate });
}

/** Validates and freezes one sequential migration definition. */
export function defineFountainDocumentMigration(
  migration: FountainDocumentMigration,
): FountainDocumentMigration {
  return migrationDefinition(migration);
}

function inputEnvelope(
  value: unknown,
  allowLegacyNodeJSON: boolean,
): { document: NodeJSON; version: number; legacyInput: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FountainDocumentMigrationError('invalid-envelope', 'A FountainJS document envelope must be an object.');
  }
  const candidate = value as Record<string, unknown>;
  if (!('format' in candidate) && typeof candidate.type === 'string') {
    if (!allowLegacyNodeJSON) {
      throw new FountainDocumentMigrationError('invalid-envelope', 'Bare NodeJSON is disabled; provide a versioned FountainJS envelope.');
    }
    return { document: portableDocument(candidate), version: 1, legacyInput: true };
  }
  if (candidate.format !== FOUNTAIN_DOCUMENT_FORMAT) {
    throw new FountainDocumentMigrationError('invalid-envelope', `Unsupported document format: ${String(candidate.format)}`);
  }
  if (!validVersion(candidate.version)) {
    throw new FountainDocumentMigrationError('invalid-envelope', 'A FountainJS document envelope requires a positive integer version.');
  }
  const unexpected = Object.keys(candidate).filter((name) => !['format', 'version', 'document'].includes(name));
  if (unexpected.length) {
    throw new FountainDocumentMigrationError('invalid-envelope', `Unknown document envelope field: ${unexpected[0]}`);
  }
  return {
    document: portableDocument(candidate.document),
    version: candidate.version,
    legacyInput: false,
  };
}

/** Deterministic, immutable migration runner for persisted FountainJS JSON. */
export class FountainDocumentMigrator {
  readonly currentVersion: number;
  private readonly migrations: ReadonlyMap<number, FountainDocumentMigration>;
  private readonly validate?: (document: NodeJSON) => void;
  private readonly allowLegacyNodeJSON: boolean;

  constructor(options: FountainDocumentMigratorOptions = {}) {
    const currentVersion = options.currentVersion ?? FOUNTAIN_DOCUMENT_VERSION;
    if (!validVersion(currentVersion)) {
      throw new FountainDocumentMigrationError('invalid-definition', 'The current document format version must be a positive integer.');
    }
    const definitions = options.migrations ?? [];
    if (definitions.length > MAXIMUM_MIGRATIONS) {
      throw new FountainDocumentMigrationError('invalid-definition', `At most ${MAXIMUM_MIGRATIONS} document migrations may be registered.`);
    }
    const migrations = new Map<number, FountainDocumentMigration>();
    const migrationIds = new Set<string>();
    definitions.forEach((candidate) => {
      const migration = migrationDefinition(candidate);
      if (migration.to > currentVersion) {
        throw new FountainDocumentMigrationError('invalid-definition', `Migration ${migration.id} targets version ${migration.to}, newer than ${currentVersion}.`);
      }
      if (migrations.has(migration.from)) {
        throw new FountainDocumentMigrationError('invalid-definition', `Multiple migrations start at document version ${migration.from}.`);
      }
      if (migrationIds.has(migration.id)) {
        throw new FountainDocumentMigrationError('invalid-definition', `Document migration id ${migration.id} is duplicated.`);
      }
      migrations.set(migration.from, migration);
      migrationIds.add(migration.id);
    });
    this.currentVersion = currentVersion;
    this.migrations = migrations;
    this.validate = options.validate;
    this.allowLegacyNodeJSON = options.allowLegacyNodeJSON !== false;
  }

  /** Wraps current-version NodeJSON in the stable persisted envelope. */
  encode(document: NodeJSON): FountainDocumentEnvelope {
    const cloned = portableDocument(document);
    this.validate?.(cloned);
    return Object.freeze({
      format: FOUNTAIN_DOCUMENT_FORMAT,
      version: this.currentVersion,
      document: cloned,
    });
  }

  /** Reads legacy or versioned data, applies every required step, and validates the result. */
  migrate(input: unknown): FountainDocumentMigrationResult {
    const normalized = inputEnvelope(input, this.allowLegacyNodeJSON);
    if (normalized.version > this.currentVersion) {
      throw new FountainDocumentMigrationError(
        'future-version',
        `Document format ${normalized.version} is newer than supported format ${this.currentVersion}.`,
      );
    }
    const sourceVersion = normalized.version;
    let version = sourceVersion;
    let document = normalized.document;
    const applied: string[] = [];
    while (version < this.currentVersion) {
      const migration = this.migrations.get(version);
      if (!migration) {
        throw new FountainDocumentMigrationError(
          'missing-migration',
          `No document migration is registered from version ${version} to ${version + 1}.`,
        );
      }
      const context = Object.freeze({ id: migration.id, fromVersion: migration.from, toVersion: migration.to });
      try {
        document = portableDocument(migration.migrate(document, context));
      } catch (error) {
        if (error instanceof FountainDocumentMigrationError && error.code === 'invalid-document') {
          throw new FountainDocumentMigrationError('migration-failed', `Migration ${migration.id} returned invalid document data.`, { cause: error });
        }
        throw new FountainDocumentMigrationError('migration-failed', `Migration ${migration.id} failed.`, { cause: error });
      }
      version = migration.to;
      applied.push(migration.id);
    }
    this.validate?.(document);
    const envelope = Object.freeze({
      format: FOUNTAIN_DOCUMENT_FORMAT,
      version: this.currentVersion,
      document,
    });
    return Object.freeze({
      envelope,
      sourceVersion,
      targetVersion: this.currentVersion,
      legacyInput: normalized.legacyInput,
      appliedMigrations: Object.freeze(applied),
    });
  }
}

/** Creates a configured migrator without introducing a global registry. */
export function createFountainDocumentMigrator(
  options: FountainDocumentMigratorOptions = {},
): FountainDocumentMigrator {
  return new FountainDocumentMigrator(options);
}

/** Convenience wrapper for writing the current document format. */
export function encodeFountainDocument(
  document: NodeJSON,
  options: Omit<FountainDocumentMigratorOptions, 'migrations'> = {},
): FountainDocumentEnvelope {
  return new FountainDocumentMigrator(options).encode(document);
}

/** Convenience wrapper for reading/migrating persisted document data. */
export function migrateFountainDocument(
  input: unknown,
  options: FountainDocumentMigratorOptions = {},
): FountainDocumentMigrationResult {
  return new FountainDocumentMigrator(options).migrate(input);
}

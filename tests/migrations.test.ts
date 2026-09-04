import { describe, expect, it } from 'vitest';
import {
  CoreSchemaSpec,
  FOUNTAIN_DOCUMENT_FORMAT,
  FOUNTAIN_DOCUMENT_VERSION,
  FountainDocumentMigrationError,
  Schema,
  createFountainDocumentMigrator,
  defineFountainDocumentMigration,
  encodeFountainDocument,
  migrateFountainDocument,
  type NodeJSON,
} from '../src';

const paragraph = (text: string): NodeJSON => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
});

function migrationErrorCode(run: () => unknown): string {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(FountainDocumentMigrationError);
    return (error as FountainDocumentMigrationError).code;
  }
  throw new Error('Expected migration failure.');
}

describe('versioned document migrations', () => {
  it('wraps current and legacy NodeJSON in an immutable versioned envelope', () => {
    const schema = new Schema(CoreSchemaSpec);
    const validate = (document: NodeJSON) => { schema.nodeFromJSON(document); };
    const encoded = encodeFountainDocument(paragraph('Portable'), { validate });

    expect(encoded).toEqual({
      format: FOUNTAIN_DOCUMENT_FORMAT,
      version: FOUNTAIN_DOCUMENT_VERSION,
      document: paragraph('Portable'),
    });
    expect(Object.isFrozen(encoded)).toBe(true);
    expect(Object.isFrozen(encoded.document)).toBe(true);
    expect(Object.isFrozen(encoded.document.content)).toBe(true);

    const legacy = migrateFountainDocument(paragraph('Legacy'), { validate });
    expect(legacy.legacyInput).toBe(true);
    expect(legacy.sourceVersion).toBe(1);
    expect(legacy.targetVersion).toBe(1);
    expect(legacy.appliedMigrations).toEqual([]);
    expect(legacy.envelope.document).toEqual(paragraph('Legacy'));
  });

  it('applies one immutable deterministic migration at every format version', () => {
    const input = Object.freeze({
      format: FOUNTAIN_DOCUMENT_FORMAT,
      version: 1,
      document: paragraph('Alpha'),
    });
    const seen: Array<readonly [string, number, number]> = [];
    const migrator = createFountainDocumentMigrator({
      currentVersion: 3,
      migrations: [
        defineFountainDocumentMigration({
          id: 'test-v1-to-v2', from: 1, to: 2,
          migrate: (document, context) => {
            seen.push([context.id, context.fromVersion, context.toVersion]);
            return { ...document, attrs: { migrated: 2 } };
          },
        }),
        defineFountainDocumentMigration({
          id: 'test-v2-to-v3', from: 2, to: 3,
          migrate: (document) => ({ ...document, attrs: { ...document.attrs, migrated: 3 } }),
        }),
      ],
    });

    const result = migrator.migrate(input);
    expect(result.sourceVersion).toBe(1);
    expect(result.targetVersion).toBe(3);
    expect(result.appliedMigrations).toEqual(['test-v1-to-v2', 'test-v2-to-v3']);
    expect(result.envelope).toEqual({
      format: FOUNTAIN_DOCUMENT_FORMAT,
      version: 3,
      document: { ...paragraph('Alpha'), attrs: { migrated: 3 } },
    });
    expect(seen).toEqual([['test-v1-to-v2', 1, 2]]);
    expect(input.document).toEqual(paragraph('Alpha'));
    expect(Object.isFrozen(result.envelope.document.attrs)).toBe(true);
  });

  it('fails closed on gaps, future formats, duplicate steps, and invalid output', () => {
    const versioned = (version: number) => ({ format: FOUNTAIN_DOCUMENT_FORMAT, version, document: paragraph('Safe') });
    expect(migrationErrorCode(() => createFountainDocumentMigrator({ currentVersion: 2 }).migrate(versioned(1)))).toBe('missing-migration');
    expect(migrationErrorCode(() => createFountainDocumentMigrator().migrate(versioned(2)))).toBe('future-version');
    expect(migrationErrorCode(() => createFountainDocumentMigrator({
      currentVersion: 2,
      migrations: [
        { id: 'one', from: 1, to: 2, migrate: (document) => document },
        { id: 'two', from: 1, to: 2, migrate: (document) => document },
      ],
    }))).toBe('invalid-definition');
    expect(migrationErrorCode(() => createFountainDocumentMigrator({
      currentVersion: 3,
      migrations: [
        { id: 'reused', from: 1, to: 2, migrate: (document) => document },
        { id: 'reused', from: 2, to: 3, migrate: (document) => document },
      ],
    }))).toBe('invalid-definition');
    expect(migrationErrorCode(() => createFountainDocumentMigrator({
      currentVersion: 2,
      migrations: [{ id: 'invalid-result', from: 1, to: 2, migrate: () => ({ type: '', attrs: { bad: undefined } }) }],
    }).migrate(versioned(1)))).toBe('migration-failed');
  });

  it('does not let migration functions mutate their input and validates the final schema', () => {
    const mutating = createFountainDocumentMigrator({
      currentVersion: 2,
      migrations: [{
        id: 'mutating-step', from: 1, to: 2,
        migrate: (document) => {
          (document as { type: string }).type = 'changed';
          return document;
        },
      }],
    });
    expect(migrationErrorCode(() => mutating.migrate({
      format: FOUNTAIN_DOCUMENT_FORMAT, version: 1, document: paragraph('Immutable'),
    }))).toBe('migration-failed');

    const schema = new Schema(CoreSchemaSpec);
    const validating = createFountainDocumentMigrator({
      currentVersion: 2,
      migrations: [{ id: 'invalid-schema', from: 1, to: 2, migrate: () => ({ type: 'doc', content: [{ type: 'table' }] }) }],
      validate: (document) => { schema.nodeFromJSON(document); },
    });
    expect(() => validating.migrate({
      format: FOUNTAIN_DOCUMENT_FORMAT, version: 1, document: paragraph('Before'),
    })).toThrow(/table_row\+/);
  });

  it('rejects non-JSON values and can require explicit envelopes', () => {
    expect(migrationErrorCode(() => encodeFountainDocument({ type: 'doc', attrs: { value: Number.NaN } }))).toBe('invalid-document');
    expect(migrationErrorCode(() => encodeFountainDocument({ type: 'doc', attrs: { value: new Date() } }))).toBe('invalid-document');
    expect(migrationErrorCode(() => migrateFountainDocument(paragraph('Legacy'), { allowLegacyNodeJSON: false }))).toBe('invalid-envelope');
    expect(migrationErrorCode(() => migrateFountainDocument({
      format: FOUNTAIN_DOCUMENT_FORMAT, version: 1, document: paragraph('Extra'), extra: true,
    }))).toBe('invalid-envelope');

    let getterCalled = false;
    const accessorDocument = { type: 'doc' } as NodeJSON;
    Object.defineProperty(accessorDocument, 'attrs', {
      enumerable: true,
      get() { getterCalled = true; return {}; },
    });
    expect(migrationErrorCode(() => encodeFountainDocument(accessorDocument))).toBe('invalid-document');
    expect(getterCalled).toBe(false);
  });
});

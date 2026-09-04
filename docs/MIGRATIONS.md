# Document versions and migrations

FountainJS now has two independent version axes:

- npm package SemVer describes the library release;
- `FOUNTAIN_DOCUMENT_VERSION` describes persisted document JSON.

They must not be inferred from one another. Upgrading an npm package does not
silently rewrite stored documents, and a document-format change does not need a
major npm version by itself when an automatic migration preserves the public
outcome.

## Persist the versioned envelope

Existing bare `NodeJSON` remains accepted as implicit document format version
1. New persistence code should write the explicit envelope:

```ts
import {
  CoreSchemaSpec,
  Schema,
  encodeFountainDocument,
  migrateFountainDocument,
  setContent,
} from 'fountainjs-editor'

const schema = new Schema(CoreSchemaSpec)
const validate = (document) => { schema.nodeFromJSON(document) }

const stored = encodeFountainDocument(editor.getJSON(), { validate })
// {
//   format: 'fountainjs',
//   version: 1,
//   document: { type: 'doc', ... }
// }

const loaded = migrateFountainDocument(await database.read(id), { validate })
setContent(editor, schema.nodeFromJSON(loaded.envelope.document))
```

The same API is available from the isolated
`fountainjs-editor/migrations` entry. The published structural JSON Schema is
`fountainjs-editor/schema/document.json`.

The JSON Schema checks the transport shape. It cannot know the application's
composed node names, content expressions, attribute validators, or mark rules.
Always validate the final `document` with the receiving FountainJS `Schema` as
shown above.

## Define a future migration chain

Every step advances exactly one integer version. There is one application-owned
step per source version, eliminating ambiguous order. An extension that changes
persisted nodes or attributes should export a pure transformation helper; the
application calls those helpers in its one explicit step.

```ts
import {
  createFountainDocumentMigrator,
  defineFountainDocumentMigration,
} from 'fountainjs-editor/migrations'
import { migratePollNodes } from '@example/fountain-polls/migrations'
import { migrateCalloutNodes } from '@example/fountain-callouts/migrations'

const migrator = createFountainDocumentMigrator({
  currentVersion: 2,
  migrations: [
    defineFountainDocumentMigration({
      id: 'product-v1-to-v2',
      from: 1,
      to: 2,
      migrate(document) {
        return migrateCalloutNodes(migratePollNodes(document))
      },
    }),
  ],
  validate(document) {
    schema.nodeFromJSON(document)
  },
})

const result = migrator.migrate(storedValue)
console.log(result.sourceVersion, result.targetVersion)
console.log(result.appliedMigrations)
await database.write(id, result.envelope)
```

Migration input is a recursively frozen portable clone. A step cannot mutate
the caller's stored object. Every output is cloned again, bounded, checked for
plain JSON values, and frozen before the next step. Circular objects,
non-finite numbers, class instances, functions, missing steps, duplicate source
steps or ids, accessors, symbols, sparse/named arrays, and future document
versions fail closed with a typed
`FountainDocumentMigrationError.code`.

There is deliberately no process-global migration registry. The host chooses
the complete ordered chain, which makes tests, server workers, multiple product
schemas, and staged deployments deterministic.

## Extension versions are separate

An extension manifest's SemVer and `apiVersion` answer different questions:

- `manifest.version` identifies the extension package release;
- `manifest.apiVersion` proves compatibility with the FountainJS extension
  runtime contract;
- the document envelope version identifies the persisted application document.

Changing only commands, UI, services, or non-persisted decorations normally
needs no document migration. Changing a persisted node name, mark name,
attribute shape, or content invariant does. Extension authors should:

1. keep old node data readable during the documented transition where safe;
2. export a pure `NodeJSON -> NodeJSON` helper;
3. document which application document step must call it;
4. provide old and new fixtures plus idempotence/invalid-input tests;
5. never use an extension package version as an implicit document version.

The extension scaffold, conformance runner, and installation doctor verify the
runtime contract; they do not silently modify persisted data.

## Deployment procedure

For a format change:

1. Back up the storage collection and record its current format distribution.
2. Deploy readers that understand both the old and new versions before new
   writers emit the new version.
3. Run migrations through the application-owned chain and current schema.
4. Write with optimistic concurrency so a stale migration cannot overwrite a
   newer edit.
5. Retain the original value or a reversible backup until the new version has
   been observed in production.
6. Track failures by migration id without logging private document content.
7. Only remove an old reader after the published support/deprecation window.

Unknown future versions must never be treated as current. Upgrade the reader
or reject the document; guessing risks data loss.

## Current contract

- Format name: `fountainjs`
- Current format version: `1`
- Historical bare `NodeJSON`: accepted as implicit version `1` by default
- Published schema: `fountainjs-editor/schema/document.json`
- Schema-specific validation: always host-owned and required after migration
- Downgrades: not automatic; restore a backup or use an explicitly tested
  reverse migration owned by the application

Behavioral coverage lives in `tests/migrations.test.ts`. Package smoke tests
load both ESM/CommonJS migration entries and the published JSON Schema.

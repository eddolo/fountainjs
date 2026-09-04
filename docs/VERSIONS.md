# Named document versions

FountainJS ships named snapshots, exact comparison, non-destructive preview,
automatic checkpoints, and guarded restoration today. The engine is
framework-neutral and the optional React panel is only a renderer over that
public API. Both are part of the public MIT package; there is no paid versioning
extension or required Fountain service.

Versions are deliberately separate from undo and real-time collaboration:

- local history reverses recent editing transactions;
- Yjs merges concurrent live work;
- tracked changes keeps proposed edits inside the document until review;
- a `VersionProvider` stores durable, named document states for later comparison
  or restoration.

## Install and create a controller

The version engine is isolated from the root bundle:

```ts
import { createEditor, StarterKit } from 'fountainjs-editor'
import {
  InMemoryVersionProvider,
  VersionController,
} from 'fountainjs-editor/versions'

const editor = createEditor({
  schema: StarterKit.schema,
  plugins: StarterKit.plugins,
})

const versions = new VersionController({
  editor,
  documentId: 'article-42',
  user: { id: session.user.id, name: session.user.name },
  provider: new InMemoryVersionProvider(),
  autoSave: {
    delayMs: 2_000,
    name: ({ nextRevision }) => `Automatic checkpoint ${nextRevision}`,
  },
})
```

`InMemoryVersionProvider` is a bounded reference, test, and local-demo provider.
It is not durable storage. A production product implements the same interface
against its authenticated database, object store, local IndexedDB database, or
existing document API.

## Complete workflow

```ts
const first = await versions.save({ name: 'Ready for legal review' })

// Preview returns validated portable JSON and never edits the live document.
const preview = await versions.preview(first.id)

// Omit the second id to compare the saved state with the current editor.
const currentDiff = await versions.compare(first.id)

// Or compare two saved states.
const releaseDiff = await versions.compare(first.id, laterVersionId)

// Restoration is guarded in the supplied UI. At the API level it saves an
// unsaved current state as a backup, restores in one undoable transaction, and
// saves the result as a new head linked to the source version.
const restoredHead = await versions.restore(first.id)

await versions.remove(first.id)
versions.destroy()
```

`VersionComparison` contains immutable endpoints, exact change records, and
counts for inserted, deleted, replaced, formatting, and attribute changes.
Records carry complete changed text or complete inserted/deleted node JSON—no
display ellipsis is introduced by the engine.

## Supplied React panel

Install React only when the product wants the supplied UI:

```tsx
import { FountainVersions } from 'fountainjs-editor/react/versions'

<FountainVersions
  controller={versions}
  onError={(error) => reportError(error)}
/>
```

The panel includes:

- complete wrapping version names, author, kind, revision, and time;
- manual naming and save status;
- any-saved-version to any-saved-version or current-state comparison;
- complete JSON preview and complete change values;
- explicit two-step confirmation for restore and permanent delete;
- automatic-version control when configured;
- pagination, loading, conflict, permission, and provider errors;
- mobile-size controls and keyboard focus styles.

DOM, Web Component, Vue, Svelte, Angular, and other consumers subscribe with
`versions.subscribe()` and read `versions.getSnapshot()`. They call the same
methods; React is not required by the version engine.

## Provider contract

```ts
interface VersionProvider {
  list(request: VersionListRequest): VersionListResult | Promise<VersionListResult>
  load(request: VersionLoadRequest): DocumentVersion | undefined | Promise<DocumentVersion | undefined>
  save(input: VersionSaveInput): DocumentVersion | Promise<DocumentVersion>
  remove?(request: VersionRemoveRequest): void | Promise<void>
  destroy?(): void
}
```

The controller supplies a stable version id, idempotent operation id, portable
document content, a deterministic content fingerprint, author, timestamp,
optional application data, and `expectedHeadId`. A provider assigns a positive,
monotonically increasing `revision` and returns the authoritative record.

`expectedHeadId` is optimistic concurrency control:

- `null` means the document must not yet have a head;
- a string means that exact version must still be the head;
- omission disables the check for a custom low-level provider caller.

A changed head must reject with `VersionConflictError`; the product can refresh,
show the intervening version, and let the user retry intentionally. Operation
ids must be idempotent: replaying the same request returns the same result, but
reusing an operation id for a different mutation must fail.

The controller validates every list, load, and save response. It rejects wrong
document ids, duplicate page ids/revisions, unordered pages, malformed dates,
unsafe author avatars, non-JSON data, incompatible schema content, fingerprint
mismatches, and a provider that substitutes a different saved record.

## Minimal authenticated HTTP adapter

This browser adapter illustrates the transport boundary. Cookies are only an
example; use the authentication and CSRF design appropriate for the host.

```ts
import { VersionConflictError, type VersionProvider } from 'fountainjs-editor/versions'

export const httpVersions: VersionProvider = {
  async list({ documentId, limit, cursor, signal }) {
    const query = new URLSearchParams({ limit: String(limit ?? 50) })
    if (cursor) query.set('cursor', cursor)
    const response = await fetch(
      `/api/documents/${encodeURIComponent(documentId)}/versions?${query}`,
      { credentials: 'same-origin', signal },
    )
    if (!response.ok) throw new Error(`Version list failed: ${response.status}`)
    return response.json()
  },
  async load({ documentId, versionId, signal }) {
    const response = await fetch(
      `/api/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}`,
      { credentials: 'same-origin', signal },
    )
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`Version load failed: ${response.status}`)
    return response.json()
  },
  async save(input) {
    const response = await fetch(
      `/api/documents/${encodeURIComponent(input.documentId)}/versions`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...input, signal: undefined }),
        signal: input.signal,
      },
    )
    if (response.status === 409) throw new VersionConflictError()
    if (!response.ok) throw new Error(`Version save failed: ${response.status}`)
    return response.json()
  },
  async remove({ documentId, versionId, operationId, signal }) {
    const response = await fetch(
      `/api/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}`,
      {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'idempotency-key': operationId },
        signal,
      },
    )
    if (!response.ok) throw new Error(`Version removal failed: ${response.status}`)
  },
}
```

The server must not trust the browser-supplied user, timestamp, document access,
revision, or permissions. Derive identity from the authenticated request,
authorize every document/action, validate the full record, serialize head
updates in a transaction, store operation-id results, and apply retention/audit
policy server-side.

## Restoration guarantees and failure behavior

Default restoration deliberately favours recoverability:

1. Load and schema-validate the source.
2. If the current document is dirty, save it as a `backup` version.
3. Replace the editor document in one normal undoable transaction.
4. Save the restored state as a `restore` version linked by
   `restoredFromVersionId`.

Set `saveCurrent: false` or `saveRestored: false` only when the product has an
equivalent recovery policy. If the backup save fails, the document is not
changed. If saving the new restored head fails after the editor transaction,
the source and pre-restore backup remain available and the controller reports an
error; the local editor restoration can still be undone.

Restoration uses `VERSION_RESTORE_META` and the internal tracked-change bypass,
so it does not turn an historical document into a new forest of suggestions.
It remains an ordinary document transaction, so collaboration adapters can
propagate the restored state. In a multi-user product, enforce restore
authorization and head serialization on the version server as well.

## Automatic versions

Automatic versions are opt-in and debounced. A new editor transaction resets
the timer, identical content is not saved, and `shouldSave` can apply product
rules. `setAutoSave(false)` cancels a pending checkpoint. This is a client
convenience, not a durable scheduler: server-side retention and periodic backup
remain the host's responsibility.

## Limits and trust

- Version/document ids, names, author fields, custom data, pages, document JSON,
  and comparison change counts are bounded.
- Content fingerprints are stable non-cryptographic identities for dirty checks
  and accidental mismatch detection. Use a cryptographic server digest or
  signature where hostile collision resistance matters.
- Provider results are treated as untrusted data and schema-validated before
  preview, comparison, or restore.
- Local `permissions` keep supplied/custom UIs consistent, but only server-side
  authorization is a security boundary.
- Do not embed database credentials, permanent tokens, or privileged service
  keys in browser code.

The behavioural contracts live in `tests/versions.test.ts`; the accessible React
workflow is covered by `tests/react-versions.test.tsx`; package smoke tests load
ESM, CommonJS, and declaration paths for both optional entries.

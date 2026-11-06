# Existing XML-room conversion — 2026-11-06

This private conversion path reads documents produced by the current public
`YjsCollaborationAdapter`, archives their complete original shared state, and
builds a separately verified retained-engine candidate. It closes a necessary
part of legacy adoption. It does not activate that candidate, change the default
adapter, or fix the six default-adapter concurrent-edit failures by itself.

## Source decoding and recovery

`src/yjs/legacy-document.ts` imports Yjs, core model/schema/selection operations,
retained model validation and the structured-attribute reader. It recognizes
the public adapter's `fountain-node`, `fountain:type`, `fountain:marks` and
`fountain:attr:*` XML encoding. It does not connect an adapter, seed missing data,
normalize duplicate roots, initialize widget values or rewrite canonical XML.
The existing public adapter does perform some of those actions on connection;
using it as a migration reader would therefore be unsafe.

The reader validates the supplied schema and retained portability contract.
It permits schema defaults but refuses rewriting/discarding supplied data.
It preserves nested blocks, mark order, metadata, application `nodeId` values,
image references, exact technical text, LaTeX source and Lean source. Asset URLs
remain references; this is not a self-contained asset package or .fjs reader.

Legacy text attributes and XmlText formatting/embeds are refused explicitly:
the current adapter's decoder ignores/interprets those differently from the
new model. Unknown XML metadata, multiple document roots, invalid schema
content, unsupported shared types, unresolved update dependencies, subdocuments
and unpaired UTF-16 are also refused. Capture does not clean up or repair them.

`src/yjs/legacy-checkpoint.ts` imports the strict reader, normalized structured
definitions, the existing wire-safety preflight and private checkpoint wire
primitives. The new archive format is `fountain-legacy-checkpoint/1`, separate
from the retained checkpoint format. It owns full wire bytes, GUID/GC options,
all shared-root declarations including empty roots, schema version, projection
definition digest and update/document/manifest SHA-256 checks. These are
integrity checks, not signatures or authentication.

Structured state requires explicit host definitions. Capture projects the
authoritative structured map even if canonical XML is stale, while archiving
both unchanged. The digest includes serializable definition names, root kinds,
limits and map/identity configuration. Host validation functions remain bound
by the host's schema-version contract; executable functions are not serialized.

Restore copies input before hashing and restores only into an isolated Y.Doc.
Capture rechecks the original wire, root inventory and document options after
asynchronous hashing, refusing concurrent source mutation. The same 64 MiB
wire, 1,000-root, 100,000-node, depth-100 and 10-million-character bounds apply.
Known shared types must be declared before capture rather than inferred from
an unresolved top-level root during migration.

## Conversion and reference translation

`src/yjs/legacy-migration.ts` imports the legacy archive/reader boundary,
retained candidate policy snapshots, retained storage and selection helpers,
and retained checkpoint validation. It has no DOM/view/provider/backend imports.

`buildLegacyMigrationCandidate` owns policy and root declarations before the
first await, restores the archived source in isolation, seeds a new retained
room from its projected document, then verifies exact model semantics and
fresh CRDT identities. Object key order is immaterial; arrays, text, mark order,
attribute values and document structure remain significant. Canonical document
digests independently verify the final result.

Every auxiliary source root, including empty roots, needs an explicit owner and
synchronous semantic verifier. Missing, duplicate, reserved and unclaimed roots
are refused. Source writes, document changes, extra/omitted destination roots,
asynchronous callbacks and verifier writes prevent acceptance. Context helpers
expire on completion/failure.

The context translates actual native XmlText relative positions, public
`yjs-client-clock` shared-node identities, and the existing adapter's encoded
text/range selections. Application node IDs stay unchanged. Backward ranges
and collapsed boundary associations survive. A detached reference fails instead
of attaching to a guessed position. Node/cell/all selections are not invented
for legacy wire formats that did not encode them. Dedicated selection-root
verification checks the actual stored destination range, not just a temporary
translated value. Granular structured trees use an explicit root migrator and
preserve their complete shared state.

The result returns the complete original-format archive, a retained checkpoint
and a report with `sourceFormat: legacy-xml` and `activation: not-implemented`.
The original archive can reopen with the public adapter and receive subsequent
old-room batches. Those batches are rejected against the retained candidate in
isolation. This is not an automatic merge or an authoritative routing switch.

## Verified scope and remaining adoption work

The source tests use actual public and retained adapters, real wire codecs,
native selection encodings, binary and empty auxiliary roots, structured state
with stale canonical XML, source races and corruption. Recorded browser use
types in the public editor, saves a backward range, converts, selects the same
range, edits/undoes in the retained editor, inspects a read-only original archive,
and checks refusal/recovery paths. The archive also rejects attempted typing.
Compiled ESM and CommonJS checks run without `window`, `document` or a fake DOM.

All **48 new cases / 196 focused cases pass**. The complete source run has
**4,648 passes and six unchanged failures**, no skips, across 295 discovered
test files. All **16 compiled Node checks** and **nine recorded three-engine
journeys** pass. The source run exposed no new ordinary assertion failure.

The declaration build initially failed because the new restore function's
inferred return type named a private wire helper type. An explicit exported
return interface repairs declaration emission. Rebuilding the audit graph proves
all **39 compiled runtime/CSS files byte-identical** after this type-only repair;
the validated behavior and browser recordings still use those exact bytes.

The repaired declaration/public build, API snapshot and headless gate pass.
All **171 public runtime/CSS files remain byte-identical** to the prior baseline.
The same three raw-size overruns remain: core ESM about 0.1 KiB, aggregate ESM
76.0 KiB and aggregate CommonJS 59.9 KiB. No acceptance limits change.

The test fixture displays three different surfaces: the still-live old editor,
the isolated converted editor and the archived original model. It is not a
production migration UI. Screenshots are complete fixed 1440 × 1400 viewport
captures with continuous containment measurements. Review covers selected stage
screenshots and sampled recording filmstrips, not full playback or physical
devices/assistive technology. Windows WebKit host font fallback differs. Math
and Lean use source presentation in this audit.

Small tested legacy documents become larger in the retained representation.
The exact source/destination byte counts are in the evidence receipt; this batch
claims no general compression, throughput or bounded-memory improvement.

The present reader handles named top-level XML document rooms within retained
namespace bounds. Public-adapter configurations using incompatible fragment
names or nested fragment handles need explicit namespace/locator migration.
They must not be silently converted through an unrelated default fragment.

The existing [retained-to-retained handoff](YJS_RETAINED_HANDOFF_AUDIT.md) cannot
accept a legacy checkpoint as its source: that API and archive table currently
require retained source records. A future cross-format authority must atomically
archive the old-format checkpoint, install the retained destination, fence old
writers and retain old-format pending batches. Host authorization, actual
external-system coordination, informed history reset, semantic reconciliation,
archive retention and large-document cost evidence remain necessary. Local
UndoManager stacks and awareness are not serialized by this archive.

Reproduction:

```powershell
node artifacts/build-legacy-migration-20261106.mjs
node artifacts/legacy-migration-node-20261106.mjs es
node artifacts/legacy-migration-node-20261106.mjs cjs
pnpm exec playwright test --config artifacts/legacy-migration-browser-20261106.config.ts
node artifacts/curate-legacy-migration-20261106.mjs
./artifacts/run-legacy-migration-checks-20261106.ps1
node artifacts/verify-legacy-migration-20261106.mjs
```

No public adapter switch, package/site publication, parity promotion or overall
completion claim is made.

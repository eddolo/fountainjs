# Retained default adoption — 2026-11-10

This is an **unreleased local beta change**. The ordinary
`fountainjs-editor/yjs` entry now uses retained character and node identities.
The published beta and existing deployed clients do not change when this source
branch changes. Full release validation and deployment remain pending.

The public names `YjsCollaborationAdapter` and
`createYjsCollaborationExtension` stay the same. Their shared storage format
changes to `fountain-retained-document/3`, with recovery checkpoints using
`fountain-retained-checkpoint/1`. Fountain document JSON and the editor schema
remain independent of this collaboration format.

Changing an import or upgrading a package **does not migrate a room**. The new
default refuses existing XML or incompatible shared data and preserves the
visible local draft. It does not infer a protocol from an empty-looking room,
copy an old document over it, or fall back to XML editing.

## Entry points and compatibility

| Entry | Behavior in this local branch |
| --- | --- |
| `fountainjs-editor/yjs` | Retained default for new or verified retained rooms. Existing XML data is refused. |
| `fountainjs-editor/yjs/legacy` | Explicit compatibility entry for existing XML rooms, including embedded fragments. Exports the former class and factory names. |
| `fountainjs-editor/experimental/yjs-retained` | Existing retained API remains available. It uses the same retained protocol as the new default. |
| `fountainjs-editor/yjs/room` | Verifies an authority-provided room before constructing its adapter. Requests retained only unless the caller explicitly includes `legacy`. |

The implementation boundary is `src/yjs/index.ts` for the default,
`src/yjs/legacy.ts` for XML, `src/yjs/retained-adapter.ts` for retained storage,
`src/yjs/types.ts` for shared provider options, and `src/yjs/room.ts` for
protocol-aware admission. The room opener imports the XML adapter explicitly
only after verifying a legacy checkpoint and native root identity.

The legacy entry remains structurally unsafe in the documented offline
typing versus wrapping, partial-formatting and paragraph-splitting cases.
Keeping it available preserves access to stored data and supports a deliberate
migration. It does not repair that representation or certify legacy parity.
See the [original failure analysis](YJS_STRUCTURAL_RETENTION_AUDIT.md).

There are intentional API differences in the retained default.

- The supported Yjs version is now `>=13.6.32 <14`. Broader testing found
  checkpoint and history behavior unavailable in 13.6.0. The new concurrency
  regression cases pass there, but that narrower result does not establish
  compatibility for the complete adapter. Use the declared supported version.

- A room must be a compatible named top-level fragment. Arbitrary embedded XML
  fragments and broader legacy names remain accessible through the legacy entry.
  Migration can map them to an explicitly chosen retained destination name.
- Independent initialization is always a conflict. Each draft stays available
  and shared editing stops. The deprecated `preserveConcurrentRoots` boolean
  is accepted for source compatibility but cannot turn preservation off.
- The default adapter no longer exposes the XML class's `document`, `fragment`,
  `structuredAttributeMap`, or `awareness` inspection fields. Hosts retain their
  own `Y.Doc`, provider and awareness references. Code inspecting or modifying
  the old native XML tree belongs to the explicit legacy integration.
- A live incompatible update or failed shared projection stops that adapter
  session. Removing the bad root or reconnecting the same instance cannot
  overwrite its private draft or silently resume shared undo.

The retained protocol and options are beta contracts. An existing retained room
must still match the format and schema expected by its clients. A matching
portable JSON document alone does not establish compatible native Yjs identity.

## New rooms

Use [authority-backed opening](YJS_RETAINED_PREVIEW.md#open-a-room-through-the-application-authority)
for application rooms. `openYjsRoom` verifies the key, protocol, epoch, revision,
namespace and native identity before returning a bound document and extension
factory. Create the provider disconnected, then let the verified adapter start
it. Every transport write still needs the host's authority checks.

The [provisioning reference](YJS_RETAINED_PROVISIONING_AUDIT.md) performs an
atomic first-room insert. Concurrent first joiners use the same saved native
room instead of independently initializing their own copies of a template.
Authentication, authorization and persistence remain application responsibilities.

For an isolated local experiment, the direct default factory can initialize
one empty document. Copy that initialized Yjs state to subsequent peers before
mounting them. In a real application, an empty `Y.Doc` before provider sync is
not evidence that the saved room is absent. Do not initialize a separate copy on
every client or attach a provider that connects before admission completes.
The retained adapter now refuses an empty local document with a provider before
seeding or calling that provider. Load an admitted checkpoint first. The host
still must bind the provider to the correct room and enforce transport fences.

## Existing XML rooms

An application that needs to keep reading or editing its existing XML format can
select the compatibility entry explicitly.

```ts
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs/legacy'

const collaboration = createYjsCollaborationExtension({
  document: existingLegacyDocument,
  fragment: existingLegacyFragment,
  user: currentUser,
  preserveConcurrentRoots: true,
})
```

This snippet preserves the XML representation and its limitations. It neither
upgrades the room nor makes concurrent structural changes safe. A protocol-aware
application may instead request `protocols: ['retained', 'legacy']` through
`openYjsRoom` and use the verified format returned by its authority.

The migration path uses the existing source-level authority and backend
references. These administrative services are not automatically installed by
importing a browser adapter.

1. Save exact local drafts and capture the source checkpoint with the complete
   schema, structured attribute definitions and selected native fragment.
   Preserve the original bytes as well as portable document JSON.
2. Rehearse conversion and validate the projected document, auxiliary state and
   explicit source/destination namespace mapping.
3. Freeze the source through the authority and fence every writer. Atomically
   archive the frozen source and initial destination when installing the new
   protocol and epoch. A provider that bypasses this authority bypasses the fence.
4. Open a fresh retained session against the new admission. Preserve an outgoing
   draft until its save is acknowledged. Do not feed legacy updates into the
   retained room.
5. Archive late legacy updates with their original protocol. Keep exact writer
   drafts separately because merging the old XML branches can already hide text.
   Review recoverable changes against the live retained document explicitly.
6. If rollback is needed, archive accepted destination edits before restoring the
   selected original or recovered source branch. Native history and awareness
   are session state, so the migration policy resets author undo explicitly.

The [cross-format handoff audit](YJS_CROSS_FORMAT_HANDOFF_AUDIT.md) covers freeze,
atomic archives, epoch fencing, rollback and lost acknowledgements. The
[namespace audit](YJS_NAMESPACE_MIGRATION_AUDIT.md) covers embedded and differently
named sources. The [browser draft audit](YJS_BROWSER_DRAFT_RECOVERY_AUDIT.md)
covers local recovery copies. None of these paths silently merges divergent
documents from different protocols.

## Shared direction and copied containers

Running the existing behavior suite against the new default exposed two real
failures in automatic text direction during concurrent list indentation.

The retained adapter originally used its pool ID as a `directionGroup` token.
Compact pool IDs contain `:`, which the portable direction attribute rejects.
As a result, indenting an item across an automatic-direction boundary returned
`false`. `src/yjs/retained-direction.ts` now derives a bounded token from the
integrated Yjs node's public relative-position identity. The adapter and saved
placement recovery share that conversion. It keeps distinct owners distinct
without trimming or replacing characters in their IDs.

After that repair, both peers could indent, but concurrent changes produced two
top-level lists. The Hebrew direction anchor moved behind English content and
the derived direction changed incorrectly. `RestructureChildrenStep` had treated
every copied, changed container as a new opening and closing token, even when
`Node.copy` carried explicit operation lineage from the original container.

`src/core/transaction/restructure-children-step.ts` now retains a container's
opening token only when there is one same-type source and one destination with
that lineage. It recursively maps the changed children and preserves the closing
token only where source order permits. An unrelated new node or an ambiguous
split into several copies gets no inferred owner. Shared-direction preparation
also carries the original owner's lineage when adding its grouping attribute.
No matching text, hashes or schema IDs are used to guess continuity.

The original direction assertion remains intact. Additional assertions require
the disconnected peers to choose the same valid group before exchanging updates.
`tests/yjs-retained-restructure.test.ts` checks copied versus unrelated and
ambiguous containers, preserves the original `Alpha` character provenance while
new text stays new, and exercises both peer/update orders with real Yjs updates.
The concurrent case retains one original list and its parent identities, keeps
the Hebrew anchor first, and preserves peer typing through the other author's
undo and redo.

## Capacity and session ownership follow-up

The subsequent audit fixes rejection after partial shared writes and mutable
host options redirecting a pending checkpoint or connection cleanup. See
[transaction capacity](YJS_RETAINED_CAPACITY_AUDIT.md) and
[session ownership](YJS_PROVIDER_LIFECYCLE_AUDIT.md). At checkpoint `f70f9bdc`, the full source run
passed **5,118 tests in 318 files**, with zero failures or skips. Build, types,
package consumers, server/headless, format checks and existing performance
limits pass. The CommonJS aggregate allowance increases from 1,409.5 to
1,414.25 KiB for the measured 1,414.1 KiB build; other limits stay unchanged.

The ordinary public-demo audit exposed a separate Firefox native-caret race
during metadata updates, before the merge operation. The subsequent repair is
recorded below. Three guide checks also used an obsolete compatibility-example
label. These browser failures are retained; this checkpoint was not release clearance.
Receipt: `artifacts/yjs-capacity-verification-20261110.json`.

## Native selection follow-up

The view now distinguishes native selection capture from explicit commands and
passive metadata updates. It preserves pending browser movement, backward ranges,
decoration redraws, external control focus and nested NodeView selections. Native
capture requires the DOM to represent the current document, preventing recursive
presence updates during a structural edit. See [the recorded failure and repair](SELECTION_METADATA_AUDIT.md).

The full source run passes **5,134 tests in 318 files**, with zero failures or
skips. The public homepage now uses `fountainjs-editor/yjs`, including room
switches, rather than the equivalent experimental entry. Its three-engine run
has **57 passes, two existing clipboard skips and one Chromium fixture-startup
failure**. The trace records `ERR_NO_BUFFER_SPACE` while loading a source module;
the unchanged isolated case then passes. All six offline editing scenarios,
including the original Firefox caret failure, pass in all three engines.

The broader native editing run passes 39 checks initially. Three paragraph-join
checks had counted the fixture's non-document `Remote` widget as document text.
Trace snapshots prove the model was correct. Stronger assertions require both
exact rendered/model content and retained non-editable widget state; those three
checks and three existing decoration checks pass afterward. This preserves the
original keyboard actions, geometry checks and document expectations.

All **45 default-adapter browser journeys** pass again after the selection
repair, including offline deletion recovery, author undo, room replacement,
native navigation and file reopening. The website build and final type/package
checks pass. Evidence: `artifacts/selection-verification-20261110.json`.

The CommonJS aggregate allowance grows by 0.75 KiB, from 1,414.25 to 1,415 KiB,
for the measured 1,414.9 KiB build. All other size and runtime limits stay fixed.
The earlier Firefox migration-fixture cold-start delay is a separate unresolved
observation. Full release CI and production adoption remain required.

## Adoption checkpoint verification — 2c28c0ea

The [compact verification receipt](../artifacts/yjs-default-verification-20261110.json)
records the tested source hashes, results, package costs and remaining limitation.

The final combined source run passes **5,086 tests, zero failures and zero
skips**. Build, ESM/CommonJS package smoke, 450 declaration snapshots, TypeScript,
Svelte/Angular type checks, headless boundaries, server/workerd checks, and
existing performance/heap gates pass. The packed default, legacy and room
entries pass Node10, Node16 ESM/CommonJS and bundler declaration resolution.

All **45 recorded default-adapter journeys** pass in Chromium, Firefox and
WebKit, including real Enter/typing inside a concurrently deleted quote,
deletion undo and continued typing. Firefox screenshots of the hidden and
restored states were inspected visually. Evidence is in
`artifacts/yjs-default-browser-final-20261110`.

The final migration recovery run has **17 passes and one Firefox startup
timeout** before the page reaches Ready. An isolated rerun repeats the timeout;
a later identical recorded run passes without changing the assertions. The
failure and retry recordings are retained. This is an open cold-start
reliability limitation, not a clean 18-case first-run result or release approval.

See [package costs](PERFORMANCE.md#retained-default-adoption--2026-11-10) for
the measured import graph and the 0.75 KiB CommonJS aggregate allowance increase.
All other size and runtime limits remain unchanged. Full release CI and
production rollout remain required. The source-level runs below are earlier,
overlapping checkpoints rather than additional unique tests.

The default-adoption and collaboration suites pass **29 tests**. A separate
focused integration run passes **322 tests**. These are source-level results,
not a completed release matrix.

After the direction and copied-container repairs, a combined run of
`shared-direction-ownership`, `document-range-wrapping`, `list-auto-scope`,
`yjs-document-range`, and `yjs-retained-restructure` passes **97 tests**. This
includes the 92 existing focused cases and five new mapping/concurrency cases.
The runs overlap other evidence and should not be added into a unique total.

```powershell
pnpm exec vitest run tests/yjs-default-adoption.test.ts tests/yjs-collaboration.test.ts --maxWorkers=1
```

The adoption cases run in pure Node and prove retained checkpoint reopening,
refusal of existing XML without changing its bytes or starting its provider,
explicit access to embedded legacy fragments, draft preservation after late
legacy updates, rejection of wrong admission namespaces, and refusal to seed
an empty-looking document with unresolved update dependencies. General behavior
tests still use the ordinary public default. XML-specific assertions select
the compatibility entry explicitly.

The original concurrent-edit regressions remain acceptance requirements for
the ordinary default. Their content and position assertions remain intact.
Existing historical evidence applies to the builds and scopes recorded in its
audits; it does not replace a fresh release run of the combined implementation.

## Homepage recovery after a failed module load

If the homepage collaboration bundle fails to load, its fallback opens the
demo in a fresh tab. The original tab keeps its editor and draft. The new
demo starts its own in-memory room.

A WebKit production trace showed that a second tab could reuse the first
tab's failed module request. The recovery tab imports the same demo source
through a different lazy bundle URL. The two bundles are about 4.6 kB gzip
each, and a normal visit requests only its selected variant. Browser tests
abort the ordinary bundle, enter an unsaved draft, follow the fallback link
and verify a successful response from the recovery bundle. Typing then
reaches the second collaborator while the original draft stays intact.
Slow-load and failed-load journeys pass in Chromium, Firefox and WebKit in
both development and the built `/fountainjs/` preview. Three further WebKit
production runs pass the failed-load case.

The check covers a failed demo bundle request.

## Migration fixture recovery when local storage is blocked

The older Firefox traces show a 30–37 second gap between opening the server
session and mounting the source editor. Three fresh Firefox runs opened
IndexedDB in 49–87 ms. The old traces lack storage-stage timings, so the
cause of the earlier stalls remains unconfirmed.

The migration fixture now gives the initial local storage open three
seconds and offers an in-page retry when storage is unavailable. The shared
draft-storage example accepts an optional abort signal and closes any
connection that arrives after cancellation. A failed open leaves the saved
session alone and the editors wait for storage before opening.

The browser regression saves an offline draft, holds a real IndexedDB
upgrade in another tab and reopens the draft in its original tab. It aborts the upgrade
before retry, confirms the original session and text reopen without
initializing another room, then edits and reloads the draft again. The existing
recovery checks keep their original readiness and document assertions.
The 21-case CI selection passes locally across Chromium, Firefox and WebKit.

## Structural latency and empty-sibling follow-up

The later installed-package diagnostic exposes costly full-pool size checks
and unnecessary reconciliation of untouched text during a split. Conservative
constant-time capacity proofs with exact fallback and selective sibling reuse
reduce the measured 1,000-paragraph median split from 1,611.5 to 115.9 ms, and
wrapping from 340.4 to 99.5 ms. Storage limits, wire format and author-history
semantics remain unchanged. Typing still needs work: the same eleven-character
burst measures 585.8 ms after the repair. These are one-machine observations,
not production or huge-document collaboration certification.

The new tests also found a pre-existing concurrency failure: another author's
split could rewrite an untouched empty paragraph's storage; after a peer typed
there, undoing the split removed required layout. Its original shared identity
is now preserved under an exact empty-leaf/parent proof. The previously packed
build fails both delivery orders; the repaired installed package passes them.

Current validation: 5,151 source tests, 48 recorded default browser journeys,
build/types/package checks, 450 public declarations and 139 headless modules.
The new browser case visibly exercises native typing, Enter, synchronization,
Undo and Redo in all three engines. A bounded installed-consumer check also
passes with Yjs 13.6.33; the full matrix remains on 13.6.32.
[Detailed evidence and remaining typing work](YJS_ENDURANCE_DIAGNOSTIC.md#measured-repair--2026-11-10).

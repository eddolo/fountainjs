# Retained document bridge — local work in progress

2026-11-05. This is an unexported candidate, not the adapter used by the package
or website. GitHub/npm/site publication is not authorized at this checkpoint;
the user requested that the new commits remain local. The six original ordinary
failures in `tests/yjs-document-range.test.ts` remain required and unresolved in
the default adapter.

## Concrete progress

`src/yjs/retained-document.ts` now connects actual Fountain models and transaction
maps to the candidate node/text pools. Its runtime imports are the internal
`Mapping` class and the retained-node/text/mapping modules; schema, transaction,
step and Yjs imports are types. The separate pools import Yjs. It needs no DOM.
The caller supplies the actual schema, globally unique ID factory and local
transaction origin. It neither discovers extensions nor changes provider rooms.

Seed/read/save/reopen preserve root and node metadata, adjacent equal text leaves,
empty leaves, inline atoms, marks, image attributes, tables, LaTeX source, Lean
code and an extension-defined structured widget in the tested fixtures. These
are model/serialization checks, not a certification of rendering, proof checking
or external file conversion. Private text grouping and placement state remain
outside application attributes. Attribute names are encoded as UTF-16 units,
including empty names, `__proto__`, `constructor` and unpaired-surrogate keys;
metadata stays inert JSON. This does not certify arbitrary unpaired-surrogate
*text* through Yjs's wire encoding.

The scheduler uses retained opening units and exact character intervals, plus
unique retained model objects for container identity. It keeps original shared
characters while quote/list wrapping reparents containers, partial marks create
model leaves, and paragraph/list-item splits insert shared boundaries. The
private `SplitNodeStep.getRetainedSplit()` descriptor supplies edge/empty split
intent without relying on class identity or holding more model snapshots.

Concurrent cuts initially converged to the wrong order (`Al`, `a`, `ph`). Private
split-family placements now project their shared text-boundary order instead
of ordering those paragraphs by peer ID. Placement tokens invalidate this
special ordering after an explicit move. Projection makes no repair writes.
This policy has been checked for two concurrent cuts with both client-ID and
exchange orders; arbitrary multi-peer splits, joins, moves and reconnection are
still required.

Author undo initially exposed redundant identical layout writes: undo could
remove a field after its competing assignment. Metadata setters now skip equal
values. Actual command tests cover local engine undo/redo and combined-scope
Yjs author undo/redo while retaining peer typing. Later invalid custom mappings
are rejected before earlier steps write shared state. This is not yet a general
rollback guarantee for every unsupported custom operation or intermediate schema
invariant.

## New required failure, not a fallback

`tests/yjs-retained-document.test.ts` contains an ordinary failing test for
deleting all five original characters while an offline peer inserts `X` at
offset two. The shared `X` survives, but Y.Text's concurrent formatting cleanup
can leave its run without the private leaf/format attributes. `read()` refuses
that run, so the end-to-end edit still fails. Silently assigning default styles
would conceal the missing provenance, particularly for mixed marked leaves.

The next design task is to retain recoverable text/format ownership independently
of formatting items that a concurrent deletion can remove. Validate it with
mixed styles, partial/full deletion, duplicate text, Unicode, author undo/redo
and persistence. Do not weaken the failing test or count the retained raw
character as a successful editor operation.

## Adoption boundaries

Verification at this checkpoint: 4,226 source tests pass and seven fail across
286 files (4,233 total, no skips). Six failures are the unchanged default adapter
cases; one is the new candidate deletion case. The new bridge file passes 42 of
43 cases. Compiled ESM/CommonJS pass 32 pure-Node journeys and independently
reproduce the deletion blocker twice. Build, full TypeScript/Svelte/Angular
checks, 423 public API declarations, the 132-module headless boundary and package
smoke pass. Existing size limits remain red: core ESM +0.1 KiB, aggregate ESM
+67.0 KiB and aggregate CommonJS +52.5 KiB. No ceiling was raised. The candidate
does not occur in the public runtime source maps. Its compiled source maps match
the current five source modules in both formats.

The candidate still rebuilds and validates the projected document. Full-size
initialization, per-keystroke projection/lookup, memory release, long histories
and history/offline-aware compaction have not passed the production budgets.
General non-monotonic moves/joins and custom intermediate invariants are not
certified. Text/range/node/cell/gap selection mapping, awareness, review anchors,
granular structured-state overlays, provider replacement, version negotiation,
recoverable legacy cutover and recorded browser/IME/clipboard journeys remain
integration work. No public adapter switch, migration, new package entry,
dependency, size-ceiling change or release is included.

The private node codec is now `fountain-retained-nodes/2`; document and text tags
are `fountain-retained-document/1` and `fountain-retained-text/1`. They are
provisional internal formats. The earlier node codec is explicitly rejected,
not silently read using the new attribute-key/layout representation.

The verification receipt records the full source run, compiled ESM/CommonJS
Node journeys, unchanged default-adapter source and the additional required
failure: [evidence](../artifacts/yjs-document-verification-20261105.json).

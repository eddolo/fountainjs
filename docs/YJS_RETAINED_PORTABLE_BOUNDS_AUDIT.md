# Reusable immutable retained portability bounds

2026-11-06, local follow-up to `aa793b20` and the
[checked shared-projection audit](YJS_RETAINED_CHECKED_PROJECTION_AUDIT.md).
The adapter remains private and experimental. COLLAB-01 stays Partial.

## Scope and ownership

`validateRetainedDocument` can reuse previously checked portability and aggregate
bounds for unchanged immutable model subtrees. A weak schema key owns the current
node/mark type-name inventory and a weak node-keyed bounds table. Each table value
contains only node count, character count, height and cacheability; it does not
retain a model node, serialized document or per-node set of type names.

Every call checks the root's owning schema and the current type inventory. Changed
type identities or names discard the schema's prior bounds table. Accessor-based
names disable reuse. The supplied `schema.validate(document)` still runs after
the portability walk; these results do not certify schema rules, transactions,
shared storage, projection, formats outside the checked metadata, or permissions.
The existing fresh factory checks during model normalization are unchanged.

Only frozen standard model nodes/marks with deeply frozen plain JSON attributes
are eligible. Host array subclasses, custom mark serializers, mutable untyped
text values and other uncacheable values retain live evaluation. Once such a
value is encountered, the remainder of that evaluation stays live, so a host
serializer cannot change later type names behind an already checked inventory.
Object/array prototype serializers and a changed mark serializer disable reuse.
Serializer eligibility is inspected through a property descriptor, without
invoking a getter, including when the original method reference is captured.

## Bounds remain per occurrence

The limits remain 100,000 nodes, depth 100 and 10,000,000 characters. A reused
subtree contributes its full count and character total each time it occurs, and
its height is checked against its actual current depth. An immutable node reused
ten times does not count as one occurrence. New nodes and metadata still receive
the original portable-JSON, key/name, mark and text-format checks before reuse
can be recorded. Metadata encoding and format limits are unchanged.

Thirteen new cases exercise depth after wrapping a cached subtree, repeated
subtree node counts, repeated-text character counts, changed node and mark names,
live host-array and mark serializers, a host serializer changing a later node's
type name, mutable untyped text length, changed prototype serialization, a
prototype getter, current schema delegation, and newly introduced bad metadata.

Review found that directly reading the serializer method for an eligibility
check could invoke a getter. The final implementation uses descriptors instead.
The first successful run is preserved locally, and type, focused/full source and
recorded browser checks are refreshed after the repair. Unchanged public package
checks remain supported by byte-identical distribution files.

## Verification and diagnostics

The final focused run has 306 passes and the same six required default-adapter
failures, 312 total, including all 290 passing candidate cases. The refreshed
complete source run has 4,436 passes and those six failures, 4,442 total across
all 289 discovered source files, without skips. Required failures are checked
by name and remain ordinary failing assertions; they are not treated as a green
release gate.

The baseline is compiled from `aa793b20`, with embedded sources checked against
its actual Git blobs. Separate uninstrumented three-trial timing processes and
an instrumented real-editor JSON-work probe compare exact final document and
encoded-state hashes. The JSON probe restores `JSON.stringify` before correctness
checks and does not supply latency measurements. Paired receiver, snapshot/live
memory, 1,024-edit history, compatibility and compiled Node checks keep their
existing scopes; no acceptance limit or default adapter is changed.

| Paragraphs | Baseline initialization median | Current initialization median | Baseline local edit median | Current local edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 124.21 ms | 117.57 ms | 9.79 ms | 7.38 ms |
| 5,000 | 569.44 ms | 578.79 ms | 51.65 ms | 43.70 ms |
| 10,000 | 1,059.63 ms | 983.33 ms | 106.44 ms | 89.49 ms |

All three timing trials at each size preserve exact model and encoded-state
hashes across builds. The independently instrumented 5,000-paragraph edit reduces
`JSON.stringify` calls from 40,037 to 10,043, with identical output. Initialization
is mixed; these sequential reduced-priority, two-logical-processor measurements
are scoped local diagnostics, not competitive benchmarks or new adoption gates.

The one-trial paired receiver diagnostic is essentially unchanged: remote edits
measure 32.52/116.52/254.11 ms before and 32.94/117.69/254.80 ms after at the three
sizes. This change targets local preflight, not remote projection. The new CPU
profile continues to identify `normalizeFrame` and its model walk as major costs.

The 1,000-paragraph two-editor snapshot diagnostic retains 2,193 unique model
nodes and 0.54060 MiB of extra memory for 65 exact receiving-editor versions in
both builds. With saved snapshots cleared but both editors/Yjs documents alive,
total measured memory is 42.01407 MiB before and 42.26511 MiB after, about +0.25
MiB for the pair. This single GC diagnostic exposes the tradeoff, not a general
steady-state or bounded-memory guarantee.

All 36 compiled ESM/CommonJS Node journeys and 28 old/new compatibility journeys
pass. Three paired 1,024-edit sessions per build preserve exact models/shared
bytes through offline typing, complete author-only undo/redo and reopen, and
release both editors/Yjs documents after destruction. V1 history still reaches
118,390 bytes after full redo; compaction is not delivered here.

All 99 recorded browser journeys pass without skips or retries: 33 each in
Chromium, Firefox and WebKit. They verify the actual compiled runtime and retain
native editing, selections, cursor/label navigation, author history, mounted
room replacement, download/reopen and 1,000-paragraph workflows. Six final stage
captures are byte-identical to reviewed parent captures; six new six-frame
recording filmstrips were visually inspected. Startup/loading frames and audit-host
font differences are not final-layout proof. This is sampled review, not complete
playback or physical-device/IME/accessibility certification.

Types, public API/package/headless/server and existing performance/heap checks
pass. All 171 public runtime/CSS files remain byte-identical; no API, default
adapter, CI workflow or numerical limit changes. The same three size overruns
remain failing gates.

The [comparison receipt](../artifacts/retained-portable-bounds-comparison-20261106.json)
contains complete measurements. The [verification receipt](../artifacts/retained-portable-bounds-verification-20261106.json)
binds current source, refreshed check results, compiled source-map/Git-blob
provenance, measurements and reviewed browser artifacts.

## Remaining work

Model normalization and provenance planning still traverse the model. Remote
and structural changes still acquire the full shared graph. Large-document
latency, initial/shared-history storage cost, compaction, migration and safe
adoption remain unfinished. The default adapter's six retention failures, three
existing size overruns, complete fresh release CI and broader physical-device,
IME/accessibility confidence remain open. No GitHub push, npm release, website
publication, protocol change, capacity increase or overall parity promotion is
performed.

# Retained collaboration storage candidate

Local work in progress, 2026-11-05. These components are not exported through
the package, connected to `YjsCollaborationAdapter`, or used by the demos. The
six ordinary failing cases in `tests/yjs-document-range.test.ts` still fail.
This is a storage-foundation checkpoint, not a collaboration-parity claim.

## Components and tested boundaries

`src/yjs/retained-text.ts` imports Yjs directly. Character sequences live in
stable named pools independently of the document tree. Private partition embeds
give the two sides of a paragraph boundary distinct shared sequence positions;
projection returns only text/format runs. Splitting inserts a boundary and joining
removes it without copying the retained characters. Formatting uses Y.Text
attributes rather than making a new shared text sequence for every model leaf.
Unknown embeds/attributes and incompatible versions are rejected with their raw
shared data intact. UTF-16 offsets match the current engine and Yjs; private
embed positions must be translated at the eventual adapter boundary.
[Y.Text contract](https://docs.yjs.dev/api/shared-types/y.text),
[relative positions](https://docs.yjs.dev/api/relative-positions).

The first concurrent-initialization test exposed a container race: assigning
separate nested maps to the same keys allowed one peer's pool to replace the
other's. The candidate now uses stable named top-level containers. Both peers'
independent initial streams survive synchronization. Tests also cover duplicate
text, deletions, concurrent marks/splits, typing on opposite sides of an existing
boundary, repeated empty splits, Unicode/invisible characters, author undo/redo,
relative anchors and reopening encoded shared state without local caches.

`src/yjs/retained-nodes.ts` imports Yjs and schema types only. Metadata records
remain in a pool while tree placements hold references. One atomic placement
register chooses the visible owner of a concurrently moved node. Attribute
fields merge separately; reparenting does not detach the original record or its
descendants. Node/placement identities come from an injected globally unique
ID factory. Local visible cycles are refused. Concurrent cycles are projected
deterministically by lifting the greatest participating ID to the root, with a
diagnostic and no repair writes. Duplicate active references render once and
produce a diagnostic. Unattached records are reported, not declared preserved
in the rendered document. Schema-valid projection remains the adapter's duty.

Concurrent field-arrival order initially produced equal metadata values with
different serialized key order. Projection now sorts metadata keys by a portable
ASCII order. A regression checks both semantic equality and identical serialized
projections, protecting document-equality and fingerprint consumers from that
arrival-order difference.

Node-pool tests cover concurrent moves, metadata edits, cycles, deletion/move
ownership, author-scoped undo/redo, startup, opaque paragraph/heading/list/table/
media/custom-node records, portable metadata validation and saved-state reopening.
Generic record tests do not certify the editor behavior of those node types.

`src/yjs/retained-mapping.ts` imports model/mapping types only. It composes the
actual transaction maps into retained source intervals, then intersects those
with old/new text leaves. Results identify retained, deleted and inserted slices
without assigning identity by text similarity. Untruthful maps that change text,
move text into structural tokens, or report the wrong document size are refused.
Actual quote/list/mark/split/history commands and repeated-character replacements
exercise this boundary. No old model roots are cached by these components.

## Verification and limits

The final focused binding run executes 94 cases in eight files: 88 pass and the
six existing default-adapter retention cases fail. All 51 new candidate cases
pass within that run. TypeScript passes. Twenty compiled ESM/CommonJS Node
cases run without DOM globals: twelve combine node/text pools, Fountain schema
validation, concurrent typing/metadata and author undo; eight exercise plans
from actual engine transactions. These are candidate consumers, not consumers
of a new published package entry or a wired editor adapter.

The existing 171 runtime distribution files are byte-identical to the preceding
local checkpoint; the public API still verifies across 423 declaration files.
The candidate is not loaded by the existing browser entry points, so no new
browser behavior or candidate browser validation is claimed. No dependency,
public export, acceptance ceiling, live provider room or npm/site release changes.

Candidate format tags are `fountain-retained-text/1` and
`fountain-retained-nodes/1`. They are internal, provisional contracts. Existing
collaboration fragments have not been migrated or rewritten.

## Required integration before adoption

- Implement the model/graph serializer and transaction scheduler in the real
  adapter. Preserve complete root/node metadata, inline atoms, empty leaf state,
  marks, stable IDs and structured-attribute overlays. Use truthful operation
  provenance for moves that cannot be represented by monotonic StepMaps.
- Define concurrent split ordering across the graph and text sequence together.
  Independent component convergence does not prove correct sibling order in
  the composed document. Exercise simultaneous splits, joins, reparenting,
  replacement and deletion through actual Fountain commands.
- Map text/range/node/cell/gap selections and awareness between model positions
  and pooled identities. Boundary embeds must never appear in model JSON,
  clipboard data, source inspection or exports. Validate author undo/redo across
  the combined scopes, including comments/revisions and provider replacement.
- Define an explicit version/cutover contract for existing documents and offline
  clients. Do not migrate a live legacy room merely because one upgraded client
  connected. Preserve a recoverable original and refuse mixed protocol writes.
- Establish bounded initialization, projection, lookup, long-edit and released-
  memory behavior at the existing large-document targets. Old placement records
  and deleted-node metadata need history/offline-aware compaction; arbitrary
  eager deletion would recreate the identity-loss problem.
- Keep the original six failures as acceptance tests, expand both exchange orders
  and multi-peer cases, then repeat real browser editing/selection/IME/clipboard
  and persistence/export journeys. Candidate component checks cannot replace
  those tests or certify physical mobile behavior.

[Candidate evidence](../artifacts/yjs-retained-storage-verification-20261105.json).

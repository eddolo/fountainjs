# Retained collaboration: transaction capacity audit

## Failure reproduced

The retained store previously checked storage limits while executing a document
transaction. Yjs does not roll a transaction back when a callback throws. At a
full style registry, replacing a selected character deleted that character and
then failed to insert its replacement. A later failed step could also leave
earlier steps shared with peers despite reporting an error.

Two further reproductions exposed formatting limits: a valid 600-field format
changed to a disjoint 600-field format needs 1,200 wire fields; historical
removals remain as `false` wire fields even after disappearing from the model.
New streams created by an earlier step need the same checks before creation.

## Boundary and implementation

- `src/yjs/retained-document.ts`: validates every intermediate model and reserves
  the entire transaction inside the Yjs callback, after `beforeTransaction`
  hooks and before any local shared write. Native text reservation and execution
  share the same prepared binding, layout, actual text and format proof.
- `src/yjs/retained-nodes.ts`: checks node/identity pools and actual physical
  child-reference slots, including duplicated slots in admitted data.
- `src/yjs/retained-text.ts`: checks partition/stream/style capacity, cached style
  consistency, physical stream characters, and raw format keys including hidden
  removal fields and insertion provenance.

There is no live-state clone/replay, rollback, raised storage limit, or shared
mutation during reservation. Caller ID factories are not consumed by preflight.
Native typing does not construct whole-document provenance maps. With a cached
style, ordinary partial replacement and deletion still work at a full style
pool. Failing adapter writes retain the author's visible private draft, report
an error, and cannot resume through undo or reconnect; the peer stays unchanged.

## Computed structural bounds

Reservation uses mapped retained opening identities and source ownership, not
text similarity. For each step:

- `N`: nontext target nodes without a retained opening identity.
- `G`: text groups requiring a new backing stream. Retained pieces claim their
  partitions before fallback groups; a conflicting fallback reserves a fresh
  stream instead of claiming the same partition twice.
- `P`: source-binding upper bounds for origins targeting multiple groups, plus
  at most two empty pieces for an explicit boundary split.

The step reserves `N + G + P` nodes, `G + P` partitions, and `G` streams. It
reserves two identities per possible new node, plus one possible placement per
target structural node/backing partition when ownership or order can move.
These reservations accumulate across steps. Unchanged groups and ordinary
metadata/mark changes do not reserve fake nodes or partitions. Provisional
origins carry new streams through subsequent steps, including splits and hiding
an ancestor, so hidden text cannot disappear from the physical growth budget.

The existing limits remain 100,000 nodes/partitions/streams/style definitions,
1,000,000 identity/reference slots, 100,000 split entries, 10,000,000 characters
per physical stream, and 1,000 wire format fields. Format preflight also allows
for the full permitted 200-character generated leaf identity in provenance.

## Conservative cases and limits

General reconciliation reserves one possible fresh style per inserted target
leaf per step; it does not claim cached-style reuse it cannot prove. General
stream growth counts all inserted characters without subtracting deletions.
Formatting reserves the union of requested keys against physical runs,
including previously removed keys. Repeated, correlated splits can overestimate
partition growth. These computed bounds can refuse a complex batch before the
exact physical limit. Compact a historical room, reduce the batch, or reduce
its fields/content; compaction cannot make genuinely oversized content fit.

This is a capacity preflight for retained model transactions, not automatic
compaction and not an exception-safe sandbox for arbitrary host callbacks,
malformed ID factories, or custom steps with side effects. It does not remove
the need for checkpoint admission, epoch coordination, or explicit recovery of
a private draft. Existing stale-room and malformed-wire checks remain active.

## Regression evidence

- `tests/yjs-retained-capacity.test.ts`: byte-identical refusal at style capacity;
  cached replacement/deletion at capacity; whole-batch refusal; newly created
  4M-character stream split with hidden text followed by a 7M insertion; public
  two-peer private-draft preservation; transaction-start hook ownership; and a
  mark edit in a fresh 25,000-paragraph document without new structural pools.
- `tests/yjs-retained-format-capacity.test.ts`: disjoint 600-field formats,
  accumulated hidden removal fields, formatting a new stream later in the same
  transaction, and 200-paragraph batch alignment with all five pools unchanged.
- `tests/yjs-retained-reservation.test.ts`: twelve independent cases asserting
  actual allocation is bounded by reservation for replacement, empty groups,
  split boundaries, wrapping, reordering, marks and metadata.

The final targeted source run passed **244 tests in seven retained files**
(13.16 seconds, one worker), including all 23 new capacity/format/reservation
checks. TypeScript and diff-whitespace checking passed. Final integrated build,
suite, and browser evidence belongs in
the parent integration receipt; these checks do not claim those runs completed.

# Retained collaboration moves, cost and cursor labels

Local follow-up to the [cursor overlay audit](COLLABORATION_CURSOR_OVERLAY_AUDIT.md),
2026-11-06. This work does not switch the default adapter or publish a release.

## Moving content without moving a peer's insertion

A new actual-adapter test exposed a provenance defect: moving `Alpha` after
three sibling paragraphs while an offline peer inserted `X` at offset two
could produce `AlphaX`, rather than `AlXpha`. The peers converged, but the
insertion's intended position was lost. This was newly exposed by the audit;
it is not established as a regression introduced by the scheduling optimization.

`src/core/structure-commands.ts` implements a block move with a child splice
that reuses immutable nodes. Its replacement position map cannot by itself
describe non-monotonic movement. `src/yjs/retained-mapping.ts` now supplements
map-derived character slices using an unchanged text object's identity only
when it appears exactly once on both sides and neither leaf already has
map-derived ownership. It does not match equal strings or override partial
character replacements. Ambiguous repeated objects are refused.

`src/yjs/retained-document.ts` imports `ReplaceStep` from
`../core/transaction/replace-step` and explicitly enables this fallback for
child splices, in both preflight and application. Explicit whole-document
replacement keeps its existing replacement semantics. The change is private
to the experimental bridge: general public non-monotonic position mapping,
including every comment/annotation anchor through moves, is not certified here.

Four adapter cases cover with/without peer typing and both update exchange
orders, followed by author-only undo and redo. Four mapping cases cover the
fallback's ownership boundaries. Compiled ESM and CommonJS checks exercise the
same lifecycle in pure Node, with the engine and adapter in one module graph;
this also checks the runtime `ReplaceStep` identity across their import boundary.

## Measured cost and the smallest safe scheduling change

`RetainedDocumentStore.change` previously rebuilt and validated a parent's
ordered children separately for every desired child. It now reads the list
once and refreshes it after each actual move. Nothing is cached across
transactions, and metadata limits and validation remain in force.

The diagnostic in `artifacts/retained-adoption-cost-20261106.mjs` uses the actual
compiled editor and adapter, twelve timed character insertions and one separate
instrumented insertion. Timings exclude instrumentation. Both configurations
must produce exactly the same JSON as a plain editor. The instrumentation
counts calls to the public `Y.Map.size` getter and sums the live cardinalities
it returns; these are diagnostic operation counts, not measured CPU cycles.
The installed Yjs implementation iterates its map to calculate that getter.

| Single-trial diagnostic | Before | Final candidate |
| --- | ---: | ---: |
| 100 paragraphs: median edit | 224.26 ms | 93.29 ms |
| 100 paragraphs: size getter calls, extra edit | 29,892 | 9,894 |
| 100 paragraphs: summed returned cardinalities | 7,713,004 | 1,713,604 |
| 100 paragraphs: encoded shared state | 181,389 bytes | 181,389 bytes |
| 500 paragraphs: median edit | No completed result | 1,238.42 ms |
| 500 paragraphs: initialization | No completed result | 15,211.64 ms |

The earlier 500-paragraph baseline was deliberately stopped after it became
prohibitively slow; its partial log is retained, not treated as a completed
benchmark. A first exploratory optimized 100-paragraph trial measured 64.05 ms,
illustrating why these single trials are not a stable speedup guarantee. The
final run is the table's comparison. Node was v24.22.1, with reduced priority
and affinity to two logical processors; client IDs are not fixed across trials.

The remaining cost is unacceptable for adoption. Full model projection,
repeated validation/index scans and text projection invalidation need further
measurement and incremental design. History/metadata growth, compaction,
migration and large-document capacity also remain open. Public editor
performance gates do not certify this experimental adapter.

## Keeping peer labels visible

`src/extensions/collaboration.ts` marks name labels with
`data-fountain-overlay-label` and gives them automatic text direction.
`src/view/widget-overlays.ts` measures those labels separately from their
caret. It clamps labels into the visible editor/ancestor/viewport intersection
and can place a top-edge label below its caret. It batches label measurements
before writing translations and preserves the label's existing transform.
Oversized labels with no fitting placement are hidden. The caret, native
selection and editable document do not move.

`src/styles.css` bounds the supplied label's width using
`--fountain-overlay-label-width`. This is a private DOM layout convention,
not a document attribute or a new package entry. Browser cases cover long Latin
and Arabic names, both document directions, a 360-pixel viewport, atomic media,
top-edge scrolling, external input focus and unchanged document JSON.

## Reproduction and evidence

The focused source run passes 187 tests. All 84 compiled browser journeys pass
(28 per engine), with 84 recordings, no retries and no skips. All 32 compiled
Node journeys pass without a fake DOM. Source maps match all 190 current source
modules in the canary. Visual review includes narrow and top-edge screenshots
and sampled recording frames across Chromium, Firefox and WebKit; it does not
certify physical-device IME.

The full source run initially reported 4,314 passes and seven failures out of
4,321 tests. Six are the unchanged required default-storage failures. The
seventh was `tests/ci-browser-evidence.test.ts` still assuming five browser
commands after the preceding checkpoint added a sixth required job step. Its
repair verifies all six distinct evidence paths and mandatory presence uploads,
while retaining the five existing preflight/headless checks. Both CI-evidence
tests and TypeScript pass on targeted rerun. Only that bookkeeping test changed
after the full run; a second full source run was not performed. The initial
seven-failure report is preserved rather than rewritten as a six-failure run.

Build, API, headless, package, Node/workerd server, framework types and existing
public performance/heap gates pass. API declarations and acceptance ceilings
are unchanged. CSS is 88.704 KiB under the 88.75 KiB ceiling. The size gate still
fails for core ESM (0.1 KiB), aggregate ESM (75.9 KiB) and aggregate CommonJS
(59.9 KiB) overruns. Those failures and the six default-storage failures remain
release blockers. No GitHub CI execution is claimed.

`artifacts/cursor-label-verification-20261106.json` records report/source hashes,
every recording and the scoped CI rerun. Its verifier checks exact known failure
names, current source-map contents, unchanged API/default adapter/limits and
compiled runtime imports in every browser journey. Complete raw reports and
traces stay local; the receipt, reproduction tools and representative captures
and recordings accompany the checkpoint.

```text
pnpm exec vitest run tests/yjs-retained-adapter.test.ts tests/yjs-retained-document.test.ts tests/yjs-retained-text.test.ts tests/yjs-retained-nodes.test.ts tests/yjs-retained-mapping.test.ts tests/widget-overlays.test.ts tests/collaboration.test.ts --maxWorkers=1
pnpm exec playwright test --config artifacts/cursor-label-final-20261106.config.ts
node artifacts/retained-adapter-node-20261106.mjs es cursor-overlay-build-20261106 cursor-label-node
node artifacts/retained-adapter-node-20261106.mjs cjs cursor-overlay-build-20261106 cursor-label-node
node artifacts/retained-adoption-cost-20261106.mjs 100,500 retained-adoption-cost-final-20261106
```

The browser command builds the compiled canary first. It uses private port 4195,
headless Chromium/Firefox/WebKit, one worker, videos and traces; it opens no
visible windows and does not reuse the user's servers. Node probes use that
same canary. The default cost diagnostic runs only 100 paragraphs; larger runs
are an explicit choice. Historical receipts remain historical, and known
default-storage failures and size overruns remain release blockers.

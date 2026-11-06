# Operation-local retained node reads

2026-11-06, local follow-up to `cf711c69` and the
[comparison/planning audit](YJS_RETAINED_COMPARISON_AUDIT.md).
This remains a private candidate optimization. COLLAB-01 remains Partial.

## Change and boundaries

`src/yjs/retained-nodes.ts` collects records with one node-pool iteration during
`project()`, checking each identity and record type. It retains those records
and checked placement values only for that synchronous call. Ownership
resolution and visible-tree traversal reuse the checked reads instead of
repeatedly looking up the same records and placements.

The next projection creates new local maps and sees writes made inside an
unfinished caller-owned Yjs transaction. No event-driven cache, cross-call
projection cache, listener or persistent index is added. Pool limits and
representation versions stay unchanged. Child references, metadata, marks,
text layout, depth and ownership are still validated. Deterministic cycle
lifting, duplicate-reference reporting and unattached-record reporting remain.
Projection still performs no shared repair writes. Cached placements are limited
to known node identities, so dangling references cannot grow the temporary
map beyond the bounded node pool. Unknown references are still validated.

Nine added cases cover pending moves/deletion/restoration with unchanged earlier
snapshots; malformed parent/token/extra placement fields and repair within the
same outer transaction; malformed placement on a deleted but referenced node;
replacement of a record at the same identity before transaction completion;
and unplaced, falsely claimed and malformed references outside the node pool.

## Measurements

The baseline is compiled from `cf711c69`, with source maps checked against its
actual Git blobs. The candidate engine and adapter share one compiled graph.
In a separate instrumented actual edit of 5,000 paragraphs, top-level node-pool
`Y.Map.get` calls drop from 45,001 to 15,001 and placement-map calls from 30,000
to 20,000. This counts the whole adapter edit, not just `project()`. Final model
and encoded shared-state hashes are identical; the 9,307,981-byte instrumented
state is unchanged. Instrumentation is restored before the reference assertion.

Three sequential uninstrumented trials per size compare twelve timed edits
against an ordinary editor reference. Every document and encoded shared-state
hash matches between both builds and every trial at each size.

| Paragraphs | Before initialization median | After initialization median | Before edit median | After edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 132.89 ms | 118.47 ms | 46.57 ms | 41.37 ms |
| 5,000 | 572.67 ms | 522.08 ms | 199.84 ms | 206.64 ms |
| 10,000 | 1,186.93 ms | 1,036.94 ms | 396.68 ms | 395.00 ms |

Initialization is lower in this run, but editing timings are mixed. The lookup
reduction does not demonstrate a general editing speedup: full projection,
model rebuilding and other shared-store work remain, and temporary local maps
also require allocation. This
is not incremental projection, a general speed claim or an adoption certificate.
The workload runs at reduced priority on two logical processors; no acceptance
limits change. The earlier comparison audit used a different timing run, so
its absolute numbers should not be combined into one continuous benchmark.

Three paired 1,024-edit sessions per build preserve offline peer typing,
complete author-only undo/redo, reopen, all stage container counts/shared sizes,
and final document/shared-state hashes. Editor/document references are released
after destruction. History growth remains; this does not certify bounded
memory for an indefinitely live editor. Twenty-eight old/new candidate
compatibility/history journeys also pass.

## Verification

All 239 candidate source cases pass. The focused six-file run has 255 passes
and six unchanged required default-adapter failures, 261 total, with no skips.
The fresh complete source run has 4,385 passes and those same six failures,
4,391 total across all 289 discovered files, without skips. The receipt checks
the exact failure names and the discovered source-file set rather than treating
the expected nonzero exit as a green suite.

Compiled ESM/CommonJS consumers pass 36 pure-Node journeys without DOM globals.
All 96 recorded browser journeys pass without retries/skips in Chromium,
Firefox and WebKit. These include native 1,000-paragraph edits with independent
keyboard history, structural offline edits, continued typing/Enter after host
observer writes, room replacement, download/reopen, directional/grapheme
navigation and presence rendering. Every journey verifies compiled imports;
embedded source maps match current production files. Six stage captures and
three sampled six-frame recording filmstrips are reviewed. This is not full
video playback, physical-device/IME or assistive-technology certification.

Types (including Svelte/Angular), build, API, headless, package, server/workerd
and existing public performance/heap checks pass. All 171 public JavaScript,
CommonJS and CSS files remain byte-identical. The public API snapshot, default
adapter and its required tests, capacity/performance limits and CI workflow
are unchanged. The three existing size overruns remain: core ESM 0.1 KiB,
aggregate ESM 75.9 KiB and aggregate CommonJS 59.9 KiB.

## Remaining work

Full projection and large-document editing costs, history/metadata growth,
compaction with explicit old-peer/undo semantics, legacy migration and safe
adoption remain open. The six default-adapter failures and complete fresh CI
must be resolved before release. No default adapter switch, limit increase,
overall parity promotion or publication follows from this checkpoint.

The [verification receipt](../artifacts/retained-projection-reads-verification-20261106.json)
records sources, compiled modules, report hashes, exact failures and visual
evidence. Broad raw reports/traces remain local; representative captures,
recordings, measurements and reproduction tools accompany the checkpoint.

## Reproduction

```text
node artifacts/build-retained-baseline.mjs cf711c69 retained-projection-reads-baseline-20261106
node artifacts/build-cursor-overlay-canary-20261106.mjs
node artifacts/retained-read-controlled-cost-20261106.mjs retained-projection-reads-baseline-20261106-build retained-projection-reads-cost-baseline-20261106 3 1000,5000,10000
node artifacts/measure-retained-node-reads-20261106.mjs retained-projection-reads-baseline-20261106-build retained-projection-reads-counts-baseline-20261106 5000
powershell -NoProfile -File artifacts/run-retained-projection-reads-checks-20261106.ps1
powershell -NoProfile -File artifacts/run-retained-projection-reads-probes-20261106.ps1
node artifacts/verify-retained-projection-reads-20261106.mjs
```

The runner keeps individual exit codes/logs. Its focused/full-source/budget
commands remain nonzero for the exact existing failures checked by the verifier.
Browser runs are headless, one worker, on private port 4195. No user server is
reused and no visible browser is opened.

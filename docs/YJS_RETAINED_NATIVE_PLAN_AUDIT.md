# Native retained-text provenance preflight

2026-11-06, local follow-up to `e994643a` and the
[portability-bound audit](YJS_RETAINED_PORTABLE_BOUNDS_AUDIT.md).
The retained adapter remains private and experimental; COLLAB-01 stays Partial.

## What changes

`src/yjs/retained-document.ts` can prove the provenance of a single native
`ReplaceTextStep` without constructing a whole-document retained-text plan.
The operation must use the native `apply`, have one exact native position map,
retain ancestor types/attributes/mark identities and sibling object identities,
and produce exactly the expected replacement in the selected text leaf.
Walking ancestor siblings still costs work; this is not a fully incremental
document model or a promise of constant-time editing.

The proof copies and freezes the path and captures range/text scalars before
opening the shared transaction. A Yjs `beforeTransaction` listener can therefore
not redirect this validated native write by changing the original step's path,
range or inserted text after preflight.

All custom operations and multi-step transactions retain complete text-plan
preflight before opening the shared transaction. A native proof does not certify
that the underlying shared partition is eligible for direct writing. Pending
shared changes, empty/full-leaf replacements, incomplete bindings and mixed
formats still decline the direct path; generic reconciliation derives its plan
before its first write. The actual shared partition is read and checked before
direct insertion/deletion. Existing shared-frame freshness, live factory/schema
rules, normalization and final document-shape comparison remain in force.

No public entry, default adapter, shared representation version, capacity limit,
API snapshot, or CI acceptance rule changes.

## New regression coverage

Eight cases in `tests/yjs-retained-document.test.ts` cover:

- native leaf construction changing metadata;
- native ancestor copying changing an otherwise untouched sibling;
- an equivalent composed map using the generic path with author undo/redo;
- identity and outside maps falsely claiming retained text, rejected before
  opening a shared transaction;
- a later dishonest native map rejected before an earlier valid step writes;
- transaction-start hooks mutating either the original range/text or path,
  while the originally validated edit remains the one actually applied.

The tests retain exact shared-state and observer assertions. Existing generic,
Unicode, mixed-style, full-deletion, pending-write, normalization and observer
contracts remain unchanged.

## Verification

The refreshed focused run has 314 passes and the same six required default
adapter failures, 320 total, including all 298 passing retained-candidate cases.
The complete source run has 4,444 passes and those six failures, 4,450 total
across all 289 discovered source files, without skips. The failures remain
ordinary failing assertions checked by name; the release suite is not green.

Type checking, build, API, packed-package, headless/server runtime and public
performance checks pass. All 171 public runtime/CSS files are byte-identical to
the preceding checkpoint. The three existing size overruns remain: core ESM
about 0.1 KiB, aggregate ESM about 76.0 KiB, and aggregate CJS about 59.9 KiB.
No acceptance limit was raised.

All 99 recorded browser journeys pass, 33 each in Chromium, Firefox and WebKit,
with one headless worker, no retries and no skips. Every journey verifies the
compiled runtime rather than development-source imports. Native offline edits,
marked replacement/deletion, both authors' keyboard undo/redo, distant editing
in 1,000 paragraphs, host observers, room replacement and JSON reopening remain
covered. Six new recording filmstrips were visually reviewed; final stage
captures are also compared with the reviewed parent revision. This is sampled
visual evidence, not full video playback or physical mobile/IME certification.

All 36 compiled pure-Node ESM/CommonJS journeys and 28 old/new compatibility
journeys pass. Three paired 1,024-edit sessions per build preserve exact models,
shared bytes, author-only undo/redo and reopened documents; both editor/document
references are released after destruction. Shared V1 history still reaches
118,390 bytes after redo. This change does not provide compaction.

## Controlled diagnostics

The baseline is compiled from `e994643a`. Embedded source maps are checked
against that commit's Git blobs and the current source, with matching sets of
191 modules. Timing runs use three sequential trials at each size, reduced
process priority and two logical processors; they are local diagnostics, not
competitive benchmarks or adoption gates. Final model and shared-state hashes
match across builds at each size.

| Paragraphs | Baseline initialization median | Current initialization median | Baseline local edit median | Current local edit median |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 129.40 ms | 142.63 ms | 8.39 ms | 7.99 ms |
| 5,000 | 624.98 ms | 569.77 ms | 50.02 ms | 38.60 ms |
| 10,000 | 1,162.66 ms | 1,092.02 ms | 96.76 ms | 78.40 ms |

Initialization is mixed and the small-document timing difference is modest.
The separate instrumented 5,000-paragraph native edit reduces String.slice calls
from 10,006 to 6. Instrumentation is restored before checking exact output, and
that probe is not used for latency claims. This measures avoided provenance
span work, not an overall 1,000-fold speedup.

The one-trial receiver diagnostic remains mixed: 33.45/126.84/275.25 ms before
versus 30.68/144.81/275.52 ms after at 1k/5k/10k paragraphs. Remote projections
retain full shared acquisition. The new CPU profile still identifies
`normalizeFrame`, its model walk and attribute processing as major costs.

The two-editor snapshot diagnostic retains 65 exact versions with 2,193 unique
model nodes and 0.54060 MiB extra memory in both builds. With saved snapshots
cleared and both editors/documents still live, measured total memory is
42.29780 MiB before versus 42.16912 MiB after. This single GC diagnostic is not
a steady-state or bounded-memory guarantee.

Reproduction uses `artifacts/run-retained-native-plan-checks-20261106.ps1`,
`artifacts/run-retained-native-plan-probes-20261106.ps1` and
`artifacts/verify-retained-native-plan-20261106.mjs`. The verifier checks actual
failures, compiled-source identity, shared/model hashes and unchanged public
files/limits; it does not turn the known failures into release passes.

## Remaining adoption work

The default adapter still loses offline typing in six wrapping/mark/split
scenarios. This private alternative is not promoted by these optimizations.
Whole-model normalization, remote acquisition, large-document costs,
history/storage growth, compaction, legacy migration and safe adoption remain.
Three existing raw-size overruns and complete fresh release CI remain open.
No GitHub, npm or website publication is part of this checkpoint.

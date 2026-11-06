# Retained document projection and observer writes

The later [text-operation/session audit](YJS_RETAINED_TEXT_SESSION_AUDIT.md)
adds repeated compiled long-session diagnostics and current browser proof.
Numbers below belong to this earlier projection checkpoint.

2026-11-06, local follow-up to `168707c6` and the
[fresh-read audit](YJS_RETAINED_READ_PERFORMANCE_AUDIT.md). The default adapter,
wire format, migration policy and public package entries remain unchanged.

## Change

`RetainedDocumentStore.change` already projects the changed shared document and
checks its complete JSON against the intended model. `apply` then performed
another full projection unconditionally. `src/yjs/retained-document.ts` now
returns the actual checked projection from `change` and can reuse the final one
within that same `apply` call. It still validates its schema before returning.
Source metadata, all step provenance and pool validation remain in force.

Reuse is conditional. A temporary `afterTransaction` listener detects relevant
follow-up Yjs transactions during observer/cleanup processing. Transaction
identity is used rather than origin: an observer can legitimately use the same
origin as the writer. Any relevant follow-up triggers the existing fresh `read`;
empty transactions also use that path. The listener is removed in `finally`,
including failure. The reuse decision/result are scoped to this call; existing
store model/path indexes remain, with no new cross-transaction cache or bypass
option. Reads inside an outer transaction return state at their call boundary;
subsequent writes remain visible to later reads.

## Behavioral proof

Before changing the implementation, the two affected test files passed 96 cases,
including eight new observer/outer-transaction scenarios. The final five-file
candidate suite passes 191 tests after adding a direct observer text-write case.
The contracts cover map observers, transaction observers, matching origins,
outer transactions with multiple applies, empty transactions, malformed observer
output, repair/recovery, unrelated namespaces and actual-adapter author history.

The six-file candidate/default retention run reports **207 passed, six failed,
zero skipped, 213 total**. The six failures match the existing default-adapter
quote/list/mark/split cases by exact name. No assertion is skipped or relaxed.
This is a focused run; a new full source-suite result is not claimed.

Compiled ESM and CommonJS probes pass **36 pure-Node journeys**, including
observer metadata, peer convergence and author undo/redo in both exchange orders.
Engine and adapter are compiled in one module graph, with no fake DOM.

The browser evidence consists of a **90-journey main run** and **three distinct
follow-up journeys**, all passing without retries/skips. The private fixture has
an explicit host-annotation control. Native typing triggers a host observer;
the annotation synchronizes and survives author-only undo. The added follow-up
types `XY`, presses Enter at the retained caret, then undoes/redoes all three
actions while preserving the annotation. Model equality, status, focus, browser
errors and visible split paragraphs are checked. Captures and sampled recording
frames were inspected across Chromium, Firefox and WebKit. This is not physical
mobile/IME certification or a public host-integration API example.

## Controlled diagnostic

The separate baseline builder extracts `src` from `168707c6` without changing the
working source. Both versions use the compiled ESM engine/adapter graph,
the same three-trial diagnostic and isolated
fixed client/controller identities. Each trial has twelve timed edits and a
separate instrumented edit. Timing excludes instrumentation.

| Paragraphs | Baseline median of edit medians | Candidate median of edit medians | Candidate maximum timed sample |
| --- | ---: | ---: | ---: |
| 100 | 9.86 ms | 7.92 ms | 19.77 ms |
| 500 | 40.65 ms | 30.78 ms | 52.06 ms |
| 1,000 | 78.84 ms | 55.73 ms | 102.99 ms |

All six baseline/candidate shared-state binaries match by SHA-256 at each size,
as do complete document JSON values and the plain-editor reference. Encoded
sizes are 181,389 / 911,676 / 1,834,709 bytes. At 1,000 paragraphs the separately
counted `Y.Map.size` calls fall from 8,133 to 4,127. Initialization is not the
optimization's target: medians are 47.27 to 73.30 ms at 100 paragraphs, 620.51
to 590.64 ms at 500, and 2,398.54 to 2,358.65 ms at 1,000. No initialization
improvement or absence of variance is claimed; all trial results remain in the
report.

These are Node v24.22.1 measurements at reduced priority on two logical
processors, sequentially. Trial variance is retained in the comparison report.
This is a diagnostic of the supplied workload, not a universal speedup or a
production adoption certificate.

## Gates and remaining work

Build, framework types, API, package, headless, Node/workerd server and existing
public performance/heap gates pass. All 170 public JavaScript/CommonJS files and
CSS are byte-identical to the preceding public build. API declarations, default
adapter/tests, CI workflow and acceptance ceilings are unchanged. The three
known size overruns remain: core ESM 0.1 KiB, aggregate ESM 75.9 KiB and aggregate
CommonJS 59.9 KiB. Full source/complete CI refresh remains required for release;
no GitHub CI, npm or website publication is claimed.

Large-document projection, initialization, metadata/history growth, compaction,
migration and safe protocol adoption remain open. COLLAB-01 stays partial.
The current proof does not certify 100,000-block collaboration or overall
ProseMirror + Tiptap parity.

`artifacts/retained-projection-verification-20261106.json` records exact source,
report and recording hashes, the two browser invocations and the scoped source
run. The verifier checks current canary source maps, compiled imports in every
journey, unchanged public bytes/guards and the controlled binary comparisons.
Full raw reports/traces remain local; tools, receipts and representative captures
and recordings accompany the checkpoint.

## Reproduction

```text
node artifacts/build-retained-projection-baseline-20261106.mjs
node artifacts/build-cursor-overlay-canary-20261106.mjs
node artifacts/retained-read-controlled-cost-20261106.mjs retained-projection-baseline-build-20261106 retained-projection-baseline-cost-20261106 3 100,500,1000
node artifacts/retained-read-controlled-cost-20261106.mjs cursor-overlay-build-20261106 retained-projection-candidate-cost-20261106 3 100,500,1000
node artifacts/compare-retained-projection-cost-20261106.mjs
pnpm exec playwright test --config artifacts/retained-projection-browser-20261106.config.ts
pnpm exec playwright test --config artifacts/retained-projection-followup-20261106.config.ts
```

The main browser config now includes the additional continued-typing case, so a
fresh main run has 93 cases. The saved historical main run has 90, supplemented
by its three new follow-ups. The verifier supports either shape without counting
duplicate follow-ups as distinct journeys. Both configs remain headless, one
worker, port 4195, with video/traces; user servers are not reused or opened.

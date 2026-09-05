# Performance and memory contract

FountainJS treats performance as a measured release property, not a claim that
follows from using an immutable tree. The repository contains two enforced
gates:

```sh
pnpm build
pnpm test:budget
pnpm test:performance
pnpm test:browser
```

`test:performance` requires Node's exposed garbage collector and is already
wired through the package script and CI. It measures the built production ESM
entry rather than TypeScript source. The browser suite measures the real input,
state, reconciliation, selection, and next-animation-frame path in Chromium,
Firefox, and WebKit.

The complete contract is certified by the public 363-test package gate and
225-check Chromium/Firefox/WebKit/mobile matrix in [CI run
`928e45f`](https://github.com/eddolo/fountainjs/actions/runs/33946679970).

## Recorded baseline

This development baseline was recorded on 2026-09-04 with Node 24.19 on
Windows. It is descriptive; the ceilings in
`scripts/check-performance-budgets.mjs` are the enforced, cross-machine
contract.

| Top-level blocks | Local transaction p50 / p95 | Incremental remote p50 / p95 | Full JSON boundary p50 / p95 |
| ---: | ---: | ---: | ---: |
| 100 | 0.16 / 0.55 ms | 0.11 / 0.38 ms | 1.34 / 1.96 ms |
| 1,000 | 0.87 / 1.55 ms | 0.94 / 1.61 ms | 9.50 / 15.56 ms |
| 5,000 | 3.75 / 6.19 ms | 4.16 / 6.14 ms | 52.82 / 59.36 ms |
| 10,000 | 8.57 / 12.03 ms | 10.42 / 13.83 ms | 94.12 / 98.44 ms |

The isolated DOM-free HTML importer has its own production-build curve. The
fixture contains a paragraph, strong text, ordinary text, and a safe link per
top-level block. The 10,000-block source is about 1.1 MiB/60,000 parsed nodes,
so the benchmark explicitly opts into the public 2 MiB/100,000-node policy
instead of weakening request-oriented defaults.

| HTML blocks | Server import p50 / p95 |
| ---: | ---: |
| 100 | 6.07 / 9.26 ms |
| 1,000 | 35.66 / 41.20 ms |
| 5,000 | 191.40 / 206.31 ms |
| 10,000 | 425.07 / 475.79 ms |

CI caps those p95 values at 35/120/500/900 ms respectively, caps median growth
from 1,000 to 10,000 blocks at 15×, and caps the retained 10,000-block parsed
document at 48 MiB. This sample grew 11.92× and retained 14.21 MiB. Input byte,
node, depth, attribute, and parser-error limits are independently tested; see
[SERVER_HTML.md](SERVER_HTML.md).

The local and incremental-remote medians may grow by at most 15× when the
fixture grows from 1,000 to 10,000 blocks. This allowance absorbs runner noise
but rejects the former quadratic content-expression path, which approaches
100× growth. Absolute p95 ceilings also apply at every size.

The retained-memory gate performs 2,000 edits in one live 1,000-block editor,
then creates, subscribes to, edits, unsubscribes from, and destroys forty more
editors. Garbage collection runs before each comparison. The live session may
grow by at most 8 MiB and destroyed editors may retain at most 16 MiB. The
recorded destroyed-editor sample retained 0.13 MiB.

The build gate currently limits the independently loadable production entries,
including 111/93 KiB raw for the ESM/CommonJS root, 30/25 KiB for the optional
Yjs adapter, 54/45 KiB for the isolated DOM pagination entry, and 270/225 KiB
for the self-contained server HTML entry (about 72/68 KiB gzip). Aggregate
ceilings are 1,075/905 KiB for all emitted ESM/CommonJS runtime code excluding
the isolated full emoji catalogue. Gzip sizes are printed by the build but raw
sizes are enforced because they are deterministic. The parser payload changes
the opt-in server entry and aggregate only; existing web entry ceilings did not
increase.

## Why small edits stay local

- Schema validation memoizes successfully validated immutable subtrees in a
  `WeakSet`. A text edit revisits the new root, the changed ancestry, and the
  changed leaf; shared subtrees do not rerun attribute or custom invariant
  validation. Failed and foreign-schema nodes are never trusted.
- `Node.eq` immediately accepts shared identity. Transaction and NodeView
  comparison therefore stop at unchanged branches.
- Repetition in schema content expressions accumulates accepted positions
  without copying the complete set for every child. Ordinary `block+` and
  `inline*` validation is linear rather than quadratic.
- The undecorated DOM renderer reconciles by immutable top-level identity. The
  1,000-block browser gate inserts through `beforeinput`, waits for the next
  animation frame, requires 999 unchanged block elements to retain identity,
  caps added/removed DOM nodes at three each, and requires input-to-paint below
  250 ms in every desktop engine. Structural insertion/removal also moves and
  rebases unchanged blocks instead of recreating them.
- DOM pagination caches geometry by immutable node plus rendered-element
  identity and rebases item, fragment, template, warning, and structural source
  paths when top-level indexes shift. Repeated edits in 1,000 blocks are capped
  at 75 ms p95; alternating edge edits in 5,000 blocks are capped at 250 ms p95
  and two geometry reads; six 5,000-block leading insertion/removal cycles are
  capped at 500 ms p95 and exactly two/one reads while retaining every unchanged
  DOM block.
- Unchanged React NodeViews are carried across that reconciliation without an
  `update` or React render. A fifty-NodeView regression test requires zero
  unrelated rerenders. React state uses `useSyncExternalStore`, and Strict Mode
  lifecycle tests require one owned editor plus exact teardown.
- Provider-neutral adapters can submit a current-state transaction through
  `applyRemoteTransaction`. The Yjs adapter converts text-only `Y.Text` deltas
  directly into Fountain steps, so a remote keystroke does not rebuild or parse
  the document JSON. Structural or untrusted snapshot updates deliberately use
  the fully validated JSON boundary.

## Interpretation and limits

The three curves measure different contracts. Local and incremental remote
updates start with a trusted immutable Fountain document. The JSON boundary
accepts untrusted portable data, so parsing and complete validation are required
and intentionally remain proportional to document size.

The current array-backed top-level document also makes a leaf update linear in
the number of top-level blocks because the changed ancestry is copied. The gate
proves bounded near-linear behavior; it does not claim logarithmic editing.
Decorated documents currently use a complete render pass because an earlier
edit can shift absolute decoration positions. Large-document virtualization,
physical-device input latency, multi-hour browser soak tests, and independent
production traces remain useful maturity work. These limits are recorded so the
benchmark is evidence, not a claim that FountainJS has already accumulated
ProseMirror's decade of production tuning.

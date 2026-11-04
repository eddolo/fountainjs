# Build size and runtime costs

Code budgets make unexpected growth visible. They are not a feature freeze.
Verified capabilities may need more code; their cost should be reviewed at
feature/release checkpoints with meaningful headroom rather than a succession
of tiny allowances. Numerical ceilings are not updated automatically.

Review three different measurements:

- Aggregate emitted code detects overall growth and duplicated implementations.
- An entry's static import closure estimates what loading that entire entry
  entails. Its facade file alone omits shared implementation chunks.
- Startup, editing, conversion and retained-memory measurements test actual
  runtime behavior. Code size alone cannot establish responsiveness.

Preserve module boundaries so optional converters, providers and interfaces
remain optional. Investigate unexpected dependency/loading changes before
increasing a budget. Justified growth for tested behavior is normal development;
it does not justify weakening correctness, latency or retained-memory checks.

## Measured nested-Markdown checkpoint, 2026-11-04

The diagnostic follows emitted ESM static imports and re-exports, compressing
each chunk independently. It excludes external peers, dynamic imports, CSS,
application code and HTTP overhead, and does not apply a consumer bundler's
tree shaking. These are transfer estimates for complete entry closures, not
final application bundle sizes or startup timings.

| Entry | Facade raw | Static closure raw | Static closure gzip |
| --- | ---: | ---: | ---: |
| Root | 86.3 KiB | 732.6 KiB | 226.6 KiB |
| Core | 9.4 KiB | 392.0 KiB | 131.8 KiB |
| React | 92.6 KiB | 514.9 KiB | 147.4 KiB |
| DOCX | 210.6 KiB | 241.6 KiB | 71.5 KiB |

Compared with the actual preceding source-boundary tarball, nested Markdown
retention adds about 7.8 KiB raw / 2.1 KiB gzip to the root and core closures.
React and DOCX closures are unchanged. The aggregate raw inventory is 1,702.6
KiB ESM / 1,417.1 KiB CommonJS; it is not a single user's download. The existing
two aggregate ceilings fail by 11.3 / 8.3 KiB. All individual entry and CSS
ceilings pass. No ceilings were changed for this measurement.

The existing local latency, growth-curve and retained-memory gates pass on this
build without changed limits. Source-preserving export does additional semantic
verification: in a throttled Windows five-sample probe, repeated export after
editing one item in a 5,000-item list took a median 142.5 ms versus 66.2 ms for
the preceding canonical-rewrite path. The latter did not retain untouched item
spelling. This is a fidelity/cost tradeoff, not a speed advantage. Applications
should schedule expensive exports deliberately rather than treating every
keystroke as a request to serialize the complete document.

Evidence is recorded in `artifacts/loaded-build-size-review-20261104.json`,
`artifacts/parent-loaded-build-size-review-20261104.json`,
`artifacts/markdown-nested-source-performance-review-20261104.json` and
`artifacts/markdown-nested-source-latency-20261104.json`. These measurements
do not certify full parity or authorize a release.

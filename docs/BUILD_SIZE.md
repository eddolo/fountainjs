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

## Reference-boundary and Enter checkpoint, 2026-11-04

The later reference-scope/Enter repair measures 1,704.2 KiB total ESM and 1,418.4
KiB CommonJS. Relative to the nested checkpoint, the root/core static closures
grow by about 1.6 KiB raw / 0.5 KiB gzip. React's closure grows slightly through
the shared Enter command; DOCX stays unchanged. Individual entries and CSS fit;
the two existing aggregate ceilings fail by 12.9 / 9.6 KiB. No ceilings changed.

A 5,000-reference structural export initially took about 678 ms repeatedly.
Reusing exact-input footer proofs and the original parsed definition context
reduces repeated exports to about 25 ms. The first checked export still takes
about 216 ms, versus about 21 ms for the parent; capture is about 871 / 891 ms
in that same five-sample probe. These are separate cold/warm operations on a
throttled Windows machine, not competitive benchmarks. Earlier uncached results
are retained. The existing editor latency and memory gates pass unchanged.

See `artifacts/reference-loaded-build-size-review-20261104.json` and
`artifacts/markdown-reference-boundaries-performance-review-20261104.json`.

## HTML-adapted source checkpoint, 2026-11-04

The subsequent HTML-policy boundary repair adds about 0.42 KiB raw to the
root/core static closures. React and DOCX closures are unchanged. Root is
734.6 KiB raw / 227.2 KiB gzip; core is 394.0 / 132.4 KiB. Individual entries
and CSS pass existing ceilings. Aggregate emitted ESM / CommonJS still exceed
their unchanged ceilings by about 13.3 / 9.9 KiB. These aggregate inventories
are distribution measurements, not a user's combined download.

Custom HTML policies can have nonlocal effects, so a proposed partial-source
export now reparses its whole body before acceptance. In a throttled Windows
five-sample probe, warm structural export for 100 / 1,000 / 5,000 references
takes about 7 / 65 / 311 ms with an HTML policy, versus 0.85 / 3.4 / 18.2 ms
on the native-only path. The actual preceding native tarball measured
0.85 / 3.3 / 19.0 ms in the same probe. This is explicit serialization cost;
applications should avoid repeatedly exporting large documents on each keypress.
It is not a typing-speed benchmark or proof about arbitrary host adapters.

The first general performance run narrowly missed the 100-block server-HTML
p95 cap (35.86 ms versus 35 ms). A separate repeat passed (30.46 ms); both raw
reports remain, and no latency/heap limits changed. The aggregate headroom
proposal remains separate and unapplied. See
`artifacts/html-source-loaded-build-size-review-20261104.json`,
`artifacts/markdown-html-source-performance-review-20261104.json` and both
`artifacts/markdown-html-source-latency*-20261104.json` reports.

## Nested root-reference source checkpoint, 2026-11-04

Sharing captured root reference scope and owning parser spans for loose lists
adds about 1.44 KiB raw / 0.37 KiB gzip to root/core closures. Root is now
736.1 KiB raw / 227.5 KiB gzip; core is 395.5 / 132.7 KiB. React and DOCX closures
are unchanged. Existing individual entry/CSS caps pass; aggregate raw inventory
exceeds its unchanged ESM / CommonJS ceilings by about 14.8 / 11.1 KiB.

In a throttled Windows five-sample probe, repeated export after one item edit in
a 100 / 1,000 / 5,000-item loose list with the same number of root references
takes about 5.8 / 32 / 181 ms. The actual preceding tarball takes about
1.1 / 7.0 / 34 ms while rewriting the unrelated source. Source capture takes
about 28 / 260 / 1,363 ms versus 18 / 200 / 993 ms. Complete model reopening is
checked for both; exact untouched spelling is gained only by the new path.
This is additional fidelity work, not a speed advantage. Normal editor latency,
growth and retained-memory checks pass without changed limits.

The first closure diagnostic incorrectly used `dist` as its package root and
failed before producing a measurement. The corrected invocation uses `.`; both
logs remain. See `artifacts/nested-reference-loaded-build-size-review-20261104.json`
and `artifacts/markdown-nested-references-performance-review-20261104.json`.

## Container-reference source checkpoint, 2026-11-04

Keeping container-carried definitions and proving complete-result semantics adds
about 1.11 KiB raw / 0.28 KiB gzip to root/core closures. Root is now 737.2 KiB
raw / 227.8 KiB gzip; core is 396.6 / 133.0 KiB. React/DOCX closures stay unchanged.
Existing individual entry/CSS ceilings pass. The two aggregate ceilings remain
unchanged and fail by about 15.9 KiB ESM / 12.0 KiB CommonJS.

For a quote containing 100 / 1,000 / 5,000 paragraphs and the same number of
embedded reference definitions, repeated preserving export takes about
34 / 277 / 1,425 ms versus 1.1 / 6.4 / 31 ms for the actual parent's canonical
rewrite. Capture takes 19 / 188 / 953 ms versus 26 / 160 / 803 ms. These are
five-sample medians on a throttled Windows machine; both paths reopen to the
complete intended model, while only the new path retains untouched source.
Full-result verification is synchronous serialization work and should be kept
off a large document's per-keystroke path. Existing general editor latency and
retained-memory limits pass without changes. No competitive speed claim follows.

See `artifacts/container-reference-loaded-build-size-review-20261104.json` and
`artifacts/markdown-container-references-performance-review-20261104.json`.

## Complete-result proof checkpoint, 2026-11-04

Avoiding redundant fragment checks when complete-result validation succeeds adds
about 1.04 KiB raw / 0.24 KiB gzip to root/core closures. Root is 738.2 / 228.1 KiB
raw/gzip; core is 397.6 / 133.3 KiB. React and DOCX closures stay unchanged. These
static closures exclude external peers/dynamic imports and do not apply consumer
tree shaking. All individual entries and CSS pass. Aggregate ESM is 1,708.2 KiB
and CommonJS 1,421.5 KiB; their unchanged ceilings fail by 16.9 / 12.8 KiB.
The separate capacity proposal remains unapplied.

The actual a658e30 archive already retains the same source. In a throttled
Windows five-sample probe, repeated preserving export of a quote with 100 /
1,000 / 5,000 paragraphs and matching embedded definitions falls from about
31 / 303 / 1,568 ms to 11 / 70 / 348 ms. Distinct edited 5,000-paragraph inputs
fall from 1,573 to 347 ms, and cold export from 1,922 to 666 ms. Complete-result
parsing still runs on every proposed edit. Capture is about 1,052 / 1,021 ms
for 5,000 paragraphs; this optimization targets export, not capture.

This is not a universal speedup: a 1,000-paragraph heading-to-paragraph edit
requiring boundary repair rises from about 359 to 492 ms because the rejected
draft adds verification before the original repair path. Both versions retain
the required blank-line repair and complete model. Keep large synchronous
serialization off the per-keystroke path. General editor latency/growth and
retained-memory gates pass without changed limits. Sampled CPU profiles show
the repeated nested and pair-validation work removed from the successful path;
profile samples include initial capture and are not ordinary wall-clock timings.

See `artifacts/markdown-source-export-proof-performance-review-20261104.json`,
`artifacts/source-proof-loaded-build-size-review-20261104.json`, and the before/
after CPU summaries. Earlier pre-observer-fix timings and the failing observer
regression are retained. This measurement does not certify a release or parity.

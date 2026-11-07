# Retained collaboration package audit

The local `0.4.0-beta.2` tarball exposes
`fountainjs-editor/experimental/yjs-retained` in ESM and CommonJS. It exports the
adapter, extension factory and isolated checkpoint capture and restore.
Existing XML rooms retain their storage format. The 441-file TypeScript snapshot
adds 18 declaration files and preserves every previous declaration hash.
[Consumer guide](YJS_RETAINED_PREVIEW.md).

## Installed consumer

A clean project outside the repository installed the actual packed tarball with
Yjs 13.6.32. Separate Node 24 processes passed 14 checks each in ESM and CommonJS.
Both exchange orders preserve offline typing across quote, bullet, ordered and
task list wrapping, partial marks and paragraph splitting. The checks also
cover author undo and redo, exact checkpoint restore, authority binding before
provider start and refusal of legacy rooms with byte-identical source updates.
The consumer runs without jsdom or browser globals. Its strict NodeNext
`.mts` and `.cts` examples typecheck the exported API using the standard DOM and
Node declaration libraries.
Publint passes. Are the Types Wrong checks the actual tarball and resolves the
preview in all four profiles. The existing Angular and CSS exclusions apply.

## Browser use

The local two-editor demo imports the installed package and stylesheet.
Chromium, Firefox and WebKit each passed 13 recorded journeys without retries.
The tests use keyboard and pointer input for concurrent edits, undo and redo,
selection and deletion, a 1,000-paragraph document, room replacement and JSON
download and reopen. Runtime request logs show the installed root and preview
entries in all 39 journeys. The visual review covers the six convergence
screenshots per engine, the reopened document in both panes and sampled
paragraph-split recording frames. The demo synchronizes peers in memory.

To reproduce the installed browser workflow on the current Windows test host,
build and pack the repository, prepare an isolated consumer, install its
dependencies, then run the recorded demo suite.

```powershell
pnpm build
pnpm pack --out artifacts/yjs-retained-package-20261107.tgz
node artifacts/prepare-yjs-retained-package-20261107.mjs
$consumer = Get-Content -Raw artifacts/yjs-retained-package-consumer-20261107.path
pnpm --ignore-workspace --dir $consumer install --prefer-offline --ignore-scripts
pnpm exec playwright test --config artifacts/yjs-retained-package-browser-20261107.config.ts
node artifacts/curate-yjs-retained-package-20261107.mjs
```

## Build size and release status

Build, package smoke, repository types, headless boundary and the public API
checks pass. The full source run has 4,802 passes and six failures across 301
files with zero skips. The failed cases match the prior default-adapter
failures by name. The local review tarball contains the same package manifest
and 949 identical build files as the archive exercised in the browser and
Node consumer.

Compared with the prior local build, top-level runtime files grow by 95,865 ESM
bytes and 77,323 CommonJS bytes. These totals exclude the optional emoji
catalogue and the separately compiled Angular entry. The preview entry is
95,468 ESM bytes and 76,752 CommonJS bytes. Following generated relative imports
and source maps finds the retained implementation only in the preview among
the compared root, core, React and Yjs entries. Splitting shared chunks adds
127–175 ESM bytes and 249–288 CommonJS bytes to the raw dependency graphs of the
four existing entries. This comparison measures bundle bytes.

| Budget | Current bytes | Excess |
|---|---:|---:|
| Core ESM | 9,888 | 160 bytes |
| Core CommonJS | 8,990 | 30 bytes |
| Aggregate ESM | 1,906,926 | 171.0 KiB |
| Aggregate CommonJS | 1,582,441 | 136.6 KiB |

The CommonJS core overrun is new. All existing budget thresholds still apply.
Production transport, first-room provisioning, durable draft recovery,
compaction, migration coverage and full release CI remain open. The preview
is available in the local tarball.

### Compact internal chunk names (2026-11-07)

Using hash-only filenames for shared runtime chunks reduces repeated import
paths. Public entries, source maps, and the shared HTML entity decoder's
measurement prefix are retained. The same gate counts the internal chunks in
the aggregate.

The core entries shrink from 9,888 to 9,614 ESM bytes and from 8,990 to 8,716
CommonJS bytes. Both meet their existing limits. The aggregate saves 4,411
ESM bytes and 4,473 CommonJS bytes and still exceeds the existing caps by
170.1 KiB and 135.4 KiB, respectively.

The build, package smoke, public declarations, headless boundary, and
Node/workerd runtime checks pass. A fresh installation of the tarball passes
28 Node checks, both strict NodeNext type examples and all 39 recorded
Chromium, Firefox and WebKit journeys. Screenshots of the six concurrent
edits in each engine show both editors displaying the same document. The
Chromium reopen capture shows the downloaded draft and figure in both panes.

### Clock and split-order costs

Retained text writes read the local Yjs clock directly. The live projection
guard compares peer clocks and deletion counts without encoding a state
vector. Ordinary document reads skip sibling ordering work when there are
no split families. Parents with split families index sibling IDs once.
Families that share a member keep the existing dynamic root lookup.

A compiled Node diagnostic used a 600-paragraph room, alternating three
baseline and three candidate trials. The 1,024-client case carries one
auxiliary Yjs record per synthetic past client. Each trial runs 18 local
inserts and times the final 15 dispatches. Document JSON and complete Yjs
updates match byte for byte across builds for each client count.

| Prior client IDs | Initialization before → after | Edit median before → after |
| --- | ---: | ---: |
| 1 | 63.90 → 53.92 ms | 3.12 → 3.61 ms |
| 1,024 | 209.46 → 56.42 ms | 4.31 → 3.44 ms |

These timings cover the diagnostic workload. They do not certify 1,024
simultaneously active editors or solve retained history growth. In a separate
24-case probe, mixed previous and current builds converge and preserve author
undo/redo in both seed and exchange orders. The performance build passed
39 installed-package browser workflows across Chromium, Firefox and WebKit.

The minimum supported Yjs 13.6.0 exposed a checkpoint failure because it
does not export the ContentDoc constructor. The guard now checks the stored
Y.Doc value, which also detects deleted subdocuments retained with GC disabled.
The final packed build passes 64 pure-Node checks across ESM and CommonJS
with Yjs 13.6.0 and 13.6.32, including checkpoint capture, reopening, and
rejection of live and retained-deleted subdocuments. Nine recorded desktop
browser journeys installed the final tarball with Yjs 13.6.0 and covered
offline quote/split edits, history, room switching, and reopening a download.
The WebKit split capture shows matching paragraphs and the retained figure.

The refreshed full source run passed 4,877 tests across 309 files, with six
failures and zero skips. All six are the required default-adapter structural
cases. Both aggregate build-size checks remain over their existing limits.

### Receiving remote text edits

The preview can reuse the checked document structure across remote edits to
existing text streams. It validates the touched streams and normalizes and
schema-checks the full model. Changes to the node graph, style registry or
partition owners, a missing expected partition, or a queued observer write
use the full read.
The shortcut depends on Yjs's internal cleanup queue and falls back if the
queue is unavailable. Empty formatting cleanups preserve the checked frame
only when the client clocks and deletion set confirm there was no change.

A compiled two-peer Node benchmark alternated three runs per build and timed
the last 11 of 13 remote keystrokes per run. The final document JSON and Yjs
update bytes matched between the builds.

| Paragraphs | Median receive time before | Median receive time after |
| ---: | ---: | ---: |
| 1,000 | 22.08 ms | 5.81 ms |
| 5,000 | 123.17 ms | 31.49 ms |

320 focused tests pass. The installed tarball passes 56 Node checks across ESM
and CommonJS on Yjs 13.6.0 and 13.6.32, both NodeNext type examples on each
version, and 39 recorded Chromium, Firefox and WebKit workflows on 13.6.32.
The WebKit reopen capture shows the same saved draft and figure in both panes.
The public declaration check covers 441 files. A separate rerun reproduces all
six known default-adapter failures. Both core entries fit their limits. The
aggregate output remains 174.3 KiB ESM and 138.7 KiB CommonJS over the limits.

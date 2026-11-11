## Summary

Prepare the next FountainJS beta around document integrity, retained
collaboration, conversion fidelity and complete integration workflows.

This branch continues draft #22, whose head is `fix/native-focus-intent-20261105`.
The earlier stacked drafts remain prerequisites. Keep this review in draft
until the combined candidate passes the release gates.

- Preserve offline/concurrent edits and author history through structural
  changes, room admission, replacement and recovery. The default Yjs entry now
  uses retained identities, with an explicit legacy entry and migration guide.
- Strengthen Markdown/source, HTML and DOCX interchange while retaining explicit
  loss reporting and the documented boundaries of each supported format.
- Repair native selection, typing, clipboard, history and toolbar interactions,
  and extend runnable framework/form examples and their developer guides.
- Separate the short current roadmap from its complete engineering history.

## Compatibility

The candidate manifest, versioned changelog and downloadable starters now
identify `0.5.0-beta.1`. Tag/changelog validation passes locally. This version
is not published; local package/consumer checks pass, and full hosted release
CI remains required before tagging and staging. The existing public package
remains `0.4.0-beta.2`.

The default `fountainjs-editor/yjs` storage format changes. Existing XML rooms
need `fountainjs-editor/yjs/legacy` or an explicit migration. The supported Yjs
range starts at 13.6.32. Read `docs/YJS_DEFAULT_ADOPTION.md` before upgrading a
persisted room. Portable document JSON has its separate migration contract.

## Local validation

Runtime candidate `024ff8fe` passes `pnpm check`, including all 5,271 source
tests in 323 files, API/package/Node/workerd/format/type checks and existing
size, latency and retention checks. The virtual host-control guard prevents
measurement from moving an external button during its native press; release,
cancellation, blur and open Shadow DOM pass 15 recorded desktop checks. It
adds 791 CommonJS bytes and 1,024 bytes of aggregate CJS capacity; other limits
stay unchanged. Public API signatures stay unchanged (five private members
update two declaration snapshots).

The fresh tarball passes both type analyses and a clean ESM/CommonJS consumer
outside the repository without browser globals, optional peers or jsdom.
Publint retains its existing DOCX warning. Repack after the final packaged-doc
updates before staging. Pinned Lean, Bun, Deno and the production site build
pass again at `b03ad598`; hosted CI must still verify the final candidate.

Fresh default Yjs (48), startup (24), migration recovery (21) and compiled
presence/retained-document (108) batches pass in all three desktop engines.
The 108-case batch repeats 48 retained cases; counts are executions. The
production-site starter-download journey passes in three engines and verifies
nine real ZIPs against the candidate source/version.

The complete local editor/mobile matrix finishes with 1,063 passes, 19 existing
skips and two Firefox lazy-loading timeouts in 42.9 minutes. Chromium (342),
WebKit (332), mobile Chrome (29) and mobile Safari emulation (29) have no
failures. Firefox has 331 passes, nine skips and two failures. Both exact failed
cases pass serially with unchanged assertions/timeouts in 4.4 and 3.3 seconds.
The original traces show unusually slow browser/page setup; transient
contention is a hypothesis, not an established cause. The complete Firefox
project subsequently passes with one worker: 333 passes, nine existing skips,
zero failures, no retries and unchanged assertions/timeouts, in 27.2 minutes.
All five projects have failure-free runs at the same runtime revision across
the original matrix and this Firefox follow-up. Original parallel failures
and serial evidence remain separate; hosted parallel CI is still mandatory.

Direct screenshot review covers recovered collaboration, merged-table resizing,
mobile task-reader navigation and editor/page-preview indentation. Static
captures do not establish physical-device, AT or independent Word/PDF coverage.

## Release gates still open

The reusable CI now includes a required independent `recorded-ui` job. It
records all eight release journeys and checks six production-subpath starter
and caption workflows, retaining evidence on success or failure. Local CI-mode
journeys, production checks, 14 policy checks and root/configuration types pass.
The main matrix/preflights remain unchanged. Actual hosted results are pending.

Latest demo/tooling follow-up `1e86e5e0` restores rich DOCX image-caption
previews and scopes the recorded command to its two original audit files.
Its complete source gate passes 5,271 tests; eight recorded journeys, three
desktop caption checks and three production-subpath checks pass. All 1,008
library distribution files remain identical. Selected full-resolution states,
sampled timelines and two PDF pages receive visual review. Continuous playback,
known DOCX viewer omissions and older-rasterizer differences remain explicit;
the earlier complete browser runs predate this demo change. Details and native
tracing controls are in `docs/RELEASES.md` and the compact audit receipt.

- Clean hosted browser/Yjs recovery and Linux display-backed clipboard validation.
  The repaired media-range/export-undo workflow passes in all three desktop
  engines in the current full run. The two Firefox lazy-loading failures and
  their serial passes remain separate evidence; do not waive hosted validation.
  The local serialized clipboard batch passes all 18 Chromium/Firefox checks;
  Windows WebKit delivery fails three checks, consistent with independent native
  controls. The original failure receipts remain retained.
- Fresh hosted CI for the combined candidate, including Bun, Deno, workerd,
  pinned Lean and the complete browser jobs.
- Final versioned metadata, matched tag and GitHub release.
- npm staging, maintainer 2FA approval, registry installation and live-site
  verification.

The capability ledger has 61 Delivered, eight Partial, two Host boundary and
three Missing rows after the November 11 upstream catalogue review. Editable
charts/diagrams, template slots and a whiteboard surface remain post-beta work.
Physical mobile/IME and assistive-technology evidence, production adoption,
further format fidelity and remaining parity work stay open. This candidate
does not establish whole-product parity or a completion percentage.

The main desktop matrix now includes the existing actual-Word research-paper
workflow. Six CI-mode local repetitions pass across Chromium/Firefox/WebKit,
with unchanged interactions/assertions and independent evidence per attempt.
Fourteen policy checks and root TypeScript pass; all 1,008 distribution files
remain byte-identical. Captured HTML math and page-template fallbacks remain
explicit limitations. Fresh combined hosted CI is still required.

Required CI now prepares and tests externally installed plain-DOM/React/Node
starters against the actual local tarball. Six final browser journeys, three
production ZIP checks, Node conversion/blocked-peer probes, 14 policy tests and
root/configuration typechecks pass locally. Visual review fixes the two starter
shells' Windows WebKit font fallback. No library or budget changes; npm CLI,
registry installation and combined hosted CI remain distinct pending evidence.

Complete local check at e15335c7 passes 5,279 tests/323 files and every existing
package/runtime/type/format/size/performance gate. Website-only follow-ups add
five focused identity tests; no new complete 5,284-test run is claimed. The
source preview now has generated package/commit/npm labels on all 20 pages,
correct framework copy and a source-accurate sample. Fifteen clean built-site
checks at 72174160, six ordinary homepage interactions and eight recorded
release journeys pass. The compiled offline-equation download is included.
The audit uses a server configuration that disables automatic browser opening.
Fresh combined hosted CI, final sealing and publication remain pending.

Homepage Copy now catches rejection/unavailability, supplies a readonly manual
copy route and associates feedback with the copied snapshot. Named contrast
targets reach at least 5.15:1. Source is 14 passes/one failed positive API paste;
production is 29 passes/one failure. Windows WebKit's same empty native paste
is reproduced by independent plain HTML. No assertion/skip waiver was added.
Required source native cases and all production cases run serialized/headed
on Linux Xvfb; that hosted result is pending. Nineteen policy checks, TypeScript
and byte identity of all 1,008 library files pass. This does not approve release.

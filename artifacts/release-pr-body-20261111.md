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
is not published; package/consumer checks and full release CI remain required
before tagging and staging. The existing public package remains `0.4.0-beta.2`.

The default `fountainjs-editor/yjs` storage format changes. Existing XML rooms
need `fountainjs-editor/yjs/legacy` or an explicit migration. The supported Yjs
range starts at 13.6.32. Read `docs/YJS_DEFAULT_ADOPTION.md` before upgrading a
persisted room. Portable document JSON has its separate migration contract.

## Local validation

Runtime `7961b966` passed `pnpm check`, including all 5,271 source tests in 323
files, API/package/runtime/format/type checks and existing size, latency and
retention checks. Its duplicate-widget repair adds 63 CommonJS bytes, with
64 bytes of aggregate capacity and all other limits unchanged. Earlier tarball
type/consumer analysis passed at `597f5415`; refresh it for the final versioned
candidate. Publint retains its existing DOCX format warning.

The latest twelve recorded desktop checks pass across Chromium, Firefox and
WebKit. The broad diagnostic stopped with 628 passes and five failures, leading
to test-selector/decoration-observation corrections and a real duplicate-widget
renderer repair. Failed controls and exact one-widget/source-retention checks
are retained. Earlier default Yjs/startup/migration/native-presence batches
passed at `597f5415`. The 441-case remaining diagnostic finishes with 421
passes, 19 skips and one Chromium module-load failure before the mobile editor
initializes (`ERR_NO_BUFFER_SPACE`). Three unchanged isolated repeats pass;
the first-run trace stays retained. It does not replace a clean full matrix.
Update this section with final candidate CI before opening the prepared review.

## Release gates still open

- Complete browser/Yjs recovery and Linux display-backed clipboard validation.
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
